#!/usr/bin/env node
// schemamap.js
// -------------------------------------------------------------------
// Run with NO arguments from inside an app folder (e.g.
// C:\xampp\htdocs\nextv2\mainapps\octaneadmin>node schemamap.js) and it
// figures out everything from the folder you're standing in:
//
//   appname          = name of the current folder (e.g. "octaneadmin")
//   spec file        = app/<appname>/schemamap.txt
//   frontend output  = app/<appname>/DataControl/<appname>Schema.js
//   backend output   = app/api/<appname>/<appname>Schema.js
//   endpoint prefix  = /api/<appname>
//
// Same idea as clone-module.js's --app defaulting to
// path.basename(__dirname) — one less thing to type every time.
//
// First run in a fresh app folder: if app/<appname>/schemamap.txt
// doesn't exist yet, this SCAFFOLDS a starter file there (with the
// format spec as comments) and stops — fill it in and run again.
//
// Every default can still be overridden:
//   node schemamap.js                                  (all defaults)
//   node schemamap.js custom-spec.txt                   (different spec file)
//   node schemamap.js --app=ratepos                     (different appname)
//   node schemamap.js --out-frontend=... --out-backend=... (different output paths)
//   node schemamap.js --out=some/single/path.js         (write ONE file only, old behavior)
//
// endpoint prefix is no longer a flag: frontend endpoints resolve live via
// apiRoutes.json (apiRoute.<table.replace(/_/g,'')>.base — same routeKey
// convention db-cli.js already uses), not a hardcoded "/api/<app>/<table>"
// guess. Backend entries omit endpoint entirely (resolveJoin never reads
// it).
//
// INPUT FORMAT (one line per table) — same as before:
//   table:displayField|localCol:otherCol:otherTable(Label),localCol:otherCol:otherTable(Label),...
// - displayField = column on THIS table shown as its label when other
//   tables point AT it.
// - localCol === "record_id" => the OTHER table has an FK pointing back
//   at this table (a child/grid relation) — listed at the bottom of the
//   output for multiGridRows, NOT turned into resolveField/resolveJoin.
// - localCol !== "record_id" => THIS table has an FK pointing OUT to a
//   parent — becomes a globalRelations entry.
// - Same localCol pointing at more than one otherTable anywhere in the
//   spec (polymorphic FK) gets split into "<localCol>__<otherTable>"
//   per target, with a warning telling you how to call each one.
// - Blank lines and lines starting with "#" are ignored.
// -------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const RELATION_REGEX = /^([a-zA-Z0-9_]+):([a-zA-Z0-9_]+):([a-zA-Z0-9_]+)\(([^)]*)\)$/;

const STUB_CONTENT = `# schemamap.txt
# One line per table:
#   table:displayField|localCol:otherCol:otherTable(Label),localCol:otherCol:otherTable(Label),...
#
# - displayField = column on THIS table shown as its label elsewhere.
# - localCol "record_id" = a child/grid relation (other table points back at this one).
# - localCol anything else = this table's FK pointing OUT to a parent.
# - Table with no relations after "|" is still worth a line so OTHER
#   tables can find its displayField.
#
# Example:
# fuel_sales:record_id|fuel_station_id:record_id:fuel_stations(Fuel Station),sold_by_staff_id:record_id:staff(Staff)
# fuel_stations:station_name|
# staff:full_name|

`;

function detectAppName() {
  return path.basename(process.cwd());
}

function parseArgs(argv) {
  const appFlag = argv.find((a) => a.startsWith('--app='));
  const appname = appFlag ? appFlag.slice('--app='.length) : detectAppName();

  const defaultInput = path.join('app', appname, 'schemamap.txt');
  const defaultOutFrontend = path.join('app', appname, 'DataControl', `${appname}Schema.js`);
  const defaultOutBackend = path.join('app', 'api', appname, `${appname}Schema.js`);
  const defaultBase = `/api/${appname}`;

  const args = { appname, input: null, outFrontend: null, outBackend: null, base: null, singleOut: null };
  const positional = [];

  argv.forEach((a) => {
    if (a.startsWith('--app=')) return; // already handled above
    if (a.startsWith('--out=')) args.singleOut = a.slice('--out='.length);
    else if (a.startsWith('--out-frontend=')) args.outFrontend = a.slice('--out-frontend='.length);
    else if (a.startsWith('--out-backend=')) args.outBackend = a.slice('--out-backend='.length);
    else if (a.startsWith('--base=')) args.base = a.slice('--base='.length);
    else positional.push(a);
  });

  args.input = positional[0] || defaultInput;
  args.base = args.base || defaultBase;
  if (argv.some((a) => a.startsWith('--base='))) {
    console.warn('NOTE: --base is ignored — endpoints now resolve live via apiRoutes.json (apiRoute.<routeKey>.base) instead of a hardcoded prefix, so there is no longer a base URL to override here.');
  }

  if (args.singleOut) {
    // Explicit --out means "write exactly here and nowhere else" — for
    // one-off/custom runs. Otherwise we default to writing BOTH sides,
    // same as db-cli.js does for module schemas.
    args.outFrontend = args.singleOut;
    args.outBackend = null;
  } else {
    args.outFrontend = args.outFrontend || defaultOutFrontend;
    args.outBackend = args.outBackend || defaultOutBackend;
  }

  return args;
}

function parseLine(line, lineNo) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const pipeIdx = trimmed.indexOf('|');
  if (pipeIdx === -1) {
    throw new Error(`Line ${lineNo}: missing "|" separator — expected "table:displayField|...". Got: ${trimmed}`);
  }
  const left = trimmed.slice(0, pipeIdx);
  const right = trimmed.slice(pipeIdx + 1).trim();

  const [table, displayField] = left.split(':').map((s) => s.trim());
  if (!table || !displayField) {
    throw new Error(`Line ${lineNo}: expected "table:displayField|..." got: ${trimmed}`);
  }

  const relStrings = right ? right.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const relations = relStrings.map((rs) => {
    const m = rs.match(RELATION_REGEX);
    if (!m) {
      throw new Error(`Line ${lineNo}: bad relation "${rs}" — expected localCol:otherCol:otherTable(Label)`);
    }
    const [, localCol, otherCol, otherTable, label] = m;
    return { localCol, otherCol, otherTable, label };
  });

  return { table, displayField, relations };
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

// One timestamp per run, shared by every backup made during this
// invocation — same trick clone-module.js uses, so if both the frontend
// and backend files get recycled in the same run it's obvious they went
// together. Milliseconds included so two runs seconds apart never collide.
function buildRunTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}
const RUN_TIMESTAMP = buildRunTimestamp();

// Fills in a PLACEHOLDER apiRoutes.json entry for any routeKey a relation
// points at that has no entry yet — so apiRoute.<routeKey>.base never
// crashes at runtime just because that table's own schema hasn't been
// built via db-cli.js yet.
//
// Deliberately NOT the same as db-cli.js's updateApiRoutesJson, which
// always upserts (routes[routeKey] = {...}, unconditional overwrite) —
// that's correct THERE because it just computed the definitive apiBase
// for the exact module it's building. Here, schemamap.js is only ever
// GUESSING at another table's routing (same tableName.replace(/_/g,'')
// convention, "list" apiListFolder assumed) for a table it isn't
// building anything for. Overwriting an existing entry could clobber a
// real apiBase db-cli.js already wrote (e.g. a custom --list-name folder,
// or an apiListFolder other than "list") with a wrong guess — so an
// existing key is left completely untouched, even if this guess would
// produce a different URL. Only a genuinely MISSING key gets a
// placeholder, and that placeholder gets replaced with the real thing
// the next time that table's own schema.js is built.
function ensureApiRoutesEntries(appname, relationEntries) {
  const routesDir = path.join('app', appname, 'AppRoutes');
  const routesPath = path.join(routesDir, 'apiRoutes.json');

  let routes = {};
  if (fs.existsSync(routesPath)) {
    try {
      routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    } catch (err) {
      console.warn(`WARNING: could not parse existing ${routesPath} (${err.message}) — leaving it untouched, skipping the apiRoutes.json placeholder step.`);
      return;
    }
  }

  const missing = [...new Set(relationEntries.map((e) => e.routeKey))].filter((k) => !routes[k]);
  if (!missing.length) return;

  missing.forEach((routeKey) => {
    const base = `/api/${appname}/${routeKey}/list`;
    routes[routeKey] = {
      base,
      delete: `${base}/delete`,
      import: `/api/${appname}/${routeKey}/import`,
    };
  });

  fs.mkdirSync(routesDir, { recursive: true });
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 4));
  console.log(`Added ${missing.length} placeholder apiRoutes.json entr${missing.length === 1 ? 'y' : 'ies'} for: ${missing.join(', ')} (guessed at the default "/list" apiBase — db-cli.js will overwrite each with the real one once that table's own schema.js is actually built).`);
}

// Same convention as clone-module.js's backupExistingFile: never
// silently overwrite a generated file — someone may have hand-edited it
// since the last run (breaking the "AUTO-GENERATED, don't hand-edit"
// header is still possible, even if it's not supposed to happen). If
// something's already sitting at destPath, move it into a sibling
// _recycled/ folder with this run's timestamp appended before writing
// the new version. Falls back to an incrementing suffix in the rare case
// that path is somehow already taken — a backup is NEVER overwritten either.
function backupExistingFile(destPath) {
  if (!fs.existsSync(destPath)) return;

  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);

  let backupPath = path.join(dir, '_recycled', `${base}.${RUN_TIMESTAMP}${ext}`);
  let attempt = 1;
  while (fs.existsSync(backupPath)) {
    attempt += 1;
    backupPath = path.join(dir, '_recycled', `${base}.${RUN_TIMESTAMP}-${attempt}${ext}`);
  }

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(destPath, backupPath);
  console.log(`   recycled existing file -> ${backupPath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`App:              ${args.appname}`);
  console.log(`Spec file:        ${args.input}`);
  console.log(`Frontend output:  ${args.outFrontend}`);
  console.log(`Backend output:   ${args.outBackend || '(skipped — single --out given)'}`);
  console.log(`Endpoint prefix:  ${args.base}`);
  console.log('');

  if (!fs.existsSync(args.input)) {
    ensureDirFor(args.input);
    fs.writeFileSync(args.input, STUB_CONTENT);
    console.log(`No spec file found — scaffolded a starter at ${args.input}`);
    console.log('Fill it in with your table relationships, then run this again.');
    process.exit(0);
  }

  const raw = fs.readFileSync(args.input, 'utf8');
  const lines = raw.split('\n');

  const tables = {};   // table -> displayField
  const forward = [];  // { sourceTable, localCol, otherCol, otherTable, label }
  const reverse = [];  // { sourceTable, otherCol, otherTable, label }

  lines.forEach((line, i) => {
    const parsed = parseLine(line, i + 1);
    if (!parsed) return;
    tables[parsed.table] = parsed.displayField;
    parsed.relations.forEach((r) => {
      if (r.localCol === 'record_id') {
        reverse.push({ sourceTable: parsed.table, otherCol: r.otherCol, otherTable: r.otherTable, label: r.label });
      } else {
        forward.push({ sourceTable: parsed.table, localCol: r.localCol, otherCol: r.otherCol, otherTable: r.otherTable, label: r.label });
      }
    });
  });

  const byLocalCol = {};
  forward.forEach((r) => {
    (byLocalCol[r.localCol] = byLocalCol[r.localCol] || []).push(r);
  });

  const relationEntries = [];

  Object.keys(byLocalCol).sort().forEach((localCol) => {
    const rels = byLocalCol[localCol];
    const distinctTargets = [...new Set(rels.map((r) => r.otherTable))];
    const ambiguous = distinctTargets.length > 1;

    distinctTargets.forEach((otherTable) => {
      const matches = rels.filter((r) => r.otherTable === otherTable);
      const first = matches[0];

      const distinctOtherCols = [...new Set(matches.map((m) => m.otherCol))];
      const distinctLabels = [...new Set(matches.map((m) => m.label))];
      if (distinctOtherCols.length > 1) {
        console.warn(`WARNING: "${localCol}" -> "${otherTable}" has conflicting target columns (${distinctOtherCols.join(', ')}) across [${matches.map((m) => m.sourceTable).join(', ')}]. Using "${first.otherCol}".`);
      }
      if (distinctLabels.length > 1) {
        console.warn(`WARNING: "${localCol}" -> "${otherTable}" has different labels (${distinctLabels.join(' / ')}) across tables. Using "${first.label}".`);
      }

      const relationKey = ambiguous ? `${localCol}__${otherTable}` : localCol;
      const targetDisplayField = tables[otherTable];
      if (!targetDisplayField) {
        console.warn(`WARNING: target table "${otherTable}" has no "${otherTable}:displayField|" line — falling back to "${first.otherCol}" as displayField/cacheField for "${relationKey}". Add a line for "${otherTable}" to fix this.`);
      }

      relationEntries.push({
        relationKey,
        table: otherTable,
        valueField: first.otherCol,
        displayField: targetDisplayField || first.otherCol,
        cacheField: targetDisplayField || first.otherCol,
        // Same convention db-cli.js uses for its default moduleName
        // (`tableName.replace(/_/g, '')`) — as long as "otherTable"'s
        // schema was built via db-cli.js's "Build schema.js from a
        // table" with no custom --list-name prefix, this routeKey will
        // match the key db-cli.js already wrote into apiRoutes.json for
        // it, so apiRoute.<routeKey>.base resolves to the real URL at
        // runtime instead of a hardcoded guess. Custom-prefixed modules
        // won't match this and need a hand override (see header note).
        routeKey: otherTable.replace(/_/g, ''),
        label: first.label,
        ambiguous,
        usedBy: [...new Set(matches.map((m) => m.sourceTable))],
      });
    });

    if (ambiguous) {
      console.warn(`NOTE: "${localCol}" points at ${distinctTargets.length} different tables (${distinctTargets.join(', ')}) — split into: ${distinctTargets.map((t) => `${localCol}__${t}`).join(', ')}. Use resolveField('${localCol}__<table>', { key: '${localCol}' }) to pick the right one per module.`);
    }
  });

  relationEntries.sort((a, b) => a.relationKey.localeCompare(b.relationKey));

  ensureApiRoutesEntries(args.appname, relationEntries);

  const q = (s) => JSON.stringify(s);
  const isValidIdent = (s) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);

  // forFrontend=true  -> endpoint: apiRoute.<routeKey>.base  (live lookup,
  //                      needs the getApiRoutes import added in sharedHead)
  // forFrontend=false -> no `endpoint` line at all. resolveJoin() never
  //                      reads rel.endpoint (it only needs table/
  //                      valueField/cacheField to build the SQL join), and
  //                      the backend has no established import path to
  //                      AppRoutes/apiRoutesHandler, so there's nothing
  //                      correct to put here — omit rather than guess.
  const buildEntriesSrc = (forFrontend) => relationEntries.map((e) => {
    const keySrc = isValidIdent(e.relationKey) ? e.relationKey : q(e.relationKey);
    const routeAccessor = isValidIdent(e.routeKey) ? `apiRoute.${e.routeKey}` : `apiRoute[${q(e.routeKey)}]`;
    const outLines = [
      `  ${keySrc}: {`,
      `    table: ${q(e.table)},`,
      forFrontend ? `    endpoint: ${routeAccessor}.base,` : null,
      `    valueField: ${q(e.valueField)},`,
      `    displayField: ${q(e.displayField)},`,
      `    cacheField: ${q(e.cacheField)},`,
      `    label: ${q(e.label)},`,
      e.ambiguous ? `    // polymorphic "${e.relationKey.split('__')[0]}" — see other __ variants for its other targets` : null,
      `    // used by: ${e.usedBy.join(', ')}`,
      `  },`,
    ].filter(Boolean);
    return outLines.join('\n');
  }).join('\n\n');

  const entriesSrcFrontend = buildEntriesSrc(true);
  const entriesSrcBackend = buildEntriesSrc(false);

  const reverseSummary = reverse.length
    ? reverse.map((r) => `// ${r.sourceTable} -> child records in ${r.otherTable} (via ${r.otherTable}.${r.otherCol}) "${r.label}"`).join('\n')
    : '// (none detected in this spec)';

  const sharedHead = (outPath, entriesSrc, forFrontend) => `// ${path.basename(outPath)}
// -------------------------------------------------------------------
// AUTO-GENERATED by schemamap.js from ${args.input} — do not hand-edit
// the globalRelations object below. Edit the spec file and rerun:
//   node schemamap.js
//
// Column name on a specific module differs from the relation key (e.g.
// a polymorphic "__" key, or a renamed FK column) — pass 'key' in
// overrides so both sides stay in sync.
// Override ANYTHING else per-module the same way — second arg always
// wins, shallow merge over the global default.
// Unknown relation key throws instead of silently returning undefined
// (fail loud, not silent).
//
// endpoint (frontend only) resolves live via apiRoutes.json/getApiRoutes,
// keyed by table.replace(/_/g, '') — the SAME default routeKey db-cli.js
// writes when it builds that table's own schema.js. If that table's
// schema was built with a custom --list-name prefix, its real
// apiRoutes.json key won't match this guess — hand-fix that one entry's
// endpoint here (or re-point it at a literal string) rather than
// regenerating; schemamap.js has no way to know about a prefix chosen in
// a different tool's run.
// -------------------------------------------------------------------
${forFrontend ? `
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';
const apiRoute = getApiRoutes();
` : ''}
export const globalRelations = {

${entriesSrc}

};

function cacheKeyFor(rel, columnKey) {
  return \`_\${rel.table}_\${rel.cacheField}_\${columnKey}\`;
}

function getRelation(relationKey, fnName) {
  const rel = globalRelations[relationKey];
  if (!rel) {
    throw new Error(
      \`\${fnName}: no globalRelations entry for "\${relationKey}". \` +
      \`Regenerate from schemamap.txt, or define this field/join locally instead.\`
    );
  }
  return rel;
}
`;

  const sharedTail = `
// ---------------------------------------------------------------------
// Detected "reverse" relations (record_id referenced FROM another table).
// These are candidate multiGridRows / child-grid wiring, NOT parent
// lookups, so they are not turned into resolveField/resolveJoin entries.
// Wire manually into multiGridRows on the parent module's schema.js.
// ---------------------------------------------------------------------
${reverseSummary}
`;

  // FRONTEND only gets resolveField — a liveSearch field shape for a
  // module's `fields:` array. No resolveJoin here; the backend join
  // descriptor shape has no reason to exist on this side.
  const frontendContents = sharedHead(args.outFrontend, entriesSrcFrontend, true) + `
// ALWAYS returns an array — spread it into fields: every time, even when
// you're only expecting one field back. Consistent shape regardless of
// arguments means you can never forget the spread and end up with a stray
// nested array sitting inside fields: (which would silently corrupt the
// module — arrays aren't valid field entries).
//
//     ...resolveField('staff_id')
//     ...resolveField('related_record_id__app_users', { key: 'related_record_id', label: 'User Profile' })
//
// Pass 'as' to ALSO get a second, plain display field for the cached
// value itself — e.g. so "station_name" shows up in showInList/sections
// as its own field, not just as the liveSearch dropdown's hidden cache.
// Third arg overrides that second field (key/label/type/title/required/
// anything) — defaults to a read-only text field if you don't:
//
//     ...resolveField('fuel_station_id', { as: 'station_name' }, { label: 'Station Name', title: true, required: true })
//     -> [ { key: 'fuel_station_id', type: 'liveSearch', ... },
//          { key: 'station_name', label: 'Station Name', type: 'text', title: true, required: true } ]
//
// Pass the SAME 'as' value to resolveJoin on the backend side so both
// stay pointed at the same cached column on the row.
export function resolveField(relationKey, overrides = {}, displayOverrides = {}) {
  const rel = getRelation(relationKey, 'resolveField');
  const columnKey = overrides.key || relationKey;
  const cacheKey = overrides.as || cacheKeyFor(rel, columnKey);

  const { as: _unusedAs, ...restFieldOverrides } = overrides;
  const liveSearchField = {
    key: columnKey,
    label: rel.label,
    type: 'liveSearch',
    colSpan: 6,
    endpoint: rel.endpoint,
    searchTable: rel.table,
    valueField: rel.valueField,
    displayField: rel.displayField,
    labelKey: cacheKey,
    ...restFieldOverrides,
  };

  if (!overrides.as) {
    return [liveSearchField];
  }

  const cachedDisplayField = {
    key: cacheKey,
    label: rel.label,
    type: 'text',
    computed: true,
    editable: false,
    ...displayOverrides,
  };

  return [liveSearchField, cachedDisplayField];
}
` + sharedTail;

  // BACKEND only gets resolveJoin — a { [cacheKey]: { type: "join", ... } }
  // descriptor to spread into a module's `batchMutations:` object. No
  // resolveField here; the liveSearch field shape has no reason to exist
  // on this side.
  const backendContents = sharedHead(args.outBackend || args.outFrontend, entriesSrcBackend, false) + `
// Use it on the BACKEND schema (in 'batchMutations:'):
//     ...resolveJoin('staff_id')
//     ...resolveJoin('related_record_id__app_users', { key: 'related_record_id' })
//
// Cache alias too long/ugly (e.g. "_fuel_stations_station_name_fuel_station_id")?
// Override it with 'as' — pass the SAME 'as' value to resolveField on the
// frontend side so the two stay pointed at the same column on the row:
//     ...resolveJoin('fuel_station_id', { as: 'station_name' })
export function resolveJoin(relationKey, overrides = {}) {
  const rel = getRelation(relationKey, 'resolveJoin');
  const columnKey = overrides.key || relationKey;
  const cacheKey = overrides.as || cacheKeyFor(rel, columnKey);
  const descriptor = {
    type: 'join',
    table: rel.table,
    link: \`\${columnKey}:\${rel.valueField}\`,
    select: { [cacheKey]: rel.cacheField },
  };
  const { key: _unusedKey, as: _unusedAs, ...restOverrides } = overrides;
  return { [cacheKey]: { ...descriptor, ...restOverrides } };
}
` + sharedTail;

  ensureDirFor(args.outFrontend);
  backupExistingFile(args.outFrontend);
  fs.writeFileSync(args.outFrontend, frontendContents);
  console.log(`Wrote ${relationEntries.length} relation(s) to ${args.outFrontend} (resolveField)`);

  if (args.outBackend) {
    ensureDirFor(args.outBackend);
    backupExistingFile(args.outBackend);
    fs.writeFileSync(args.outBackend, backendContents);
    console.log(`Wrote ${relationEntries.length} relation(s) to ${args.outBackend} (resolveJoin)`);
  }

  if (reverse.length) {
    console.log(`Detected ${reverse.length} reverse/child relation(s) — see the comment block at the bottom of the generated file(s).`);
  }
}

main();