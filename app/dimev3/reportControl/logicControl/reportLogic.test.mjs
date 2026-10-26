// Run:  node --test reportControl/logicControl/reportLogic.test.mjs
// Self-contained (no app imports) — checks the pure maths the grid and the server share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReport, validateReport, parseExpr, evalExpr, renderTemplate, formatValue, formatGroup, inferTypes, forecastReport } from './reportLogic.js';

const schema = {
  entity: 'monthly_performance',
  currency: 'KES',
  groupBy: 'month',
  groupLabel: 'Month',
  fields: [
    { key: 'events', label: 'Events', from: 'events' },
    { key: 'sold', label: 'Tickets sold', from: 'tickets' },
    { key: 'attended', label: 'Attended', from: 'check_ins' },
    { key: 'show_rate', label: 'Show rate', calc: 'attended / sold' },
    { key: 'collected', label: 'Collected', from: 'payments.amount', type: 'money' },
    { key: 'per_event', label: 'Avg per event', calc: 'collected / events' },
    { key: 'change', label: 'vs last month', calc: 'change(collected)' },
  ],
  remarks: [
    { if: 'events > 0 && collected == 0', tone: 'bad', say: '{events} events but nothing collected.' },
    { if: 'change !== null && change <= -20', tone: 'bad', say: '{events} events made {collected}, down {abs(change)}% on last month. Fewer sales, not fewer events.' },
    { if: 'show_rate < 60', tone: 'watch', say: 'Only {show_rate}% of ticket holders attended.' },
    { if: 'change !== null && change >= 10 && show_rate >= 80', tone: 'good', say: '{events} events made {collected}, up {change}%, with strong attendance ({show_rate}%). A healthy month.' },
    { if: 'true', tone: 'neutral', say: '{events} events made {collected} ({per_event} per event).' },
  ],
  headline: '{label}: {events} events made {collected}[, {updown} {abs(change)}% on {prev_label}].',
};

// deliberately shuffled — the engine sorts month groups ascending
const raw = [
  { _group: '2026-08', events: 18, sold: 4100, attended: 3280, collected: 13600000 },
  { _group: '2026-05', events: 14, sold: 3200, attended: 2480, collected: 9800000 },
  { _group: '2026-10', events: 20, sold: 4600, attended: 3770, collected: 17000000 },
  { _group: '2026-06', events: 16, sold: 3650, attended: 2810, collected: 11200000 },
  { _group: '2026-09', events: 17, sold: 3900, attended: 2730, collected: 15200000 },
  { _group: '2026-07', events: 15, sold: 3400, attended: 1970, collected: 8400000 },
];

test('types are inferred from the formulas', () => {
  const t = inferTypes(schema.fields);
  assert.deepEqual(t, { events: 'int', sold: 'int', attended: 'int', collected: 'money', show_rate: 'percent', per_event: 'money', change: 'delta' });
});

test('derived columns, sorting and change()', () => {
  const out = computeReport(schema, raw);
  assert.deepEqual(out.rows.map((r) => r.label), ['May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026']);
  const may = out.rows[0];
  const jul = out.rows[2];
  const oct = out.rows[5];
  assert.equal(may.vars.change, null);
  assert.equal(may.display.change, 'n/a');
  assert.equal(may.display.show_rate, '77.5%');
  assert.equal(may.display.per_event, 'KES 700,000');
  assert.equal(jul.display.change, '−25.0%');
  assert.equal(jul.display.show_rate, '57.9%');
  assert.equal(oct.display.collected, 'KES 17.0M');
  assert.equal(oct.display.change, '+11.8%');
  assert.equal(out.rows[4].display.per_event, 'KES 894,118');
});

test('remarks: first matching rule wins, with the rule that fired', () => {
  const out = computeReport(schema, raw);
  assert.deepEqual(out.rows.map((r) => r.tone), ['neutral', 'neutral', 'bad', 'good', 'neutral', 'good']);
  assert.equal(out.rows[2].remark.text, '15 events made KES 8.4M, down 25.0% on last month. Fewer sales, not fewer events.');
  assert.equal(out.rows[2].remark.rule, 2);
  assert.equal(out.rows[5].remark.text, '20 events made KES 17.0M, up 11.8%, with strong attendance (82.0%). A healthy month.');
  assert.equal(out.rows[0].remark.text, '14 events made KES 9.8M (KES 700,000 per event).');
});

test('totals recompute the derived columns; change is n/a', () => {
  const { totals } = computeReport(schema, raw);
  assert.equal(totals.label, 'Total');
  assert.equal(totals.display.events, '100');
  assert.equal(totals.display.sold, '22,850');
  assert.equal(totals.display.attended, '17,040');
  assert.equal(totals.display.collected, 'KES 75.2M');
  assert.equal(totals.display.show_rate, '74.6%');
  assert.equal(totals.display.per_event, 'KES 752,000');
  assert.equal(totals.display.change, 'n/a');
});

test('headline uses the last row; the optional clause drops when there is no previous row', () => {
  assert.equal(computeReport(schema, raw).headline.text, 'Oct 2026: 20 events made KES 17.0M, up 11.8% on Sep 2026.');
  assert.equal(computeReport(schema, raw).headline.tone, 'good');
  const one = computeReport(schema, [raw[1]]);
  assert.equal(one.headline.text, 'May 2026: 14 events made KES 9.8M.');
});

test('missing measures become 0, divide-by-zero becomes null (never Infinity/NaN)', () => {
  const out = computeReport(schema, [{ _group: '2026-01', events: 3 }]);
  assert.equal(out.rows[0].vars.sold, 0);
  assert.equal(out.rows[0].vars.show_rate, null);
  assert.equal(out.rows[0].display.show_rate, 'n/a');
  assert.equal(out.rows[0].tone, 'bad'); // events > 0 && collected == 0
});

test('expression parser: precedence, null safety, no eval', () => {
  const ev = (src, vars = {}) => evalExpr(parseExpr(src), { vars, prev: null });
  assert.equal(ev('1 + 2 * 3'), 7);
  assert.equal(ev('(1 + 2) * 3'), 9);
  assert.equal(ev('a > 5 && b < 2', { a: 6, b: 1 }), true);
  assert.equal(ev('a > 5', { a: null }), false);
  assert.equal(ev('a !== null', { a: null }), false);
  assert.equal(ev('a / 0', { a: 4 }), null);
  assert.equal(ev('abs(-3) + max(1, 9)'), 12);
  assert.throws(() => parseExpr('constructor.constructor("x")()'), /bad number|unexpected/); // property access / string literals simply don't exist in the grammar
  assert.throws(() => evalExpr(parseExpr('process()'), { vars: {} }), /unknown function/);
});

test('templates: optional segments and formatting by column type', () => {
  const types = { m: 'money', p: 'percent', n: 'int' };
  const ctx = (vars) => ({ env: { vars, prev: null }, types, currency: 'KES' });
  assert.equal(renderTemplate('{n} made {m}, {p}%', ctx({ n: 1200, m: 2500000, p: 12.34 })), '1,200 made KES 2.5M, 12.3%');
  assert.equal(renderTemplate('x[ and {m}]', ctx({ m: null })), 'x');
  assert.equal(renderTemplate('x[ and {m}]', ctx({ m: 5 })), 'x and KES 5');
});

test('formatting helpers', () => {
  assert.equal(formatValue(999999, 'money'), 'KES 999,999');
  assert.equal(formatValue(1000000, 'money'), 'KES 1.0M');
  assert.equal(formatValue(-2500000, 'money'), '-KES 2.5M');
  assert.equal(formatValue(0, 'delta'), '0.0%');
  assert.equal(formatGroup('hour', '7'), '07:00');
  assert.equal(formatGroup('weekday', '1'), 'Mon');
  assert.equal(formatGroup('month', '2026-02'), 'Feb 2026');
});

test('validateReport: a good schema is clean, a bad one explains what to fix', () => {
  assert.deepEqual(validateReport(schema), []);
  const bad = {
    entity: 'x',
    fields: [{ key: 'a', label: 'A', from: 'a' }, { key: 'b', label: 'B', calc: 'a / zzz' }, { key: 'a', label: 'dup', from: 'a' }, { key: 'c', label: 'C' }],
    remarks: [{ if: 'q > 1', tone: 'angry', say: 'hi {nope}' }],
    headline: '{label} {missing}',
  };
  const p = validateReport(bad).join('\n');
  assert.match(p, /duplicate field key "a"/);
  assert.match(p, /uses "zzz" — not a field key/);
  assert.match(p, /field "c" needs either from/);
  assert.match(p, /tone "angry"/);
  assert.match(p, /uses "q"/);
  assert.match(p, /\{nope\}/);
  assert.match(p, /headline \{missing\}/);
});

test('share() and sortBy: a leaderboard of groups with each one\'s slice of the total', () => {
  const lb = {
    entity: 'x', groupBy: 'type', sortBy: 'collected desc',
    fields: [
      { key: 'acts', label: 'Activities', from: 'activities' },
      { key: 'collected', label: 'Collected', from: 'payments.amount', type: 'money' },
      { key: 'share_acts', label: 'Effort', calc: 'share(acts)' },
      { key: 'share_cash', label: 'Cash', calc: 'share(collected)' },
    ],
    remarks: [{ if: 'share_cash > share_acts', tone: 'good', say: '{share_cash}% of cash from {share_acts}% of effort.' }, { if: 'true', tone: 'neutral', say: 'ok' }],
    headline: '{label} leads with {collected}.',
  };
  assert.deepEqual(validateReport(lb), []);
  const out = computeReport(lb, [
    { _group: 'Call', acts: 60, collected: 100000 },
    { _group: 'Meeting', acts: 20, collected: 700000 },
    { _group: 'Email', acts: 20, collected: 200000 },
  ]);
  assert.deepEqual(out.rows.map((r) => r.label), ['Meeting', 'Email', 'Call']);       // ranked, not input order
  assert.equal(out.rows[0].display.share_acts, '20.0%');
  assert.equal(out.rows[0].display.share_cash, '70.0%');
  assert.equal(out.rows[0].remark.text, '70.0% of cash from 20.0% of effort.');
  assert.equal(out.rows[2].tone, 'neutral');
  assert.equal(out.totals.display.share_cash, '100.0%');                              // shares add up
  assert.equal(out.headline.text, 'Meeting leads with KES 700,000.');                 // headline = the leader
  assert.match(validateReport({ ...lb, sortBy: 'nope desc' }).join(), /sortBy/);
  assert.match(validateReport({ ...lb, fields: [...lb.fields, { key: 'bad', label: 'B', calc: 'share(share_cash)' }] }).join(), /share\(share_cash\) — share\(\) needs a measure/);
});

test('explain: every kind of cell can say how its value came about', async () => {
  const { explainCell, explainRemark, explainGroup } = await import('./reportLogic.js');
  const out = computeReport(schema, raw);
  // a measure
  const m = explainCell(schema, out, 2, 'collected');
  assert.match(m.lead, /Adds up amount in payments for Jul 2026/);
  assert.equal(m.result, 'KES 8.4M');
  // a ratio, with the real numbers substituted in
  const r = explainCell(schema, out, 2, 'show_rate');
  assert.equal(r.formula, 'Attended ÷ Tickets sold');
  assert.equal(r.working.text, '1,970 ÷ 3,400 × 100');
  assert.equal(r.result, '57.9%');
  // change vs the previous row
  const c = explainCell(schema, out, 2, 'change');
  assert.equal(c.working.text, '(KES 8.4M − KES 11.2M) ÷ KES 11.2M');
  assert.equal(c.result, '−25.0%');
  assert.match(explainCell(schema, out, 0, 'change').lines[0], /first row/);
  // totals are re-derived, not averaged
  const t = explainCell(schema, out, 'totals', 'show_rate');
  assert.match(t.lines.join(' '), /not an average/);
  assert.match(explainCell(schema, out, 'totals', 'events').lead, /sum of the 6 rows above/);
  // the remark names the rule and the numbers it looked at
  const e = explainRemark(schema, out, 2);
  assert.equal(e.rule, 'Because vs last month is set and vs last month ≤ −20');
  assert.deepEqual(e.facts.map((x) => x.name), ['vs last month']);
  assert.equal(e.facts[0].value, '−25.0%');
  assert.match(e.lines[1], /Rule 1.*not met/);
  // own words win
  const own = explainCell({ ...schema, fields: schema.fields.map((f) => (f.key === 'events' ? { ...f, explain: 'Events that started in the month.' } : f)) }, out, 0, 'events');
  assert.equal(own.lead, 'Events that started in the month.');
  assert.match(explainGroup(schema, out, 0).lead, /One row per month/);
  assert.equal(explainCell(schema, out, 0, 'nope'), null);
});

test('periodOf + schema checks for filterTo / controls / showInList / view', async () => {
  const { periodOf } = await import('./reportLogic.js');
  assert.deepEqual(periodOf('month', '2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodOf('month', '2028-02'), { start: '2028-02-01', end: '2028-02-29' });   // leap year
  assert.deepEqual(periodOf('day', '2026-10-05'), { start: '2026-10-05', end: '2026-10-05' });
  assert.equal(periodOf('type', 'Call'), null);
  const base = { ...schema, actionRegistry: { open_events: () => {} } };
  const withLink = (filterTo) => ({ ...base, fields: base.fields.map((f) => (f.key === 'events' ? { ...f, filterTo } : f)) });
  assert.deepEqual(validateReport(withLink('open_events')), []);
  assert.deepEqual(validateReport(withLink(() => {})), []);
  assert.match(validateReport(withLink('open_evnts')).join(), /"open_evnts" is not in schema.actionRegistry\. Registered: open_events/);
  assert.match(validateReport({ ...base, view: 'fancy' }).join(), /view "fancy"/);
  assert.match(validateReport({ ...base, showInList: ['events', 'nope'] }).join(), /"nope" — not a field key/);
  assert.match(validateReport({ ...base, controls: { why: false, wibble: true } }).join(), /controls\.wibble is not a control/);
});

// ── forecast: 10 months, 120 clients -> average 12/month -> 7 coming months ≈ 84 ──
test('forecastReport extends a monthly count series', () => {
  const sc = { entity: 'g', groupBy: 'month', fields: [{ key: 'n', label: 'New Clients', from: 'clients' }], forecast: [{ key: 'n', next: 7, method: 'avg' }] };
  const vals = [10, 12, 11, 13, 12, 12, 11, 13, 12, 14]; // = 120
  const rawRows = vals.map((n, i) => ({ _group: `2025-${String(i + 1).padStart(2, '0')}`, n }));
  const out = computeReport(sc, rawRows);
  const f = forecastReport(sc, out, { today: new Date(2026, 5, 15) });
  assert.equal(f.rows.length, 7);
  assert.equal(f.rows[0].group, '2025-11');
  assert.equal(f.rows[2].group, '2026-01'); // rolls over the year
  assert.equal(f.rows[0].display.n, '12');
  assert.ok(f.rows[0].band.n.low <= 12 && f.rows[0].band.n.high >= 12);
  assert.equal(f.notes[0], 'Past 10 months: New Clients: 120');
  assert.match(f.notes[1], /^Next 7 months: New Clients: about 84 \(lower side \d+, upper side \d+\)/);
  assert.equal(out.rows.length, 10); // history untouched
});

test('forecastReport: gaps count as zero, running month is dropped, bad setups explain themselves', () => {
  const sc = { entity: 'g', groupBy: 'month', fields: [{ key: 'n', label: 'N', from: 'c' }], forecast: [{ key: 'n', next: 2, method: 'avg' }] };
  const out = computeReport(sc, [{ _group: '2026-01', n: 10 }, { _group: '2026-03', n: 10 }, { _group: '2026-04', n: 10 }, { _group: '2026-05', n: 1 }]);
  const f = forecastReport(sc, out, { today: new Date(2026, 4, 20) }); // May is running -> excluded; Feb = 0
  assert.equal(f.rows[0].group, '2026-06');
  assert.ok(Math.abs(f.rows[0].vars.n - 7.5) < 0.51);
  const bad = forecastReport({ ...sc, groupBy: 'dimension' }, out, {});
  assert.equal(bad.rows.length, 0);
  assert.match(bad.notes[0], /month, day or year/);
  assert.match(forecastReport({ ...sc, forecast: [{ key: 'zz', next: 2 }] }, out, {}).notes[0], /unknown column/);
});

test('remark "why" explains catch-all rules and which earlier rules were skipped', async () => {
  const { explainRemark, whyText } = await import('./reportLogic.js');
  const out = computeReport(schema, raw);
  const idx = out.rows.findIndex((r) => r.remark.rule === 5);
  assert.ok(idx >= 0);
  const e = explainRemark(schema, out, idx);
  assert.match(e.rule, /^Default message \(rule 5\)/);
  assert.equal(e.lines.filter((l) => /not met/.test(l)).length, 4); // rules 1-4 skipped, each named
  assert.match(e.lines.at(-1), /no condition/);
  assert.match(whyText(schema, out.rows[idx].remark), /none of the 4 rules above it fit/);
  assert.match(whyText(schema, { rule: 2 }), /^Because /);
});

test('forecast works from a single period, says so, and explains each cell', async () => {
  const { explainForecast } = await import('./reportLogic.js');
  const sc = { entity: 'g', groupBy: 'month', fields: [{ key: 'n', label: 'Loans', from: 'loans' }], forecast: [{ key: 'n', next: 3 }] };
  const out = computeReport(sc, [{ _group: '2026-01', n: 12 }]);
  const f = forecastReport(sc, out, { today: new Date(2026, 5, 1) });
  assert.equal(f.rows.length, 3);
  assert.match(f.rows[0].fcNote, /Based on 1 month of history: rough guide/);
  assert.equal(f.rows[0].fcTone, 'watch');
  const e = explainForecast(sc, f, 1, 'n');
  assert.match(e.lead, /Not real data yet/);
  assert.ok(e.lines.some((l) => /rough guide/.test(l)));
  assert.ok(explainForecast(sc, f, 0, '').title.endsWith('forecast'));
  // running month is the only one -> flagged as partial
  const f2 = forecastReport(sc, out, { today: new Date(2026, 0, 20) });
  assert.match(f2.rows[0].fcNote, /unfinished month only/);
});

test('running total starts from the past total, on lower side, average and upper side', () => {
  const sc = { entity: 'g', groupBy: 'month', fields: [{ key: 'n', label: 'N', from: 'c' }], forecast: [{ key: 'n', next: 3, method: 'avg' }] };
  const out = computeReport(sc, [6, 6, 6, 6, 6].map((n, i) => ({ _group: `2026-0${i + 1}`, n }))); // past 5 months = 30
  const f = forecastReport(sc, out, { today: new Date(2026, 8, 1) });
  assert.deepEqual(f.rows.map((r) => r.cum.n.value), [36, 42, 48]); // 30 + 6, +6, +6
  assert.equal(f.rows[0].cum.n.base, 30);
  assert.deepEqual(f.rows.map((r) => r.cum.n.display), ['36', '42', '48']);
  assert.equal(f.notes[0], 'Past 5 months: N: 30');
  assert.equal(f.notes[1], 'Next 3 months: N: about 18 (lower side 18, upper side 18)');
  assert.equal(f.rows[1].fcNote, 'Steady, from the past 5 months\nJul 2026: about 6 (6 to 6)\nTotal up to Jul 2026: about 42 (42 to 42)\n\nA good guess, not a promise.');
});

test('forecast horizon can be overridden, and up-to dates convert to a number of periods', async () => {
  const { addPeriods, periodsBetween } = await import('./reportLogic.js');
  assert.equal(addPeriods('month', '2026-10', 3), '2027-01');
  assert.equal(periodsBetween('month', '2026-10', '2027-01'), 3);
  assert.equal(periodsBetween('year', '2026', '2030'), 4);
  assert.equal(periodsBetween('day', '2026-02-27', '2026-03-02'), 3);
  const sc = { entity: 'g', groupBy: 'month', fields: [{ key: 'n', label: 'N', from: 'c' }], forecast: [{ key: 'n', next: 3, method: 'avg' }] };
  const out = computeReport(sc, [10, 10, 10, 10].map((n, i) => ({ _group: `2026-0${i + 1}`, n })));
  const f = forecastReport(sc, out, { today: new Date(2026, 8, 1), next: 12 });
  assert.equal(f.rows.length, 12);
  assert.equal(f.last, '2026-04');
  assert.equal(forecastReport(sc, out, { today: new Date(2026, 8, 1), next: 500 }).rows.length, 60); // capped
  assert.equal(forecastReport(sc, out, { today: new Date(2026, 8, 1) }).rows.length, 3); // schema default
});
