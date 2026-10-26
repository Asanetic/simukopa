// reportAdapters.js — "plug into any DB". An adapter is four things:
//   dialect            how this DB spells dates / quotes names (reportDialects.js)
//   table(name)        the quoted, fully-qualified table name  (e.g. `mydb`.`activities`)
//   session(fn)        open a connection, call fn(q), always close.  q(sql, values) -> rows (array of objects)
//   columns(tables)    Map table -> Set(column) from the DB's own catalogue (for the live schema check)
// The engine only ever calls these four. Bring your own for any DB.
import { IDENT } from './reportSchemaCheck.js';
import { mysql, sqlite, postgres } from './reportDialects.js';

const safeIdent = (s, what) => { if (!IDENT.test(String(s))) throw new Error(`reportAdapters: unsafe ${what}`); return s; };

// ── MySQL / MariaDB — wraps YOUR existing connectDB (mysql2 .execute = real prepared statements) ──
//   const db = mysqlAdapter({ connect: connectDB, database: () => activeDB });
// Pass a read-only connection factory as `connect` if you have one (strongly recommended for reports).
export function mysqlAdapter({ connect, database }) {
  const dbName = () => safeIdent(typeof database === 'function' ? database() : database, 'database name');
  return {
    dialect: mysql,
    table: (t) => `\`${dbName()}\`.\`${safeIdent(t, 'table')}\``,
    async session(fn) {
      const conn = await connect();
      try {
        return await fn(async (sql, values = []) => { const [rows] = await conn.execute(sql, values); return rows; });
      } finally { await conn.end(); }
    },
    async columns(tables) {
      return this.session(async (q) => {
        const rows = await q(
          `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name IN (${tables.map(() => '?').join(',')})`,
          [dbName(), ...tables]
        );
        const out = new Map();
        rows.forEach((r) => { const t = r.t ?? r.TABLE_NAME; const c = r.c ?? r.COLUMN_NAME; if (!out.has(t)) out.set(t, new Set()); out.get(t).add(c); });
        return out;
      });
    },
  };
}

// ── SQLite (node:sqlite DatabaseSync or better-sqlite3) — used by the tests; also handy for local tools ──
export function sqliteAdapter({ db }) {
  return {
    dialect: sqlite,
    table: (t) => `"${safeIdent(t, 'table')}"`,
    async session(fn) { return fn(async (sql, values = []) => db.prepare(sql).all(...values)); },
    async columns(tables) {
      const out = new Map();
      tables.forEach((t) => {
        const rows = db.prepare(`PRAGMA table_info("${safeIdent(t, 'table')}")`).all();
        if (rows.length) out.set(t, new Set(rows.map((r) => r.name)));
      });
      return out;
    },
  };
}

// ── PostgreSQL via `pg` Pool — UNTESTED against a live server ──
export function postgresAdapter({ pool, schemaName = 'public' }) {
  safeIdent(schemaName, 'schema name');
  return {
    dialect: postgres,
    table: (t) => `"${schemaName}"."${safeIdent(t, 'table')}"`,
    async session(fn) {
      const client = await pool.connect();
      try { return await fn(async (sql, values = []) => (await client.query(postgres.positional(sql), values)).rows); }
      finally { client.release(); }
    },
    async columns(tables) {
      return this.session(async (q) => {
        const rows = await q(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name IN (${tables.map(() => '?').join(',')})`, [schemaName, ...tables]);
        const out = new Map();
        rows.forEach((r) => { if (!out.has(r.t)) out.set(r.t, new Set()); out.get(r.t).add(r.c); });
        return out;
      });
    },
  };
}
