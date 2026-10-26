#!/usr/bin/env node
/**
 * gen-report.js — builds reports from a tiny map. Sits next to db-cli.js and clone-module.js (run from the PROJECT ROOT).
 *
 *   node gen-report.js --new sales/complete "Completed sales"   new module from the template, with a starter report.map
 *   node gen-report.js sales/complete --tables=schema.txt        build it from its own report.map (check + schemas + clone + route)
 *   node gen-report.js sales/history sales/complete              several modules
 *   node gen-report.js --all                                     rebuild every report.map under app/<app>
 *   node gen-report.js --file=reportmap.txt [--nest=sales]       a bulk file: each block is first copied into its module as report.map
 *   flags:  --tables=<dump>  check tables/columns against your table dump ("//Table name : x" format)
 *           --db             ...or against the live database (.env: DB_HOST DB_USER DB_PASS DB_NAME)
 *           --dry-run        print what would be written; write nothing        --app=<ns>  (default: this script's folder name)
 *           --only=<name>    one block from a bulk file      --no-clone  schemas only      --help  this text
 *           --root=reports   new reports live under app/<app>/reports/<nest>/<module> (default; --root=- for no root folder)
 *           --flat-menu      one flat Reports list instead of Reports > folder > report
 *           menu: after a build it offers to add each report to app/<app>/AppRoutes/<app>MenuConfig.js as  Reports > <report> (flat list)  (y/n).
 *                 --yes  no question   --no-menu  skip   --menu-dir=<folder>   --menu  menu only, for every report.map already on disk
 *
 * Where things go (nest = any folder path you like: sales/complete, sales/history, reports/finance/daily ...):
 *   app/<app>/<nest>/<module>/             report.map  <Nest><Module>Schema.js  list/page.jsx  uiControl/  logicControl/actionsRegistry.js
 *   app/api/<app>/<nest>/<module>/list/    route.js (never edited)  <Nest><Module>Schema.js
 *   app/<app>/AppRoutes/apiRoutes.json     "<nest><module>": { base: "/api/<app>/<nest>/<module>/list" }
 * Templates: app/<app>/_mosy_df_template_v1 and app/api/<app>/_mosy_df_template_v1 (token Dftemplatev1).
 * Names: sales/complete -> SalesCompleteSchema / SalesCompleteList, route key "salescomplete" — so sales/complete and
 * returns/complete never collide. Relative imports in nested clones get the extra "../" automatically.
 * Cloning works like clone-module.js: token swapped in file names + contents, files that already exist are kept.
 * The two generated schema files are rewritten on every run (the old copy goes to _recycled/) — report.map is the source of truth.
 *
 * ── report.map SYNTAX ──────────────────────────────────────────────────────────────────────────
 *   # comment
 *   report Complete "Completed sales" - one-line description shown under the title     (a path also works: report sales/Complete)
 *     by month|day                 rows are time buckets (first is the default).   OR   by dimension
 *     date reg_date                default date column for every measure (per measure: by=col)
 *     filter event = event_id      URL filter ?event=… ; mapped to that column on every table that has it
 *     entity ticksy_sales          (optional) default <app>_<nest>_<module>     role view_reports   currency KES   cache 60
 *     nest sales                   (optional) same as --nest / the folder the map sits in
 *     rows "Ticket type"           dimension reports: the first column's title
 *     group ticket_type_id         dimension reports: the column the rows are grouped by
 *     labels ticket_types.ticket_type_id > name merge     turn ids into names (merge = same name becomes one row)
 *     sort revenue desc            leaderboard order
 *     forecast clients next 7      time reports: add 7 coming periods after the history (count/sum measures only)
 *                                  options: method=auto|avg|trend|recent  window=<last N periods>   (default method=auto)
 *
 *     orders   = count orders where status=paid          "Paid orders"   link=view_orders
 *     revenue  = sum orders.total_amount where status=paid   "Money in"  money
 *     checkins = count check_ins via tickets on ticket_id=ticket_id   "Checked in"
 *     avg      = revenue / orders                        "Avg order"          (anything that is not a verb = a formula)
 *     change   = change(revenue)                         "vs last month"
 *
 *     remark orders == 0 | neutral | No sales | No paid orders this month.        (if | tone | title | sentence)
 *     headline {label}: {orders} paid orders brought in {revenue}.
 *
 *   verbs: count sum avg min max countDistinct.  where: col=val, !=, >, >=, <, <=, like, in a,b — joined by "and".
 *   via <table> on <fromCol>=<toCol>   reach the group through another table (checkins -> tickets -> ticket type);
 *   credit=split shares a link's amounts by activity count instead (default credit=full).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const TEMPLATE_SOURCE = '_mosy_df_template_v1';
const TEMPLATE_TOKEN = 'Dftemplatev1';
const MAP_FILE = 'report.map';
const VERBS = ['count', 'sum', 'avg', 'min', 'max', 'countDistinct'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DIRECTIVES = new Set(['nest', 'by', 'date', 'filter', 'entity', 'role', 'currency', 'cache', 'rows', 'group', 'labels', 'sort', 'headline', 'remark', 'maxrange', 'forecast']);

/* ================= PARSE ================= */

function stripLabel(s) {
  const m = s.match(/"([^"]*)"/);
  return m ? { text: s.replace(m[0], ' ').replace(/\s+/g, ' ').trim(), label: m[1] } : { text: s.trim(), label: '' };
}

function parseWhere(str, where) {
  // "status=paid and kind in a,b and amount >= 10"
  return str.split(/\s+and\s+/i).map((c) => {
    const m = c.trim().match(/^(\w+)\s*(!=|>=|<=|=|>|<|\blike\b|\bin\b)\s*(.+)$/i);
    if (!m) throw new Error(`${where}: can't read the where part "${c.trim()}" (use col=value, !=, >, >=, <, <=, like, in a,b)`);
    const op = m[2].toLowerCase() === 'in' ? 'IN' : m[2].toLowerCase() === 'like' ? 'LIKE' : m[2];
    const raw = m[3].trim().replace(/^['"]|['"]$/g, '');
    const num = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
    return op === 'IN' ? { col: m[1], op, val: raw.split(',').map((v) => num(v.trim())) } : { col: m[1], op, val: num(raw) };
  });
}

function parseMeasure(key, rest, where) {
  const tok = rest.split(/\s+/);
  const verb = tok.shift();
  const target = tok.shift() || '';
  const [table, col] = target.split('.');
  const m = { key, table, agg: verb };
  if (col) m.col = col;
  const flags = {};
  let i = 0;
  const isClause = (w) => /^(by=|group=|credit=|link=)/.test(w) || ['via', 'money', 'where'].includes(w);
  while (i < tok.length) {
    const w = tok[i];
    if (w === 'where') {
      const parts = []; i += 1;
      while (i < tok.length && !isClause(tok[i])) parts.push(tok[i++]);
      m.where = parseWhere(parts.join(' '), where);
    } else if (w === 'via') {
      const t = tok[i + 1]; const on = tok[i + 2] === 'on' ? tok[i + 3] : null;
      const mm = on && on.match(/^(\w+)=(\w+)$/);
      if (!t || !mm) throw new Error(`${where}: "via" needs  via <table> on <fromCol>=<toCol>`);
      m.join = { table: t, from: mm[1], to: mm[2] };
      i += 4;
    } else if (w === 'money') { flags.money = true; i += 1; }
    else if (/^by=/.test(w)) { m.by = w.slice(3); i += 1; }
    else if (/^group=/.test(w)) { m.group = w.slice(6); i += 1; }
    else if (/^credit=/.test(w)) { m.credit = w.slice(7); i += 1; }
    else if (/^link=/.test(w)) { flags.link = w.slice(5); i += 1; }
    else throw new Error(`${where}: don't understand "${w}" in "${key} = ${rest}"`);
  }
  return { measure: m, flags };
}

function parseMap(text) {
  const reports = [];
  const errors = [];
  let r = null;
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) { if (r) r.raw.push(raw); return; }
    const where = `line ${idx + 1}`;
    if (r && !/^\s*report\s/i.test(raw) && !/^\s*nest\s/i.test(raw)) r.raw.push(raw);
    try {
      let m;
      if ((m = line.match(/^report\s+([A-Za-z][A-Za-z0-9]*(?:\/[A-Za-z][A-Za-z0-9]*)*)\s*(.*)$/i))) {
        const { text, label } = stripLabel(m[2]);
        const desc = text.replace(/^-\s*/, '').trim();
        const parts = m[1].split('/');
        const mod = parts.pop();
        r = { mod: mod[0].toUpperCase() + mod.slice(1), nestParts: parts, label: label || mod, description: desc, headerRest: m[2], by: [], filters: [], fields: [], remarks: [], forecasts: [], raw: [], line: idx + 1 };
        reports.push(r);
        return;
      }
      if (!r) throw new Error('write  report <Name> "Label"  first');
      const dm = line.match(/^(\w+)\s+(.*)$/);
      const kw = dm && dm[1].toLowerCase();
      if (dm && DIRECTIVES.has(kw) && !/^\w+\s*=/.test(line)) {
        const v = dm[2].trim();
        if (kw === 'nest') r.nestParts = v.split('/').filter(Boolean);
        else if (kw === 'by') r.by = v.split(/[|,\s]+/).filter(Boolean);
        else if (kw === 'date') r.date = v;
        else if (kw === 'filter') {
          const fm = v.match(/^(\w+)\s*=\s*(\w+)$/);
          if (!fm) throw new Error('filter needs  filter <param> = <column>');
          r.filters.push({ param: fm[1], col: fm[2] });
        } else if (kw === 'entity') r.entity = v;
        else if (kw === 'role') r.role = v;
        else if (kw === 'currency') r.currency = v;
        else if (kw === 'cache') r.cache = Number(v);
        else if (kw === 'maxrange') r.maxRange = Number(v);
        else if (kw === 'rows') r.rowsLabel = stripLabel(v).label || v;
        else if (kw === 'group') r.group = v;
        else if (kw === 'labels') {
          const lm = v.match(/^(\w+)\.(\w+)\s*>\s*(\w+)(\s+merge)?$/);
          if (!lm) throw new Error('labels needs  labels <table>.<keyCol> > <nameCol> [merge]');
          r.labels = { table: lm[1], key: lm[2], label: lm[3], merge: !!lm[4] };
        } else if (kw === 'sort') r.sort = v;
        else if (kw === 'forecast') {
          const fm = v.match(/^(\w+)\s+next\s+(\d+)((?:\s+\w+=\w+)*)$/);
          if (!fm) throw new Error('forecast needs  forecast <measure> next <N> [method=auto|avg|trend|recent] [window=<N>]');
          const f = { key: fm[1], next: Number(fm[2]), method: 'auto' };
          for (const o of fm[3].trim().split(/\s+/).filter(Boolean)) {
            const [k, val] = o.split('=');
            if (k === 'method') f.method = val;
            else if (k === 'window') f.window = Number(val);
            else throw new Error(`forecast: don't understand "${o}" (use method= or window=)`);
          }
          if (r.forecasts.some((x) => x.key === f.key)) throw new Error(`forecast "${f.key}" is written twice`);
          r.forecasts.push(f);
        }
        else if (kw === 'headline') r.headline = v;
        else if (kw === 'remark') {
          const p = v.split('|').map((s) => s.trim());
          if (p.length < 4) throw new Error('remark needs  if | tone | title | sentence');
          r.remarks.push({ if: p[0], tone: p[1], title: p[2], say: p.slice(3).join('|') });
        }
        return;
      }
      const fm = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (!fm) throw new Error(`can't read "${line}"`);
      const { text, label } = stripLabel(fm[2]);
      const key = fm[1];
      if (!IDENT.test(key)) throw new Error(`field key "${key}" must be a plain word`);
      if (r.fields.some((f) => f.key === key)) throw new Error(`field "${key}" is defined twice`);
      const first = text.split(/\s+/)[0];
      if (VERBS.includes(first)) {
        const { measure, flags } = parseMeasure(key, text, where);
        r.fields.push({ key, label: label || key, kind: 'measure', measure, ...flags });
      } else {
        const money = /\s+money$/.test(text);
        r.fields.push({ key, label: label || key, kind: 'calc', calc: text.replace(/\s+money$/, ''), ...(money ? { money: true } : {}) });
      }
    } catch (e) {
      errors.push(e.message.startsWith('line ') ? e.message : `${where}: ${e.message}`);
    }
  });
  return { reports, errors };
}

/* ================= BUILD THE TWO SCHEMA OBJECTS ================= */

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// tables: { name: Set(columns) } or null (no dump -> trust the map)
function buildSchemas(r, { app, tables }) {
  const problems = [];
  const bad = (m) => problems.push(`${r.name}: ${m}`);
  const lower = r.name.toLowerCase();
  const dimension = r.by[0] === 'dimension';
  const time = !dimension;
  if (!r.by.length) bad('add a "by" line: by month|day  or  by dimension');
  const measures = r.fields.filter((f) => f.kind === 'measure');
  measures.forEach((f) => { if (f.measure.agg !== 'count' && !f.measure.col) bad(`"${f.key}": ${f.measure.agg} needs a column — write  ${f.measure.agg} ${f.measure.table}.<column>`); });
  if (!measures.length) bad('no measures — add at least one  key = count <table>');
  if (dimension && !r.group && !measures.every((f) => f.measure.group)) bad('dimension reports need a  group <column>  line (or group= on every measure)');

  const entity = r.entity || `${app}_${r.entityPart}`;
  const back = { entity, roles: { view: r.role || 'view_reports' } };
  if (time) { back.bucket = r.by[0]; if (r.by.length > 1) back.bucketOptions = r.by; } else back.bucket = 'dimension';
  if (r.labels) back.bucketLabel = r.labels;
  back.cacheSeconds = r.cache || 60;
  if (r.maxRange) back.maxRangeDays = r.maxRange;
  back.measures = measures.map((f) => {
    const m = { ...f.measure };
    const out = { key: m.key, table: m.table, agg: m.agg };
    if (m.col) out.col = m.col;
    if (dimension && !m.join) out.group = m.group || r.group;
    const by = m.by || r.date;
    if (!by) bad(`measure "${m.key}" has no date column — add  date <col>  to the report or by=<col> to the measure`);
    else out.by = by;
    if (m.where) out.where = m.where;
    if (m.join) out.join = { table: m.join.table, from: m.join.from, to: m.join.to, group: m.group || r.group, credit: m.credit || 'full' };
    return out;
  });

  if (r.filters.length) {
    back.filters = r.filters.map((f) => ({
      param: f.param,
      cols: Object.fromEntries(back.measures.map((m) => {
        const has = !tables || (tables[m.table] && tables[m.table].has(f.col));
        return [m.key, has ? f.col : null];
      })),
    }));
    back.filters.forEach((f) => {
      const skipped = Object.entries(f.cols).filter(([, c]) => c === null).map(([k]) => k);
      if (skipped.length === Object.keys(f.cols).length) bad(`filter "${f.param}": no table has column "${r.filters.find((x) => x.param === f.param).col}"`);
      else if (skipped.length) r.notes = (r.notes || []).concat(`filter "${f.param}" ignored by: ${skipped.join(', ')} (their table has no such column) — columns won't all narrow together`);
    });
  }

  // table/column existence
  if (tables) {
    const need = (t, c, what) => {
      if (!tables[t]) return bad(`${what}: table "${t}" is not in your tables`);
      if (c && !tables[t].has(c)) bad(`${what}: "${t}" has no column "${c}" (it has: ${[...tables[t]].join(', ')})`);
    };
    back.measures.forEach((m) => {
      const w = `measure ${m.key}`;
      need(m.table, null, w); need(m.table, m.col, w); need(m.table, m.by, w); need('hive_site_id' && m.table, 'hive_site_id', w);
      (m.where || []).forEach((c) => need(m.table, c.col, w));
      if (m.group && !m.join) need(m.table, m.group, w);
      if (m.join) { need(m.table, m.join.from, w); need(m.join.table, m.join.to, w); need(m.join.table, m.join.group, w); need(m.join.table, 'hive_site_id', w); }
    });
    if (r.labels) { need(r.labels.table, r.labels.key, 'labels'); need(r.labels.table, r.labels.label, 'labels'); }
  }

  // ----- frontend -----
  const dict = new Set(r.fields.map((f) => f.key));
  r.fields.filter((f) => f.kind === 'calc').forEach((f) => {
    const words = (f.calc.match(/[A-Za-z_]\w*/g) || []).filter((w) => !['change', 'share', 'abs', 'round', 'min', 'max'].includes(w));
    words.forEach((w) => { if (!dict.has(w)) bad(`formula "${f.key} = ${f.calc}" uses "${w}", which is not a field`); });
  });
  if (r.sort && !dict.has(r.sort.split(/\s+/)[0])) bad(`sort "${r.sort}" — "${r.sort.split(/\s+/)[0]}" is not a field`);
  (r.forecasts || []).forEach((f) => {
    const fld = r.fields.find((x) => x.key === f.key);
    if (!time) bad(`forecast "${f.key}": forecasts need a time report (by month|day|year), not by dimension`);
    if (!fld || fld.kind !== 'measure') bad(`forecast "${f.key}": must be a measure (a count/sum line), not a formula or unknown key`);
    else if (!['count', 'sum', 'countDistinct'].includes(fld.measure.agg)) bad(`forecast "${f.key}": only count, sum and countDistinct can be forecast (not ${fld.measure.agg})`);
    if (f.next < 1 || f.next > 60) bad(`forecast "${f.key}": next must be 1 to 60`);
    if (!['auto', 'avg', 'trend', 'recent'].includes(f.method)) bad(`forecast "${f.key}": method must be auto, avg, trend or recent`);
    if (f.window !== undefined && !(f.window >= 3)) bad(`forecast "${f.key}": window must be 3 or more`);
  });

  const front = {
    entity, label: r.label, description: r.description || '',
    apiBase: `__APIBASE__`, moduleRole: back.roles.view,
    currency: r.currency || 'KES', actionRegistry: '__ACTIONS__',
  };
  if (time) {
    front.groupBy = r.by[0]; front.groupLabel = r.by[0] === 'day' ? 'Day' : r.by[0] === 'year' ? 'Year' : 'Month';
    front.groupByOptions = r.by.map((b) => ({ key: b, label: b[0].toUpperCase() + b.slice(1) }));
  } else {
    front.groupBy = snake((r.group || measures[0].measure.group || 'item').replace(/_id$/, ''));
    front.groupLabel = r.rowsLabel || (front.groupBy[0].toUpperCase() + front.groupBy.slice(1).replace(/_/g, ' '));
    if (r.sort) front.sortBy = r.sort;
  }
  front.fields = r.fields.map((f) => {
    const o = { key: f.key, label: f.label };
    if (f.kind === 'measure') {
      o.from = f.measure.col ? `${f.measure.table}.${f.measure.col}` : f.measure.table;
      if (f.money) o.type = 'money';
      if (f.link) o.filterTo = f.link;
    } else { o.calc = f.calc; if (f.money) o.type = 'money'; }
    return o;
  });
  front.remarks = r.remarks.length ? r.remarks : [{ if: 'true', tone: 'neutral', title: 'Steady', say: `{label}: ${measures.slice(0, 2).map((f) => `{${f.key}} ${f.label.toLowerCase()}`).join(', ')}.` }];
  front.headline = r.headline || `{label}: ${measures.slice(0, 2).map((f) => `{${f.key}} ${f.label.toLowerCase()}`).join(', ')}.`;
  if (r.sort && time) front.sortBy = r.sort;
  front.links = measures.filter((f) => f.link).map((f) => ({ key: f.link, label: f.label }));
  if (r.forecasts && r.forecasts.length) front.forecast = r.forecasts.map((f) => ({ key: f.key, next: f.next, method: f.method, ...(f.window ? { window: f.window } : {}), integer: (r.fields.find((x) => x.key === f.key)?.measure?.agg) !== 'sum' }));
  return { back, front, problems, lower, entity };
}

/* ================= EMIT SOURCE ================= */

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lit = (v) => (typeof v === 'string' ? q(v) : Array.isArray(v) ? `[${v.map(lit).join(', ')}]` : v === null ? 'null' : String(v));
const obj = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${v && typeof v === 'object' && !Array.isArray(v) ? obj(v) : lit(v)}`).join(', ')} }`;

function emitBackend(name, r, { back }) {
  const pad = (rows, key) => Math.max(...rows.map((x) => x[key].length));
  const L = [];
  L.push(`// ${name}Schema.js — BACKEND schema (data shape only), generated by gen-report.js from report.map. Twin of ${r.fePath}/${name}Schema.js.`);
  L.push(`// Edit report.map in the module folder and re-run gen-report.js instead of editing this file (hand edits are kept in _recycled/ when it is regenerated).`);
  L.push(`export const ${name}Schema = {`);
  L.push(`  entity: ${q(back.entity)},`, `  roles: { view: ${q(back.roles.view)} },`, '');
  L.push(`  bucket: ${q(back.bucket)},`);
  if (back.bucketOptions) L.push(`  bucketOptions: ${lit(back.bucketOptions)},`);
  if (back.bucketLabel) L.push(`  bucketLabel: ${obj(back.bucketLabel)},`);
  L.push(`  cacheSeconds: ${back.cacheSeconds},`);
  if (back.maxRangeDays) L.push(`  maxRangeDays: ${back.maxRangeDays},`);
  L.push('', '  measures: [');
  back.measures.forEach((m) => {
    const parts = [`key: ${q(m.key)}`, `table: ${q(m.table)}`, `agg: ${q(m.agg)}`];
    if (m.col) parts.push(`col: ${q(m.col)}`);
    if (m.group) parts.push(`group: ${q(m.group)}`);
    if (m.by) parts.push(`by: ${q(m.by)}`);
    if (m.where) parts.push(`where: [${m.where.map((c) => `{ col: ${q(c.col)}, op: ${q(c.op)}, val: ${lit(c.val)} }`).join(', ')}]`);
    if (m.join) parts.push(`join: ${obj(m.join)}`);
    L.push(`    { ${parts.join(', ')} },`);
  });
  L.push('  ],');
  if (back.filters) {
    L.push('', '  filters: [');
    back.filters.forEach((f) => L.push(`    { param: ${q(f.param)}, cols: { ${Object.entries(f.cols).map(([k, c]) => `${k}: ${c === null ? 'null' : q(c)}`).join(', ')} } },`));
    L.push('  ],');
  }
  L.push('};', '');
  return L.join('\n');
}

function emitFrontend(name, r, { front }) {
  const L = [];
  L.push(`// ${name}Schema.js — FRONTEND schema: labels, formulas, remarks, click-throughs. Generated by gen-report.js from report.map (same folder).`);
  L.push(`// The numbers come from the backend twin ${r.bePath}/list/${name}Schema.js (same measure keys).`);
  L.push(`import { getApiRoutes } from '${r.up}../AppRoutes/apiRoutesHandler';`);
  L.push(`import ${name}Actions from './logicControl/actionsRegistry';`);
  L.push('const apiRoutes = getApiRoutes();', '', `export const ${name}Schema = {`);
  L.push(`  entity: ${q(front.entity)},`, `  label: ${q(front.label)},`, `  description: ${q(front.description)},`);
  L.push(`  apiBase: apiRoutes.${r.key}?.base,`, `  moduleRole: ${q(front.moduleRole)},`, `  currency: ${q(front.currency)},`);
  L.push(`  actionRegistry: ${name}Actions,`, '');
  L.push(`  groupBy: ${q(front.groupBy)},`, `  groupLabel: ${q(front.groupLabel)},`);
  if (front.groupByOptions) L.push(`  groupByOptions: [${front.groupByOptions.map((o) => obj(o)).join(', ')}],`);
  if (front.sortBy) L.push(`  sortBy: ${q(front.sortBy)},`);
  L.push('', '  fields: [');
  front.fields.forEach((f) => L.push(`    ${obj(f)},`));
  L.push('  ],', '', '  remarks: [');
  front.remarks.forEach((m) => L.push(`    { if: ${q(m.if)}, tone: ${q(m.tone)}, title: ${q(m.title)}, say: ${q(m.say)} },`));
  L.push('  ],', '', `  headline: ${q(front.headline)},`);
  if (front.forecast) L.push('', '  // coming periods the report page adds after the history (see forecast.js)', `  forecast: [${front.forecast.map((f) => obj(f)).join(', ')}],`);
  L.push('};', '');
  return L.join('\n');
}

function emitRegistry(name, links, up = '') {
  const L = [];
  L.push(`/**`, ` * Click targets for ${name} — same pattern as every module's actionsRegistry.js (one function per key, one ctx).`);
  L.push(` * A report field opts in with  link=<key>  in reportmap.txt (-> filterTo); the schema points here with actionRegistry.`);
  L.push(` * ctx.cell { key, label, value, group, groupLabel, ids, period:{start,end}, rangeStart, rangeEnd }   ctx.query = what the report shows now`);
  L.push(` * Lists take fixedQuery like any module: values btoa()'d, camelCase column keys (regDate_start / regDate_end / status ...).`);
  L.push(` * Replace each stub with the real thing, e.g.:`);
  L.push(` *   import React from 'react'; import { MosyCard } from '${up}../../../components/MosyCard'; import OrdersList from '${up}../../orders/uiControl/OrdersList';`);
  L.push(` *   view_orders: (ctx) => MosyCard('', React.createElement(OrdersList, { title: ctx.cell.groupLabel, fixedQuery: { regDate_start: btoa(ctx.cell.period.start) }, hiddenActions: ['new'] }), true, 'modal3', 'mosycard_wide'),`);
  L.push(` */`, `const notWired = (key) => (ctx) => console.warn(\`[${name}] "\${key}" is not wired yet — edit logicControl/actionsRegistry.js\`, ctx.cell);`, '');
  L.push(`const ${name}Actions = {`);
  links.forEach((l) => L.push(`  ${l.key}: notWired(${q(l.key)}),   // ${l.label}`));
  L.push('};', '', `export default ${name}Actions;`, '');
  return L.join('\n');
}

/* ================= TABLE DUMP / LIVE DB ================= */

// his dump format:  //Table name : orders   // columns : "primkey" , "order_id" , ...
function parseTableDump(text) {
  const tables = {};
  let t = null;
  text.split(/\r?\n/).forEach((l) => {
    let m;
    if ((m = l.match(/^\s*\/\/\s*Table name\s*:\s*(\S+)/i))) t = m[1];
    else if (t && /columns\s*:/i.test(l)) tables[t] = new Set([...l.matchAll(/"(\w+)"/g)].map((x) => x[1]));
  });
  return tables;
}

async function liveTables(env) {
  let mysql;
  try { mysql = require('mysql2/promise'); } catch { throw new Error('--db needs mysql2 (npm install mysql2) — db-cli.js installs it for you; or use --tables=<dump file>'); }
  const conn = await mysql.createConnection({ host: env.DB_HOST || 'localhost', user: env.DB_USER || 'root', password: env.DB_PASS || '', database: env.DB_NAME || path.basename(__dirname) });
  const [rows] = await conn.execute('SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()');
  await conn.end();
  const tables = {};
  rows.forEach((x) => { const t = x.t || x.TABLE_NAME; (tables[t] = tables[t] || new Set()).add(x.c || x.COLUMN_NAME); });
  return tables;
}

function loadEnv(dir) {
  const env = {}; const p = path.join(dir, '.env');
  if (fs.existsSync(p)) fs.readFileSync(p, 'utf8').split('\n').forEach((l) => { const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/); if (m) env[m[1]] = (m[2] || '').trim().replace(/^["']|["']$/g, ''); });
  return env;
}

/* ================= FILES ================= */

const stamp = () => { const d = new Date(); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`; };
const RUN = stamp();

function writeWithBackup(file, content, moduleRoot, root, log) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const had = fs.readFileSync(file, 'utf8');
    if (had === content) return log.push(`   = unchanged  ${path.relative(root, file)}`);
    if (/— placeholder\./.test(had.split('\n')[0])) { fs.writeFileSync(file, content); return log.push(`   ✎ wrote      ${path.relative(root, file)}`); } // the template's blank stand-in: nothing to keep
    const rel = path.relative(moduleRoot, file); const ext = path.extname(rel);
    let bk = path.join(moduleRoot, '_recycled', `${rel.slice(0, -ext.length)}.${RUN}${ext}`);
    for (let n = 2; fs.existsSync(bk); n += 1) bk = path.join(moduleRoot, '_recycled', `${rel.slice(0, -ext.length)}.${RUN}-${n}${ext}`);
    fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.renameSync(file, bk);
    log.push(`   ♻️  old copy -> ${path.relative(root, bk)}`);
  }
  fs.writeFileSync(file, content);
  log.push(`   ✎ wrote      ${path.relative(root, file)}`);
}

function mergeRoutes(root, app, r, log, dry) {
  const f = path.join(root, 'app', ...(app ? [app] : []), 'AppRoutes', 'apiRoutes.json');
  const base = `/api${app ? '/' + app : ''}/${r.rel.join('/')}/list`;
  if (!fs.existsSync(f)) return log.push(`   ⚠️  ${path.relative(root, f)} not found — add  "${r.key}": { "base": "${base}" }  by hand`);
  const json = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (json[r.key] && json[r.key].base === base) return log.push(`   = apiRoutes.json already has "${r.key}"`);
  if (json[r.key]) log.push(`   ⚠️  apiRoutes.json "${r.key}" pointed at ${json[r.key].base} — now ${base}`);
  json[r.key] = { base };
  if (!dry) { fs.copyFileSync(f, f + '.bak'); fs.writeFileSync(f, JSON.stringify(json, null, 2) + '\n'); }
  log.push(`   ✎ apiRoutes.json + "${r.key}"`);
}

/* ================= SIDEBAR MENU (same step as clone-module.js, one link per report) ================= */

const capFirst = (w) => w.charAt(0).toUpperCase() + w.slice(1);
function menuExportName(app) {
  const parts = app.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  let base = parts.map((w, i) => (i === 0 ? w : capFirst(w))).join('');
  if (/^\d/.test(base)) base = `_${base}`;
  return `${base}SidebarConfig`;
}
const menuRouteRef = (app) => (/^[A-Za-z_$][\w$]*$/.test(app) ? `routes.${app}` : `routes["${app}"]`);
const menuHref = (app, it) => `${menuRouteRef(app)}/${it.basePath}/list`;

const esc = (t) => String(t).replace(/"/g, '\\"');
const groupLabel = (it) => (it.menuGroup || []).map(capFirst).join(' / ');
// Nested by default: Reports > <folder> > <report>  (needs the recursive AdminNav; --flat-menu = one flat list)
let FLAT_MENU = false;
const linkLabel = (it) => it.words;
const linkBlock = (app, it, pad) => [
  '{', `  label: "${esc(linkLabel(it))}",`, `  href: (routes) => \`\${${menuRouteRef(app)}}/${it.basePath}/list\`,`, '  roles: []', '}',
].map((l) => pad + l).join('\n');
const MK = { rootEnd: '// gen-report:reports:end', groupEnd: (path) => `// gen-report:group:${path.join('-')}:end` };
const itemPath = (it) => (FLAT_MENU ? [] : it.menuGroup || []);
const nestedGroup = (it) => itemPath(it).length > 0;
const indentLines = (lines, n) => lines.map((l) => ' '.repeat(n) + l);
// the object for level k of the item's folder path (k = folders already present): a folder holding the rest, or the link itself
function menuNode(app, it, k) {
  const path = itemPath(it);
  if (k >= path.length) return linkBlock(app, it, '').split('\n');
  return ['{', '  type: "submenu",', `  label: "${esc(capFirst(path[k]))}",`, '  roles: [],', '  items: [',
    ...indentLines(menuNode(app, it, k + 1), 4), `    ${MK.groupEnd(path.slice(0, k + 1))}`, '  ]', '}'];
}
// the whole "Reports" submenu, created the first time
function buildMenuBlock(app, it) {
  return [
    '  // ============================================================', '  // REPORTS  (added by gen-report.js)', '  // ============================================================', '',
    '  {', '    type: "submenu",', '    label: "Reports",', '    icon: "fa fa-bar-chart",', '    roles: [],', '    items: [', '',
    ...indentLines(menuNode(app, it, 0), 6), `      ${MK.rootEnd}`, '', '    ]', '  }',
  ].join('\n');
}
const isLinkedInMenu = (content, it) => content.includes(`/${it.basePath}/list`);

// put `text` just before the line holding `marker`, adding the comma the previous entry needs
function insertBeforeMarker(content, marker, text) {
  const at = content.indexOf(marker);
  if (at === -1) return null;
  const lineStart = content.lastIndexOf('\n', at) + 1;
  let i = lineStart - 1;
  while (i >= 0 && /\s/.test(content[i])) i -= 1;
  let before = content.slice(0, i + 1);
  if (content[i] === '}') before += ',';
  else if (content[i] !== ',' && content[i] !== '[') return null;
  return `${before}\n${text}\n${content.slice(lineStart)}`;
}
function addToMenu(content, app, it) {
  if (!content.includes(MK.rootEnd)) return insertIntoSidebarConfig(content, buildMenuBlock(app, it)); // first report: whole Reports block
  const path = itemPath(it);
  for (let k = path.length; k >= 0; k -= 1) { // deepest folder that already exists wins
    const marker = k === 0 ? MK.rootEnd : MK.groupEnd(path.slice(0, k));
    const at = content.indexOf(marker);
    if (at === -1) continue;
    const lineStart = content.lastIndexOf('\n', at) + 1;
    const indent = content.slice(lineStart, at).length;
    return insertBeforeMarker(content, marker, indentLines(menuNode(app, it, k), indent).join('\n'));
  }
  return null;
}

function insertIntoSidebarConfig(content, block) {
  if (!/export\s+const\s+\w*[Ss]idebarConfig\s*=\s*\[/.test(content)) return null;
  const end = content.lastIndexOf('];');
  if (end === -1) return null;
  let i = end - 1;
  while (i >= 0 && /\s/.test(content[i])) i -= 1;
  let before = content.slice(0, i + 1);
  const last = content[i];
  if (last === '}') before += ',';
  else if (last !== ',' && last !== '[') return null;
  return `${before}\n\n${block}\n${content.slice(end)}`;
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.on('close', () => { if (!answered) resolve(false); });
    rl.question(question, (a) => { answered = true; rl.close(); resolve(/^(y|yes)$/i.test(a.trim())); });
  });
}

// items: [{ words: "Completed sales", basePath: "sales/complete" }]
async function offerMenuConfig(root, app, items, { menuDir: menuDirArg, autoYes, dry }) {
  if (!app) return console.log('\nℹ️  Menu skipped: no app namespace (--app=-), so there is no routes.<app> key to build links from.');
  const menuDir = menuDirArg ? path.resolve(root, menuDirArg) : path.join(root, 'app', app, 'AppRoutes');
  const menuPath = path.join(menuDir, `${app}MenuConfig.js`);
  const rel = path.relative(root, menuPath).split(path.sep).join('/');
  const existing = fs.existsSync(menuPath) ? fs.readFileSync(menuPath, 'utf8') : null;
  const seen = new Set();
  const unique = items.filter((it) => (seen.has(it.basePath) ? false : seen.add(it.basePath)));
  const toAdd = unique.filter((it) => !(existing !== null && isLinkedInMenu(existing, it)));
  const skipped = unique.length - toAdd.length;
  if (!toAdd.length) return console.log(unique.length ? `\n🧭 Menu: ${skipped} report(s) already linked in ${rel} — nothing to add.` : '\n🧭 Menu: no reports found to add.');

  console.log(`\n🧭 ${toAdd.length} report(s) to add to the sidebar menu${skipped ? ` (${skipped} already linked, skipped)` : ''}.`);
  console.log(`   File: ${rel} — ${existing === null ? 'will be created' : 'exists; a copy goes to _recycled/ first, then these are appended'}\n`);
  toAdd.forEach((it, i) => console.log(`  ${i + 1}. Reports > ${itemPath(it).map(capFirst).map((g) => g + ' > ').join('')}${linkLabel(it)}\n       ${menuHref(app, it)}`));
  if (dry) return console.log('\n(dry run — menu not written)');
  if (!autoYes && !(await askYesNo(`\nAdd ${toAdd.length} report(s) to the menu? (y/n) `))) return console.log('ℹ️  Skipped. Run it later with: node gen-report.js --menu');

  let content = existing === null
    ? [`// ${app}MenuConfig.js`, '//', `// Sidebar menu for the "${app}" app. Extended by clone-module.js and gen-report.js:`, '// confirmed modules get a block appended below. Nothing already here is duplicated, and the', '// file is copied to _recycled/ before any change — reorder, rename, regroup and set `roles` freely.', '', `export const ${menuExportName(app)} = [`, '', '];', ''].join('\n')
    : existing;
  const manual = []; let added = 0;
  for (const it of toAdd) {
    const updated = addToMenu(content, app, it);
    if (updated === null) manual.push(it); else { content = updated; added += 1; }
  }
  if (added) {
    if (existing !== null) {
      let bk = path.join(menuDir, '_recycled', `${app}MenuConfig.${RUN}.js`);
      for (let n = 2; fs.existsSync(bk); n += 1) bk = path.join(menuDir, '_recycled', `${app}MenuConfig.${RUN}-${n}.js`);
      fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.copyFileSync(menuPath, bk);
      console.log(`   ♻️  existing menu config backed up -> ${path.relative(root, bk).split(path.sep).join('/')}`);
    }
    fs.mkdirSync(menuDir, { recursive: true }); fs.writeFileSync(menuPath, content);
    console.log(`✅ Menu: ${existing === null ? 'created' : 'updated'} ${rel} — added ${added} report(s).`);
  }
  if (manual.length) {
    console.log(`⚠️  Couldn't safely edit ${rel} (no "export const ...SidebarConfig = [ ... ];" ending in an item). Paste ${manual.length === 1 ? 'this' : 'these'} in yourself:\n`);
    manual.forEach((it) => console.log(`${buildMenuBlock(app, it)}\n`));
  }
}

const menuItemOf = (r) => ({ words: r.label || r.mod.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), basePath: r.rel.join('/'), menuGroup: r.menuGroup || [] });

/* ================= RUN ================= */

function flagsOf(args) {
  const get = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a === undefined ? undefined : a.slice(n.length + 3); };
  const has = (n) => args.some((x) => x === `--${n}` || x.startsWith(`--${n}=`));
  return { get, has };
}

async function engineCheck(root, back) {
  try {
    const url = require('url').pathToFileURL(path.join(root, 'app/api/apiUtils/reportControl/reportSchemaCheck.js')).href;
    const orig = process.emitWarning; // the engine file is ESM in a package with no "type": hide that one harmless Node notice
    process.emitWarning = (w, ...a) => { if (!/MODULE_TYPELESS_PACKAGE_JSON/.test(String((a[0] && a[0].code) || a[1] || a[0] || ''))) orig.call(process, w, ...a); };
    let mod; try { mod = await import(url); } finally { process.emitWarning = orig; }
    const { validateApiSchema } = mod;
    const res = validateApiSchema(back);
    return Array.isArray(res) ? res : (res && res.problems) || [];
  } catch (e) {
    return [`__skipped__ ${e.message.split('\n')[0]}`];
  }
}

/* ================= NAMING + TEMPLATE CLONE ================= */

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// sales/complete  ->  folder app/<app>/sales/complete, identifiers SalesComplete*, apiRoutes key "salescomplete"
let ROOT_NEST = 'reports'; // every NEW report lives under app/<app>/reports/... (set --root=- for none, --root=x for another)
function naming(r, { app, nest }) {
  let nestParts = (r.nestParts && r.nestParts.length ? r.nestParts : nest || []).map((p) => p.toLowerCase());
  if (ROOT_NEST && !r.fromDisk && nestParts[0] !== ROOT_NEST) nestParts = [ROOT_NEST, ...nestParts];
  const idNest = ROOT_NEST && nestParts[0] === ROOT_NEST ? nestParts.slice(1) : nestParts; // the root is not part of the names
  const parts = [...idNest, r.mod];
  const rel = [...nestParts, r.mod.toLowerCase()];
  r.nestParts = nestParts;
  r.menuGroup = idNest; // menu folder(s) under "Reports"
  r.name = parts.map(cap).join('');
  r.key = parts.join('').toLowerCase();
  r.entityPart = parts.map((p) => p.toLowerCase()).join('_');
  r.rel = rel;
  r.up = '../'.repeat(nestParts.length);
  r.fePath = ['app', ...(app ? [app] : []), ...rel].join('/');
  r.bePath = ['app', 'api', ...(app ? [app] : []), ...rel].join('/');
  r.pageUrl = `${app ? '/' + app : ''}/${rel.join('/')}/list`;
  return r;
}

// Template files sit at module depth 0. When a module is nested n levels deeper, every relative import that
// leaves the module (more "../" than the file's own depth inside it) needs n more "../".
function rewriteDepth(text, dirDepth, n) {
  if (!n) return text;
  return text.replace(/((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)['"])((?:\.\.\/)+)/g, (m, pre, ups) => (ups.length / 3 > dirDepth ? pre + '../'.repeat(n) + ups : m));
}

const TEXT_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.md', '.html']);

// Same job as clone-module.js: swap the token in file names and contents, never replace a file that already exists.
function cloneTemplate(src, dest, r, log, root) {
  const fromU = TEMPLATE_TOKEN; const fromL = TEMPLATE_TOKEN.toLowerCase();
  const swap = (t) => t.split(fromU).join(r.name).split(fromL).join(r.key).split(fromU.toUpperCase()).join(r.name.toUpperCase());
  const walkDir = (s, d, depth) => {
    fs.mkdirSync(d, { recursive: true });
    for (const e of fs.readdirSync(s, { withFileTypes: true })) {
      const sp = path.join(s, e.name); const dp = path.join(d, swap(e.name));
      if (e.isDirectory()) { walkDir(sp, dp, depth + 1); continue; }
      if (fs.existsSync(dp)) { log.push(`   = kept       ${path.relative(root, dp)}`); continue; }
      if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) fs.writeFileSync(dp, rewriteDepth(swap(fs.readFileSync(sp, 'utf8')), depth, r.nestParts.length));
      else fs.copyFileSync(sp, dp);
      log.push(`   + created    ${path.relative(root, dp)}`);
    }
  };
  walkDir(src, dest, 0);
}

function starterMap(mod, label) {
  return `report ${mod} "${label}" - one line shown under the title
  by month|day
  date reg_date
  # filter event = event_id

  # key = verb table[.column] [where col=val] ["Label"] [money] [link=view_x]     (see: node gen-report.js --help)
  total = count orders    "Total orders"
  # revenue = sum orders.total_amount where status=paid   "Money in"   money
  # avg     = revenue / total                              "Avg order"

  remark true | neutral | Steady | {total} orders.
`;
}

function findMaps(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === MAP_FILE && e.isFile()) out.push(path.join(dir, e.name));
    else if (e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.') && e.name !== 'node_modules') findMaps(path.join(dir, e.name), out);
  }
  return out;
}

/* ================= RUN ================= */

async function main(argv) {
  const { get, has } = flagsOf(argv);
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (has('help') || has('h') || has('list-types')) {
    const src = fs.readFileSync(__filename, 'utf8');
    return console.log(src.slice(src.indexOf('/**'), src.indexOf('*/') + 2));
  }
  const root = process.cwd();
  const app = get('app') === '-' ? '' : (get('app') || path.basename(__dirname));
  const appDir = path.join(root, 'app', ...(app ? [app] : []));
  const dry = has('dry-run');
  const nestFlag = (get('nest') || '').split('/').filter(Boolean);
  FLAT_MENU = has('flat-menu');
  if (get('root') !== undefined) ROOT_NEST = get('root') === '-' ? '' : get('root').toLowerCase();
  const feTpl = path.join(appDir, TEMPLATE_SOURCE);
  const beTpl = path.join(root, 'app', 'api', ...(app ? [app] : []), TEMPLATE_SOURCE);

  /* ---- --new sales/complete "Label": clone the template + a starter report.map, build nothing yet ---- */
  if (has('new')) {
    const target = positional[0];
    if (!target) { console.error('❌ Usage: node gen-report.js --new sales/complete ["Label"]'); process.exit(1); }
    const parts = [...nestFlag, ...target.split('/').filter(Boolean)];
    const mod = parts.pop();
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(mod || '') || parts.some((p) => !/^[A-Za-z][A-Za-z0-9]*$/.test(p))) { console.error('❌ Names may only use letters and numbers, e.g. sales/complete'); process.exit(1); }
    const r = naming({ mod: cap(mod), nestParts: parts }, { app });
    for (const t of [feTpl, beTpl]) if (!fs.existsSync(t)) { console.error(`❌ Template folder not found: ${path.relative(root, t)} (run the reports installer first)`); process.exit(1); }
    const log = [];
    cloneTemplate(feTpl, path.join(root, r.fePath), r, log, root);
    cloneTemplate(beTpl, path.join(root, r.bePath), r, log, root);
    const mapFile = path.join(root, r.fePath, MAP_FILE);
    writeWithBackup(mapFile, starterMap(r.mod, positional[1] || cap(mod)), path.join(root, r.fePath), root, log);
    mergeRoutes(root, app, r, log, false);
    console.log(log.join('\n'));
    console.log(`\n✅ ${r.name} created.\n👉 edit ${r.fePath}/${MAP_FILE}, then run:  node gen-report.js ${r.rel.join('/')} --tables=<your table dump>\n👉 page ${r.pageUrl}`);
    if (!has('no-menu')) await offerMenuConfig(root, app, [{ words: positional[1] || cap(mod), basePath: r.rel.join('/'), menuGroup: r.menuGroup }], { menuDir: get('menu-dir'), autoYes: has('yes'), dry: false });
    return;
  }

  /* ---- --menu: just link existing reports (every report.map on disk, or the modules named) ---- */
  if (has('menu') && !has('all') && !has('file')) {
    const maps = positional.length ? positional.map((p) => path.join(appDir, ...p.replace(/^\/+|\/+$/g, '').split('/'), MAP_FILE)) : findMaps(appDir);
    const items = [];
    for (const mp of maps) {
      if (!fs.existsSync(mp)) { console.error(`❌ ${path.relative(root, mp)} not found.`); process.exit(1); }
      const rel = path.relative(appDir, path.dirname(mp)).split(path.sep).join('/');
      const { reports } = parseMap(fs.readFileSync(mp, 'utf8'));
      if (!reports.length) continue;
      const parts = rel.split('/'); const mod = parts.pop();
      const r = reports[0]; r.mod = cap(mod); r.nestParts = parts; r.fromDisk = true; naming(r, { app });
      items.push(menuItemOf(r));
    }
    return offerMenuConfig(root, app, items, { menuDir: get('menu-dir'), autoYes: has('yes'), dry });
  }

  /* ---- collect jobs: [{ r, mapText }] ---- */
  const jobs = [];
  const seed = []; // bulk: map text to write into each module
  const addFromText = (text, fromLabel, forcePath) => {
    const { reports, errors } = parseMap(text);
    if (errors.length) { console.error(`❌ Problems in ${fromLabel}:\n` + errors.map((e) => '   ' + e).join('\n')); process.exit(1); }
    if (!reports.length) { console.error(`❌ No "report" line found in ${fromLabel}.`); process.exit(1); }
    return reports.map((r) => {
      if (forcePath) { // module folder is the truth for where it lives and what it is called
        const parts = forcePath.split('/'); const mod = parts.pop();
        if (r.mod.toLowerCase() !== mod.toLowerCase()) console.log(`ℹ️  ${fromLabel}: header says "${r.mod}" but the folder is "${mod}" — using the folder name.`);
        r.mod = cap(mod); r.nestParts = parts; r.fromDisk = true;
      }
      return r;
    });
  };

  if (positional.length) {
    for (const p of positional) {
      const rel = p.replace(/^\/+|\/+$/g, '');
      const mapPath = path.join(appDir, ...rel.split('/'), MAP_FILE);
      if (!fs.existsSync(mapPath)) { console.error(`❌ ${path.relative(root, mapPath)} not found. Create the module first:  node gen-report.js --new ${rel}`); process.exit(1); }
      const rs = addFromText(fs.readFileSync(mapPath, 'utf8'), path.relative(root, mapPath), [...nestFlag, ...rel.split('/')].join('/'));
      jobs.push({ r: rs[0], mapPath });
    }
  } else if (has('all')) {
    findMaps(appDir).forEach((mp) => {
      const rel = path.relative(appDir, path.dirname(mp)).split(path.sep).join('/');
      jobs.push({ r: addFromText(fs.readFileSync(mp, 'utf8'), path.relative(root, mp), rel)[0], mapPath: mp });
    });
    if (!jobs.length) { console.error(`❌ No ${MAP_FILE} files found under ${path.relative(root, appDir)}.`); process.exit(1); }
  } else {
    const file = path.resolve(root, get('file') || 'reportmap.txt');
    if (!fs.existsSync(file)) { console.error(`❌ Nothing to build. Use one of:\n   node gen-report.js sales/complete          (builds from that module's ${MAP_FILE})\n   node gen-report.js --new sales/complete    (new module with a starter ${MAP_FILE})\n   node gen-report.js --file=reportmap.txt    (several reports at once)\n   node gen-report.js --all                   (every ${MAP_FILE} found)`); process.exit(1); }
    const only = get('only') && get('only').toLowerCase();
    const rs = addFromText(fs.readFileSync(file, 'utf8'), path.basename(file), null)
      .filter((r) => !only || r.mod.toLowerCase() === only || [...(r.nestParts || []), r.mod].join('/').toLowerCase() === only);
    if (!rs.length) { console.error(`❌ No report named "${get('only')}" in ${path.basename(file)}.`); process.exit(1); }
    rs.forEach((r) => { naming(r, { app, nest: nestFlag }); jobs.push({ r, mapPath: path.join(root, r.fePath, MAP_FILE), seedFrom: r }); });
  }
  jobs.forEach((j) => { if (!j.r.rel) naming(j.r, { app, nest: nestFlag }); });
  const seen = new Set();
  for (const j of jobs) { if (seen.has(j.r.key)) { console.error(`❌ Two reports would both be called "${j.r.name}" (${j.r.rel.join('/')}). Give one a different nest or name.`); process.exit(1); } seen.add(j.r.key); }

  let tables = null;
  if (get('tables')) tables = parseTableDump(fs.readFileSync(path.resolve(root, get('tables')), 'utf8'));
  else if (has('db')) tables = await liveTables(loadEnv(__dirname));
  console.log(`📊 ${jobs.length} report(s)${tables ? ` — checked against ${Object.keys(tables).length} tables` : ' — NOT checked against tables (add --tables=<dump> or --db)'}`);

  const built = [];
  let failed = 0;
  for (const { r, mapPath, seedFrom } of jobs) {
    const s = buildSchemas(r, { app, tables });
    const eng = await engineCheck(root, s.back);
    const engSkipped = eng.find((x) => x.startsWith('__skipped__'));
    const problems = [...new Set(s.problems.concat(eng.filter((x) => !x.startsWith('__skipped__')).map((x) => `${r.name}: ${x}`)))];
    console.log(`\n━━━━ ${r.rel.join('/')} — "${r.label}" (${r.by[0] === 'dimension' ? 'by group' : 'by ' + r.by.join('/')}, ${r.fields.length} fields) ━━━━`);
    (r.notes || []).forEach((n) => console.log(`   ℹ️  ${n}`));
    if (engSkipped) console.log(`   ℹ️  engine schema check skipped (${engSkipped.replace('__skipped__ ', '')}) — the route runs it on every request anyway`);
    if (problems.length) { failed += 1; console.error(problems.map((p) => `   ❌ ${p}`).join('\n')); continue; }
    built.push({ r, s, mapPath, seedFrom });
  }
  if (failed) { console.error(`\n⛔ ${failed} report(s) have problems — nothing was written. Fix the map and run again.`); process.exit(1); }
  if (dry) { built.forEach(({ r, s }) => console.log(`\n--- ${r.name}: backend ---\n${emitBackend(r.name, r, s)}\n--- ${r.name}: frontend ---\n${emitFrontend(r.name, r, s)}`)); return console.log('\n(dry run — nothing written)'); }
  if (!has('no-clone')) for (const t of [feTpl, beTpl]) if (!fs.existsSync(t)) { console.error(`❌ Template folder not found: ${path.relative(root, t)} (run the reports installer first)`); process.exit(1); }

  for (const { r, s, mapPath, seedFrom } of built) {
    const log = [];
    const feDir = path.join(root, r.fePath);
    const beDir = path.join(root, r.bePath);
    console.log(`\n━━━━ building ${r.rel.join('/')} ━━━━`);
    if (seedFrom) { // bulk file: the block moves into the module as its own report.map
      const body = `report ${r.mod} ${r.headerRest}`.trim() + '\n' + r.raw.join('\n').replace(/\s+$/, '') + '\n';
      writeWithBackup(mapPath, body, feDir, root, log);
    }
    writeWithBackup(path.join(beDir, 'list', `${r.name}Schema.js`), emitBackend(r.name, r, s), beDir, root, log);
    writeWithBackup(path.join(feDir, `${r.name}Schema.js`), emitFrontend(r.name, r, s), feDir, root, log);
    const reg = path.join(feDir, 'logicControl', 'actionsRegistry.js');
    if (s.front.links.length && !fs.existsSync(reg)) writeWithBackup(reg, emitRegistry(r.name, s.front.links, r.up), feDir, root, log);
    if (!has('no-clone')) { cloneTemplate(feTpl, feDir, r, log, root); cloneTemplate(beTpl, beDir, r, log, root); mergeRoutes(root, app, r, log, false); }
    console.log(log.filter((l) => !/= kept/.test(l)).join('\n'));
    console.log(`   👉 page ${r.pageUrl}      api /api${app ? '/' + app : ''}/${r.rel.join('/')}/list`);
    if (s.front.links.length) console.log(`   👉 click-throughs: wire ${s.front.links.map((l) => l.key).join(', ')} in ${r.fePath}/logicControl/actionsRegistry.js`);
  }
  if (!has('no-menu')) await offerMenuConfig(root, app, built.map(({ r }) => menuItemOf(r)), { menuDir: get('menu-dir'), autoYes: has('yes'), dry: false });
  console.log('\n✅ Done. Make sure users have the role the report asks for.');
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error('❌', e.message); process.exit(1); });
module.exports = { naming, rewriteDepth, parseMap, buildSchemas, emitBackend, emitFrontend, emitRegistry, parseTableDump };
