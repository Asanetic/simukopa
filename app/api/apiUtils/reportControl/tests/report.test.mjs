import test from 'node:test';
import assert from 'node:assert/strict';
import { mosySecureReport, ReportError, _buildMeasureQuery, indexAdvice } from '../reportEngine.js';
import { createReportCache, createRateLimiter } from '../reportCache.js';
import { validateApiSchema, _resetVerified } from '../reportSchemaCheck.js';
import { mysql, postgres } from '../reportDialects.js';
import { ActivityRevenueApiSchema as monthly } from '../examples/ActivityRevenueApiSchema.js';
import { ActivityPerformanceApiSchema as perf } from '../examples/ActivityPerformanceApiSchema.js';
import { makeDb, qs } from './fixture.mjs';

const T1 = { hive_site_id: 'T1', user_id: 'u1' };
const run = (schema, params, auth = T1, extra = {}) => {
  const { db, log, raw } = extra.ctx || makeDb();
  return mosySecureReport({ schema, searchParams: qs(params), authData: auth, db, cache: createReportCache(), now: new Date('2026-09-15T00:00:00Z'), ...extra }).then((r) => ({ ...r, log, raw, db }));
};
const rows = (r) => r.data.map((x) => [x._group, x.activities, x.expected, x.collected]);

test('monthly: matches hand-computed numbers, fills the empty month, never shows another tenant', async () => {
  const r = await run(monthly, { date_start: '2026-05', date_end: '2026-08' });
  assert.deepEqual(rows(r), [['2026-05', 2, 1000, 600], ['2026-06', 3, 3000, 500], ['2026-07', 0, 0, 0], ['2026-08', 1, 500, 0]]);
  const t2 = await run(monthly, { date_start: '2026-05', date_end: '2026-08' }, { hive_site_id: 'T2' });
  assert.deepEqual(rows(t2), [['2026-05', 0, 0, 0], ['2026-06', 3, 9999, 7777], ['2026-07', 0, 0, 0], ['2026-08', 0, 0, 0]]);
});

test('date window: month end is inclusive, outside rows excluded', async () => {
  const r = await run(monthly, { date_start: '2026-06', date_end: '2026-06' });
  assert.deepEqual(rows(r), [['2026-06', 3, 3000, 500]]);
  const day = await run(monthly, { date_start: '2026-06-03', date_end: '2026-06-15', bucket: 'day' });
  assert.equal(day.data.length, 13);
  assert.equal(day.data.find((x) => x._group === '2026-06-03').activities, 1);
  assert.equal(day.data.find((x) => x._group === '2026-06-15').activities, 1);
});

test('schema filter applies only where mapped', async () => {
  const r = await run(monthly, { date_start: '2026-05', date_end: '2026-06', owner: 'u1' });
  assert.deepEqual(rows(r), [['2026-05', 2, 1000, 600], ['2026-06', 2, 3000, 500]]);
});

test('no start date -> default window, snapped to whole months', async () => {
  const r = await run(monthly, {});
  assert.equal(r.meta.start, '2025-09-01'); // now 2026-09-15 minus 366d = 2025-09-14 -> snapped to 2025-09-01
  assert.ok(r.data.length >= 12);
});

test('dimension report: split credit shares an opportunity across its activity types', async () => {
  const r = await run(perf, {});
  const by = Object.fromEntries(r.data.map((x) => [x._group, x]));
  assert.equal(by.call.activities, 4); assert.equal(by.meeting.activities, 1); assert.equal(by.email.activities, 1);
  const close = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`);
  close(by.call.expected, 3666.67); close(by.meeting.expected, 333.33); close(by.email.expected, 500);
  close(by.call.collected, 833.33); close(by.meeting.collected, 266.67); assert.equal(by.email.collected, 0);
  // splits never create or lose money
  close(r.data.reduce((a, x) => a + x.expected, 0), 4500);
});

test('dimension report: full credit gives every type the whole amount; labels come from a tenant-scoped lookup', async () => {
  const full = JSON.parse(JSON.stringify(perf));
  full.measures.forEach((m) => { if (m.join) m.join.credit = 'full'; });
  full.bucketLabel = undefined;
  const r = await run(full, {});
  const by = Object.fromEntries(r.data.map((x) => [x._group, x]));
  assert.equal(by.call.expected, 4000); assert.equal(by.meeting.expected, 1000); assert.equal(by.email.expected, 500);

  const byUser = { entity: 'by_user', bucket: 'dimension', bucketLabel: { table: 'system_users', key: 'record_id', label: 'name' },
    measures: [{ key: 'activities', table: 'activities', agg: 'count', group: 'user_id' }] };
  const u = await run(byUser, {});
  assert.deepEqual(u.data.map((x) => [x._group, x._label, x.activities]), [['u1', 'Amina', 4], ['u2', 'Brian', 2]]);
});

test('tenant is mandatory', async () => {
  await assert.rejects(run(monthly, {}, { user_id: 'x' }), (e) => e instanceof ReportError && e.status === 403);
});

test('INJECTION: hostile params are rejected or bound as inert values — never part of the SQL text', async () => {
  const evil = [
    ['date_start', "2026-01-01' OR '1'='1"],
    ['date_end', '2026-05\'; DROP TABLE activities;--'],
    ['bucket', 'month; DROP TABLE canary'],
    ['date_start', '2026-13'], ['date_start', '2026-02-30'],
  ];
  for (const [k, v] of evil) {
    await assert.rejects(run(monthly, { [k]: v }), (e) => e instanceof ReportError && e.status === 400, `${k}=${v}`);
  }
  // a value that is hostile but legal as DATA: it must be bound, find nothing, and leak nothing
  const ctx = makeDb();
  const r = await run(monthly, { date_start: '2026-05', date_end: '2026-08', owner: "u1' OR 1=1 --" }, T1, { ctx });
  assert.deepEqual(r.data.map((x) => x.activities), [0, 0, 0, 0]);
  ctx.log.forEach(({ sql }) => { assert.ok(!/OR 1=1|DROP|u1'/.test(sql), sql); });
  assert.equal(ctx.raw.prepare('SELECT COUNT(*) c FROM canary').get().c, 1);
  assert.equal(ctx.raw.prepare('SELECT COUNT(*) c FROM activities').get().c, 9);
  // raw (non base64) params do not parse
  await assert.rejects(mosySecureReport({ schema: monthly, searchParams: new URLSearchParams('date_start=2026-05%27%20OR%201=1'), authData: T1, db: ctx.db, cache: createReportCache() }), (e) => e.status === 400);
});

test('INJECTION: a hostile SCHEMA is refused before any SQL exists', async () => {
  const bad = (patch) => ({ ...monthly, measures: [{ ...monthly.measures[0], ...patch }] });
  for (const p of [{ table: 'activities; DROP TABLE canary' }, { by: 'activity_date`) --' }, { agg: 'count; --' }, { col: 'x', agg: 'sum', where: [{ col: 'a', op: '; DROP', val: 1 }] }]) {
    assert.ok(validateApiSchema(bad(p)).length > 0, JSON.stringify(p));
    const ctx = makeDb();
    await assert.rejects(mosySecureReport({ schema: bad(p), searchParams: qs({}), authData: T1, db: ctx.db, cache: createReportCache() }), (e) => e.status === 500);
    assert.equal(ctx.log.length, 0);
  }
});

test('live check: a table/column the schema names but the DB lacks is reported, nothing runs', async () => {
  _resetVerified();
  const ctx = makeDb();
  const s = { ...monthly, filters: undefined, entity: 'ghost', measures: [{ key: 'n', table: 'activities', agg: 'count', by: 'no_such_col' }] };
  await assert.rejects(mosySecureReport({ schema: s, searchParams: qs({}), authData: T1, db: ctx.db, cache: createReportCache() }), /no_such_col/);
  assert.equal(ctx.log.length, 0);
  _resetVerified();
});

test('every statement is parameterised: placeholders == values, and no value text appears in SQL (all dialects)', async () => {
  const fake = (dialect) => ({ dialect, table: (t) => dialect.quote(t) });
  for (const d of [mysql, postgres]) {
    for (const schema of [monthly, perf]) {
      schema.measures.forEach((m) => {
        const { sql, vals } = _buildMeasureQuery(schema, m, { d, db: fake(d), tenantCol: 'hive_site_id', tenant: 'TENANT-X', bucket: schema.bucket, range: { start: '2026-05-01', endExcl: '2026-09-01' }, filters: [], timeoutMs: 8000 });
        assert.equal((sql.match(/\?/g) || []).length, vals.length, sql);
        assert.ok(!sql.includes('TENANT-X') && !sql.includes('2026-05-01') && !sql.includes('paid'), sql);
        assert.ok(vals.includes('TENANT-X'));
      });
    }
  }
  const m = monthly.measures[2];
  const { sql } = _buildMeasureQuery(monthly, m, { d: mysql, db: fake(mysql), tenantCol: 'hive_site_id', tenant: 'T', bucket: 'month', range: { start: '2026-05-01', endExcl: '2026-09-01' }, filters: [], timeoutMs: 8000 });
  console.log('\nMySQL SQL shape:\n' + sql + '\n');
  assert.ok(sql.includes("DATE_FORMAT(`t`.`payment_date`, '%Y-%m')") && sql.includes('MAX_EXECUTION_TIME(8000)'));
});

test('LOAD: 4,000 requests (100 tenants x 40 people at once) -> 100 report runs; a second wave costs 0', async () => {
  const ctx = makeDb();
  const ins = ctx.raw.prepare('INSERT INTO activities (hive_site_id, activity_date, activity_type, opportunity_id, user_id) VALUES (?,?,?,?,?)');
  for (let t = 0; t < 100; t++) ins.run(`L${t}`, '2026-06-10', 'call', `o${t}`, 'u');
  const cache = createReportCache();
  const hit = (t, i) => mosySecureReport({ schema: monthly, searchParams: qs({ date_start: '2026-05', date_end: '2026-08' }), authData: { hive_site_id: `L${t}`, user_id: `p${i}` }, db: ctx.db, cache, now: new Date('2026-09-15T00:00:00Z') });
  const wave = () => Promise.all(Array.from({ length: 4000 }, (_, n) => hit(n % 100, n)));
  const t0 = performance.now();
  const first = await wave();
  const ms1 = performance.now() - t0;
  assert.equal(ctx.db.sessions, 100);
  assert.ok(first.every((r) => r.data.length === 4));
  assert.equal(first[7].data[1].activities, 1);
  const t1 = performance.now();
  await wave();
  assert.equal(ctx.db.sessions, 100);
  console.log(`\n4000 requests: first wave ${ms1.toFixed(0)}ms (${ctx.db.sessions} DB sessions), cached wave ${(performance.now() - t1).toFixed(0)}ms (0 new)\n`);
});

test('refresh=1 is honoured but rate-protected; limiter throttles a reload loop', async () => {
  const ctx = makeDb(); const cache = createReportCache(); let t = new Date('2026-09-15T00:00:00Z');
  const go = (extra = {}) => mosySecureReport({ schema: monthly, searchParams: Object.assign(qs({ date_start: '2026-05', date_end: '2026-06' }), {}), authData: T1, db: ctx.db, cache, now: t, ...extra });
  await go(); assert.equal(ctx.db.sessions, 1);
  const sp = qs({ date_start: '2026-05', date_end: '2026-06' }); sp.set('refresh', '1');
  await mosySecureReport({ schema: monthly, searchParams: sp, authData: T1, db: ctx.db, cache, now: t });
  assert.equal(ctx.db.sessions, 1, 'refresh inside 15s is ignored');
  t = new Date(t.getTime() + 20000);
  await mosySecureReport({ schema: monthly, searchParams: sp, authData: T1, db: ctx.db, cache, now: t });
  assert.equal(ctx.db.sessions, 2, 'refresh after 15s recomputes');
  const lim = createRateLimiter({ max: 3, windowMs: 1000 });
  const outcomes = [1, 2, 3, 4, 5].map(() => lim.hit('u', 5000));
  assert.deepEqual(outcomes, [true, true, true, false, false]);
});

test('index advice names the (tenant, date) indexes the queries want', () => {
  const adv = indexAdvice(monthly);
  assert.ok(adv.some((l) => l.includes('ON activities (hive_site_id, activity_date)')));
  assert.ok(indexAdvice(perf).some((l) => l.includes('ON activities (hive_site_id, opportunity_id)')));
});

test('bucketLabel.merge: same-named rows become one, sums stay exact, ids are kept', async () => {
  const { db, raw } = makeDb();
  raw.exec("INSERT INTO system_users (hive_site_id, record_id, name) VALUES ('T1','u3','Amina')"); // a second "Amina"
  raw.exec("INSERT INTO activities (hive_site_id, activity_date, activity_type, opportunity_id, user_id) VALUES ('T1','2026-06-01','call','Q','u3')");
  const byUser = { entity: 'by_user_m', bucket: 'dimension', bucketLabel: { table: 'system_users', key: 'record_id', label: 'name', merge: true },
    measures: [{ key: 'activities', table: 'activities', agg: 'count', group: 'user_id' }] };
  const r = await mosySecureReport({ schema: byUser, searchParams: qs({}), authData: T1, db, cache: createReportCache() });
  assert.deepEqual(r.data.map((x) => [x._group, x.activities, x._ids.sort().join('+')]), [['Amina', 5, 'u1+u3'], ['Brian', 2, 'u2']]);
  assert.ok(validateApiSchema({ ...byUser, measures: [{ key: 'x', table: 'activities', agg: 'avg', col: 'primkey', group: 'user_id' }] }).some((p) => /merge/.test(p)));
});
