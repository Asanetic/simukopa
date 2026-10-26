import { DatabaseSync } from 'node:sqlite';
import { sqliteAdapter } from '../reportAdapters.js';

export const b64 = (s) => Buffer.from(String(s)).toString('base64');
export const qs = (o) => new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, b64(v)])));

export function makeDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE activities (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, activity_date TEXT, activity_type TEXT, opportunity_id TEXT, user_id TEXT);
    CREATE TABLE expected_revenue (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, revenue_month TEXT, expected_amount REAL, deal_id TEXT);
    CREATE TABLE payment_history (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, payment_date TEXT, amount REAL, status TEXT, opportunity_id TEXT);
    CREATE TABLE system_users (primkey INTEGER PRIMARY KEY, hive_site_id TEXT, record_id TEXT, name TEXT);
    CREATE TABLE canary (id INTEGER);
    INSERT INTO canary VALUES (1);
  `);
  const act = raw.prepare('INSERT INTO activities (hive_site_id, activity_date, activity_type, opportunity_id, user_id) VALUES (?,?,?,?,?)');
  [['2026-05-10','call','A','u1'],['2026-05-20','call','A','u1'],['2026-06-03','meeting','A','u2'],['2026-06-15','call','B','u1'],['2026-06-20','call','B','u1'],['2026-08-01','email','C','u2']]
    .forEach(([d, t, o, u]) => act.run('T1', d, t, o, u));
  for (let i = 0; i < 3; i++) act.run('T2', '2026-06-05', 'call', 'Z', 'u9');
  const exp = raw.prepare('INSERT INTO expected_revenue (hive_site_id, revenue_month, expected_amount, deal_id) VALUES (?,?,?,?)');
  exp.run('T1','2026-05-01',1000,'A'); exp.run('T1','2026-06-01',3000,'B'); exp.run('T1','2026-08-01',500,'C'); exp.run('T2','2026-06-01',9999,'Z');
  const pay = raw.prepare('INSERT INTO payment_history (hive_site_id, payment_date, amount, status, opportunity_id) VALUES (?,?,?,?,?)');
  pay.run('T1','2026-05-28',600,'paid','A'); pay.run('T1','2026-06-02',200,'paid','A'); pay.run('T1','2026-06-25',900,'pending','B'); pay.run('T1','2026-06-26',300,'paid','B'); pay.run('T2','2026-06-10',7777,'paid','Z');
  const usr = raw.prepare('INSERT INTO system_users (hive_site_id, record_id, name) VALUES (?,?,?)');
  usr.run('T1','u1','Amina'); usr.run('T1','u2','Brian'); usr.run('T2','u9','Zed');

  const log = []; // every statement that reached the database
  const base = sqliteAdapter({ db: raw });
  const db = {
    ...base,
    sessions: 0,
    async session(fn) { db.sessions += 1; return base.session((q) => fn(async (sql, vals = []) => { log.push({ sql, vals }); return q(sql, vals); })); },
  };
  return { raw, db, log };
}
