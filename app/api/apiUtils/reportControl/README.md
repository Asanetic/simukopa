# apiControl — report backend (schema in, rows out)

Per report you write ONE file: `<Name>ApiSchema.js` (see examples/). The route is `route.template.js` cloned — only its schema import line changes.
No tables, no views, no ALTERs: a report reads the tables you already have.

Files
- reportEngine.js        mosySecureReport + indexAdvice (print CREATE INDEX lines, never run them)
- reportSchemaCheck.js   gate 1: every name is a plain word, ops/aggregates on an allow-list. gate 2: every table/column exists in the DB (once)
- reportDialects.js      mysql | sqlite | postgres(untested) — how a DB spells month-bucketing and quoting
- reportAdapters.js      mysqlAdapter wraps your connectDB; sqliteAdapter (tests); postgresAdapter(untested)
- reportCache.js         TTL cache + single-flight; per-user rate limiter
- tests/                 `node --test tests/report.test.mjs` (14 tests), `node tests/bench.mjs`

Schema cheat-sheet
  bucket: 'day'|'month'|'year'|'dimension'      bucketOptions, cacheSeconds, maxRangeDays, defaultDays, tenantColumn (null = global)
  measures[]: { key, table, agg: count|sum|avg|min|max|countDistinct, col?, by?(date col), group?(dimension), where?:[{col,op,val}],
                join?:{ table, from, to, group, credit:'full'|'split', where? } }
  filters[]:  { param, op?: '=' | 'IN', cols: { <measureKey>: 'column' | null } }
  bucketLabel: { table, key, label }   (dimension reports: shows names instead of ids)

Request: date_start / date_end ('YYYY-MM' or 'YYYY-MM-DD'), bucket, <filter param>, refresh=1 — values base64 like your grids.
Response: { status, data:[{ _group, _label?, <measureKey>:n }], meta:{ start,end,cached,ageSeconds,generatedAt } }
