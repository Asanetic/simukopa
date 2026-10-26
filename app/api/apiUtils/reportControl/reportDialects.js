// reportDialects.js — the ONLY place that knows how a database spells things.
// The engine never writes DATE_FORMAT / strftime / to_char itself; it asks the dialect.
// Add a database = add one object here (+ an adapter in reportAdapters.js).
//
//   quote(id)          identifier quoting. Identifiers are validated BEFORE they get here (see reportSchemaCheck).
//   bucket(col, b)     expression turning a date column into 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'
//   hint(ms)           optional "stop this query after N ms" prefix
//   positional(sql)    placeholder style: '?' stays '?', Postgres becomes $1, $2 …

const wrap = (open, close = open) => (id) => `${open}${id}${close}`;

export const mysql = {
  name: 'mysql',
  quote: wrap('`'),
  bucket: (col, b) => `DATE_FORMAT(${col}, '${b === 'year' ? '%Y' : b === 'day' ? '%Y-%m-%d' : '%Y-%m'}')`,
  hint: (ms) => (ms ? `/*+ MAX_EXECUTION_TIME(${Number(ms) | 0}) */ ` : ''),
  positional: (sql) => sql,
};

export const sqlite = {
  name: 'sqlite',
  quote: wrap('"'),
  bucket: (col, b) => `strftime('${b === 'year' ? '%Y' : b === 'day' ? '%Y-%m-%d' : '%Y-%m'}', ${col})`,
  hint: () => '',
  positional: (sql) => sql,
};

// UNTESTED against a live server (none available in the build environment) — SQL shape is standard.
export const postgres = {
  name: 'postgres',
  quote: wrap('"'),
  bucket: (col, b) => `to_char(${col}, '${b === 'year' ? 'YYYY' : b === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}')`,
  hint: () => '',
  positional: (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); },
};

export const dialects = { mysql, sqlite, postgres };
