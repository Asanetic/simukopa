// Index benchmark on SQLite (engine = same SQL shape; MySQL timings will differ, the with/without-index ratio is the point).
import { DatabaseSync } from 'node:sqlite';
import { mosySecureReport } from '../reportEngine.js';
import { createReportCache } from '../reportCache.js';
import { sqliteAdapter } from '../reportAdapters.js';
import { ActivityRevenueApiSchema as schema } from '../examples/ActivityRevenueApiSchema.js';
import { b64 } from './fixture.mjs';

const raw = new DatabaseSync(':memory:');
raw.exec(`CREATE TABLE activities (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, activity_date TEXT, activity_type TEXT, opportunity_id TEXT, user_id TEXT);
CREATE TABLE expected_revenue (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, revenue_month TEXT, expected_amount REAL, deal_id TEXT);
CREATE TABLE payment_history (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, payment_date TEXT, amount REAL, status TEXT, opportunity_id TEXT);`);
const N = 1_000_000, TEN = 200;
raw.exec('BEGIN');
const a = raw.prepare('INSERT INTO activities (hive_site_id, activity_date, activity_type, opportunity_id, user_id) VALUES (?,?,?,?,?)');
const p = raw.prepare('INSERT INTO payment_history (hive_site_id, payment_date, amount, status, opportunity_id) VALUES (?,?,?,?,?)');
const e = raw.prepare('INSERT INTO expected_revenue (hive_site_id, revenue_month, expected_amount, deal_id) VALUES (?,?,?,?)');
for (let i = 0; i < N; i++) {
  const t = `T${i % TEN}`; const m = 1 + (i % 12); const d = 1 + (i % 28);
  const date = `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  a.run(t, date, 'call', `o${i % 5000}`, 'u');
  if (i % 3 === 0) p.run(t, date, 100, 'paid', `o${i % 5000}`);
  if (i % 10 === 0) e.run(t, `2025-${String(m).padStart(2, '0')}-01`, 500, `o${i % 5000}`);
}
raw.exec('COMMIT');
const db = sqliteAdapter({ db: raw });
const time = async () => {
  const t0 = performance.now();
  const r = await mosySecureReport({ schema, searchParams: new URLSearchParams({ date_start: b64('2025-01'), date_end: b64('2025-12') }), authData: { hive_site_id: 'T7' }, db, cache: createReportCache(), now: new Date('2026-01-10') });
  return [performance.now() - t0, r.data.reduce((s, x) => s + x.activities, 0)];
};
await time();
const [noIdx, n1] = await time();
raw.exec('CREATE INDEX i1 ON activities (hive_site_id, activity_date); CREATE INDEX i2 ON expected_revenue (hive_site_id, revenue_month); CREATE INDEX i3 ON payment_history (hive_site_id, payment_date);');
await time();
const [idx, n2] = await time();
console.log(`rows: activities ${N.toLocaleString()}, payments ${Math.ceil(N / 3).toLocaleString()}, expected ${(N / 10).toLocaleString()}, ${TEN} tenants (~${(N / TEN).toLocaleString()} activity rows each)`);
console.log(`one tenant, 12-month report:  no index ${noIdx.toFixed(0)} ms   with (tenant,date) indexes ${idx.toFixed(1)} ms   (rows counted ${n1} / ${n2})`);
