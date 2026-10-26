#!/usr/bin/env node
/**
 * build-relations.js — adds "related record" buttons to modules, from the FK
 * links the schemas already have. Nothing to configure and nothing to type:
 *
 *   node build-relations.js              (run from the PROJECT ROOT, like clone-module.js)
 *   node build-relations.js --dry-run    (show what would change, write nothing)
 *   node build-relations.js --app=ticksy (defaults to this script's folder name, like db-cli.js)
 *
 * db-cli.js runs it automatically as the last step of  schemas -> clone -> relations,
 * and menu option "r" runs it on its own. It always processes every module on
 * disk, so running it twice (or after adding another module) converges on the
 * full result instead of needing a special order.
 *
 * HOW IT WORKS
 *   1. Scans app/<app>/** for frontend schemas (a file named *Schema.js holding
 *      `entity:` and `profileActions:`). Each one is a module.
 *   2. Reads the `...resolveField('relKey', { key, as })` lines in those schemas.
 *      Those lines (written by db-cli.js) ARE the FK links — no second matching
 *      pass that could disagree with the schema.
 *   3. Looks each relation up in globalRelations (app/<app>/DataControl/<app>Schema.js,
 *      written by schemamap.js) for the parent table and the key it is joined on.
 *   4. For every link it writes two buttons, one on each module:
 *
 *        on the PARENT (clients):  view_clients_payments          pops the payments list,
 *                                                                 filtered to this client
 *        on the CHILD  (payments): view_payments_clients_profile  pops the client this
 *                                                                 payment points to
 *
 *      i.e. view_<module you are on>_<module it opens>, with a trailing _profile when
 *      it opens the single record the row points at. If one table has two FKs to the same
 *      parent, the column name is added to both keys (view_payments_clients_profile_payer_id).
 *      Module names are the folder names, used as they are (no singular/plural guessing).
 *
 *      Third button, on the CHILD's list toolbar:  filter_payments_clients
 *      "Filter by Client" — a grid-toolbar smart filter (openSmartMapFilter, combine: true) that
 *      searches the parent and narrows the list to that FK value. One per FK column, except the
 *      audit columns in FILTER_SKIP_COLUMNS below.
 *
 *      Fourth button, on the PARENT:  add_clients_payments  pops the child's create form with the FK
 *      preset and locked (not shown, still saved). Any OTHER FK the child form shares with the parent
 *      row — same column name, and the same related table when both are FKs (branch_id on both) — is
 *      carried over and locked too, together with its label key and its _name/_no/_number/_code/_title
 *      copies. That is decided when the button is clicked: a parent row with an empty value for it
 *      carries nothing and leaves the picker editable. created_by/updated_by/deleted_by/hive_site_*
 *      are never carried. The run report prints them ("also maps branch_id (+branch_name)").
 *
 * WHAT IT TOUCHES — only text between these marker lines, nothing else:
 *   actionsRegistry.js:  // <auto-relations:imports> ... // </auto-relations:imports>
 *                        // <auto-relations:actions> ... // </auto-relations:actions>
 *   <Entity>Schema.js:   // <auto-relations:actions> ... // </auto-relations:actions>   (inside profileActions)
 *   Markers that are missing are inserted (where the file's shape is recognisable) the
 *   first time a module needs them. Hand-written actions outside the markers are never
 *   edited; if one of them already uses a generated key, that key is skipped and reported.
 *
 * SAFE TO RE-RUN
 *   - A file is only written when its content would actually change, and the old copy
 *     goes to <module>/_recycled/... first (same convention as clone-module.js).
 *   - A link whose other side doesn't exist yet is NOT built and nothing is invented:
 *     it is listed as PENDING with the reason, and picked up on the next run.
 *   - Each module's registry and schema are changed together or not at all, so a button
 *     never exists without its function (or the other way round).
 *
 * REPORT: printed, and saved to app/<app>/AppRoutes/relations-log.txt (overwritten each run).
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getFlag = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.slice(name.length + 3);
};
const hasFlag = (name) => args.some((x) => x === `--${name}` || x.startsWith(`--${name}=`));

if (hasFlag('help')) {
  console.log('Usage: node build-relations.js [--dry-run] [--app=<namespace>]\nRun from the project root. See the comment at the top of this file.');
  process.exit(0);
}

const DRY_RUN = hasFlag('dry-run');
const appArgRaw = getFlag('app');
const appName = appArgRaw === '-' ? '' : (appArgRaw || path.basename(__dirname));
const projectRoot = process.cwd();
const appDir = path.join(projectRoot, 'app', ...(appName ? [appName] : []));
const apiDirAtAppRoot = path.join(projectRoot, 'app', 'api');

const IMPORTS_OPEN = '// <auto-relations:imports>';
const IMPORTS_CLOSE = '// </auto-relations:imports>';
const ACTIONS_OPEN = '// <auto-relations:actions>';
const ACTIONS_CLOSE = '// </auto-relations:actions>';

// FK columns that get "view" buttons but NO toolbar filter (a "filter by user" button
// for who-created-it is rarely worth the toolbar space). Edit freely.
// Column filters (date / tag) generated for every module on top of the FK ones.
// A text-ish column becomes a tag filter when its name contains one of these words.
const TAG_WORDS = ['status', 'type', 'category', 'state', 'stage', 'priority', 'kind', 'mode', 'method', 'tag', 'group', 'class', 'level', 'month', 'year', 'period'];
const TAG_RE = new RegExp(`(^|_)(${TAG_WORDS.join('|')})(_|$)`);
// Text-ish columns are also treated as dates by NAME: ..._at, ..._on, ..._date, date_... — except the look-alikes below.
const NOT_DATE_BEFORE_AT = new Set(['located', 'stored', 'kept', 'looked', 'aimed', 'pointed', 'directed', 'targeted', 'meet', 'meeting', 'pickup_point', 'arrived_from']);
const NOT_DATE_BEFORE_ON = new Set(['based', 'depends', 'relies', 'built', 'focus', 'carried', 'turned', 'switched', 'passed', 'hung', 'reliant', 'dependent', 'agreed', 'working']);
function dateByName(key) {
  const parts = key.toLowerCase().split('_');
  if (parts.length < 2 && parts[0] !== 'date') return '';
  if (/^(is|has|can|should)$/.test(parts[0])) return ''; // flags, not timestamps
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2] || '';
  if (last === 'at' && !NOT_DATE_BEFORE_AT.has(prev)) return 'datetime-local';
  if (last === 'on' && !NOT_DATE_BEFORE_ON.has(prev)) return 'date';
  if (last === 'date' || parts[0] === 'date') return 'date';
  return '';
}
// Friendlier filter wording for system columns (add 'reg_date' to COLUMN_SKIP below to drop it instead).
const COLUMN_TITLES = { reg_date: 'created on' };
// The row dropdown stays short: at most this many row actions per module (hand-written ones count).
// Generated actions beyond the budget still appear on the profile page (form:true), just not in the row menu.
// Icon for the "view related records" action. Swap to 'search' (lens) or any icon name your app supports.
const VIEW_RELATED_ICON = 'list';
const MAX_ROW_ACTIONS = 5;
// Who gets the row-menu slots first.
const ROW_PRIORITY = ['child->parent', 'parent->child', 'add'];
const COLUMN_SKIP = new Set(['created_at', 'updated_at', 'deleted_at', 'row_count']);
const FILTER_SKIP_COLUMNS = new Set(['created_by', 'updated_by', 'deleted_by']);

const rel = (p) => path.relative(projectRoot, p).split(path.sep).join('/');
const toPosix = (p) => p.split(path.sep).join('/');
const capFirst = (w) => w.charAt(0).toUpperCase() + w.slice(1);
// Last word to singular: "Fuel deliveries" -> "Fuel delivery", "Business branches" -> "Business branch", "Fuel sales" -> "Fuel sale".
const singular = (text) => {
  const parts = String(text).split(' ');
  let w = parts[parts.length - 1];
  if (w.length > 1 && w === w.toUpperCase()) return text; // acronym
  if (/ies$/i.test(w) && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (/(ss|us|is)$/i.test(w)) { /* status, analysis: already singular */ }
  else if (/(ch|sh|x|z|ss)es$/i.test(w)) w = w.slice(0, -2);
  else if (/s$/i.test(w)) w = w.slice(0, -1);
  parts[parts.length - 1] = w;
  return parts.join(' ');
};
// Words printed in capitals in button labels. Add your own.
const ACRONYMS = new Set(['kra', 'sms', 'pos', 'api', 'url', 'vat', 'kyc', 'ussd', 'etims', 'gps', 'qr', 'otp', 'atm', 'erp', 'crm', 'id', 'ip', 'tv', 'fdc', 'lpg']);
function formatWords(words) {
  const list = words.filter(Boolean);
  const out = list.map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  if (out.length && !ACRONYMS.has(list[0].toLowerCase())) out[0] = capFirst(out[0]);
  return out.join(' ');
}
const camel = (col) => col.replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildRunTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}
const RUN_TIMESTAMP = buildRunTimestamp();

/* ================= FILE / TEXT HELPERS ================= */

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '_recycled' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!appName && path.resolve(full) === path.resolve(apiDirAtAppRoot)) continue; // app/api is the backend tree
      walk(full, onFile);
    } else onFile(full);
  }
}

const textCache = new Map();
function readText(p) {
  if (!textCache.has(p)) textCache.set(p, fs.readFileSync(p, 'utf8'));
  return textCache.get(p);
}

function findFileWithExt(dir, baseName, exts = ['.jsx', '.js', '.tsx', '.ts']) {
  for (const ext of exts) {
    const p = path.join(dir, `${baseName}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const stripExt = (p) => p.replace(/\.(jsx?|tsx?)$/i, '');

// "../../events/uiControl/EventsList" from a registry's folder.
function importPath(fromDir, toFileNoExt) {
  let r = toPosix(path.relative(fromDir, toFileNoExt));
  if (!r.startsWith('.')) r = `./${r}`;
  return r;
}

// Skips over a quoted string starting at text[i]; returns the index of its closing quote.
function skipString(text, i) {
  const q = text[i];
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === '\\') { j += 1; continue; }
    if (text[j] === q) return j;
  }
  return -1;
}

// Index of the bracket that closes the one at text[openIdx], ignoring strings and comments.
function findClosing(text, openIdx) {
  const open = text[openIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    const nx = text[i + 1];
    if (ch === '/' && nx === '/') { i = text.indexOf('\n', i); if (i === -1) return -1; continue; }
    if (ch === '/' && nx === '*') { const e = text.indexOf('*/', i + 2); if (e === -1) return -1; i = e + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(text, i); if (i === -1) return -1; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

// Last meaningful character before `endIdx` (skips blank lines and // comment lines).
function lastSignificantChar(text, endIdx) {
  const lines = text.slice(0, endIdx).split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = lines[i].replace(/\s\/\/.*$/, '').trim();
    if (t === '' || t.startsWith('//')) continue;
    return t.slice(-1);
  }
  return '';
}

/* ---- marker regions ---- */

// Body of a region = whole lines between the open and close marker lines.
function regionBounds(text, open, close) {
  const a = text.indexOf(open);
  if (a === -1) return null;
  const b = text.indexOf(close, a);
  if (b === -1) return null;
  const bodyStart = text.indexOf('\n', a) + 1;
  const bodyEnd = text.lastIndexOf('\n', b) + 1;
  if (bodyStart === 0 || bodyStart > bodyEnd) return null; // markers on one line / malformed
  return { bodyStart, bodyEnd };
}
const hasRegion = (t, o, c) => regionBounds(t, o, c) !== null;
function regionBody(t, o, c) { const r = regionBounds(t, o, c); return r ? t.slice(r.bodyStart, r.bodyEnd) : ''; }
function setRegion(t, o, c, body) { const r = regionBounds(t, o, c); return t.slice(0, r.bodyStart) + body + t.slice(r.bodyEnd); }
function outsideRegion(t, o, c) { const r = regionBounds(t, o, c); return r ? t.slice(0, r.bodyStart) + t.slice(r.bodyEnd) : t; }
const dropComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const ACTIONS_OBJECT_RE = /^(?:export\s+)?(?:const|let|var)\s+\w+Actions\s*=\s*\{/m;

// Registry: make sure both marker pairs exist. Returns { text } or { error }.
function ensureRegistryMarkers(text) {
  let t = text;
  if (!hasRegion(t, IMPORTS_OPEN, IMPORTS_CLOSE)) {
    const m = ACTIONS_OBJECT_RE.exec(t);
    if (!m) return { error: 'could not find "const <Name>Actions = {" to anchor the markers' };
    t = `${t.slice(0, m.index)}${IMPORTS_OPEN}\n${IMPORTS_CLOSE}\n\n${t.slice(m.index)}`;
  }
  if (!hasRegion(t, ACTIONS_OPEN, ACTIONS_CLOSE)) {
    const m = ACTIONS_OBJECT_RE.exec(t);
    if (!m) return { error: 'could not find "const <Name>Actions = {" to anchor the markers' };
    const openBrace = m.index + m[0].length - 1;
    const close = findClosing(t, openBrace);
    if (close === -1) return { error: 'could not find the end of the actions object' };
    const lineStart = t.lastIndexOf('\n', close) + 1;
    if (t.slice(lineStart, close).trim() !== '') return { error: 'the closing "};" of the actions object is not on its own line' };
    const prev = lastSignificantChar(t, close);
    if (prev !== ',' && prev !== '{') return { error: 'the last entry in the actions object has no trailing comma — add one, then re-run' };
    t = `${t.slice(0, lineStart)}\n  ${ACTIONS_OPEN}\n  ${ACTIONS_CLOSE}\n${t.slice(lineStart)}`;
  }
  return { text: t };
}

// Schema: marker pair inside profileActions: [ ... ].
function ensureSchemaMarkers(text) {
  if (hasRegion(text, ACTIONS_OPEN, ACTIONS_CLOSE)) return { text };
  const m = /profileActions\s*:\s*\[/.exec(text);
  if (!m) return { error: 'could not find "profileActions: [" in the schema' };
  const openBracket = m.index + m[0].length - 1;
  const close = findClosing(text, openBracket);
  if (close === -1) return { error: 'could not find the end of profileActions' };
  const lineStart = text.lastIndexOf('\n', close) + 1;
  if (text.slice(lineStart, close).trim() !== '') return { error: 'the closing "]" of profileActions is not on its own line' };
  const prev = lastSignificantChar(text, close);
  if (prev !== ',' && prev !== '[') return { error: 'the last profileActions entry has no trailing comma — add one, then re-run' };
  return { text: `${text.slice(0, lineStart)}\n    ${ACTIONS_OPEN}\n    ${ACTIONS_CLOSE}\n${text.slice(lineStart)}` };
}

/* ================= SCAN: RELATIONS ================= */

function loadRelations() {
  let file = path.join(appDir, 'DataControl', `${appName}Schema.js`);
  if (!appName || !fs.existsSync(file)) {
    file = null;
    walk(appDir, (f) => {
      if (!file && /Schema\.js$/.test(f) && /export\s+const\s+globalRelations\s*=/.test(fs.readFileSync(f, 'utf8'))) file = f;
    });
  }
  if (!file) return null;

  const text = fs.readFileSync(file, 'utf8');
  const start = text.search(/export\s+const\s+globalRelations\s*=\s*\{/);
  const open = text.indexOf('{', start);
  const close = findClosing(text, open);
  if (start === -1 || close === -1) return null;

  const relations = {};
  const body = text.slice(open + 1, close);
  const entryRe = /^[ \t]*['"]?(\w+)['"]?\s*:\s*\{([^}]*)\}/gm;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const props = {};
    const propRe = /(\w+)\s*:\s*(?:"([^"]*)"|'([^']*)')/g;
    let p;
    while ((p = propRe.exec(m[2])) !== null) props[p[1]] = p[2] !== undefined ? p[2] : p[3];
    if (props.table) relations[m[1]] = props;
  }
  return { file, relations };
}

/* ================= SCAN: MODULES ================= */

function scanModules() {
  const all = [];
  walk(appDir, (file) => {
    if (!/Schema\.js$/.test(file)) return;
    const top = (path.relative(appDir, file).split(path.sep)[0] || '').toLowerCase();
    if (top === 'datacontrol' || top === 'approutes') return; // the app-level relations map, not a module
    const text = fs.readFileSync(file, 'utf8');
    const entity = /\bentity\s*:\s*['"]([^'"]+)['"]/.exec(text);
    if (!entity || !/profileActions\s*:\s*\[/.test(text)) return;

    const dir = path.dirname(file);
    const name = path.basename(dir);
    const exportBase = (/export\s+const\s+(\w+)Schema\s*=/.exec(text) || [])[1] || '';
    // Name shown on buttons ("Fuel pump nozzles"): the table's words when the module is just that table
    // without underscores (fuel_pump_nozzles -> fuelpumpnozzles), else the schema's own label.
    const schemaLabel = (/^[ \t]*label\s*:\s*['"]([^'"]*)['"]/m.exec(text) || [])[1] || capFirst(name);
    const tbl = entity[1];
    const label = tbl.includes('_') && /^[A-Za-z0-9_]+$/.test(tbl) && tbl.replace(/_/g, '').toLowerCase() === name.toLowerCase()
      ? formatWords(tbl.split('_')) : schemaLabel;

    // uiControl/<Base>List.jsx — the component the schema's own list page renders.
    const uiDir = path.join(dir, 'uiControl');
    let listFile = exportBase ? findFileWithExt(uiDir, `${exportBase}List`) : null;
    if (!listFile && fs.existsSync(uiDir)) {
      const guess = fs.readdirSync(uiDir).filter((f) => /List\.(jsx?|tsx?)$/.test(f)).sort()[0];
      if (guess) listFile = path.join(uiDir, guess);
    }

    // Profile folder: "<prefix>profile" for a prefixed variant, else the only *profile folder, else "profile".
    const prefix = exportBase && exportBase.toLowerCase() !== name.toLowerCase() && exportBase.toLowerCase().endsWith(name.toLowerCase())
      ? exportBase.slice(0, exportBase.length - name.length).toLowerCase() : '';
    const profileDirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && /profile$/i.test(e.name)).map((e) => e.name);
    const profileFolder = profileDirs.includes(`${prefix}profile`) ? `${prefix}profile`
      : (profileDirs.length === 1 ? profileDirs[0] : (profileDirs.includes('profile') ? 'profile' : (profileDirs[0] || 'profile')));

    // List folder (the route the "View more" badge opens): the variant's own folder, else "list", else the only page folder.
    const pageDirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && e.name.toLowerCase() !== 'import' && !/profile$/i.test(e.name) && findFileWithExt(path.join(dir, e.name), 'page'))
      .map((e) => e.name);
    const listFolder = prefix && pageDirs.includes(prefix) ? prefix : (pageDirs.includes('list') ? 'list' : (pageDirs[0] || 'list'));

    // uiControl/<Base>Profile.jsx — the form component openEntityCreateModal renders for "add" actions.
    let profileFile = exportBase ? findFileWithExt(uiDir, `${exportBase}Profile`) : null;
    if (!profileFile && fs.existsSync(uiDir)) {
      const g = fs.readdirSync(uiDir).filter((f) => /Profile\.(jsx?|tsx?)$/.test(f)).sort()[0];
      if (g) profileFile = path.join(uiDir, g);
    }

    const logicDir = path.join(dir, 'logicControl');
    const registryPath = fs.existsSync(logicDir)
      ? (fs.readdirSync(logicDir).filter((f) => /^actionsRegistry\.(jsx?|tsx?)$/i.test(f)).map((f) => path.join(logicDir, f))[0] || null)
      : null;

    const clean = dropComments(text);
    const resolveCalls = [];
    const callRe = /\.\.\.resolveField\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
    let c;
    while ((c = callRe.exec(clean)) !== null) {
      const over = c[2] || '';
      resolveCalls.push({
        relKey: c[1],
        column: (/\bkey\s*:\s*['"]([^'"]+)['"]/.exec(over) || [])[1] || c[1],
        as: (/\bas\s*:\s*['"]([^'"]+)['"]/.exec(over) || [])[1] || '',
      });
    }

    // Literal columns of the schema's `fields: [ ... ]` (resolveField FKs are handled as relations).
    const columns = [];
    // db-cli schemas have SEVERAL `fields: [` — the sections hold plain key strings, the real list holds
    // { key, ... } objects — so read every one and keep the objects.
    const fieldsRe = /\bfields\s*:\s*\[/g;
    let fm;
    while ((fm = fieldsRe.exec(clean)) !== null) {
      const open = fm.index + fm[0].length - 1;
      const close = findClosing(clean, open);
      const body = close > open ? clean.slice(open + 1, close) : '';
      const objRe = /\{\s*key\s*:\s*['"]([^'"]+)['"]([^{}]*)\}/g;
      let o;
      while ((o = objRe.exec(body)) !== null) {
        if (columns.some((c) => c.key === o[1])) continue;
        const typ = (/\btype\s*:\s*['"]([^'"]+)['"]/.exec(o[2]) || [])[1] || 'text';
        const computed = /\bcomputed\s*:\s*true/.test(o[2]);
        columns.push({ key: o[1], type: typ, computed, label: (/\blabel\s*:\s*['"]([^'"]*)['"]/.exec(o[2]) || [])[1] || '' });
      }
    }

    all.push({
      columns,
      profileFile,
      profileComp: profileFile ? path.basename(profileFile).replace(/\.(jsx?|tsx?)$/i, '') : '',
      table: entity[1], name, dir, label, schemaPath: file, exportBase, listFile,
      listComp: listFile ? path.basename(listFile).replace(/\.(jsx?|tsx?)$/i, '') : '',
      profileFolder, listFolder, registryPath, resolveCalls,
    });
  });

  // One module per table: the plain-named schema (shortest file name) is the primary,
  // prefixed variants (ActiveXxxSchema.js) share its folder and registry.
  const byTable = new Map();
  const variants = [];
  all.sort((a, b) => path.basename(a.schemaPath).length - path.basename(b.schemaPath).length || a.schemaPath.localeCompare(b.schemaPath));
  for (const m of all) {
    if (!byTable.has(m.table)) byTable.set(m.table, m);
    else variants.push(m);
  }
  return { byTable, variants };
}

/* ================= BUILD LINKS (edges -> two halves each) ================= */

function buildEdges(byTable, relations, relationsFile) {
  const edges = [];
  for (const child of byTable.values()) {
    const seenCols = new Set();
    for (const call of child.resolveCalls) {
      if (seenCols.has(call.column)) continue;
      seenCols.add(call.column);
      const relation = relations[call.relKey];
      const edge = { child, column: call.column, relKey: call.relKey, relation, parent: null, problem: '' };
      if (!relation) {
        edge.problem = `relation "${call.relKey}" is not in ${rel(relationsFile)} (regenerate it with schemamap.js)`;
      } else {
        edge.parent = byTable.get(relation.table) || null;
        edge.valueField = relation.valueField || 'record_id';
        edge.displayField = relation.displayField || relation.cacheField || edge.valueField;
        // The row key holding the parent's display value on the CHILD's rows (same rule db-cli/resolveField use).
        edge.alias = call.as || (relation.cacheField ? `_${relation.table}_${relation.cacheField}_${call.column}` : '');
      }
      edges.push(edge);
    }
  }

  // Two FKs from one child to the same parent need distinct keys.
  const pairCount = {};
  edges.forEach((e) => { if (e.relation) { const k = `${e.child.table}|${e.relation.table}`; pairCount[k] = (pairCount[k] || 0) + 1; } });

  for (const e of edges) {
    if (!e.relation) continue;
    const multi = pairCount[`${e.child.table}|${e.relation.table}`] > 1;
    const suffix = multi ? `_${e.column}` : '';
    const parentName = e.parent ? e.parent.name : e.relation.table.replace(/_/g, '');
    e.multi = multi;
    // child -> parent: "open the record I point at"; parent -> child: "open my records".
    e.forward = { side: 'child->parent', host: e.child, target: e.parent, key: `view_${e.child.name}_${parentName}_profile${suffix}`, edge: e, problems: [] };
    e.reverse = { side: 'parent->child', host: e.parent, target: e.child, key: `view_${parentName}_${e.child.name}${suffix}`, edge: e, problems: [] };
    // add: on the PARENT row, pop the child's create form with this FK preset (client -> "add payment").
    e.add = FILTER_SKIP_COLUMNS.has(e.column) ? null
      : { side: 'add', host: e.parent, target: e.child, key: `add_${parentName}_${e.child.name}${suffix}`, edge: e, problems: [] };
    // grid-toolbar "filter by parent": lives on the child, needs only the parent's schema.
    e.filter = FILTER_SKIP_COLUMNS.has(e.column) ? null
      : { side: 'filter', host: e.child, target: e.parent, key: `filter_${e.child.name}_${parentName}${suffix}`, edge: e, problems: [] };

    if (!e.parent) {
      const why = `no module found for table "${e.relation.table}" — build and clone it, then re-run`;
      e.problem = why; // reported once for the whole link
      e.forward.problems.push(why);
      e.reverse.problems.push(why);
      if (e.filter) e.filter.problems.push(why);
      if (e.add) e.add.problems.push(why);
      continue;
    }
    if (e.add) e.add.extras = extraMappedFks(e, relations);
    // forward lives in the child's registry and opens the parent's list
    if (!e.child.registryPath) e.forward.problems.push(`${e.child.name}: no logicControl/actionsRegistry.js (module not cloned?)`);
    if (!e.parent.listFile) e.forward.problems.push(`${e.parent.name}: no uiControl/*List.jsx to open (module not cloned?)`);
    // reverse lives in the parent's registry and opens the child's list
    if (!e.parent.registryPath) e.reverse.problems.push(`${e.parent.name}: no logicControl/actionsRegistry.js (module not cloned?)`);
    if (!e.child.listFile) e.reverse.problems.push(`${e.child.name}: no uiControl/*List.jsx to open (module not cloned?)`);
    // add lives in the parent's registry and opens the child's create form
    if (e.add) {
      if (!e.parent.registryPath) e.add.problems.push(`${e.parent.name}: no logicControl/actionsRegistry.js (module not cloned?)`);
      if (!e.child.profileFile) e.add.problems.push(`${e.child.name}: no uiControl/*Profile.jsx for the create form (module not cloned?)`);
      if (!e.child.exportBase) e.add.problems.push(`${e.child.name}: schema has no "export const <Name>Schema"`);
    }
    // filter lives in the child's registry and searches the parent's schema
    if (e.filter) {
      if (!e.child.registryPath) e.filter.problems.push(`${e.child.name}: no logicControl/actionsRegistry.js (module not cloned?)`);
      if (!e.parent.exportBase) e.filter.problems.push(`${e.parent.name}: schema has no "export const <Name>Schema" to search`);
    }
  }
  return edges;
}

/* ================= CODE GENERATION ================= */

function genAction(h) {
  const e = h.edge;
  const { host, target } = h;
  const comp = target.listComp;
  const imp = importPath(path.dirname(host.registryPath), stripExt(target.listFile));
  const profilePath = toPosix(path.relative(host.dir, path.join(target.dir, target.profileFolder)));
  // Route of the target's list page, e.g. /ticksy/systemusers/list (same shape as profileActions' navigateTo).
  const listRoute = `/${[appName, toPosix(path.relative(appDir, target.dir)), target.listFolder].filter(Boolean).join('/')}`;

  let guard; let title; let query;
  if (h.side === 'child->parent') {
    // On the child row: the FK column holds the parent's key (e.valueField).
    const shown = e.alias ? `row.${e.alias}` : `row.${e.column}`;
    guard = `row?.${e.column}`;
    title = `${singular(target.label)} — \${${shown} || ''}`;
    query = `{ ${camel(e.valueField)}: btoa(row.${e.column}) }`;
  } else {
    // On the parent row: filter the child list by the FK column = this row's key.
    guard = `row?.${e.valueField}`;
    title = `${target.label} — \${row.${e.displayField} || row.${e.valueField}}`;
    query = `{ ${camel(e.column)}: btoa(row.${e.valueField}) }`;
  }
  return [
    `  ${h.key}: async ({ rows, router }) => {`,
    `    const row = rows?.[0];`,
    `    if (!${guard}) return;`,
    `    const { default: ${comp} } = await import('${imp}');`,
    `    const fixedQuery = ${query};`,
    `    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine`,
    `    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.`,
    `    const href = \`${listRoute}?\${new URLSearchParams({ ${target.table}_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}\`;`,
    `    MosyCard('', React.createElement(React.Fragment, null,`,
    `      React.createElement(${comp}, {`,
    `        customProfilePath: '${profilePath}',`,
    `        title: \`${title}\`,`,
    `        fixedQuery,`,
    `        hiddenActions: ['new'],`,
    `      }),`,
    `      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),`,
    `    ), true, 'modal4', 'mosycard_wide');`,
    `  },`,
  ].join('\n');
}

function genFilterAction(h) {
  const e = h.edge;
  const noun = singular(h.target.label).toLowerCase();
  const title = `Filter by ${noun}${e.multi ? ` (${e.column})` : ''}`.replace(/'/g, "\\'");
  return [
    `  ${h.key}: (ctx) => openSmartMapFilter(ctx, {`,
    `    title: '${title}',`,
    `    searchSchema: ${h.target.exportBase}Schema,`,
    `    displayField: '${e.displayField}',`,
    `    valueField: '${e.valueField}',`,
    `    localColumnKey: '${e.column}',`,
    `    combine: true,`,
    `  }),`,
  ].join('\n');
}

// Add-related popups hide whatever the parent row already decides, so the user never retypes
// (or changes) it: the FK itself, its liveSearch label column, and sibling columns the child keeps
// as a copy of the parent's value (merchant_id -> merchant_name, device_id -> device_name, ...).
// They go in lockedFields (EntityCreateModal): kept in schema.fields so the values are still SAVED. Set to false to show them locked instead.
const HIDE_MAPPED_FIELDS = true;
const MIRROR_SUFFIXES = ['name', 'no', 'number', 'code', 'title'];

function mirroredColumnsFor(column, child, parent) {
  if (!/_id$/.test(column) || !child || !parent) return [];
  const base = column.replace(/_id$/, '');
  const childKeys = new Set((child.columns || []).map((c) => c.key));
  const parentKeys = new Set((parent.columns || []).map((c) => c.key));
  return MIRROR_SUFFIXES.map((x) => `${base}_${x}`).filter((k) => childKeys.has(k) && parentKeys.has(k) && k !== column);
}

function mirroredColumns(e) {
  return mirroredColumnsFor(e.column, e.child, e.parent);
}

// Other FKs the child form shares with the parent row (branch_id on both merchant_list and merchant_device_list):
// the add action carries them over too. Same column name on both sides is required, and when both are FKs they
// must point at the same table. Audit/site columns are never carried. Whether a value is actually carried is
// decided at click time (the parent row must have one) — see genAddAction.
const EXTRA_FK_SKIP = new Set([...FILTER_SKIP_COLUMNS, 'hive_site_id', 'hive_site_name']);

function extraMappedFks(e, relations) {
  const { child, parent } = e;
  if (!child || !parent) return [];
  const used = new Set([e.column, ...mirroredColumns(e)]);
  const out = [];
  for (const call of child.resolveCalls) {
    const x = call.column;
    if (x === e.column || EXTRA_FK_SKIP.has(x) || out.some((o) => o.column === x)) continue;
    const parentFk = parent.resolveCalls.find((c) => c.column === x);
    const parentPlain = parent.columns.some((c) => c.key === x && !c.computed);
    if (!parentFk && !parentPlain) continue;
    if (parentFk && parentFk.relKey !== call.relKey) {
      const childTable = (relations[call.relKey] || {}).table || call.relKey;
      const parentTable = (relations[parentFk.relKey] || {}).table || parentFk.relKey;
      if (childTable !== parentTable) continue;
    }
    const mirrors = HIDE_MAPPED_FIELDS ? mirroredColumnsFor(x, child, parent).filter((k) => !used.has(k)) : [];
    used.add(x);
    mirrors.forEach((k) => used.add(k));
    out.push({ column: x, mirrors });
  }
  return out;
}

function genAddAction(h) {
  const e = h.edge;
  const child = h.target;
  const schemaVar = `${child.exportBase}Schema`;
  const noun = singular(child.label);
  const shown = `row.${e.displayField}`;
  const mirrors = HIDE_MAPPED_FIELDS ? mirroredColumns(e) : [];
  const lines = [
    `  ${h.key}: ({ rows, refresh }) => {`,
    `    const row = rows?.[0];`,
    `    if (!row?.${e.valueField}) return;`,
  ];
  const extras = h.extras || [];
  if (HIDE_MAPPED_FIELDS) {
    lines.push(`    const fk = ${schemaVar}.fields?.find((f) => f.key === '${e.column}');`);
  }
  if (extras.length) {
    // Other FKs the parent row shares with the child form: carried (preset + locked) only when this row has a value.
    lines.push(
      `    // other FKs this row shares with the form: carried over only when the row has a value, else left for the user to pick`,
      `    const carried = [`,
      ...extras.map((x) => `      { column: '${x.column}', mirrors: [${x.mirrors.map((k) => `'${k}'`).join(', ')}] },`),
      `    ].filter(({ column }) => row[column] !== undefined && row[column] !== null && row[column] !== '');`,
      `    const carriedPreset = {};`,
      `    const carriedLocked = [];`,
      `    carried.forEach(({ column, mirrors }) => {`,
      `      const labelKey = ${schemaVar}.fields?.find((f) => f.key === column)?.labelKey;`,
      `      const copies = [labelKey, ...mirrors].filter((k) => k && row[k] !== undefined);`,
      `      carriedPreset[column] = row[column];`,
      `      copies.forEach((k) => { carriedPreset[k] = row[k]; });`,
      `      carriedLocked.push(column, ...new Set([...(labelKey ? [labelKey] : []), ...copies]));`,
      `    });`,
    );
  }
  lines.push(
    `    openEntityCreateModal({`,
    `      ProfileComponent: ${child.profileComp},`,
    `      schema: ${schemaVar},`,
    `      title: \`New ${noun.replace(/`/g, '')} — \${${shown} || row.${e.valueField}}\`,`,
    `      presetValues: {`,
    `        ...buildPresetFromRow(row, [`,
    `          { sourceKey: '${e.valueField}', destKey: '${e.column}', destSchema: ${schemaVar}, labelValue: ${shown} },`,
    `        ]),`,
    ...mirrors.map((k) => `        ${k}: row.${k} ?? '', // copy kept on the child`),
    ...(extras.length ? [`        ...carriedPreset,`] : []),
    `      },`,
  );
  if (HIDE_MAPPED_FIELDS) {
    lines.push(`      lockedFields: ['${e.column}', fk?.labelKey${mirrors.map((k) => `, '${k}'`).join('')}${extras.length ? ', ...carriedLocked' : ''}].filter(Boolean), // mapped from the row: not shown, not editable, still saved`);
  } else if (extras.length) {
    lines.push(`      fieldOverrides: { ${e.column}: { editable: false }, ...Object.fromEntries(carriedLocked.map((k) => [k, { editable: false }])) }, // lock the mapped FKs so they can't be switched`);
  } else {
    lines.push(`      fieldOverrides: { ${e.column}: { editable: false } }, // lock the mapped FK so it can't be switched`);
  }
  lines.push(`      onSaved: refresh,`, `    });`, `  },`);
  return lines.join('\n');
}

function genColumnAction(h) {
  const title = h.title.replace(/'/g, "\\'");
  if (h.kind === 'date') {
    return [
      `  ${h.key}: (ctx) => openSmartDateFilter(ctx, {`,
      `    title: '${title}',`,
      `    columnKey: '${h.column}',`,
      `    inputType: '${h.inputType}',`,
      `    combine: true,`,
      `  }),`,
    ].join('\n');
  }
  return [
    `  ${h.key}: (ctx) => openSmartTagFilter(ctx, {`,
    `    title: '${title}',`,
    `    columnKey: '${h.column}',`,
    `    combine: true,`,
    `  }),`,
  ].join('\n');
}

function genSchemaEntry(h) {
  if (h.side === 'column') {
    return `    { key: '${h.key}', label: '${h.title.replace(/'/g, "\\'")}', icon: '${h.kind === 'date' ? 'calendar' : 'tag'}', variant: 'outline-primary', type: 'action', grid: true, form: false, rowAction: false },`;
  }
  const e = h.edge;
  if (h.side === 'filter') {
    const noun = singular(h.target.label);
    const label = `Filter by ${noun}${e.multi ? ` (${e.column})` : ''}`.replace(/'/g, "\\'");
    return `    { key: '${h.key}', label: '${label}', icon: 'filter', variant: 'outline-primary', type: 'action', grid: true, form: false, rowAction: false, role: 'view_${h.target.name}' },`;
  }
  if (h.side === 'add') {
    const label = `Add ${singular(h.target.label)}${e.multi ? ` (${e.column})` : ''}`.replace(/'/g, "\\'");
    return `    { key: '${h.key}', label: '${label}', icon: 'plus', form: true, grid: false, rowAction: ${h.rowAction !== false}, editOnly: true },`;
  }
  const base = h.side === 'child->parent' ? `View ${singular(h.target.label)}` : `View ${h.target.label}`;
  const label = e.multi ? `${base} (${e.column})` : base;
  return `    { key: '${h.key}', label: '${label.replace(/'/g, "\\'")}', icon: '${VIEW_RELATED_ICON}', form: true, grid: false, rowAction: ${h.rowAction !== false}, editOnly: true, role: 'view_${h.target.name}' },`;
}

/* ================= APPLY ================= */

function backupBeforeWrite(module, file) {
  const relFromModule = path.relative(module.dir, file);
  const ext = path.extname(relFromModule);
  const base = relFromModule.slice(0, relFromModule.length - ext.length);
  let backup = path.join(module.dir, '_recycled', `${base}.${RUN_TIMESTAMP}${ext}`);
  for (let n = 2; fs.existsSync(backup); n += 1) backup = path.join(module.dir, '_recycled', `${base}.${RUN_TIMESTAMP}-${n}${ext}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(file, backup);
  return backup;
}

function main() {
  if (!fs.existsSync(appDir)) {
    console.error(`❌ ${rel(appDir)} not found. Run from the project root, or pass --app=<namespace>.`);
    process.exit(1);
  }

  const relInfo = loadRelations();
  if (!relInfo) {
    console.log(`ℹ️  No globalRelations found under ${rel(appDir)} (expected DataControl/${appName}Schema.js from schemamap.js) — nothing to link.`);
    return;
  }

  const { byTable, variants } = scanModules();
  if (byTable.size === 0) return console.log(`ℹ️  No module schemas found under ${rel(appDir)}.`);

  const edges = buildEdges(byTable, relInfo.relations, relInfo.file);
  const edgeHalves = (e) => [e.forward, e.reverse, e.add, e.filter].filter(Boolean);
  const halves = edges.filter((e) => e.relation).flatMap(edgeHalves);

  // Column filters: every date column -> date-range filter; every tag-like column -> distinct-value filter.
  const fkColumns = new Set(edges.map((e) => `${e.child.table}|${e.column}`));
  for (const mod of byTable.values()) {
    for (const col of mod.columns) {
      if (COLUMN_SKIP.has(col.key) || col.computed || fkColumns.has(`${mod.table}|${col.key}`)) continue;
      let kind = '';
      let byName = '';
      if (col.type === 'date' || col.type === 'datetime') kind = 'date';
      else if (['text', 'select'].includes(col.type) && !/_id$/.test(col.key) && (byName = dateByName(col.key))) kind = 'date';
      else if (col.type === 'groupedSelect') kind = 'tag'; // db-cli already marked it as a grouped (distinct-value) column
      else if (['text', 'select'].includes(col.type) && !/_(id|code)$/.test(col.key) && TAG_RE.test(col.key)) kind = 'tag';
      if (!kind) continue;
      const nice = COLUMN_TITLES[col.key] || (col.label || col.key.replace(/_/g, ' ')).toLowerCase();
      halves.push({
        side: 'column', kind, host: mod, target: null, edge: null, column: col.key, problems: [],
        inputType: byName || (col.type === 'date' ? 'date' : 'datetime-local'), byName: !!byName,
        key: `filter_${mod.name}_${col.key}`,
        title: `Filter by ${nice}`,
      });
      if (!mod.registryPath) halves[halves.length - 1].problems.push(`${mod.name}: no logicControl/actionsRegistry.js (module not cloned?)`);
    }
  }

  // Hand-written key already in the host's registry or schema (outside the markers) -> skip, report.
  const skippedByHand = [];
  for (const h of halves) {
    if (h.problems.length) continue;
    const keyRe = new RegExp(`(^|[\\s,{])${escapeRegExp(h.key)}\\s*:`);
    const schemaKeyRe = new RegExp(`key\\s*:\\s*['"]${escapeRegExp(h.key)}['"]`);
    const regOutside = dropComments(outsideRegion(readText(h.host.registryPath), ACTIONS_OPEN, ACTIONS_CLOSE));
    const schOutside = dropComments(outsideRegion(readText(h.host.schemaPath), ACTIONS_OPEN, ACTIONS_CLOSE));
    // Skip when the SAME BEHAVIOUR is already hand-written, not only the same key — existing modules
    // have their own filter_by_client / view_payment_history and must not get a duplicate beside it.
    const queryKey = h.side === 'column' ? '' : (h.side === 'child->parent' ? camel(h.edge.valueField) : camel(h.edge.column));
    let reason = '';
    if (keyRe.test(regOutside) || schemaKeyRe.test(schOutside)) reason = 'key already defined by hand';
    else if (h.side === 'column') { if (new RegExp(`columnKey\\s*:\\s*['"]${escapeRegExp(h.column)}['"]`).test(regOutside)) reason = `already covered by a hand-written filter on ${h.column}`; }
    else if (h.side === 'filter' && new RegExp(`localColumnKey\\s*:\\s*['"]${escapeRegExp(h.edge.column)}['"]`).test(regOutside)) reason = `already covered by a hand-written filter on ${h.edge.column}`;
    else if (h.side === 'add') { if (new RegExp(`destKey\\s*:\\s*['"]${escapeRegExp(h.edge.column)}['"][^}]{0,120}destSchema\\s*:\\s*${escapeRegExp(h.target.exportBase)}Schema`).test(regOutside)) reason = `already covered by a hand-written create form for ${h.target.name} (${h.edge.column} preset)`; }
    else if ((h.side === 'child->parent' || h.side === 'parent->child') && new RegExp(`createElement\\(\\s*${escapeRegExp(h.target.listComp)}\\b[\\s\\S]{0,500}?fixedQuery\\s*:\\s*\\{\\s*${queryKey}\\s*:`).test(regOutside)) reason = `already covered by a hand-written popup (${h.target.listComp} filtered by ${queryKey})`;
    if (reason) {
      h.skippedByHand = true;
      h.skipReason = reason;
      skippedByHand.push(h);
    }
  }
  const buildable = (h) => !h.problems.length && !h.skippedByHand;

  // One change set per HOST module: registry + schema together or neither.
  const changes = []; // { module, file, text, original }
  const noMarkers = [];
  const hostModules = new Set([...byTable.values()]);
  const mosyCard = (() => {
    const p = findFileWithExt(path.join(projectRoot, 'app', 'components'), 'MosyCard');
    return p ? stripExt(p) : path.join(projectRoot, 'app', 'components', 'MosyCard');
  })();
  const mosyCardMissing = !findFileWithExt(path.join(projectRoot, 'app', 'components'), 'MosyCard');
  const viewAllLink = (() => {
    const p = findFileWithExt(path.join(projectRoot, 'app', 'components'), 'ViewAllLink');
    return p ? stripExt(p) : path.join(projectRoot, 'app', 'components', 'ViewAllLink');
  })();
  const viewAllMissing = !findFileWithExt(path.join(projectRoot, 'app', 'components'), 'ViewAllLink');
  const createModalFile = findFileWithExt(path.join(appDir, 'moduleControl', 'UiControl'), 'EntityCreateModal');
  const entityCreateModal = createModalFile ? stripExt(createModalFile) : path.join(appDir, 'moduleControl', 'UiControl', 'EntityCreateModal');
  const smartFilterDir = path.join(appDir, 'moduleControl', 'UiControl');
  const smartFilterFile = findFileWithExt(smartFilterDir, 'smartFilterActions');
  const smartFilterActions = smartFilterFile ? stripExt(smartFilterFile) : path.join(smartFilterDir, 'smartFilterActions');

  for (const mod of hostModules) {
    const mine = halves.filter((h) => h.host === mod && buildable(h)).sort((a, b) => a.key.localeCompare(b.key));
    if (!mod.registryPath) continue;
    const regOrig = readText(mod.registryPath);
    const schOrig = readText(mod.schemaPath);
    const hasAny = hasRegion(regOrig, ACTIONS_OPEN, ACTIONS_CLOSE) || hasRegion(schOrig, ACTIONS_OPEN, ACTIONS_CLOSE);
    if (mine.length === 0 && !hasAny) continue; // nothing to add and nothing generated before: leave the files alone

    let reg = regOrig;
    let sch = schOrig;
    if (mine.length) {
      const r1 = ensureRegistryMarkers(reg);
      const r2 = ensureSchemaMarkers(sch);
      if (r1.error || r2.error) {
        const why = [r1.error && `${rel(mod.registryPath)}: ${r1.error}`, r2.error && `${rel(mod.schemaPath)}: ${r2.error}`].filter(Boolean).join('; ');
        noMarkers.push({ module: mod, why });
        mine.forEach((h) => h.problems.push(`${mod.name}: markers could not be added (see NO MARKERS below)`));
        continue;
      }
      reg = r1.text;
      sch = r2.text;
    } else {
      // Stale generated blocks (link removed): empty them, never invent markers.
      if (!hasRegion(reg, ACTIONS_OPEN, ACTIONS_CLOSE) || !hasRegion(sch, ACTIONS_OPEN, ACTIONS_CLOSE)) continue;
    }

    // Row-menu budget: hand-written row actions (outside the markers) use slots first; generated ones take
    // the rest in ROW_PRIORITY order, the others stay profile-only (form:true) so the dropdown stays short.
    {
      const schOut = dropComments(outsideRegion(sch, ACTIONS_OPEN, ACTIONS_CLOSE));
      const hand = (schOut.match(/[^\n]*rowAction\s*:\s*true[^\n]*/g) || []).filter((l) => !/key\s*:\s*['"](view|delete)['"]/.test(l)).length;
      const rl = /\browLinks\s*:\s*\[/.exec(schOut);
      const linkCount = rl ? ((schOut.slice(rl.index, findClosing(schOut, rl.index + rl[0].length - 1)).match(/\{\s*key\s*:/g)) || []).length : 0;
      let budget = Math.max(0, MAX_ROW_ACTIONS - hand - linkCount);
      const rowCandidates = mine.filter((h) => ROW_PRIORITY.includes(h.side))
        .sort((a, b) => ROW_PRIORITY.indexOf(a.side) - ROW_PRIORITY.indexOf(b.side) || a.key.localeCompare(b.key));
      mod.rowOverflow = [];
      for (const h of rowCandidates) {
        h.rowAction = budget > 0;
        if (budget > 0) budget -= 1; else mod.rowOverflow.push(h.key);
      }
    }

    const outsideReg = dropComments(outsideRegion(reg, IMPORTS_OPEN, IMPORTS_CLOSE));
    const importLines = [];
    if (mine.length) {
      if (!/\bimport\s+React\b/.test(outsideReg)) importLines.push(`import React from 'react';`);
      if (!/\bimport\s*\{[^}]*\bMosyCard\b[^}]*\}/.test(outsideReg)) {
        importLines.push(`import { MosyCard } from "${importPath(path.dirname(mod.registryPath), mosyCard)}";`);
      }
      if (mine.some((h) => h.side === 'forward' || h.side === 'reverse' || h.side === 'child->parent' || h.side === 'parent->child') && !/\bimport\s+ViewAllLink\b/.test(outsideReg)) {
        importLines.push(`import ViewAllLink from "${importPath(path.dirname(mod.registryPath), viewAllLink)}";`);
      }
      const adds = mine.filter((h) => h.side === 'add');
      if (adds.length) {
        if (!/\bimport\s*\{[^}]*\bopenEntityCreateModal\b[^}]*\}/.test(outsideReg) || !/\bbuildPresetFromRow\b/.test(outsideReg)) {
          importLines.push(`import { openEntityCreateModal, buildPresetFromRow } from "${importPath(path.dirname(mod.registryPath), entityCreateModal)}";`);
        }
        const seenProfiles = new Set();
        for (const h of adds) {
          const pc = h.target.profileComp;
          if (seenProfiles.has(pc)) continue;
          seenProfiles.add(pc);
          if (!new RegExp(`\\bimport\\s+${pc}\\b`).test(outsideReg)) {
            importLines.push(`import ${pc} from "${importPath(path.dirname(mod.registryPath), stripExt(h.target.profileFile))}";`);
          }
        }
      }
      const colFns = [...new Set(mine.filter((h) => h.side === 'column').map((h) => (h.kind === 'date' ? 'openSmartDateFilter' : 'openSmartTagFilter')))];
      for (const fn of colFns) {
        if (!new RegExp(`\\bimport\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}`).test(outsideReg)) {
          importLines.push(`import { ${fn} } from "${importPath(path.dirname(mod.registryPath), smartFilterActions)}";`);
        }
      }
      const schemaImports = [...mine.filter((h) => h.side === 'filter'), ...mine.filter((h) => h.side === 'add')];
      const filters = mine.filter((h) => h.side === 'filter');
      if (filters.length) {
        if (!/\bimport\s*\{[^}]*\bopenSmartMapFilter\b[^}]*\}/.test(outsideReg)) {
          importLines.push(`import { openSmartMapFilter } from "${importPath(path.dirname(mod.registryPath), smartFilterActions)}";`);
        }
        }
      {
        const seenSchemas = new Set();
        for (const h of schemaImports) {
          const schemaVar = `${h.target.exportBase}Schema`;
          if (seenSchemas.has(schemaVar)) continue;
          seenSchemas.add(schemaVar);
          if (!new RegExp(`\\bimport\\s*\\{[^}]*\\b${schemaVar}\\b[^}]*\\}`).test(outsideReg)) {
            importLines.push(`import { ${schemaVar} } from "${importPath(path.dirname(mod.registryPath), stripExt(h.target.schemaPath))}";`);
          }
        }
      }
    }
    if (hasRegion(reg, IMPORTS_OPEN, IMPORTS_CLOSE)) {
      reg = setRegion(reg, IMPORTS_OPEN, IMPORTS_CLOSE, importLines.length ? `${importLines.join('\n')}\n` : '');
    }
    reg = setRegion(reg, ACTIONS_OPEN, ACTIONS_CLOSE, mine.length ? `${mine.map((h) => (h.side === 'filter' ? genFilterAction(h) : (h.side === 'column' ? genColumnAction(h) : (h.side === 'add' ? genAddAction(h) : genAction(h))))).join('\n\n')}\n` : '');
    sch = setRegion(sch, ACTIONS_OPEN, ACTIONS_CLOSE, mine.length ? `${mine.map(genSchemaEntry).join('\n')}\n` : '');

    if (reg !== regOrig) changes.push({ module: mod, file: mod.registryPath, text: reg });
    if (sch !== schOrig) changes.push({ module: mod, file: mod.schemaPath, text: sch });
  }

  // Write (with backups), unless dry run.
  const written = [];
  for (const ch of changes) {
    if (!DRY_RUN) {
      backupBeforeWrite(ch.module, ch.file);
      fs.writeFileSync(ch.file, ch.text);
    }
    written.push(rel(ch.file));
  }

  /* ---------- report ---------- */
  const lines = [];
  const stamp = new Date().toLocaleString();
  lines.push(`RELATIONS REPORT — ${stamp} — app: ${appName || '(none)'}${DRY_RUN ? '   [DRY RUN — nothing written]' : ''}`);
  lines.push(`Modules found: ${byTable.size}   FK links found: ${edges.length}`);

  const describe = (h) => {
    const hostName = h.host ? h.host.name : '(missing module)';
    if (h.skippedByHand) return `${hostName}: ${h.key}   skipped — ${h.skipReason}`;
    if (h.problems.length) return `${hostName}: ${h.key}   NOT BUILT — ${h.problems.join('; ')}`;
    const alsoMaps = h.side === 'add' && h.extras && h.extras.length
      ? `   also maps ${h.extras.map((x) => `${x.column}${x.mirrors.length ? ` (+${x.mirrors.join(', +')})` : ''}`).join(', ')}` : '';
    return `${hostName}: ${h.key}${alsoMaps}`;
  };
  const edgeTitle = (e) => `${e.child.name}.${e.column} -> ${e.relation ? e.relation.table : e.relKey}`;
  const done = (h) => buildable(h);

  // A half skipped because hand-written code already covers it counts as done, not pending.
  const allDone = (e) => e.relation && e.parent && edgeHalves(e).every((h) => done(h) || h.skippedByHand);
  const linked = edges.filter(allDone);
  const pending = edges.filter((e) => !allDone(e));

  lines.push('', `LINKED (${linked.length})`);
  if (!linked.length) lines.push('  (none)');
  linked.forEach((e) => {
    lines.push(`  ${edgeTitle(e)}`);
    edgeHalves(e).forEach((h) => lines.push(`     ${describe(h)}`));
  });

  lines.push('', `PENDING / PARTIAL (${pending.length})${pending.length ? '   — fix the reason, then run: node build-relations.js' : ''}`);
  if (!pending.length) lines.push('  (none)');
  pending.forEach((e) => {
    lines.push(`  ${edgeTitle(e)}`);
    if (!e.relation || !e.parent) { lines.push(`     NOT BUILT — ${e.problem}`); return; }
    edgeHalves(e).forEach((h) => lines.push(`     ${describe(h)}`));
  });

  const colBuilt = halves.filter((h) => h.side === 'column');
  lines.push('', `COLUMN FILTERS (${colBuilt.length})   — date columns and status/type/category-like columns`);
  if (!colBuilt.length) lines.push('  (none)');
  colBuilt.forEach((h) => lines.push(`  ${h.host.name}.${h.column} [${h.kind}${h.byName ? ' by name' : ''}]   ${describe(h)}`));

  if (skippedByHand.length) {
    lines.push('', 'SKIPPED — already covered by hand-written code outside the markers');
    skippedByHand.forEach((h) => lines.push(`  ${h.host.name}: ${h.key}   (${h.skipReason})`));
  }
  if (noMarkers.length) {
    lines.push('', 'NO MARKERS — could not insert them automatically (module left untouched)');
    noMarkers.forEach((n) => lines.push(`  ${n.module.name}: ${n.why}`));
  }
  if (variants.length) {
    lines.push('', 'NOT WIRED — extra schema variants of a table (the main schema of that table is used)');
    variants.forEach((v) => lines.push(`  ${rel(v.schemaPath)}`));
  }
  const overflow = [...byTable.values()].filter((m) => m.rowOverflow && m.rowOverflow.length);
  if (overflow.length) {
    lines.push('', `ROW MENU LIMIT (${MAX_ROW_ACTIONS} per module) — these are on the profile page only, not in the row dropdown`);
    overflow.forEach((m) => lines.push(`  ${m.name}: ${m.rowOverflow.join(', ')}`));
  }
  if (mosyCardMissing && written.length) {
    lines.push('', `CHECK — ${rel(mosyCard)} not found; the MosyCard import path in the registries is a guess`);
  }
  if (!smartFilterFile && halves.some((h) => (h.side === 'filter' || h.side === 'column') && buildable(h)) && written.length) {
    lines.push('', `CHECK — ${rel(smartFilterActions)}.jsx not found; the openSmartMapFilter import path in the registries is a guess`);
  }
  if (viewAllMissing && written.length) {
    lines.push('', `CHECK — ${rel(viewAllLink)}.jsx not found; copy ViewAllLink.jsx there (the registries import it)`);
  }

  lines.push('', written.length
    ? `FILES ${DRY_RUN ? 'THAT WOULD CHANGE' : 'CHANGED'} (${written.length})${DRY_RUN ? '' : ' — previous copy of each is in <module>/_recycled/'}`
    : 'FILES CHANGED: none (already up to date)');
  written.forEach((f) => lines.push(`  ${f}`));

  const report = `${lines.join('\n')}\n`;
  console.log(`\n${report}`);

  if (!DRY_RUN) {
    const logPath = path.join(appDir, 'AppRoutes', 'relations-log.txt');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, report);
    console.log(`📝 Saved to ${rel(logPath)}`);
  }
}

try {
  main();
} catch (err) {
  console.error('❌', err.message);
  process.exit(1);
}
