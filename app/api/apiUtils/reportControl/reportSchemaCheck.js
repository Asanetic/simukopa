// reportSchemaCheck.js — a backend report schema is trusted ONLY after it passes this file.
// Two gates:
//   validateApiSchema(schema)            static: every identifier is a plain word, every operator/aggregate is on the allow-list.
//   verifySchemaAgainstDb(schema, db)    live: every table/column named in the schema really exists (once per process).
// Nothing a request sends can add a table or column, so these two gates are what make "schema-only" safe.

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const AGGS = ['count', 'sum', 'avg', 'min', 'max', 'countDistinct'];
export const OPS = ['=', '!=', '>', '>=', '<', '<=', 'IN', 'NOT IN', 'LIKE', 'IS NULL', 'IS NOT NULL'];
export const TIME_BUCKETS = ['day', 'month', 'year'];
const CREDITS = ['full', 'split'];

const isIdent = (s) => typeof s === 'string' && IDENT.test(s);

function checkWhere(list, where, problems) {
  if (where === undefined) return;
  if (!Array.isArray(where)) { problems.push(`${list}: where must be an array of { col, op, val }.`); return; }
  where.forEach((w, i) => {
    const at = `${list} where[${i}]`;
    if (!w || !isIdent(w.col)) problems.push(`${at}: col must be a plain column name.`);
    if (!w || !OPS.includes(w.op)) problems.push(`${at}: op must be one of ${OPS.join(' ')}.`);
    else if (w.op === 'IS NULL' || w.op === 'IS NOT NULL') { /* no value */ }
    else if (w.op === 'IN' || w.op === 'NOT IN') {
      if (!Array.isArray(w.val) || w.val.length === 0 || w.val.length > 200) problems.push(`${at}: IN needs a list of 1–200 values.`);
    } else if (w.val === undefined || w.val === null || typeof w.val === 'object') problems.push(`${at}: val must be a string, number or boolean.`);
  });
}

export function validateApiSchema(schema) {
  const problems = [];
  const name = schema && schema.entity ? schema.entity : '(report)';
  if (!schema || !isIdent(schema.entity)) { problems.push('entity must be a plain word, e.g. activity_vs_revenue.'); return problems; }
  if (schema.tenantColumn !== undefined && schema.tenantColumn !== null && !isIdent(schema.tenantColumn)) problems.push(`${name}: tenantColumn must be a plain column name (or null for a global, non-tenant report).`);

  const timeMode = TIME_BUCKETS.includes(schema.bucket);
  const dimMode = schema.bucket === 'dimension';
  if (!timeMode && !dimMode) problems.push(`${name}: bucket must be one of ${[...TIME_BUCKETS, 'dimension'].join(', ')}.`);
  if (schema.bucketOptions !== undefined) {
    if (!timeMode) problems.push(`${name}: bucketOptions only applies to day/month/year reports.`);
    else if (!Array.isArray(schema.bucketOptions) || schema.bucketOptions.some((b) => !TIME_BUCKETS.includes(b))) problems.push(`${name}: bucketOptions must list day, month and/or year.`);
  }

  const measures = schema.measures;
  if (!Array.isArray(measures) || measures.length === 0) { problems.push(`${name}: measures must be a non-empty array.`); return problems; }
  const seen = new Set();
  measures.forEach((m, i) => {
    const at = `${name} measure[${i}]${m && m.key ? ` "${m.key}"` : ''}`;
    if (!m || !isIdent(m.key)) { problems.push(`${at}: key must be a plain word.`); return; }
    if (seen.has(m.key)) problems.push(`${at}: duplicate key.`);
    seen.add(m.key);
    if (!isIdent(m.table)) problems.push(`${at}: table must be a plain table name.`);
    if (!AGGS.includes(m.agg)) problems.push(`${at}: agg must be one of ${AGGS.join(', ')}.`);
    if (m.agg !== 'count' && !isIdent(m.col)) problems.push(`${at}: ${m.agg} needs col (the column to ${m.agg}).`);
    if (m.col !== undefined && !isIdent(m.col)) problems.push(`${at}: col must be a plain column name.`);
    if (m.by !== undefined && !isIdent(m.by)) problems.push(`${at}: by must be a plain column name.`);
    if (timeMode && !m.by) problems.push(`${at}: a ${schema.bucket} report needs by (the date column that puts this measure's rows in a ${schema.bucket}).`);
    if (timeMode && (m.group || m.join)) problems.push(`${at}: group/join only apply to bucket:'dimension' reports.`);
    checkWhere(at, m.where, problems);
    if (dimMode) {
      if (m.join) {
        const j = m.join;
        if (m.group) problems.push(`${at}: use group OR join, not both.`);
        if (!isIdent(j.table) || !isIdent(j.from) || !isIdent(j.to) || !isIdent(j.group)) problems.push(`${at}: join needs table, from (column on ${m.table}), to (column on the join table) and group (the join-table column to group by).`);
        if (j.credit !== undefined && !CREDITS.includes(j.credit)) problems.push(`${at}: join.credit must be full or split.`);
        if (j.credit === 'split' && !['sum', 'count'].includes(m.agg)) problems.push(`${at}: credit:'split' only works with sum or count.`);
        checkWhere(`${at} join`, j.where, problems);
      } else if (!isIdent(m.group)) problems.push(`${at}: a dimension report needs group (column to group by) or join.`);
    }
  });

  if (schema.bucketLabel !== undefined) {
    const l = schema.bucketLabel;
    if (!dimMode) problems.push(`${name}: bucketLabel only applies to bucket:'dimension'.`);
    if (!l || !isIdent(l.table) || !isIdent(l.key) || !isIdent(l.label)) problems.push(`${name}: bucketLabel needs { table, key, label } as plain names.`);
    if (l && l.merge && measures.some((m) => !['count', 'sum'].includes(m.agg))) problems.push(`${name}: bucketLabel.merge adds rows together, so every measure must be count or sum (avg/min/max/countDistinct cannot be merged exactly).`);
  }

  if (schema.filters !== undefined) {
    if (!Array.isArray(schema.filters)) problems.push(`${name}: filters must be an array.`);
    else schema.filters.forEach((f, i) => {
      const at = `${name} filter[${i}]`;
      if (!f || !isIdent(f.param)) { problems.push(`${at}: param must be a plain word (the URL name).`); return; }
      if (f.op !== undefined && !['=', 'IN'].includes(f.op)) problems.push(`${at}: op must be = or IN.`);
      if (!f.cols || typeof f.cols !== 'object') { problems.push(`${at}: cols must map every measure key to a column (or null to leave that measure unfiltered).`); return; }
      measures.forEach((m) => {
        if (!(m.key in f.cols)) problems.push(`${at}: cols is missing measure "${m.key}" — map it to a column or null, so a filter can never silently skip a measure.`);
        else if (f.cols[m.key] !== null && !isIdent(f.cols[m.key])) problems.push(`${at}: cols.${m.key} must be a plain column name or null.`);
      });
    });
  }
  return problems;
}

// Every (table, column) the schema depends on — the live check and the index advice both use it.
export function referencedColumns(schema) {
  const tenant = schema.tenantColumn === null ? null : (schema.tenantColumn || 'hive_site_id');
  const need = new Map(); // table -> Set(column)
  const add = (t, c) => { if (!c) return; if (!need.has(t)) need.set(t, new Set()); need.get(t).add(c); };
  schema.measures.forEach((m) => {
    add(m.table, tenant); add(m.table, m.col); add(m.table, m.by); add(m.table, m.group);
    (m.where || []).forEach((w) => add(m.table, w.col));
    if (m.join) {
      add(m.table, m.join.from); add(m.join.table, tenant); add(m.join.table, m.join.to); add(m.join.table, m.join.group);
      (m.join.where || []).forEach((w) => add(m.join.table, w.col));
    }
  });
  (schema.filters || []).forEach((f) => schema.measures.forEach((m) => add(m.table, f.cols[m.key])));
  if (schema.bucketLabel) { const l = schema.bucketLabel; add(l.table, tenant); add(l.table, l.key); add(l.table, l.label); }
  return need;
}

const verified = new Map(); // `${entity}` -> Promise
export function verifySchemaAgainstDb(schema, db) {
  const id = `${schema.entity}`;
  if (!verified.has(id)) {
    const p = (async () => {
      const need = referencedColumns(schema);
      const have = await db.columns([...need.keys()]); // Map table -> Set(column)
      const missing = [];
      for (const [t, cols] of need) {
        if (!have.has(t)) { missing.push(`table "${t}"`); continue; }
        for (const c of cols) if (!have.get(t).has(c)) missing.push(`column "${t}.${c}"`);
      }
      if (missing.length) throw new Error(`report "${schema.entity}" names things that do not exist in the database: ${missing.join(', ')}`);
      return true;
    })();
    verified.set(id, p);
    p.catch(() => setTimeout(() => verified.delete(id), 30000).unref?.()); // retry after 30s, don't hammer
  }
  return verified.get(id);
}
export const _resetVerified = () => verified.clear();
