// reportLogic.js — PURE report maths. No React, no DOM, no fetch (only ./forecast.js, also pure).
// ---------------------------------------------------------------------------
// Takes a flat report schema + raw measure rows and returns everything the
// grid shows: derived columns, a totals row, one remark per row, a headline.
// Because it is pure it runs identically in the browser (ReportGrid), on the
// server (SMS/email summaries, Decision Feed) and in a node test.
//
//   const out = computeReport(schema, rawRows);
//   out.rows[i] = { label, group, values, display, remark: { tone, text, why } | null }
//   out.totals  = same shape (no remark)        out.headline = { text, tone } | null
//
// FLAT SCHEMA (same spirit as a module schema: key / label / type + a few extras)
//   fields: [
//     { key:'events',    label:'Events',       from:'events' },                  // count rows (API supplies the number)
//     { key:'collected', label:'Collected',    from:'payments.amount', type:'money' },   // sum of a column
//     { key:'show_rate', label:'Show rate',    calc:'attended / sold' },        // formula over other columns
//     { key:'change',    label:'vs last month',calc:'change(collected)' },      // % vs previous row
//   ]
//   remarks: [ { if:'change <= -20', tone:'bad', say:'{events} events made {collected}…' }, … ]   // first match wins
//   headline: '{label}: {events} events made {collected}[, {updown} {abs(change)}% on {prev_label}].'
//
// TYPES: int | number | money | percent | delta.  `type` is optional:
//   from:'x'      -> int          from:'x.col' -> number (set type:'money' for money)
//   calc 'a / b'  -> percent if a and b are both int, money if money/int, else number
//   calc 'change(x)' -> delta
//   A percent column whose calc is a plain ratio 'a / b' is multiplied by 100.
//
// EXPRESSIONS (calc, remark `if`, template {placeholders}) are parsed by the tiny
// parser below — NEVER eval()'d — so a schema file can't run arbitrary code.
//   numbers, column keys, true/false/null, + - * / %, comparisons, && || !, ( ),
//   abs() round() min() max() change(col).
//   null-safe: arithmetic with null -> null; ordering comparisons with null -> false;
//   x !== null / x === null work as written.
// TEMPLATES: {expr} is evaluated and formatted by the column's type; percent and
//   delta print as a plain number (write the % yourself: "{show_rate}%").
//   [ … ] marks an OPTIONAL segment, dropped when any {placeholder} inside is null.
// ---------------------------------------------------------------------------

import { forecast } from './forecast.js';
export const TONES = ['bad', 'watch', 'good', 'neutral'];
export const TONE_LABELS = { bad: 'Problem', watch: 'Watch', good: 'Healthy', neutral: 'OK' };
const RESERVED = new Set(['label', 'prev_label', 'updown', 'true', 'false', 'null']);
const NULLMARK = '\u0000';

// ── tokenizer + parser ──────────────────────────────────────────────────────
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const n = Number(src.slice(i, j));
      if (Number.isNaN(n)) throw new Error(`bad number "${src.slice(i, j)}"`);
      out.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (three === '===' || three === '!==') { out.push({ t: 'op', v: three }); i += 3; continue; }
    if (['&&', '||', '<=', '>=', '==', '!='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%()<>!,'.includes(ch)) { out.push({ t: 'op', v: ch }); i += 1; continue; }
    throw new Error(`unexpected character "${ch}"`);
  }
  return out;
}

class Parser {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek() { return this.toks[this.i]; }
  next() { const t = this.toks[this.i]; this.i += 1; return t; }
  isOp(...ops) { const t = this.peek(); return !!t && t.t === 'op' && ops.includes(t.v); }
  eat(op) {
    if (!this.isOp(op)) throw new Error(`expected "${op}"`);
    return this.next();
  }
  parse() {
    const node = this.or();
    if (this.i < this.toks.length) throw new Error(`unexpected "${this.peek().v}"`);
    return node;
  }
  bin(sub, ops) {
    let l = sub.call(this);
    while (this.isOp(...ops)) { const op = this.next().v; l = { k: 'bin', op, l, r: sub.call(this) }; }
    return l;
  }
  or() { return this.bin(this.and, ['||']); }
  and() { return this.bin(this.eq, ['&&']); }
  eq() { return this.bin(this.rel, ['==', '===', '!=', '!==']); }
  rel() { return this.bin(this.add, ['<', '<=', '>', '>=']); }
  add() { return this.bin(this.mul, ['+', '-']); }
  mul() { return this.bin(this.unary, ['*', '/', '%']); }
  unary() {
    if (this.isOp('!', '-')) { const op = this.next().v; return { k: 'un', op, x: this.unary() }; }
    return this.primary();
  }
  primary() {
    const t = this.next();
    if (!t) throw new Error('unexpected end of expression');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') {
      if (this.isOp('(')) {
        this.next();
        const args = [];
        if (!this.isOp(')')) {
          args.push(this.or());
          while (this.isOp(',')) { this.next(); args.push(this.or()); }
        }
        this.eat(')');
        return { k: 'call', name: t.v, args };
      }
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      return { k: 'id', name: t.v };
    }
    if (t.v === '(') { const n = this.or(); this.eat(')'); return n; }
    throw new Error(`unexpected "${t.v}"`);
  }
}

const parseCache = new Map();
export function parseExpr(src) {
  const key = String(src);
  if (parseCache.has(key)) return parseCache.get(key);
  const ast = new Parser(tokenize(key)).parse();
  parseCache.set(key, ast);
  return ast;
}

const isNil = (v) => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));

export function evalExpr(ast, env = { vars: {}, prev: null }) {
  switch (ast.k) {
    case 'num': case 'lit': return ast.v;
    case 'id': return ast.name in env.vars ? env.vars[ast.name] : null;
    case 'un': {
      const x = evalExpr(ast.x, env);
      if (ast.op === '!') return !x;
      return isNil(x) ? null : -x;
    }
    case 'bin': {
      if (ast.op === '&&') return !!evalExpr(ast.l, env) && !!evalExpr(ast.r, env);
      if (ast.op === '||') return !!evalExpr(ast.l, env) || !!evalExpr(ast.r, env);
      const l = evalExpr(ast.l, env);
      const r = evalExpr(ast.r, env);
      switch (ast.op) {
        case '==': case '===': return (isNil(l) && isNil(r)) || l === r;
        case '!=': case '!==': return !((isNil(l) && isNil(r)) || l === r);
        case '<': return !isNil(l) && !isNil(r) && l < r;
        case '<=': return !isNil(l) && !isNil(r) && l <= r;
        case '>': return !isNil(l) && !isNil(r) && l > r;
        case '>=': return !isNil(l) && !isNil(r) && l >= r;
        default: {
          if (isNil(l) || isNil(r)) return null;
          if (ast.op === '+') return l + r;
          if (ast.op === '-') return l - r;
          if (ast.op === '*') return l * r;
          if (r === 0) return null; // / and % by zero -> null, never Infinity
          return ast.op === '/' ? l / r : l % r;
        }
      }
    }
    case 'call': {
      if (ast.name === 'change') {
        const arg = ast.args[0];
        if (!arg || arg.k !== 'id') throw new Error('change() takes one column key, e.g. change(collected)');
        const cur = env.vars[arg.name];
        const prev = env.prev ? env.prev[arg.name] : null;
        if (isNil(cur) || isNil(prev) || prev === 0) return null;
        return ((cur - prev) / Math.abs(prev)) * 100;
      }
      if (ast.name === 'share') {   // this row's slice of the column total, as a percent (a measure column, not a calc)
        const arg = ast.args[0];
        if (!arg || arg.k !== 'id') throw new Error('share() takes one measure key, e.g. share(collected)');
        const cur = env.vars[arg.name];
        const sum = env.sums ? env.sums[arg.name] : null;
        if (isNil(cur) || isNil(sum) || sum === 0) return null;
        return (cur / sum) * 100;
      }
      const a = ast.args.map((n) => evalExpr(n, env));
      if (ast.name === 'abs') return isNil(a[0]) ? null : Math.abs(a[0]);
      if (ast.name === 'round') return isNil(a[0]) ? null : Math.round(a[0]);
      if (ast.name === 'min') return a.some(isNil) ? null : Math.min(...a);
      if (ast.name === 'max') return a.some(isNil) ? null : Math.max(...a);
      throw new Error(`unknown function ${ast.name}()`);
    }
    default: throw new Error('bad expression node');
  }
}

export function collectIds(ast, out = []) {
  if (!ast) return out;
  if (ast.k === 'id') out.push(ast.name);
  if (ast.l) collectIds(ast.l, out);
  if (ast.r) collectIds(ast.r, out);
  if (ast.x) collectIds(ast.x, out);
  if (ast.args) ast.args.forEach((n) => collectIds(n, out));
  return out;
}

// ── formatting ──────────────────────────────────────────────────────────────
const nf = (v, max = 0) => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: max });

// opts.plain=true -> template mode (no % sign / arrow / + sign)
export function formatValue(v, type = 'number', { currency = 'KES', plain = false } = {}) {
  if (isNil(v)) return 'n/a';
  switch (type) {
    case 'int': return nf(Math.round(v));
    case 'money': {
      const sign = v < 0 ? '-' : '';
      const a = Math.abs(v);
      return a >= 1e6 ? `${sign}${currency} ${(a / 1e6).toFixed(1)}M` : `${sign}${currency} ${nf(Math.round(a))}`;
    }
    case 'percent': return plain ? v.toFixed(1) : `${v.toFixed(1)}%`;
    case 'delta': {
      if (plain) return v.toFixed(1);
      const s = v > 0 ? '+' : v < 0 ? '−' : '';
      return `${s}${Math.abs(v).toFixed(1)}%`;
    }
    default: return Number.isInteger(v) ? nf(v) : nf(v, 1);
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatGroup(groupBy, v) {
  if (isNil(v) || v === '') return '—';
  const s = String(v);
  if (groupBy === 'month' && /^\d{4}-\d{2}/.test(s)) return `${MONTHS[Number(s.slice(5, 7)) - 1] || s.slice(5, 7)} ${s.slice(0, 4)}`;
  if (groupBy === 'day' && /^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(8, 10)} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  if (groupBy === 'hour' && /^\d{1,2}$/.test(s)) return `${s.padStart(2, '0')}:00`;
  if (groupBy === 'weekday' && /^[0-6]$/.test(s)) return WEEKDAYS[Number(s)];
  return s;
}

const SORTED_GROUPS = new Set(['month', 'day', 'year', 'hour', 'weekday']);

// ── types ───────────────────────────────────────────────────────────────────
const SIMPLE_RATIO = /^\s*([A-Za-z_]\w*)\s*\/\s*([A-Za-z_]\w*)\s*$/;

export function inferTypes(fields = []) {
  const types = {};
  fields.forEach((f) => {
    if (f.calc) return;
    types[f.key] = f.type || (f.from && String(f.from).includes('.') ? 'number' : 'int');
  });
  for (let pass = 0; pass <= fields.length; pass += 1) {
    let changed = false;
    fields.forEach((f) => {
      if (!f.calc || types[f.key]) return;
      if (f.type) { types[f.key] = f.type; changed = true; return; }
      if (/^\s*change\s*\(/.test(f.calc)) { types[f.key] = 'delta'; changed = true; return; }
      if (/^\s*share\s*\(/.test(f.calc)) { types[f.key] = 'percent'; changed = true; return; }
      const m = f.calc.match(SIMPLE_RATIO);
      if (m) {
        const a = types[m[1]];
        const b = types[m[2]];
        if (!a || !b) return; // operands not typed yet — next pass
        types[f.key] = a === 'int' && b === 'int' ? 'percent' : a === 'money' && b === 'int' ? 'money' : a === 'money' && b === 'money' ? 'percent' : 'number';
        changed = true;
        return;
      }
      types[f.key] = 'number';
      changed = true;
    });
    if (!changed) break;
  }
  fields.forEach((f) => { if (!types[f.key]) types[f.key] = f.type || 'number'; });
  return types;
}

// ── templates ───────────────────────────────────────────────────────────────
function renderPlaceholder(expr, ctx) {
  const ast = parseExpr(expr);
  const value = evalExpr(ast, ctx.env);
  if (isNil(value)) return NULLMARK;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  const ids = collectIds(ast);
  const type = ctx.types[ids.find((id) => ctx.types[id])] || 'number';
  return formatValue(value, type, { currency: ctx.currency, plain: true });
}

export function renderTemplate(tpl, ctx) {
  const fill = (s) => s.replace(/\{([^{}]+)\}/g, (_, expr) => renderPlaceholder(expr.trim(), ctx));
  const withOptional = String(tpl).replace(/\[([^[\]]*)\]/g, (_, inner) => {
    const r = fill(inner);
    return r.includes(NULLMARK) ? '' : r;
  });
  return fill(withOptional).split(NULLMARK).join('n/a');
}

// ── validation (errors written as teaching) ─────────────────────────────────
export function validateReport(schema) {
  const problems = [];
  const name = schema?.entity || schema?.label || 'report';
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  if (!fields.length) { problems.push(`${name}: "fields" is empty — add at least one { key, label, from } entry.`); return problems; }
  const keys = new Set();
  fields.forEach((f) => {
    if (!f.key) problems.push(`${name}: a field has no "key".`);
    if (keys.has(f.key)) problems.push(`${name}: duplicate field key "${f.key}".`);
    keys.add(f.key);
    if (!f.from && !f.calc) problems.push(`${name}: field "${f.key}" needs either from:'…' (a measure) or calc:'…' (a formula).`);
    if (f.from && f.calc) problems.push(`${name}: field "${f.key}" has both from and calc — pick one.`);
  });
  fields.filter((f) => f.calc).forEach((f) => {
    const m = String(f.calc).match(/share\s*\(\s*(\w+)\s*\)/);
    if (m && !fields.some((x) => x.key === m[1] && !x.calc)) problems.push(`${name}: field "${f.key}" uses share(${m[1]}) — share() needs a measure (a from: column), not a calc column.`);
  });
  const registry = schema.actionRegistry && typeof schema.actionRegistry === 'object' ? schema.actionRegistry : {};
  fields.forEach((f) => {
    if (f.filterTo === undefined || f.filterTo === null || typeof f.filterTo === 'function') return;
    if (typeof f.filterTo !== 'string') problems.push(`${name}: field "${f.key}" filterTo must be an action key (string) or a function.`);
    else if (typeof registry[f.filterTo] !== 'function') problems.push(`${name}: field "${f.key}" filterTo "${f.filterTo}" is not in schema.actionRegistry. Registered: ${Object.keys(registry).join(', ') || '(none — set actionRegistry: ReportActions)'}.`);
  });
  if (schema.view !== undefined && !['smart', 'general'].includes(schema.view)) problems.push(`${name}: view "${schema.view}" — use 'smart' or 'general'.`);
  if (Array.isArray(schema.showInList)) schema.showInList.forEach((k) => { if (!keys.has(k)) problems.push(`${name}: showInList lists "${k}" — not a field key.`); });
  if (schema.controls) {
    const okc = ['view', 'why', 'remarks', 'dates', 'groupBy', 'reset', 'export', 'print'];
    Object.keys(schema.controls).forEach((k) => { if (!okc.includes(k)) problems.push(`${name}: controls.${k} is not a control. Use: ${okc.join(', ')}.`); });
  }
  if (schema.sortBy) {
    const sk = String(schema.sortBy).trim().split(/\s+/)[0];
    if (!keys.has(sk)) problems.push(`${name}: sortBy "${schema.sortBy}" — "${sk}" is not a field key.`);
  }
  const known = new Set([...keys, ...RESERVED]);
  const checkExpr = (src, where) => {
    try {
      collectIds(parseExpr(src)).forEach((id) => {
        if (!known.has(id)) problems.push(`${name}: ${where} uses "${id}" — not a field key. Known keys: ${[...keys].join(', ')}.`);
      });
    } catch (e) { problems.push(`${name}: ${where} "${src}" can't be read (${e.message}).`); }
  };
  const checkTemplate = (tpl, where) => {
    String(tpl).replace(/\{([^{}]+)\}/g, (_, expr) => { checkExpr(expr.trim(), `${where} {${expr.trim()}}`); return ''; });
  };
  fields.forEach((f) => { if (f.calc) checkExpr(f.calc, `calc of "${f.key}"`); });
  (schema.remarks || []).forEach((r, i) => {
    if (!TONES.includes(r.tone)) problems.push(`${name}: remark #${i + 1} has tone "${r.tone}" — use ${TONES.join(' | ')}.`);
    if (!r.if) problems.push(`${name}: remark #${i + 1} has no "if".`); else checkExpr(r.if, `remark #${i + 1} "if"`);
    if (!r.say) problems.push(`${name}: remark #${i + 1} has no "say".`); else checkTemplate(r.say, `remark #${i + 1} "say"`);
  });
  if (schema.headline) checkTemplate(schema.headline, 'headline');
  return problems;
}

// ── the main entry ──────────────────────────────────────────────────────────
function dependencyOrder(fields) {
  const calcs = fields.filter((f) => f.calc);
  const done = new Set(fields.filter((f) => !f.calc).map((f) => f.key));
  const ordered = [];
  let guard = calcs.length + 1;
  const left = [...calcs];
  while (left.length && guard > 0) {
    guard -= 1;
    for (let i = 0; i < left.length; i += 1) {
      const deps = collectIds(parseExpr(left[i].calc)).filter((id) => fields.some((f) => f.key === id));
      if (deps.every((d) => done.has(d))) {
        ordered.push(left[i]);
        done.add(left[i].key);
        left.splice(i, 1);
        i -= 1;
      }
    }
  }
  return ordered.concat(left); // any cycle is left to fail loudly in validateReport
}

function calcValue(field, types, env) {
  let v = evalExpr(parseExpr(field.calc), env);
  if (!isNil(v) && types[field.key] === 'percent' && SIMPLE_RATIO.test(field.calc)) v *= 100;
  return isNil(v) ? null : v;
}

export function computeReport(schema, rawRows = []) {
  const fields = schema.fields || [];
  const types = inferTypes(fields);
  const currency = schema.currency || 'KES';
  const fmt = (key, v) => formatValue(v, types[key], { currency });
  const calcFields = dependencyOrder(fields);

  let src = Array.isArray(rawRows) ? [...rawRows] : [];
  if (SORTED_GROUPS.has(schema.groupBy)) src.sort((a, b) => String(a._group).localeCompare(String(b._group)));

  // column sums over every row: feeds share() and the totals row
  const colSums = {};
  fields.filter((f) => !f.calc).forEach((f) => { colSums[f.key] = src.reduce((a, r) => a + (Number(r[f.key]) || 0), 0); });

  const build = (raw, prevVars, extra = {}) => {
    const vars = {};
    fields.filter((f) => !f.calc).forEach((f) => {
      const n = Number(raw[f.key]);
      vars[f.key] = raw[f.key] === undefined || raw[f.key] === null || Number.isNaN(n) ? 0 : n;
    });
    calcFields.forEach((f) => { vars[f.key] = calcValue(f, types, { vars, prev: prevVars, sums: colSums }); });
    const display = {};
    fields.forEach((f) => { display[f.key] = fmt(f.key, vars[f.key]); });
    return { vars, display, ...extra };
  };

  const rows = [];
  src.forEach((raw, i) => {
    const prev = rows[i - 1];
    const label = raw._label ?? formatGroup(schema.groupBy, raw._group);
    rows.push(build(raw, prev ? prev.vars : null, { group: raw._group, ids: raw._ids, label, prevLabel: prev ? prev.label : null }));
  });

  // sortBy:'collected desc' — rank the groups (a leaderboard). The headline then speaks about the leader, not the last row.
  const sortSpec = typeof schema.sortBy === 'string' ? schema.sortBy.trim().split(/\s+/) : null;
  if (sortSpec && sortSpec[0]) {
    const dir = (sortSpec[1] || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const x = a.vars[sortSpec[0]];
      const y = b.vars[sortSpec[0]];
      if (isNil(x) && isNil(y)) return 0;
      if (isNil(x)) return 1;
      if (isNil(y)) return -1;
      return (x - y) * dir;
    });
  }

  // totals: measures summed, calc columns recomputed on the sums, change -> null
  let totals = null;
  if (schema.totals !== false && rows.length) {
    const sums = {};
    fields.filter((f) => !f.calc).forEach((f) => {
      sums[f.key] = f.total === false ? null : rows.reduce((a, r) => a + (r.vars[f.key] || 0), 0);
    });
    totals = build(sums, null, { label: schema.totalLabel || 'Total', group: null });
    fields.filter((f) => !f.calc && f.total === false).forEach((f) => { totals.vars[f.key] = null; totals.display[f.key] = 'n/a'; });
  }

  // remarks
  const rules = schema.remarks || [];
  const remarkFor = (r) => {
    if (!rules.length) return null;
    const vars = { ...r.vars, label: r.label, prev_label: r.prevLabel || '', updown: isNil(r.vars.change) ? '' : r.vars.change > 0 ? 'up' : r.vars.change < 0 ? 'down' : 'flat' };
    const env = { vars, prev: null };
    for (let i = 0; i < rules.length; i += 1) {
      let hit = false;
      try { hit = !!evalExpr(parseExpr(rules[i].if), env); } catch (e) { hit = false; }
      if (hit) {
        let text = '';
        try { text = renderTemplate(rules[i].say, { env, types, currency }); } catch (e) { text = rules[i].say; }
        return { tone: rules[i].tone, text, why: rules[i].if, rule: i + 1 };
      }
    }
    return { tone: 'neutral', text: '', why: 'no rule matched', rule: 0 };
  };
  rows.forEach((r) => { r.remark = remarkFor(r); r.tone = r.remark ? r.remark.tone : 'neutral'; });

  // headline = last row, toned like its remark
  let headline = null;
  if (schema.headline && rows.length) {
    const last = sortSpec && sortSpec[0] ? rows[0] : rows[rows.length - 1];
    const vars = { ...last.vars, label: last.label, prev_label: last.prevLabel || '', updown: isNil(last.vars.change) ? '' : last.vars.change > 0 ? 'up' : last.vars.change < 0 ? 'down' : 'flat' };
    try { headline = { text: renderTemplate(schema.headline, { env: { vars, prev: null }, types, currency }), tone: last.tone }; } catch (e) { headline = null; }
  }

  return { rows, totals, headline, types };
}

// ════════════════════════════════════════════════════════════════
// FORECAST — schema.forecast = [{ key, next, method?, window?, integer? }]
// Extends a time-grouped report (month | day | year) with `next` coming periods, fitted on the
// loaded history of `key` (a count or sum column). Pure; never touches rows/totals/remarks.
//   forecastReport(schema, out, { groupBy, today }) -> { rows, notes }
//   rows  [{ group, label, forecast:true, vars:{key:v}, display:{key:'12'}, band:{key:{low,high,text}} }]
//   notes ['Client Growth: based on 10 months; average method. Next 7 months ≈ 84 (60–108).']
// Missing periods inside the history count as 0 (a month with no sales is a zero, not a gap).
// The last period is left out of the fit while it is still running (it is "today's" period).
// ════════════════════════════════════════════════════════════════
const pad2 = (n) => String(n).padStart(2, '0');
function groupOfDate(groupBy, d) {
  if (groupBy === 'month') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  if (groupBy === 'day') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (groupBy === 'year') return String(d.getFullYear());
  return null;
}
function nextGroup(groupBy, g) {
  if (groupBy === 'year') return String(Number(g) + 1);
  if (groupBy === 'month') { const y = Number(g.slice(0, 4)); const m = Number(g.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`; }
  const d = new Date(Date.UTC(Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10)) + 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
const UNIT = { month: 'month', day: 'day', year: 'year' };
export const FORECAST_MAX = 60;
// addPeriods('month','2026-10',3) -> '2027-01'      periodsBetween('month','2026-10','2027-01') -> 3 (negative if `to` is earlier)
export function addPeriods(groupBy, g, n) { let x = String(g); for (let i = 0; i < n; i += 1) x = nextGroup(groupBy, x); return x; }
export function periodsBetween(groupBy, from, to) {
  const a = String(from); const b = String(to);
  if (groupBy === 'year') return Number(b) - Number(a);
  if (groupBy === 'month') return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}
const trustLine = (f) => (f.partial ? `Based on the unfinished ${f.unit || 'period'} only: probably low.` : `Based on ${f.used} ${f.unit || 'period'}${f.used === 1 ? '' : 's'} of history: ${f.confidence === 'low' ? 'rough guide' : f.confidence === 'fair' ? 'fair guide' : 'good guide'}.`);
const plural1 = (n, u) => `${n} ${u}${n === 1 ? '' : 's'}`;

export function forecastReport(schema, out, { groupBy, today = new Date(), next: nextOverride } = {}) {
  const specs = Array.isArray(schema.forecast) ? schema.forecast : [];
  const gb = groupBy || schema.groupBy;
  const empty = { rows: [], notes: [] };
  if (!specs.length || !out || !out.rows || !out.rows.length) return empty;
  if (!UNIT[gb]) return { rows: [], notes: [`Forecast needs the report grouped by month, day or year (now: ${gb}).`] };

  const hist = out.rows.filter((r) => typeof r.group === 'string' || typeof r.group === 'number').map((r) => ({ ...r, group: String(r.group) }));
  if (!hist.length) return empty;
  const first = hist[0].group;
  const last = hist[hist.length - 1].group;
  const byGroup = new Map(hist.map((r) => [r.group, r]));
  const running = last === groupOfDate(gb, today);
  const types = out.types || {};
  const currency = schema.currency || 'KES';
  const rowsByGroup = new Map();
  const notes = [];

  specs.forEach((spec) => {
    const key = spec.key;
    if (!key || !hist[0].vars || !(key in hist[0].vars)) { notes.push(`Forecast: unknown column "${key}".`); return; }
    const series = [];
    for (let g = first, guard = 0; guard < 5000; g = nextGroup(gb, g), guard += 1) {
      const r = byGroup.get(g);
      const v = r ? r.vars[key] : 0;
      series.push(Number.isFinite(v) ? v : 0);
      if (g === last) break;
    }
    const label = (schema.fields || []).find((f) => f.key === key)?.label || key;
    const f = forecast(series, {
      next: nextOverride ? Math.min(FORECAST_MAX, Math.max(1, Math.round(nextOverride))) : spec.next, method: spec.method || 'auto', window: spec.window, integer: spec.integer !== undefined ? !!spec.integer : types[key] === 'int',
      dropLast: spec.dropLast !== undefined ? !!spec.dropLast : running, unit: UNIT[gb],
    });
    if (!f.ok) { notes.push(`${label}: no forecast — ${f.reason}`); return; }
    const fmt = (v) => formatValue(v, types[key], { currency });
    let g = last;
    f.rows.forEach((p) => {
      g = nextGroup(gb, g);
      if (!rowsByGroup.has(g)) rowsByGroup.set(g, { group: g, label: formatGroup(gb, g), forecast: true, tone: 'neutral', remark: null, vars: {}, display: {}, band: {}, meta: {} });
      const row = rowsByGroup.get(g);
      row.vars[key] = p.value;
      row.display[key] = fmt(p.value);
      row.raw = row.raw || {}; row.raw[key] = p.raw;
      row.band[key] = { low: p.low, high: p.high, text: `${fmt(p.low)} – ${fmt(p.high)}` };
      row.meta[key] = { label, method: f.method, used: f.used, unit: UNIT[gb], confidence: f.confidence, partial: f.partial, average: fmt(f.average), slope: f.slope, slopeDisplay: fmt(Math.abs(f.slope)), h: 0, lastLabel: formatGroup(gb, last) };
    });
    // which step ahead each forecast row is (1 = the very next period)
    [...rowsByGroup.values()].forEach((r, i) => { r.h = i + 1; Object.values(r.meta).forEach((m) => { m.h = i + 1; }); });
    notes.push({ key, label, fmt, f: { ...f, unit: UNIT[gb] } });
  });

  // running totals on all three lines: expected, lower side and upper side (each adds the period before it: 10, then +10 = 20)
  const rowsList = [...rowsByGroup.values()];
  notes.filter((n) => typeof n === 'object').forEach(({ key, fmt }) => {
    const base = hist.reduce((a, r) => a + (Number(r.vars[key]) || 0), 0); // everything already in the report: the running total starts here
    let cv = base; let cl = base; let ch = base;
    rowsList.forEach((r) => {
      if (!r.band[key]) return;
      cv += r.raw[key].value; cl += r.raw[key].low; ch += r.raw[key].high;
      r.cum = r.cum || {};
      r.cum[key] = { value: cv, low: cl, high: ch, base, baseDisplay: fmt(base), lowDisplay: fmt(cl), highDisplay: fmt(ch), display: fmt(cv), text: `${fmt(cl)} – ${fmt(ch)}`, past: hist.length };
    });
  });
  // one plain summary for the whole report: what the past added up to, and what the coming periods look like
  const oks = notes.filter((n) => typeof n === 'object');
  const problems = notes.filter((n) => typeof n !== 'object');
  notes.length = 0;
  const blocks = [];
  if (oks.length) {
    const u = UNIT[gb];
    const per = oks.map((n) => {
      const last = [...rowsList].reverse().find((r) => r.cum && r.cum[n.key]);
      return { n, c: last.cum[n.key], cnt: rowsList.filter((r) => r.band[n.key]).length };
    });
    const cnt = Math.max(...per.map((x) => x.cnt));
    const past = per[0].c.past;
    const worst = per.map((x) => x.n.f).sort((x, y) => ({ low: 0, fair: 1, good: 2 }[x.confidence] - { low: 0, fair: 1, good: 2 }[y.confidence]))[0];
    blocks.push({ title: `Past ${plural1(past, u)}`, lines: per.map((x) => `${x.n.label}: ${x.c.baseDisplay}`) });
    blocks.push({ title: `Next ${plural1(cnt, u)}`, lines: per.map((x) => `${x.n.label}: about ${x.n.fmt(x.c.value - x.c.base)} (lower side ${x.n.fmt(x.c.low - x.c.base)}, upper side ${x.n.fmt(x.c.high - x.c.base)})`) });
    blocks.push({ title: null, lines: [trustLine(worst)] });
  }
  problems.forEach((p) => blocks.push({ title: null, lines: [p] }));
  // flat text version of the same blocks (tests, plain-text uses)
  blocks.forEach((b) => { if (b.title) notes.push(`${b.title}: ${b.lines.join(' · ')}`); else b.lines.forEach((l) => notes.push(l)); });

  // one plain sentence per forecast row (Details column): the numbers in words + how much to trust them
  const rows = rowsList;
  rows.forEach((r) => {
    const ms = Object.values(r.meta);
    const worst = ms.find((m) => m.partial) || ms.find((m) => m.confidence === 'low') || ms.find((m) => m.confidence === 'fair') || ms[0];
    if (!worst) return;
    // value cell = the numbers; this column = one short block per figure (what, how reached, this month, total) + how far to trust it
    const multi = Object.keys(r.meta).length > 1;
    r.fcBlocks = Object.keys(r.meta).map((k) => {
      const m = r.meta[k];
      const c = r.cum[k];
      const past = m.used === 1 ? `past ${m.unit}` : `past ${m.used} ${m.unit}s`;
      const how = m.method === 'trend' ? `${m.slope >= 0 ? 'Rising' : 'Falling'} about ${m.slopeDisplay} a ${m.unit}, from the ${past}`
        : m.method === 'recent' ? `Recent average, from the last 3 ${m.unit}s`
        : `Steady, from the ${past}`;
      const [lo, hi] = r.band[k].text.split(' – ');
      return {
        title: multi ? m.label : null,
        lines: [
          how,
          `${r.label}: about ${r.display[k]} (${lo} to ${hi})`,
          `Total up to ${r.label}: about ${c.display} (${c.lowDisplay} to ${c.highDisplay})`,
        ],
      };
    });
    r.fcTone = worst.partial || worst.confidence === 'low' ? 'watch' : 'neutral';
    r.fcFoot = `${worst.partial || worst.confidence === 'low' ? `${trustLine({ partial: worst.partial, used: worst.used, unit: worst.unit, confidence: worst.confidence })} ` : ''}A good guess, not a promise.`;
    r.fcNote = [...r.fcBlocks.map((bl) => [bl.title, ...bl.lines].filter(Boolean).join('\n')), r.fcFoot].join('\n\n');
  });
  return { rows, notes, blocks, last, unit: UNIT[gb], groupBy: gb, next: nextOverride || Math.max(...specs.map((x) => x.next || 0)) };
}

// Hover text for a forecast cell (key) or the whole forecast row (key empty). Same shape as explainCell.
export function explainForecast(schema, fout, rowIndex, key) {
  const row = fout && fout.rows ? fout.rows[rowIndex] : null;
  if (!row) return null;
  const m = key ? row.meta[key] : Object.values(row.meta)[0];
  if (!m) return null;
  const u = m.unit;
  const plural = (n) => `${n} ${u}${n === 1 ? '' : 's'}`;
  const how = {
    avg: `${m.label} averaged ${m.average} per ${u} over ${plural(m.used)}. Each coming ${u} is projected at that average.`,
    recent: `${m.label} averaged ${m.average} per ${u} over the last 3 ${u}s. Each coming ${u} is projected at that recent average.`,
    trend: `${m.label} has been ${m.slope >= 0 ? 'rising' : 'falling'} by about ${Math.abs(m.slope)} per ${u}. The trend line through ${plural(m.used)} is extended ${m.h} ${u}${m.h === 1 ? '' : 's'} past ${m.lastLabel}.`,
  }[m.method];
  const lines = [];
  if (key && row.band[key]) lines.push(`Range ${row.band[key].text}: roughly an 80% chance the real figure lands inside it.`);
  if (key && row.cum && row.cum[key]) { const c = row.cum[key]; lines.push(`Running total: the past ${plural(c.past)} total ${c.baseDisplay}; adding the forecast up to ${row.label} gives lower side ${c.lowDisplay}, average ${c.display}, upper side ${c.highDisplay}. The lower side, average and upper side each build on the same past total.`); }
  if (m.partial) lines.push(`Only the running ${u} exists, and it is not finished — the real figure will probably be higher.`);
  else if (m.confidence === 'low') lines.push(`Only ${plural(m.used)} of history, so this is a rough guide. The range is deliberately wide and tightens as more ${u}s arrive.`);
  else if (m.confidence === 'fair') lines.push(`${plural(m.used)} of history: a fair guide. With 6 or more the method is chosen by testing it on recent ${u}s.`);
  lines.push('Forecast rows are not added to the totals and do not get remarks.');
  return {
    title: key ? `${m.label} · ${row.label} (forecast)` : `${row.label} · forecast`,
    lead: `Not real data yet. ${how}`,
    formula: { avg: 'Average of the past periods', recent: 'Average of the last 3 periods', trend: 'Straight line through the past periods, extended forward' }[m.method],
    working: key ? { text: row.display[key], result: null } : null,
    result: key ? row.display[key] : null,
    lines,
  };
}

// periodOf('month','2026-07') -> { start:'2026-07-01', end:'2026-07-31' }   (day -> that day; anything else -> null)
// Handed to filterTo actions so "click July" can open a module list limited to July without re-doing date maths.
export function periodOf(groupBy, group) {
  const g = String(group ?? '');
  if (groupBy === 'month' && /^\d{4}-\d{2}/.test(g)) {
    const y = Number(g.slice(0, 4));
    const m = Number(g.slice(5, 7));
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { start: `${g.slice(0, 7)}-01`, end: `${g.slice(0, 7)}-${String(last).padStart(2, '0')}` };
  }
  if (groupBy === 'day' && /^\d{4}-\d{2}-\d{2}/.test(g)) return { start: g.slice(0, 10), end: g.slice(0, 10) };
  return null;
}

// ════════════════════════════════════════════════════════════════
// EXPLAIN — "how did we end up with this value?"  Pure text, no React.
// The grid shows it in a hover card; the same output could feed a PDF footnote.
//   explainCell(schema, out, rowIndex, key)   a measure or calc cell   (rowIndex = 'totals' for the totals row)
//   explainRemark(schema, out, rowIndex)      the Details / Remark / Status cells: which rule fired and why
//   explainGroup(schema, out, rowIndex)       the first column: what one row stands for
// `out` is whatever computeReport() returned. A field may carry `explain:'…'` to replace the
// generated lead sentence with your own words.
// ════════════════════════════════════════════════════════════════
const OP_WORDS = { '/': '÷', '*': '×', '-': '−' };
const plain = (s) => String(s).replace(/\s+/g, ' ').trim();

function tokens(src) { return String(src).match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|&&|\|\||[<>!=]=?=?|[()+\-*/%,]|\s+|./g) || []; }

// rewrite an expression, swapping each field key through `swap(key)`; operators become words/symbols
function rewrite(src, fields, swap) {
  const keys = new Set(fields.map((f) => f.key));
  const t = tokens(src);
  const sig = t.map((x) => x.trim()).filter(Boolean);
  let si = -1;
  const out = plain(t.map((tok, i) => {
    if (tok.trim()) si += 1;
    const before = si > 0 ? sig[si - 1] : null;
    if (keys.has(tok)) return swap(tok);
    if (tok === '-' && (before === null || /^(?:[(+\-*/%,<>=!&|])/.test(before))) return '−'; // a minus sign, not subtraction
    if (OP_WORDS[tok]) return ` ${OP_WORDS[tok]} `;
    if (tok === '&&') return ' and ';
    if (tok === '||') return ' or ';
    if (tok === '===' || tok === '==') return ' = ';
    if (tok === '!==' || tok === '!=') return ' ≠ ';
    if (tok === '>=' ) return ' ≥ ';
    if (tok === '<=') return ' ≤ ';
    if (/^[A-Za-z_]\w*$/.test(tok) && t[i + 1] === '(') return tok;
    return tok;
  }).join(''));
  return out.replace(/ ≠ null\b/g, ' is set').replace(/ = null\b/g, ' is empty');
}

function rowOf(out, rowIndex) {
  const row = rowIndex === 'totals' ? out.totals : out.rows[rowIndex];
  const prev = rowIndex === 'totals' ? null : out.rows[rowIndex - 1] || null;
  return { row, prev };
}

export function explainGroup(schema, out, rowIndex) {
  const { row } = rowOf(out, rowIndex);
  if (!row) return null;
  if (rowIndex === 'totals') return { title: row.label, lead: `All ${out.rows.length} rows added together.`, lines: [] };
  const src = schema.groupFrom ? `each distinct value of ${schema.groupFrom}` : `each ${schema.groupBy || 'group'}`;
  return { title: row.label, lead: `One row per ${String(schema.groupLabel || schema.groupBy || 'group').toLowerCase()}: ${src}.`, lines: [] };
}

export function explainCell(schema, out, rowIndex, key) {
  const fields = schema.fields || [];
  const f = fields.find((x) => x.key === key);
  const { row, prev } = rowOf(out, rowIndex);
  if (!f || !row) return null;
  const isTotals = rowIndex === 'totals';
  const val = row.display[key];
  const lines = [];
  let lead = '';
  let formula = null;
  let working = null;
  const labelOf = (k) => (fields.find((x) => x.key === k) || {}).label || k;
  const valOf = (k) => (row.display[k] === undefined ? k : row.display[k]);

  if (f.from) {
    const [tableRaw, col] = String(f.from).split('.');
    lead = col ? `Adds up ${col} in ${tableRaw}` : `Counts the rows in ${tableRaw}`;
    lead += isTotals ? '' : ` for ${row.label}.`;
    if (isTotals) lead += ` — the sum of the ${out.rows.length} rows above.`;
    if (f.where) lines.push(`Only rows where ${plain(String(f.where).replace(/\s*=\s*/, ' = '))}.`);
    if (f.by) lines.push(`Placed in a row by ${f.by}.`);
    if (f.via) lines.push(`Reaches the ${String(schema.groupLabel || 'group').toLowerCase()} through ${f.via}.`);
    if (f.via && schema.credit === 'split') lines.push('A deal touched by several activities is split equally between them, so rows add up to the real total.');
    if (f.via && schema.credit === 'full') lines.push('A deal touched by several activities counts in full for each one (rows can add up to more than the real total).');
    if (isTotals && f.total === false) { lead = 'Not totalled — adding these up would not mean anything.'; }
    working = { text: val, result: null };
  } else if (f.calc) {
    const calc = String(f.calc);
    const ch = calc.match(/^\s*change\s*\(\s*(\w+)\s*\)\s*$/);
    const sh = calc.match(/^\s*share\s*\(\s*(\w+)\s*\)\s*$/);
    if (ch) {
      const k = ch[1];
      formula = `(${labelOf(k)} now − ${labelOf(k)} before) ÷ ${labelOf(k)} before`;
      lead = `How much ${labelOf(k)} moved compared with the previous row.`;
      if (isTotals || !prev) {
        lines.push(isTotals ? 'No comparison on the totals row.' : `Nothing to compare with — ${row.label} is the first row.`);
        working = null;
      } else {
        working = { text: `(${valOf(k)} − ${prev.display[k]}) ÷ ${prev.display[k]}`, result: val };
        lines.push(`${row.label} against ${prev.label}.`);
      }
    } else if (sh) {
      const k = sh[1];
      formula = `${labelOf(k)} ÷ column total`;
      lead = `This row's slice of all ${labelOf(k)}.`;
      working = { text: `${valOf(k)} ÷ ${out.totals ? out.totals.display[k] : '?'}`, result: val };
    } else {
      formula = rewrite(calc, fields, labelOf);
      const worked = rewrite(calc, fields, valOf);
      const pct = out.types[key] === 'percent' && SIMPLE_RATIO.test(calc);
      lead = `Worked out from other columns: ${formula}.`;
      working = { text: pct ? `${worked} × 100` : worked, result: val };
      if (isTotals) lines.push('Worked out on the totals row itself — not an average of the rows above.');
    }
    if (row.vars[key] === null || row.vars[key] === undefined) {
      if (!ch && !sh) lines.push('Shows n/a because a value it needs is missing or the divisor is zero.');
    }
  }
  if (f.explain) lead = String(f.explain);
  return { title: `${f.label} · ${row.label}`, lead, formula, working, result: val, lines };
}

// One plain sentence for the inline "Why?" line.
export function whyText(schema, remark) {
  if (!remark || !remark.rule) return 'No rule fit this row.';
  const rules = schema.remarks || [];
  const rule = rules[remark.rule - 1];
  if (!rule) return '';
  if (String(rule.if).trim() === 'true') {
    return remark.rule === 1 ? 'Default message — this report has no other rules.' : `Default message — none of the ${remark.rule - 1} rule${remark.rule === 2 ? '' : 's'} above it fit this row.`;
  }
  const fields = schema.fields || [];
  const labelOf = (k) => (fields.find((x) => x.key === k) || {}).label || k;
  return `Because ${rewrite(rule.if, fields, labelOf)}.`;
}

export function explainRemark(schema, out, rowIndex) {
  const { row } = rowOf(out, rowIndex);
  const rules = schema.remarks || [];
  if (!row || !row.remark) return null;
  const r = row.remark;
  const fields = schema.fields || [];
  const labelOf = (k) => (fields.find((x) => x.key === k) || {}).label || k;
  if (!r.rule) return { title: row.label, lead: 'No remark rule matched this row.', lines: ['Remarks are checked top to bottom and the first rule that fits is used. None fit, and there is no catch-all rule at the end.'], facts: [], tone: r.tone };
  const rule = rules[r.rule - 1];
  const cond = (x) => rewrite(x.if, fields, labelOf);
  const idsOf = (x) => { try { return [...new Set(collectIds(parseExpr(x.if)))].filter((id) => fields.some((f) => f.key === id)); } catch (e) { return []; } };
  const facts = idsOf(rule).map((id) => ({ name: labelOf(id), value: row.display[id] }));
  const isDefault = String(rule.if).trim() === 'true';
  const lines = [];
  lines.push('Remarks are checked top to bottom; the first rule that fits is the one shown.');
  rules.slice(0, r.rule - 1).forEach((x, i) => {
    const vals = idsOf(x).map((id) => `${labelOf(id)} is ${row.display[id]}`).join(', ');
    lines.push(`Rule ${i + 1}${x.title ? ` (${x.title})` : ''}: ${String(x.if).trim() === 'true' ? 'always fits' : cond(x)} — not met${vals ? ` (${vals})` : ''}.`);
  });
  lines.push(isDefault
    ? `Rule ${r.rule} has no condition — it is the default, used when nothing above it fits.`
    : `Rule ${r.rule}: ${cond(rule)} — met, so this message is used.`);
  return {
    title: `${row.label} · ${rule.title || 'Remark'}`,
    lead: r.text,
    rule: isDefault ? `Default message (rule ${r.rule})` : `Because ${cond(rule)}`,
    facts,
    lines,
    tone: r.tone,
  };
}
