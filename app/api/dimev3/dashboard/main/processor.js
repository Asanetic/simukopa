// ════════════════════════════════════════════════════════════════
// processor.js — the engine behind the dashboard route. Three files live together in
// app/api/<app>/dashboard/main/ :
//   route.js              login check + one call to processDashboard()
//   dashboard.schema.js   the ONE schema for this app: screen layout + queries (the browser receives the layout without the queries)
//   processor.js          this file: query compiler + runner + cache  (copy it unchanged into each app)
//
// The browser never sends SQL. It calls the route with ?from=&to=&<filter keys>, and this file runs
// the queries written in the app's schema: bound parameters only, identifiers validated and
// back-ticked, tenant column forced from the login token, one DB connection per computation.
//
// SCHEMA
//   { tz, cacheMs, scope?,
//     filters: { county: 'county_id' },              filter key → column; applies to every query on the field's tables (query.filters:false opts out)
//     options: { counties: {table,value,label} | ['A','B'] },
//     widgets: { <id>: { query, compare?, alert?, kind? } } }     <id> = the id used in the front-end schema
//   A widget with no groupBy is a stat card, with groupBy a chart (raw SQL: kind:'chart' or fill).
//
// QUERY
//   { table, agg: count|sum|avg|min|max, col, distinct,
//     where: [ {col, eq|ne|gt|gte|lt|lte|like|in|notIn|between|isNull|notNull: v, lower?}, {or:[…]} ],
//     dateCol,            global from/to applies to this column      ranged:false → ignore the date filter
//     filters:false  opt out of the dashboard filters (they apply by table automatically)   scope:false|'col' → tenant column
//     groupBy: 'col' | {col, label:{table,key,col}} | {month:'col'} | {day:'col'},
//     blank, orderBy:'value desc'|'label asc'…, limit (≤100), months (≤60), days (≤366) }
//   or raw: { sql:'SELECT … FROM {db}.t WHERE (:site IS NULL OR hive_site_id=:site) …', ranged?, fill?:'month'|'day' }
//     named params: :site :from :to :fromTs :toExclusive :windowStart :f_<filterKey>
//     charts read columns `label` + `value`, stats read `value`
// ════════════════════════════════════════════════════════════════

export class DashQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DashQueryError';
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);
const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'notIn', 'between', 'isNull', 'notNull'];
const CMP = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const MAX_IN = 200;
const LBL = '`__lbl`';
const VAL = '`__val`';

const fail = (msg) => { throw new DashQueryError(msg); };
const bt = (name, what) => {
  if (typeof name !== 'string' || !IDENT.test(name)) fail(`Invalid ${what} name: ${JSON.stringify(name)}`);
  return `\`${name}\``;
};
const clampInt = (v, lo, hi, dflt) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// ── dates (pure string/UTC maths, so server timezone never shifts a day) ──
const pad = (n) => String(n).padStart(2, '0');
const fmtUtc = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export function isYmd(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return fmtUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

export function diffDays(fromYmd, toYmd) {
  const [a, b, c] = fromYmd.split('-').map(Number);
  const [x, y, z] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86400000);
}

// ── date range: whole days ('2026-05-31') or to-the-minute ('2026-05-31 14:30') ──
export function isStamp(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(v)) return false;
  const h = Number(v.slice(11, 13));
  const m = Number(v.slice(14, 16));
  return isYmd(v.slice(0, 10)) && h < 24 && m < 60;
}
export const fmtTs = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

function parseBound(v) {
  if (isYmd(v)) {
    const [y, m, d] = v.split('-').map(Number);
    const ms = Date.UTC(y, m - 1, d);
    return { text: v, ms, endMs: ms + 86400000 }; // the whole day
  }
  if (isStamp(v)) {
    const [y, mo, d] = v.slice(0, 10).split('-').map(Number);
    const ms = Date.UTC(y, mo - 1, d, Number(v.slice(11, 13)), Number(v.slice(14, 16)));
    return { text: v.replace('T', ' '), ms, endMs: ms + 60000 }; // the whole minute
  }
  return null;
}

// → { from, to (as given), fromTs, toTs (exclusive, 'YYYY-MM-DD HH:MM:SS'), fromMs, toMs } — empty strings / null when not set
export function makeRange(fromIn, toIn) {
  let f = parseBound(fromIn);
  let t = parseBound(toIn);
  if (f && t && f.ms > t.ms) [f, t] = [t, f];
  return {
    from: f ? f.text : '', to: t ? t.text : '',
    fromTs: f ? fmtTs(f.ms) : '', toTs: t ? fmtTs(t.endMs) : '',
    fromMs: f ? f.ms : null, toMs: t ? t.endMs : null,
  };
}

// first bucket of a time-series window, as YYYY-MM-DD
export function windowStart(unit, n, today) {
  const [y, m] = today.split('-').map(Number);
  if (unit === 'month') return fmtUtc(new Date(Date.UTC(y, m - 1 - (n - 1), 1)));
  return addDays(today, -(n - 1));
}

export const seriesWindow = (q, unit) =>
  unit === 'month' ? clampInt(q.months, 2, 60, 24) : clampInt(q.days, 2, 366, 30);

// Does the global date filter apply to this widget? (the UI shows a marker for these)
export function isRanged(q) {
  if (!q || typeof q !== 'object') return false;
  if (q.sql) return q.ranged === true;
  if (!q.dateCol || q.ranged === false) return false;
  const g = q.groupBy;
  const isTime = g && typeof g === 'object' && (g.month || g.day);
  return isTime ? q.ranged === true : true;
}

// ── where conditions ──────────────────────────────────────────────
function compileCond(cond, alias, params, depth = 0) {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) fail('Each where entry must be an object');

  if ('or' in cond) {
    if (depth > 0) fail('"or" can only be used at the top level of where');
    if (!Array.isArray(cond.or) || !cond.or.length) fail('"or" needs a non-empty array');
    return `(${cond.or.map((c) => compileCond(c, alias, params, depth + 1)).join(' OR ')})`;
  }

  const ops = OPS.filter((k) => k in cond);
  if (ops.length !== 1) fail(`Condition on ${JSON.stringify(cond.col)} needs exactly one operator (${OPS.join(', ')})`);
  const op = ops[0];
  const colSql = `${alias}.${bt(cond.col, 'column')}`;
  const expr = cond.lower ? `LOWER(${colSql})` : colSql;

  const val = (v) => {
    if (v === undefined || (v !== null && typeof v === 'object')) fail(`Bad value for ${cond.col}.${op}`);
    if (typeof v === 'number' && !Number.isFinite(v)) fail(`Bad number for ${cond.col}.${op}`);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return cond.lower && typeof v === 'string' ? v.toLowerCase() : v;
  };

  switch (op) {
    case 'isNull': return `${colSql} IS NULL`;
    case 'notNull': return `${colSql} IS NOT NULL`;
    case 'in':
    case 'notIn': {
      const list = cond[op];
      if (!Array.isArray(list)) fail(`${cond.col}.${op} needs an array`);
      if (!list.length) return op === 'in' ? '1 = 0' : '1 = 1'; // empty IN matches nothing
      if (list.length > MAX_IN) fail(`${cond.col}.${op} is limited to ${MAX_IN} values`);
      list.forEach((v) => params.push(val(v)));
      return `${expr} ${op === 'in' ? 'IN' : 'NOT IN'} (${list.map(() => '?').join(',')})`;
    }
    case 'between': {
      const b = cond.between;
      if (!Array.isArray(b) || b.length !== 2) fail(`${cond.col}.between needs [from, to]`);
      params.push(val(b[0]), val(b[1]));
      return `${expr} BETWEEN ? AND ?`;
    }
    case 'like':
      params.push(val(cond.like));
      return `${expr} LIKE ?`;
    case 'eq':
      if (cond.eq === null) return `${colSql} IS NULL`;
      break;
    case 'ne':
      if (cond.ne === null) return `${colSql} IS NOT NULL`;
      break;
    default:
  }
  params.push(val(cond[op]));
  return `${expr} ${CMP[op]} ?`;
}

function rangeConds(alias, col, range, conds, params) {
  if (range.fromTs) { conds.push(`${alias}.${col} >= ?`); params.push(range.fromTs); }
  if (range.toTs) { conds.push(`${alias}.${col} < ?`); params.push(range.toTs); } // end-exclusive: index-friendly, includes the whole "to" day / minute
}

const sanityCheck = (sql, params) => {
  const marks = (sql.match(/\?/g) || []).length;
  if (marks !== params.length) fail(`Internal: ${marks} placeholders but ${params.length} params`);
};

// ── entry point ───────────────────────────────────────────────────
// ctx: { db, siteId, scopeCol, range:{from,to}, today:'YYYY-MM-DD' }
// opts.role: 'scalar' (stat card) | 'series' (chart)
export function compileQuery(query, ctx, opts = {}) {
  if (!query || typeof query !== 'object') fail('query is required');
  return query.sql ? compileRaw(query, ctx, opts.role) : compileDeclarative(query, ctx, opts.role);
}

function compileDeclarative(q, ctx, role) {
  const db = bt(ctx.db, 'database');
  const table = bt(q.table, 'table');
  const range = ctx.range || {};

  const joinSql = [];
  const joinParams = [];
  const where = [];
  const whereParams = [];

  const scopeCol = q.scope === false ? null : typeof q.scope === 'string' ? q.scope : ctx.scopeCol;

  // aggregate
  const agg = String(q.agg || 'count').toLowerCase();
  if (!AGGS.has(agg)) fail(`Unknown agg "${q.agg}"`);
  let aggSql;
  if (agg === 'count') {
    aggSql = q.distinct ? `COUNT(DISTINCT t.${bt(q.distinct, 'column')})` : 'COUNT(*)';
  } else {
    if (!q.col) fail(`agg "${agg}" needs col`);
    aggSql = `COALESCE(${agg.toUpperCase()}(t.${bt(q.col, 'column')}),0)`;
  }

  // grouping
  const g = q.groupBy;
  let kind = 'scalar';
  let unit = null;
  let timeCol = null;
  let selectLabel = null;
  let groupSql = null;
  let hasLookup = false;

  if (g !== undefined && g !== null) {
    if (typeof g === 'string') {
      kind = 'category';
      selectLabel = groupSql = `t.${bt(g, 'column')}`;
    } else if (typeof g === 'object' && (g.month || g.day)) {
      kind = 'time';
      unit = g.month ? 'month' : 'day';
      timeCol = bt(g.month || g.day, 'column');
      selectLabel = groupSql = `DATE_FORMAT(t.${timeCol},'${unit === 'month' ? '%Y-%m' : '%Y-%m-%d'}')`;
    } else if (typeof g === 'object' && g.col) {
      kind = 'category';
      const base = `t.${bt(g.col, 'column')}`;
      if (g.label) {
        const L = g.label;
        const lookupScope = L.scope === false ? null : typeof L.scope === 'string' ? L.scope : ctx.scopeCol;
        let on = `j1.${bt(L.key, 'column')} = ${base}`;
        // the lookup is tenant-scoped too, otherwise ids that repeat across tenants duplicate rows / leak names
        if (lookupScope && ctx.siteId) {
          on += ` AND j1.${bt(lookupScope, 'column')} = ?`;
          joinParams.push(ctx.siteId);
        }
        joinSql.push(`LEFT JOIN ${db}.${bt(L.table, 'table')} j1 ON ${on}`);
        const lc = `j1.${bt(L.col, 'column')}`;
        selectLabel = lc;
        groupSql = `${base}, ${lc}`;
        hasLookup = true;
      } else {
        selectLabel = groupSql = base;
      }
    } else {
      fail('groupBy must be a column name, { col, label }, { month } or { day }');
    }
  }

  if (role === 'scalar' && kind !== 'scalar') fail('Stat cards cannot use groupBy');
  if (role === 'series' && kind === 'scalar') fail('Charts need groupBy');

  // where
  if (q.where !== undefined) {
    if (!Array.isArray(q.where)) fail('where must be an array');
    q.where.forEach((c) => where.push(compileCond(c, 't', whereParams)));
  }

  // dashboard filters: a filter field applies by itself to every query on one of its tables (field.tables, default the
  // table its options come from). A query can opt out with filters:false, or list keys itself (filters:['county']).
  // Keys that no longer exist (field removed) are skipped — nothing breaks.
  if (q.filters !== undefined && q.filters !== false && !Array.isArray(q.filters)) fail('filters must be an array of filter keys, or false');
  if (q.filters !== false) {
    const keys = new Set(Array.isArray(q.filters) ? q.filters : []);
    for (const [key, tables] of Object.entries(ctx.filterTables || {})) if (tables.includes(q.table)) keys.add(key);
    for (const key of keys) {
      const col = ctx.filterCols && Object.hasOwn(ctx.filterCols, key) ? ctx.filterCols[key] : null;
      if (!col) continue;
      const v = ctx.filters?.[key];
      if (v !== undefined && v !== null && v !== '') { where.push(`t.${bt(col, 'column')} = ?`); whereParams.push(v); }
    }
  }

  const ranged = isRanged(q);
  if (ranged) rangeConds('t', bt(q.dateCol, 'column'), range, where, whereParams);

  let n = null;
  if (kind === 'time') {
    n = seriesWindow(q, unit);
    where.push(`t.${timeCol} >= ?`);
    whereParams.push(`${windowStart(unit, n, ctx.today)} 00:00:00`);
  }

  if (scopeCol && ctx.siteId) {
    where.push(`t.${bt(scopeCol, 'column')} = ?`);
    whereParams.push(ctx.siteId);
  }

  // assemble — params are pushed in the same order the placeholders appear: joins, then where
  const params = [...joinParams, ...whereParams];
  const select = [];
  if (selectLabel) select.push(`${selectLabel} AS ${LBL}`);
  select.push(`${aggSql} AS ${VAL}`);

  let sql = `SELECT ${select.join(', ')} FROM ${db}.${table} t`;
  if (joinSql.length) sql += ` ${joinSql.join(' ')}`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  if (groupSql) sql += ` GROUP BY ${groupSql}`;

  let order = null;
  if (kind === 'category') {
    const m = /^(value|label)\s+(asc|desc)$/i.exec(String(q.orderBy || 'value desc').trim());
    if (!m) fail(`Bad orderBy ${JSON.stringify(q.orderBy)} (use "value desc", "label asc", …)`);
    order = `${m[1].toLowerCase()} ${m[2].toLowerCase()}`;
    sql += m[1].toLowerCase() === 'value'
      ? ` ORDER BY ${VAL} ${m[2].toUpperCase()}, ${LBL} ASC`
      : ` ORDER BY ${LBL} ${m[2].toUpperCase()}`;
    sql += ` LIMIT ${clampInt(q.limit, 1, 100, 12)}`; // inlined integer: LIMIT ? is unreliable with prepared statements
  }

  sanityCheck(sql, params);
  return {
    sql, params, kind, unit, n, ranged, order,
    raw: false,
    additive: agg === 'count' || agg === 'sum',
    blank: typeof q.blank === 'string' ? q.blank : hasLookup ? 'Unknown' : 'Other',
  };
}

// ── raw SQL (server-authored, so trusted) with named params turned into bound ? ──
function compileRaw(q, ctx, role) {
  let sql = String(q.sql).trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(sql)) fail('Raw SQL must start with SELECT or WITH');
  sql = sql.split('{db}').join(bt(ctx.db, 'database'));

  const range = ctx.range || {};
  let kind = role === 'scalar' ? 'scalar' : 'category';
  let unit = null;
  let n = null;
  if (role !== 'scalar' && q.fill) {
    if (q.fill !== 'month' && q.fill !== 'day') fail('fill must be "month" or "day"');
    kind = 'time';
    unit = q.fill;
    n = seriesWindow(q, unit);
  }

  const named = {
    from: range.from || null, to: range.to || null,
    fromTs: range.fromTs || null, toExclusive: range.toTs || null,
    site: ctx.siteId || null,
    windowStart: unit ? `${windowStart(unit, n, ctx.today)} 00:00:00` : null,
  };
  for (const key of Object.keys(ctx.filterCols || {})) {
    const v = ctx.filters?.[key];
    named[`f_${key}`] = v === undefined || v === '' ? null : v;
  }

  const params = [];
  sql = sql.replace(/(?<![:\w]):([A-Za-z_]\w*)/g, (m, name) => {
    if (!Object.hasOwn(named, name)) fail(`Unknown named param :${name} (allowed: ${Object.keys(named).map((k) => ':' + k).join(' ')})`);
    params.push(named[name]);
    return '?';
  });
  return { sql, params, kind, unit, n, ranged: q.ranged === true, order: null, raw: true, additive: q.additive !== false, blank: typeof q.blank === 'string' ? q.blank : 'Other' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WIDGET_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const MAX_FILTER_LEN = 100;

// ── context ───────────────────────────────────────────────────────
function todayIn(tz, now) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export const filterColumns = (schema) =>
  Object.fromEntries(Object.entries(schema.filters || {}).map(([k, v]) => [k, typeof v === 'string' ? v : v?.col]));

// filters: raw values from the request. Only keys the schema declares are kept; values are trimmed strings.
export function makeCtx({ schema, db, siteId = '', from = '', to = '', filters = {}, now = new Date() }) {
  const filterCols = filterColumns(schema);
  const clean = {};
  for (const key of Object.keys(filterCols)) {
    const v = filters[key];
    if (typeof v === 'string' || typeof v === 'number') {
      const t = String(v).trim().slice(0, MAX_FILTER_LEN);
      if (t) clean[key] = t;
    }
  }
  const tz = schema.tz || 'UTC';
  return {
    db,
    siteId: siteId ? String(siteId) : '',
    scopeCol: schema.scope === false ? null : schema.scope?.col || 'hive_site_id',
    range: makeRange(from, to),
    filterCols,
    filterTables: schema._filterTables || {},
    filters: clean,
    tz,
    today: todayIn(tz, now),
  };
}

// ── widget roles ──────────────────────────────────────────────────
export function roleOf(w) {
  if (w.kind === 'stat') return 'scalar';
  if (w.kind === 'chart') return 'series';
  const q = w.query || {};
  if (q.sql) return q.fill ? 'series' : 'scalar';
  return q.groupBy !== undefined && q.groupBy !== null ? 'series' : 'scalar';
}

// ── dropdown options ──────────────────────────────────────────────
export function compileOptions(def, ctx) {
  const bt = (n, what) => {
    if (typeof n !== 'string' || !IDENT.test(n)) throw new DashQueryError(`Invalid ${what} name: ${JSON.stringify(n)}`);
    return `\`${n}\``;
  };
  const params = [];
  const scopeCol = def.scope === false ? null : typeof def.scope === 'string' ? def.scope : ctx.scopeCol;
  let sql = `SELECT ${bt(def.value, 'column')} AS \`__v\`, ${bt(def.label || def.value, 'column')} AS \`__l\` FROM ${bt(ctx.db, 'database')}.${bt(def.table, 'table')}`;
  if (scopeCol && ctx.siteId) { sql += ` WHERE ${bt(scopeCol, 'column')} = ?`; params.push(ctx.siteId); }
  sql += ` GROUP BY \`__v\`, \`__l\` ORDER BY \`__l\` ASC LIMIT 500`;
  return { sql, params };
}

async function buildOptions(schema, ctx, run) {
  const out = {};
  for (const [key, def] of Object.entries(schema.options || {})) {
    try {
      if (Array.isArray(def)) {
        out[key] = def.map((o) => (typeof o === 'object' ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) }));
      } else {
        const c = compileOptions(def, ctx);
        const rows = await run(c.sql, c.params);
        out[key] = rows.filter((r) => r.__v !== null && r.__v !== '').map((r) => ({ value: String(r.__v), label: String(r.__l ?? r.__v) }));
      }
    } catch (e) {
      console.error('[dashboard] options failed for', key, e.message);
      out[key] = [];
    }
  }
  return out;
}

// ── schema: ONE file = layout + queries ──────────────────────────────
// layout blocks (rendered top to bottom): the browser gets them WITHOUT their queries.
//   { kind:'filters', fields:[ {key,label,column, tables?:['sales_orders'], options:[…] | optionsQuery:{table,value,label}, type?:'select'|'text'} ], date?:false, time?:false }
//        a field filters every card/chart whose query table is in its `tables` (default: the optionsQuery table). Opt a card out with query.filters:false.
//   { kind:'attention', title?, items:[ { id, text:'{n} items low on stock', query (one number), href?, hrefFilter?, tone?:'danger'|'warn'|'info' } ] }  rows with 0 are hidden
//   { kind:'stats',   items:[ { id,label,href?,prefix?, query, compare?, alert? } ] }
//   { kind:'chart',   id, type:'bar'|'hbar'|'trend'|'donut', title, href?, prefix?, unit?, span?, query }
//   { kind:'grid',    id, ref, title?, href?, props?, bare?, span? }    ref = name in the front end's gridRegistry.js
//   { kind:'heading', id, text, sub? }
const BLOCK_KINDS = ['filters', 'stats', 'attention', 'chart', 'grid', 'heading'];
const CHART_TYPES = ['bar', 'hbar', 'trend', 'donut'];
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const normalized = new WeakMap();

// a block with a missing `kind` / `id` is repaired from its shape instead of breaking the dashboard
function repairBlock(b, i) {
  if (!b || typeof b !== 'object') return b;
  const kind = b.kind || (b.fields || b.date !== undefined ? 'filters' : b.items ? 'stats' : b.ref ? 'grid' : b.text ? 'heading' : b.type && b.query ? 'chart' : undefined);
  if (!kind) return b;
  return { ...b, kind, id: b.id || `${kind}-${i}` };
}

// layout → { widgets, filters, options } (what the engine runs). A schema that already has `widgets` and no layout is used as is.
export function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.layout)) return schema;
  if (normalized.has(schema)) return normalized.get(schema);
  schema = { ...schema, layout: schema.layout.map(repairBlock) };
  const widgets = {};
  const filters = {};
  const filterTables = {};
  const options = {};
  const dup = [];
  const add = (id, w) => { if (Object.hasOwn(widgets, id)) dup.push(id); widgets[id] = w; };
  for (const b of schema.layout) {
    if (b?.kind === 'stats' || b?.kind === 'attention') (b.items || []).forEach((it) => it?.id && add(it.id, it));
    else if (b?.kind === 'chart' && b.id) add(b.id, b); // block.kind === 'chart' doubles as the widget role
    else if (b?.kind === 'filters') {
      for (const f of b.fields || []) {
        if (f?.key && f.column) filters[f.key] = f.column;
        if (f?.key) filterTables[f.key] = f.tables || (f.optionsQuery?.table ? [f.optionsQuery.table] : []);
        if (f?.key && f.optionsQuery) options[f.key] = f.optionsQuery;
      }
    }
  }
  const out = { ...schema, widgets, filters, options, _filterTables: filterTables, _dups: dup };
  normalized.set(schema, out);
  return out;
}

// href + hrefFilter:{col,value,table?} → href?<table>_mosyfilter=btoa("<camelCol>=" + btoa(value))  (col is camelCased: sale_status → saleStatus), so the list page opens already filtered.
// table defaults to the card's query table; set hrefFilter.table when the list page belongs to another table.
// sale_status → saleStatus (already-camel names such as saleDate are left alone)
export const camel = (s) => String(s).replace(/_+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());

export function linkWithFilter(it) {
  const f = it.hrefFilter;
  if (!f || f.col === undefined || f.value === undefined || f.value === null) return it.href;
  const b64 = (v) => Buffer.from(String(v), 'utf8').toString('base64');
  const table = f.table || it.query?.table;
  if (!table) return it.href;
  const param = `${table}_mosyfilter=${encodeURIComponent(b64(`${camel(f.col)}=${b64(f.value)}`))}`;
  return `${it.href}${it.href.includes('?') ? '&' : '?'}${param}`;
}

// what the browser receives: the layout with every query, column name and SQL removed
export function publicLayout(input) {
  const schema = normalizeSchema(input);
  const strip = (it) => ({ ...omit(it, ['query', 'alert', 'compare', 'hrefFilter']), ...(it.href ? { href: linkWithFilter(it) } : {}) });
  return schema.layout.map((b) => {
    if (b.kind === 'stats') return { ...b, items: b.items.map(strip) };
    if (b.kind === 'attention') return { ...omit(b, ['hrefFilter']), ...(b.href ? { href: linkWithFilter(b) } : {}), items: b.items.map(strip) }; // block href = "View All", each row has its own View link
    if (b.kind === 'chart') return strip(b);
    if (b.kind === 'filters') {
      return { ...b, fields: (b.fields || []).map((f) => ({ ...omit(f, ['column', 'optionsQuery']), ...(f.optionsQuery ? { optionsKey: f.key } : {}) })) };
    }
    return { ...b };
  });
}

// ── schema validation ─────────────────────────────────────────────
// Compiles every query once with a dummy context, so a typo in a dashboard file
// fails at load / in CI instead of showing up as a broken widget in production.
export function validateSchema(input, name = 'dashboard') {
  const problems = lintSchema(input);
  if (problems.length) throw new Error(`[${name}] invalid dashboard schema:\n  - ${problems.join('\n  - ')}`);
  return input;
}

// every problem found in a schema (empty = clean). processDashboard reports these but keeps serving what works.
export function lintSchema(input) {
  if (!input || typeof input !== 'object') return ['schema must be an object'];
  const schema = normalizeSchema(input);
  const problems = [];
  const bad = (msg) => problems.push(msg);

  if (input.layout !== undefined) {
    if (!Array.isArray(input.layout) || !input.layout.length) bad('layout must be a non-empty array');
    const seen = new Set();
    (schema.layout || []).forEach((b, i) => {
      const at = `layout[${i}]`;
      if (!b || !BLOCK_KINDS.includes(b.kind)) return bad(`${at}: kind must be one of ${BLOCK_KINDS.join(', ')}`);
      if (b.kind !== 'filters' || b.id) {
        if (typeof b.id !== 'string' || !b.id) bad(`${at}: id is required`);
        else if (seen.has(b.id)) bad(`${at}: duplicate id "${b.id}"`);
        else seen.add(b.id);
      }
      if (b.kind === 'stats' || b.kind === 'attention') {
        const attn = b.kind === 'attention';
        if (!Array.isArray(b.items) || !b.items.length) bad(`${at}: ${b.kind} needs a non-empty items[]`);
        (b.items || []).forEach((it, j) => {
          if (!(attn ? it?.text : it?.label)) bad(`${at}.items[${j}]: ${attn ? 'text (use {n} for the count)' : 'label'} is required`);
          if (attn && it?.query?.groupBy) bad(`${at}.items[${j}]: an attention item counts one number — remove groupBy`);
          if (it?.hrefFilter && (!it.href || !IDENT.test(String(it.hrefFilter.col)) || it.hrefFilter.value == null || !(it.hrefFilter.table || it.query?.table))) bad(`${at}.items[${j}]: hrefFilter needs href, col, value (and table when the query is raw SQL)`);
          if (typeof it?.id !== 'string' || !it.id) bad(`${at}.items[${j}]: id is required`);
          else if (seen.has(it.id)) bad(`${at}.items[${j}]: duplicate id "${it.id}"`);
          else seen.add(it.id);
        });
      } else if (b.kind === 'chart') {
        if (!CHART_TYPES.includes(b.type)) bad(`${at}: chart type must be one of ${CHART_TYPES.join(', ')}`);
        if (b.hrefFilter && (!b.href || !IDENT.test(String(b.hrefFilter.col)) || b.hrefFilter.value == null || !(b.hrefFilter.table || b.query?.table))) bad(`${at}: hrefFilter needs href, col, value (and table when the query is raw SQL)`);
      } else if (b.kind === 'grid') {
        if (typeof b.ref !== 'string' || !b.ref) bad(`${at}: grid needs ref (a name from gridRegistry.js)`);
        if (b.props !== undefined && !isPlainJson(b.props)) bad(`${at}: grid props must be plain JSON`);
      } else if (b.kind === 'heading') {
        if (!b.text) bad(`${at}: heading needs text`);
      } else if (b.kind === 'filters') {
        (b.fields || []).forEach((f, j) => {
          if (!f?.key || !f.column) bad(`${at}.fields[${j}]: key and column are required`);
          if (f?.optionsQuery && f.options) bad(`${at}.fields[${j}]: use options OR optionsQuery`);
        });
      }
    });
  }

  Object.entries(schema.filters || {}).forEach(([k, v]) => {
    const col = typeof v === 'string' ? v : v?.col;
    if (!IDENT.test(k)) bad(`filters.${k}: key must be a plain identifier`);
    if (typeof col !== 'string' || !IDENT.test(col)) bad(`filters.${k}: column must be a plain identifier`);
  });

  const probe = makeCtx({ schema, db: 'probe_db', siteId: 'probe_site', from: '2026-01-01', to: '2026-01-31', filters: {}, now: new Date('2026-06-15T12:00:00Z') });
  const dry = (q, role, where) => {
    try { return compileQuery(q, probe, { role }); } catch (e) { bad(`${where}: ${e.message}`); return null; }
  };

  const widgets = schema.widgets;
  if (!widgets || typeof widgets !== 'object' || Array.isArray(widgets) || !Object.keys(widgets).length) bad('no widgets: add a stats or chart block with a query');
  (schema._dups || []).forEach((id) => bad(`duplicate widget id "${id}"`));
  Object.entries(widgets || {}).forEach(([id, w]) => {
    const at = `widgets.${id}`;
    if (!WIDGET_ID.test(id)) bad(`${at}: id must match ${WIDGET_ID}`);
    if (!w || typeof w !== 'object') return bad(`${at}: must be an object`);
    const c = dry(w.query, roleOf(w), at);
    if (c && w.type === 'trend' && c.kind !== 'time') bad(`${at}: a trend chart needs groupBy {month|day} (or raw sql with fill)`);
    if (c && w.kind === 'chart' && w.type && w.type !== 'trend' && c.kind === 'time') bad(`${at}: ${w.type} charts can't use a time groupBy — use type "trend"`);
    if (w.alert) dry(w.alert.query, 'scalar', `${at}.alert`);
    if (w.compare && !(roleOf(w) === 'scalar' && isRanged(w.query))) bad(`${at}: compare needs a stat query with dateCol (or raw sql with ranged:true)`);
  });

  Object.entries(schema.options || {}).forEach(([k, def]) => {
    if (Array.isArray(def)) return;
    try { compileOptions(def || {}, probe); } catch (e) { bad(`options.${k}: ${e.message}`); }
  });

  return problems;
}

function isPlainJson(v, depth = 0) {
  if (depth > 20) return false;
  if (v === null || ['string', 'boolean'].includes(typeof v)) return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isPlainJson(x, depth + 1));
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v).every((x) => isPlainJson(x, depth + 1));
  return false;
}

// ── result shaping ────────────────────────────────────────────────
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function scalarOf(rows, c) {
  const r = rows && rows[0];
  if (!r) return 0;
  return num(c.raw ? ('value' in r ? r.value : Object.values(r)[0]) : r.__val);
}

function categorySeries(rows, c) {
  const out = [];
  const index = new Map();
  let merged = false;
  for (const r of rows) {
    const rawLabel = c.raw ? r.label : r.__lbl;
    const label = rawLabel === null || rawLabel === undefined || String(rawLabel).trim() === '' ? c.blank : String(rawLabel);
    const value = num(c.raw ? r.value : r.__val);
    if (c.additive && index.has(label)) { out[index.get(label)].value += value; merged = true; }
    else { index.set(label, out.length); out.push({ label, value }); }
  }
  if (merged && c.order === 'value desc') out.sort((a, b) => b.value - a.value);
  return { rows: out, total: out.reduce((s, r) => s + r.value, 0) };
}

function bucketKeys(unit, n, today) {
  const [y, m] = today.split('-').map(Number);
  if (unit === 'month') {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    });
  }
  return Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));
}

const bucketLabel = (unit, key) => {
  const [y, m, d] = key.split('-').map(Number);
  return unit === 'month' ? `${MONTHS[m - 1]} '${String(y).slice(2)}` : `${d} ${MONTHS[m - 1]}`;
};

// Runs from the first bucket that has data up to the current one (min 2 points, max = window); gaps → 0.
function timeSeries(rows, c, ctx) {
  const data = new Map();
  for (const r of rows) {
    const lbl = c.raw ? r.label : r.__lbl;
    if (lbl === null || lbl === undefined) continue;
    const key = String(lbl).slice(0, c.unit === 'month' ? 7 : 10);
    data.set(key, (data.get(key) || 0) + num(c.raw ? r.value : r.__val));
  }
  const keys = bucketKeys(c.unit, c.n, ctx.today);
  const first = keys.findIndex((k) => data.has(k));
  if (first === -1) return { rows: [], total: 0 };
  let span = keys.slice(first);
  if (span.length < 2) span = keys.slice(-2);
  const out = span.map((k) => ({ key: k, label: bucketLabel(c.unit, k), value: data.get(k) || 0 }));
  return { rows: out, total: out.reduce((s, r) => s + r.value, 0) };
}

// ── widgets ───────────────────────────────────────────────────────
async function runStat(w, ctx, run, trace) {
  const c = compileQuery(w.query, ctx, { role: 'scalar' });
  trace(c);
  const value = scalarOf(await run(c.sql, c.params), c);
  const out = { value };

  // vs the previous period of the same length — only when the filter has both ends
  const r = ctx.range;
  if (w.compare && c.ranged && r.fromTs && r.toTs) {
    try {
      const len = r.toMs - r.fromMs;
      const prevRange = { from: '', to: '', fromTs: fmtTs(r.fromMs - len), toTs: fmtTs(r.fromMs), fromMs: r.fromMs - len, toMs: r.fromMs };
      const pc = compileQuery(w.query, { ...ctx, range: prevRange }, { role: 'scalar' });
      const prev = scalarOf(await run(pc.sql, pc.params), pc);
      out.trend = { prev, pct: prev ? Math.round(((value - prev) / Math.abs(prev)) * 1000) / 10 : null, prevRange: { from: prevRange.fromTs, to: prevRange.toTs } };
    } catch (e) {
      console.error('[dashboard] compare failed for', w.id, e.message);
    }
  }

  // a side note on the card, e.g. "3 pending orders" — never allowed to break the card itself
  if (w.alert) {
    try {
      const ac = compileQuery(w.alert.query, ctx, { role: 'scalar' });
      const n = scalarOf(await run(ac.sql, ac.params), ac);
      out.alert = n > 0 || w.alert.hideWhenZero === false
        ? { n, text: String(w.alert.text || '{n}').split('{n}').join(n.toLocaleString('en-US')), tone: w.alert.tone || 'danger' }
        : null;
    } catch (e) {
      console.error('[dashboard] alert failed for', w.id, e.message);
      out.alert = null;
    }
  }
  return out;
}

async function runChart(w, ctx, run, trace) {
  const c = compileQuery(w.query, ctx, { role: 'series' });
  trace(c);
  const rows = await run(c.sql, c.params);
  return c.kind === 'time' ? timeSeries(rows, c, ctx) : categorySeries(rows, c);
}

export const listWidgets = (schema) => Object.entries(schema.widgets).map(([id, w]) => ({ ...w, id, _kind: roleOf(w) === 'scalar' ? 'stat' : 'chart' }));

// Runs every widget, one after another on the single connection `run` talks to.
// A failing widget becomes { error } and never takes the page down.
export async function buildDashboard({ schema, ctx, run, debug = false }) {
  const data = {};
  const trace = {};
  for (const w of listWidgets(schema)) {
    const t0 = Date.now();
    let compiled = null;
    try {
      data[w.id] = w._kind === 'stat'
        ? await runStat(w, ctx, run, (c) => { compiled = c; })
        : await runChart(w, ctx, run, (c) => { compiled = c; });
    } catch (e) {
      console.error(`[dashboard] widget "${w.id}" failed:`, e.code || '', e.message);
      data[w.id] = { error: e instanceof DashQueryError ? e.message : `Query failed (${e?.code || e?.name || 'database error'})` };
      if (debug) data[w.id].detail = e.message;
    }
    if (debug) trace[w.id] = { ms: Date.now() - t0, sql: compiled?.sql, params: compiled?.params };
  }
  const options = await buildOptions(schema, ctx, run);
  return { data, options, trace: debug ? trace : undefined };
}

// ── cache: one computation per key per TTL, concurrent requests share it ──
const cache = (globalThis.__mosyDashCache ||= new Map()); // survives dev hot-reload; per Node process
function memo(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
  const promise = Promise.resolve().then(load);
  cache.delete(key);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); }); // failures are never cached
  while (cache.size > 500) cache.delete(cache.keys().next().value);
  return promise;
}
export const clearDashboardCache = () => cache.clear();

// ── database: one connection per dashboard computation, closed afterwards ──
const loadConn = () => import('../../../apiUtils/dataControl/conn'); // app/api/apiUtils/dataControl/conn.js

async function defaultRunWith(fn) {
  const { connectDB } = await loadConn();
  const conn = await connectDB();
  try {
    // MySQL 8: MAX_EXECUTION_TIME (ms) · MariaDB: max_statement_time (s). Whichever isn't supported is ignored.
    await conn.query('SET SESSION MAX_EXECUTION_TIME=8000').catch(() => {});
    await conn.query('SET SESSION max_statement_time=8').catch(() => {});
    return await fn(async (sql, params) => (await conn.execute(sql, params))[0]);
  } finally {
    await conn.end();
  }
}

// ── entry point ───────────────────────────────────────────────────
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const checked = new WeakMap(); // each schema object is validated once per process

/**
 * @param schema        the app's dashboard schema
 * @param auth          decoded token — hive_site_id present = tenant user, absent = superadmin
 * @param searchParams  URLSearchParams of the request
 * @returns             JSON-able object: { status:'success', data, options, range, … } or { status:'error', message }
 * (runWith / db / now are test hooks; leave them out in production)
 */
export async function processDashboard({ schema: input, auth, searchParams, runWith = defaultRunWith, db, now = new Date() }) {
  const isSuperadmin = !auth?.hive_site_id;
  try {
    const schema = normalizeSchema(input);
    if (!checked.has(input)) { checked.set(input, lintSchema(input)); if (checked.get(input).length) console.warn(`[dashboard] schema problems (serving what works):\n  - ${checked.get(input).join('\n  - ')}`); }
    const problems = checked.get(input);
    if (!schema?.widgets || !Object.keys(schema.widgets).length) {
      return { status: 'error', message: `Dashboard schema has no stats or charts with a query.${isSuperadmin ? ` Problems: ${problems.join('; ')}` : ' Ask the administrator to check the schema.'}` };
    }

    // tenant users are pinned to their own site; only superadmin may pick one (or see all)
    const siteId = isSuperadmin ? clean(searchParams.get('hive_site_id'), 64) : clean(auth.hive_site_id, 64);
    const debug = isSuperadmin && searchParams.get('debug') === '1';
    const rawFilters = Object.fromEntries(Object.keys(filterColumns(schema)).map((k) => [k, searchParams.get(k)])); // only declared keys
    const from = clean(searchParams.get('from'), 16);
    const to = clean(searchParams.get('to'), 16);

    const ctx = makeCtx({ schema, db: db || (await loadConn()).activeDB, siteId, from, to, filters: rawFilters, now });
    const key = [input.cacheKey || '', ctx.db, ctx.siteId, ctx.range.fromTs, ctx.range.toTs, JSON.stringify(ctx.filters), debug ? 'd' : ''].join('|');
    // a cache hit never touches the database: the connection is only opened inside the loader
    const built = await memo(key, debug ? 0 : schema.cacheMs ?? 15000, () => runWith((run) => buildDashboard({ schema, ctx, run, debug })));

    return {
      status: 'success',
      is_superadmin: isSuperadmin,
      selected_site: ctx.siteId || null,
      range: { from: ctx.range.from, to: ctx.range.to },
      filters: ctx.filters,
      options: built.options,
      data: built.data,
      ...(searchParams.get('layout') === '1' ? { brand: schema.brand || '', refreshMs: schema.refreshMs ?? 30000, layout: publicLayout(schema) } : {}), // the screen layout: only when asked (first load)
      ...(isSuperadmin && problems.length ? { warnings: problems } : {}),
      ...(debug ? { debug: built.trace } : {}),
      generatedAt: now.toISOString(),
    };
  } catch (err) {
    console.error('[dashboard] failed:', err);
    const code = err?.code || err?.name || 'Error';
    const plain = /^(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|PROTOCOL_CONNECTION_LOST|ER_ACCESS_DENIED_ERROR|ER_BAD_DB_ERROR)$/.test(code) ? 'The database could not be reached' : 'The dashboard failed on the server';
    return { status: 'error', message: isSuperadmin ? `${plain} (${code}): ${String(err.message || err)}` : `${plain} (${code}). Please try again, or tell the administrator.` };
  }
}
