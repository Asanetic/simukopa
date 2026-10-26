// reportEngine.js — mosySecureReport: run a report described ONLY by a backend schema.
// Same family as mosySecureSelect (dataUtils): values are bound parameters, identifiers come from a validated
// schema (never from the request), the tenant filter is mandatory. It never touches a table the schema doesn't name.
//
//   const out = await mosySecureReport({ schema, searchParams, authData, db });
//   out = { data:[{ _group:'2026-06', _label?, <measureKey>: n, … }], meta:{ … } }
//
// How it works (one idea): every measure becomes ONE small grouped query on its own table —
//   SELECT <bucket> AS bucket, <agg> AS v FROM <table> t WHERE tenant = ? AND <date range> [AND <where>] GROUP BY <bucket>
// — the results are merged by bucket in JS, empty buckets are filled with 0, and the whole answer is cached per
// (tenant, report, range, filters) with single-flight, so a crowd asking at once costs one set of queries.
//
// Request params (same conventions as your grids: values are base64 unless encoding:'plain'):
//   date_start / date_end   'YYYY-MM' or 'YYYY-MM-DD'
//   bucket                  day | month | year   (only if schema.bucketOptions allows it)
//   <filter.param>          each schema.filters entry, e.g. owner=<b64>
//   refresh=1               bypass the cache (itself rate-limited)

import { validateApiSchema, verifySchemaAgainstDb, TIME_BUCKETS } from './reportSchemaCheck.js';
import { createReportCache } from './reportCache.js';

export class ReportError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = status < 500; }
}

const defaultCache = createReportCache();
const checked = new WeakMap(); // schema object -> problems[] (validated once)

// ── param decoding ──
function decode(raw, encoding) {
  if (encoding === 'plain') return String(raw);
  const s = String(raw).replace(/ /g, '+'); // a '+' that travelled unescaped in a URL arrives as a space
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s)) throw new ReportError(400, 'Malformed parameter.');
  const out = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// 'YYYY-MM' or 'YYYY-MM-DD' -> UTC Date at midnight, or throws. `end` = exclusive upper bound (the day AFTER the given day/month).
function parseDay(s, isEnd) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s).trim());
  if (!m) throw new ReportError(400, 'Dates must look like 2026-06 or 2026-06-30.');
  const y = Number(m[1]); const mo = Number(m[2]); const d = m[3] ? Number(m[3]) : 1;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1970 || y > 2100) throw new ReportError(400, 'That date does not exist.');
  if (!isEnd) return date;
  return m[3] ? new Date(Date.UTC(y, mo - 1, d + 1)) : new Date(Date.UTC(y, mo, 1));
}

// every bucket key between two dates (end exclusive)
function enumerate(bucket, start, endExcl, cap) {
  const out = [];
  let cur = new Date(start);
  while (cur < endExcl) {
    out.push(bucket === 'year' ? String(cur.getUTCFullYear()) : bucket === 'month' ? iso(cur).slice(0, 7) : iso(cur));
    if (out.length > cap) throw new ReportError(400, 'That range has too many rows — pick a shorter period or a bigger bucket.');
    cur = bucket === 'year' ? new Date(Date.UTC(cur.getUTCFullYear() + 1, 0, 1))
      : bucket === 'month' ? new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
        : new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
  }
  return out;
}
const keyToDate = (bucket, k) => parseDay(bucket === 'year' ? `${k}-01` : k, false);

// ── SQL builders (values only ever travel in `vals`) ──
function whereSql(list, alias, q, P, out) {
  (list || []).forEach((w) => {
    const c = `${q(alias)}.${q(w.col)}`;
    if (w.op === 'IS NULL' || w.op === 'IS NOT NULL') out.push(`${c} ${w.op}`);
    else if (w.op === 'IN' || w.op === 'NOT IN') out.push(`${c} ${w.op} (${w.val.map((v) => P(v)).join(', ')})`);
    else out.push(`${c} ${w.op} ${P(w.val)}`);
  });
}

function buildMeasureQuery(schema, m, ctx) {
  const { d, db, tenantCol, tenant, bucket, range, filters, timeoutMs } = ctx;
  const q = d.quote;
  const vals = [];
  const P = (v) => { vals.push(v); return '?'; };
  const T = 't';
  const col = (a, c) => `${q(a)}.${q(c)}`;
  let from = `${db.table(m.table)} ${q(T)}`;
  let groupExpr;
  let valueExpr;

  const aggOf = (arg) => (m.agg === 'count' ? 'COUNT(*)' : m.agg === 'countDistinct' ? `COUNT(DISTINCT ${arg})` : `${m.agg.toUpperCase()}(${arg})`);

  if (schema.bucket === 'dimension') {
    if (m.join) {
      const j = m.join;
      const credit = j.credit || 'full';
      const derivedWhere = () => {
        const parts = [];
        if (tenantCol) parts.push(`${q(tenantCol)} = ${P(tenant)}`);
        whereSql(j.where, 'dd', q, P, parts); // alias dd is set on the inner table below
        return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const jt = db.table(j.table);
      if (credit === 'split') {
        const wx = derivedWhere();
        const x = `(SELECT ${q(j.to)} AS ${q('lk')}, ${q(j.group)} AS ${q('grp')}, COUNT(*) AS ${q('c')} FROM ${jt} ${q('dd')}${wx} GROUP BY ${q(j.to)}, ${q(j.group)})`;
        const wy = derivedWhere();
        const y = `(SELECT ${q(j.to)} AS ${q('lk')}, COUNT(*) AS ${q('tot')} FROM ${jt} ${q('dd')}${wy} GROUP BY ${q(j.to)})`;
        from += ` JOIN ${x} ${q('x')} ON ${col('x', 'lk')} = ${col(T, j.from)} JOIN ${y} ${q('y')} ON ${col('y', 'lk')} = ${col('x', 'lk')}`;
        const share = `${col('x', 'c')} * 1.0 / ${col('y', 'tot')}`;
        valueExpr = m.agg === 'count' ? `SUM(${share})` : `SUM(${col(T, m.col)} * ${share})`;
      } else {
        const wx = derivedWhere();
        const x = `(SELECT DISTINCT ${q(j.to)} AS ${q('lk')}, ${q(j.group)} AS ${q('grp')} FROM ${jt} ${q('dd')}${wx})`;
        from += ` JOIN ${x} ${q('x')} ON ${col('x', 'lk')} = ${col(T, j.from)}`;
        valueExpr = aggOf(m.col ? col(T, m.col) : '*');
      }
      groupExpr = col('x', 'grp');
    } else {
      groupExpr = col(T, m.group);
      valueExpr = aggOf(m.col ? col(T, m.col) : '*');
    }
  } else {
    groupExpr = d.bucket(col(T, m.by), bucket);
    valueExpr = aggOf(m.col ? col(T, m.col) : '*');
  }

  const where = [];
  if (tenantCol) where.push(`${col(T, tenantCol)} = ${P(tenant)}`);
  if (m.by && range.start) where.push(`${col(T, m.by)} >= ${P(range.start)}`);
  if (m.by && range.endExcl) where.push(`${col(T, m.by)} < ${P(range.endExcl)}`);
  whereSql(m.where, T, q, P, where);
  filters.forEach((f) => {
    const c = f.cols[m.key];
    if (!c) return;
    if (f.list) where.push(`${col(T, c)} IN (${f.list.map((v) => P(v)).join(', ')})`);
    else where.push(`${col(T, c)} = ${P(f.value)}`);
  });

  const sql = `SELECT ${d.hint(timeoutMs)}${groupExpr} AS ${q('bucket')}, ${valueExpr} AS ${q('v')} FROM ${from}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} GROUP BY ${groupExpr}`;
  return { sql, vals };
}

// exported so tests (and the doctor script) can see exactly what would run
export const _buildMeasureQuery = buildMeasureQuery;

// ── the main entry ──
export async function mosySecureReport({
  schema, searchParams, authData, db,
  cache = defaultCache, limiter = null, now = new Date(), encoding = 'base64',
}) {
  // 1. schema must be sound (once per schema object)
  if (!checked.has(schema)) checked.set(schema, validateApiSchema(schema));
  const problems = checked.get(schema);
  if (problems.length) { console.error('[mosySecureReport] bad schema:\n - ' + problems.join('\n - ')); throw new ReportError(500, 'Report is misconfigured.'); }

  // 2. tenant is mandatory
  const tenantCol = schema.tenantColumn === null ? null : (schema.tenantColumn || 'hive_site_id');
  const tenant = tenantCol ? authData?.[tenantCol] : null;
  if (tenantCol && (tenant === undefined || tenant === null || tenant === '')) throw new ReportError(403, 'No site on this session.');

  if (limiter && !limiter.hit(`${schema.entity}:${tenant ?? 'global'}:${authData?.user_id ?? authData?.record_id ?? ''}`)) throw new ReportError(429, 'Too many requests — try again in a few seconds.');

  if (!(searchParams instanceof URLSearchParams)) searchParams = new URLSearchParams(searchParams || {});
  const get = (k) => { const v = searchParams.get(k); return v === null || v === '' ? null : decode(v, encoding); };

  // 3. bucket
  const timeMode = TIME_BUCKETS.includes(schema.bucket);
  let bucket = schema.bucket;
  if (timeMode) {
    const asked = searchParams.get('bucket') ? decode(searchParams.get('bucket'), encoding) : null;
    if (asked) {
      const allowed = schema.bucketOptions || [schema.bucket];
      if (!allowed.includes(asked)) throw new ReportError(400, `bucket must be one of ${allowed.join(', ')}.`);
      bucket = asked;
    }
  }

  // 4. date range (time reports with no start get the default window so an open request is never unbounded)
  let startRaw = get('date_start');
  const endRaw = get('date_end');
  const maxDays = schema.maxRangeDays || 1200;
  let start = startRaw ? parseDay(startRaw, false) : null;
  const endExcl = endRaw ? parseDay(endRaw, true) : null;
  if (!start && timeMode && !(schema.defaultDays === 0)) {
    const back = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (schema.defaultDays || 366)));
    // snap to the bucket's own start so the first row is a whole month/year, not a partial one
    start = bucket === 'year' ? new Date(Date.UTC(back.getUTCFullYear(), 0, 1)) : bucket === 'month' ? new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth(), 1)) : back;
  }
  if (start && endExcl && endExcl <= start) throw new ReportError(400, 'The end date is before the start date.');
  if (start && endExcl && (endExcl - start) / 86400000 > maxDays) throw new ReportError(400, `Pick a range of at most ${maxDays} days.`);
  const range = { start: start ? iso(start) : null, endExcl: endExcl ? iso(endExcl) : null };

  // 5. user filters (schema-declared only; unknown URL params are ignored)
  const filters = (schema.filters || []).map((f) => {
    const raw = get(f.param);
    if (raw === null) return null;
    if (f.op === 'IN') {
      const list = raw.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 200);
      return list.length ? { cols: f.cols, list, key: `${f.param}=${list.join(',')}` } : null;
    }
    return { cols: f.cols, value: raw, key: `${f.param}=${raw}` };
  }).filter(Boolean);

  // 6. cache
  const ttlMs = (schema.cacheSeconds === undefined ? 60 : schema.cacheSeconds) * 1000;
  const key = [schema.entity, tenant ?? '*', bucket, range.start, range.endExcl, ...filters.map((f) => f.key)].join('|');
  const wantsFresh = searchParams.get('refresh') === '1';
  const minRefreshMs = (schema.minRefreshSeconds ?? 15) * 1000;
  const hit = cache.get(key, now.getTime());
  if (hit && !(wantsFresh && now.getTime() - hit.at >= minRefreshMs)) {
    return { data: hit.value.data, meta: { ...hit.value.meta, cached: true, ageSeconds: Math.round((now.getTime() - hit.at) / 1000) } };
  }

  const value = await cache.once(key, async () => {
    await verifySchemaAgainstDb(schema, db); // live check: every table/column named exists
    const ctx = { d: db.dialect, db, tenantCol, tenant, bucket, range, filters, timeoutMs: schema.queryTimeoutMs ?? 8000 };
    const built = schema.measures.map((m) => ({ m, ...buildMeasureQuery(schema, m, ctx) }));

    const { results, labels } = await db.session(async (run) => {
      const results = await Promise.all(built.map(async (b) => ({ key: b.m.key, rows: await run(b.sql, b.vals) })));
      let labels = null;
      if (schema.bucketLabel) {
        const groups = new Set();
        results.forEach((r) => r.rows.forEach((row) => { if (row.bucket !== null && row.bucket !== undefined) groups.add(String(row.bucket)); }));
        if (groups.size) {
          const l = schema.bucketLabel; const q = db.dialect.quote;
          const vals = [];
          const parts = [];
          if (tenantCol) { parts.push(`${q(tenantCol)} = ?`); vals.push(tenant); }
          const list = [...groups].slice(0, 500);
          parts.push(`${q(l.key)} IN (${list.map(() => '?').join(', ')})`); vals.push(...list);
          const rows = await run(`SELECT ${q(l.key)} AS ${q('k')}, ${q(l.label)} AS ${q('l')} FROM ${db.table(l.table)} WHERE ${parts.join(' AND ')}`, vals);
          labels = new Map(rows.map((r) => [String(r.k), r.l]));
        }
      }
      return { results, labels };
    });

    // merge by bucket
    const byBucket = new Map();
    results.forEach(({ key: mk, rows }) => rows.forEach((row) => {
      const b = row.bucket === null || row.bucket === undefined ? '' : String(row.bucket);
      if (!byBucket.has(b)) byBucket.set(b, { _group: b || '(none)' });
      byBucket.get(b)[mk] = Number(row.v) || 0;
    }));
    let keys = [...byBucket.keys()];
    if (timeMode) {
      const have = keys.filter(Boolean).sort();
      const from = start || (have.length ? keyToDate(bucket, have[0]) : null);
      let to = endExcl;
      if (!to && have.length) { const lastD = keyToDate(bucket, have[have.length - 1]); to = bucket === 'year' ? new Date(Date.UTC(lastD.getUTCFullYear() + 1, 0, 1)) : bucket === 'month' ? new Date(Date.UTC(lastD.getUTCFullYear(), lastD.getUTCMonth() + 1, 1)) : new Date(Date.UTC(lastD.getUTCFullYear(), lastD.getUTCMonth(), lastD.getUTCDate() + 1)); }
      keys = from && to ? enumerate(bucket, from, to, schema.maxBuckets || 400) : have;
      const extra = have.filter((k) => !keys.includes(k)); // data outside an explicit window can't exist (filtered in SQL) — kept for safety
      keys = [...keys, ...extra].sort();
    } else keys = keys.sort();
    let data = keys.map((k) => {
      const row = byBucket.get(k) || { _group: k };
      schema.measures.forEach((m) => { if (row[m.key] === undefined) row[m.key] = 0; });
      if (labels && labels.has(k)) row._label = labels.get(k);
      return row;
    });
    // bucketLabel.merge: rows whose NAME is the same become one row (e.g. "VIP" of every event). Counts and sums add up exactly;
    // _ids keeps the underlying ids so a click-through can still filter on them.
    if (schema.bucketLabel && schema.bucketLabel.merge) {
      const merged = new Map();
      data.forEach((row) => {
        const name = row._label !== undefined && row._label !== null && row._label !== '' ? String(row._label) : row._group;
        if (!merged.has(name)) merged.set(name, { _group: name, _label: name, _ids: [] });
        const into = merged.get(name);
        into._ids.push(row._group);
        schema.measures.forEach((m) => { into[m.key] = (into[m.key] || 0) + row[m.key]; });
      });
      data = [...merged.values()];
    }
    const meta = { entity: schema.entity, bucket, start: range.start, end: range.endExcl, generatedAt: new Date().toISOString(), cached: false, ageSeconds: 0, rows: data.length };
    cache.set(key, { data, meta }, ttlMs, now.getTime());
    return { data, meta };
  });
  return value;
}

// CREATE INDEX lines worth having for this schema (printed, never executed). (tenant, date) per measure table, (link, tenant) per join table.
export function indexAdvice(schema) {
  const tenant = schema.tenantColumn === null ? null : (schema.tenantColumn || 'hive_site_id');
  const out = new Map();
  const add = (table, cols) => { const c = cols.filter(Boolean); if (c.length) out.set(`${table}|${c.join(',')}`, `CREATE INDEX idx_${table}_${c.join('_')} ON ${table} (${c.join(', ')});`); };
  schema.measures.forEach((m) => {
    add(m.table, [tenant, m.by || m.group]);
    if (m.join) add(m.join.table, [tenant, m.join.to]);
  });
  return [...out.values()];
}
