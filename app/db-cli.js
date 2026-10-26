#!/usr/bin/env node
/**
 * Terminal DB CLI — single file, no setup required.
 * Auto-installs mysql2 if missing. Defaults to root/blank password/localhost
 * unless overridden by a .env file (DB_HOST, DB_USER, DB_PASS, DB_NAME).
 *
 * Scope: table/column structure + generating schema.js. This tool builds
 * UI/API scaffolding — it does NOT insert/select/update/delete row data.
 *
 * Usage:
 *   node db-cli.js
 *   -> interactive menu: create table, add/drop column, list columns,
 *      build schema.js from an existing table
 *
 * BULK schema build (menu option 10, or straight from the command line):
 *   node db-cli.js --bulk="system_users -> Users , clients_tbl -> ActiveCustomers --active"
 *   node db-cli.js --bulk=modules.csv
 * Entry format:  table [-> Module] [--listname]   (comma / semicolon / newline separated)
 *   - "-> Module" is optional (defaults to the table name minus underscores)
 *   - "--active" is that entry's custom list name, same as single mode's
 *     "custom name used with clone-module.js's --list-name" prompt
 * clone-module.js --bulk reads the same format, so one list drives both.
 * Quote the list on the command line: a bare "->" is a redirect to the shell.
 *
 * After building schema(s) — single or bulk — it asks "Create the client module(s) now?"
 * and, on y, runs clone-module.js (same folder) with --keep-schemas so the schema files
 * just generated are kept; every other existing file is recycled + replaced like a normal clone.
 * When the clone succeeds it then runs build-relations.js (same folder), which adds the
 * related-record buttons (view_<from>_<to>) for every FK the schemas auto-linked. Menu option
 * "r" (or `node build-relations.js`) runs just that last step on its own.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/* ================= AUTO-INSTALL MISSING PACKAGES ================= */

function ensurePackage(pkgName) {
  try {
    return require(pkgName);
  } catch {
    console.log(`📦 "${pkgName}" not found — installing...`);
    execSync(`npm install ${pkgName} --save`, { stdio: 'inherit', cwd: __dirname });
    return require(pkgName);
  }
}

const mysql = ensurePackage('mysql2/promise');

/* ================= LOAD .env (no dotenv dependency needed) ================= */

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        env[match[1]] = (match[2] || '').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

// Diagnostic: show exactly where we're looking, and flag common Windows gotchas
// (a second db-cli.js elsewhere, or a ".env" that actually saved as ".env.txt").
function diagnoseEnv() {
  const envPath = path.join(__dirname, '.env');
  const found = fs.existsSync(envPath);
  console.log(`📄 .env expected at: ${envPath}`);
  console.log(`   ${found ? '✅ found' : '❌ not found'}`);

  if (!found) {
    const dirFiles = fs.readdirSync(__dirname);
    const suspects = dirFiles.filter((f) => f.toLowerCase().startsWith('.env') || f.toLowerCase() === 'env.txt');
    if (suspects.length > 0) {
      console.log(`   ⚠️  Found similarly-named file(s) instead: ${suspects.join(', ')}`);
      console.log(`      If one of these is "env.txt" or ".env.txt", rename it to exactly ".env" (no extra extension).`);
    } else {
      console.log(`   ℹ️  No .env-like file in this folder at all. Using built-in defaults (root / blank password / localhost).`);
      console.log(`      If you edited .env before, it may be next to a DIFFERENT copy of db-cli.js. Check for other db-cli.js files on your system.`);
    }
  }
}

const env = loadEnv();

const DB_CONFIG = {
  host: env.DB_HOST || 'localhost',
  user: env.DB_USER || 'root',
  password: env.DB_PASS || '',
  database: env.DB_NAME || path.basename(__dirname), // defaults to current folder name
};

/* ================= TYPE MAP ================= */

const TYPE_MAP = {
  text: 'VARCHAR(255)',
  tel: 'VARCHAR(20)',
  email: 'VARCHAR(255)',
  textarea: 'TEXT',
  money: 'DECIMAL(12,2)',
  number: 'INT',
  select: 'VARCHAR(100)',
  date: 'DATE',
  datetime: 'DATETIME',
  boolean: 'TINYINT(1)',
};
const TYPE_CHOICES = Object.keys(TYPE_MAP);

/* ================= SMART FIELD DETECTION (schema.js generation only) =================
 * Name-pattern rules for turning a raw DB column into a rich schema field —
 * same "SHOW COLUMNS + string matching" philosophy as the old PHP
 * SmartPageLayoutInit(), just producing the JS schema field shape instead.
 * Tune these lists, not the logic below, when a rule misfires on a table.
 */

const SMART_RULES = {
  sensitive: [/password/i, /pass_?hash/i, /secret/i, /(^|_)token(_hash|_secret)?$/i, /api_?key/i],
  datetime: [/created_at/i, /updated_at/i, /created_on/i, /updated_on/i, /_date$/i, /^date_/i, /_time$/i, /^regdate$/i, /(^|_)seen$/i],
  textarea: [/description/i, /notes?$/i, /(^|_)messages?$/i, /remark/i, /(?<!host_|ip_|mac_|email_|web_)address/i],
  money: [/^latitude$/i, /^longitude$/i, /_lat$/i, /_lng$/i, /_amount$/i, /_price$/i, /_cost$/i, /_balance$/i, /_total$/i],
  groupedSelect: [/^country$/i, /^county$/i, /^town$/i, /^region$/i, /^status$/i, /^category$/i, /^cluster$/i, /_company$/i, /^vendor$/i, /_vendor$/i, /(^|_)type$/i, /(^|_)kind$/i, /(^|_)role$/i, /(^|_)tier$/i, /(^|_)stage$/i, /(^|_)priority$/i, /(^|_)state$/i, /(^|_)group$/i, /(^|_)gender$/i, /(^|_)sex$/i, /_status$/i, /_category$/i],
  computedSum: [/^total_/i, /_count$/i, /_sum$/i],
  title: [/_name$/i, /^name$/i, /_code$/i, /^code$/i],
  required: /_name$|^name$/i,
};

// Columns that usually want a colour badge — gets a one-line commented hint in the generated schema.
const BADGE_HINT_RULE = /(^|_)(status|state|active|approved|paid|priority)$/i;

function matchesAny(str, patterns) {
  return patterns.some((p) => p.test(str));
}

// ---- upload columns (image / file) ----
// A column is an upload when one WORD of its name says so (image, photo, file_url, attachment ...) and it is
// a text column that holds a path/URL. Words are matched whole ("profile_photo" yes, "photography_style" no),
// and names that describe the file instead of holding it (file_type, image_alt, photo_taken_at ...) don't count.
// Tune these two lists, not the logic.
const UPLOAD_WORDS = new Set(['image', 'img', 'photo', 'picture', 'pic', 'avatar', 'logo', 'thumbnail', 'thumb', 'banner', 'selfie', 'attachment', 'upload', 'file']);
const UPLOAD_NOT_LAST = new Set(['type', 'size', 'count', 'name', 'id', 'number', 'no', 'at', 'on', 'date', 'time', 'ext', 'extension', 'mime', 'alt', 'caption', 'title', 'status', 'format', 'width', 'height', 'hash', 'note', 'notes', 'amount', 'by', 'taken', 'code']);
const UPLOAD_DEFAULT_IMAGE_CLASS = 'useravatar_120'; // imageClass every upload field gets; change per field afterwards
function isUploadColumn(col) {
  const name = col.Field.toLowerCase();
  if (!/^(var)?char|text$/i.test(String(col.Type).split('(')[0])) return false; // numbers, dates, flags can't hold a path
  const tokens = name.split('_').filter(Boolean);
  if (tokens.length === 0 || /^(is|has|can|should)$/.test(tokens[0])) return false;
  const singular = (t) => (t.length > 3 && /s$/.test(t) && !/ss$/.test(t) ? t.slice(0, -1) : t);
  if (!tokens.some((t) => UPLOAD_WORDS.has(singular(t)))) return false;
  const last = singular(tokens[tokens.length - 1]);
  return !UPLOAD_NOT_LAST.has(last) || tokens.length === 1;
}

/**
 * Classifies one DB column into a schema field descriptor, or returns null
 * if the column should be dropped entirely (sensitive data).
 * `apiBase` is threaded through so groupedSelect fields can point their
 * endpoint at this module's own list API, same as the sites schema does.
 */
function classifySmartField(col, apiBase) {
  const name = col.Field;
  if (matchesAny(name, SMART_RULES.sensitive)) return null;

  const field = { key: name, label: toLabel(name), type: sqlTypeToFieldType(col.Type) };

  if (isUploadColumn(col)) {
    field.type = 'image';
    field.colSpan = 12;
    field.imageClass = UPLOAD_DEFAULT_IMAGE_CLASS;
  } else if (matchesAny(name, SMART_RULES.datetime) || field.type === 'date' || field.type === 'datetime') {
    field.type = 'datetime';
  } else if (matchesAny(name, SMART_RULES.textarea)) {
    field.type = 'textarea';
  } else if (matchesAny(name, SMART_RULES.money)) {
    field.type = 'money';
  } else if (matchesAny(name, SMART_RULES.groupedSelect)) {
    field.type = 'groupedSelect';
    field.endpoint = apiBase;
    field.groupByField = name;
  }

  // Every textarea — whether picked by name (description, notes, ...) or because
  // the DB column is TEXT/MEDIUMTEXT/LONGTEXT — spans the whole 12-column row.
  if (field.type === 'textarea') field.colSpan = 12;

  // Money columns get the grid's footer total automatically — except coordinates, which the
  // money rule also catches but are meaningless to add up.
  if (field.type === 'money' && !/^(latitude|longitude)$|_(lat|lng)$/i.test(name)) field.sum = true;

  // total_* / *_count / *_sum: summed in the grid footer. classifySmartField only ever sees columns that
  // EXIST in the table, so these are real columns - NOT flagged computed (that flag makes the backend skip
  // the column in its query, and the value would never load). Truly computed, non-DB fields (row_count and
  // the extras typed in by hand) get computed:true where they are created.
  if (matchesAny(name, SMART_RULES.computedSum) && (field.type === 'money' || field.type === 'number')) {
    field.sum = true;
  }

  if (matchesAny(name, SMART_RULES.title)) field.title = true;
  if (SMART_RULES.required.test(name) && col.Null === 'NO') field.required = true;

  if (['text', 'textarea', 'groupedSelect'].includes(field.type)) field.searchable = true;

  return field;
}

/* ================= DB HELPERS ================= */

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertIdentifier(name, label) {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${label} "${name}" — use only letters, numbers, underscores.`);
  }
}

async function createTable(connection, tableName, columnsSql) {
  assertIdentifier(tableName, 'table name');
  const sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${columnsSql})`;
  await connection.query(sql);
  console.log(`✅ Table "${tableName}" ready.`);
}

/* ================= DNA-STYLE MULTI-TABLE CREATION SCRIPT ================= */

// Parses a pasted "DNA" (Digital Nexus Architecture) creation script — the
// xxx_table_script = "..."; xxx_table = 'name'; create_table(...); block
// pattern from the Mosy tooling — into a list of { tableName, columnsSql }
// ready for createTable(). Deliberately keyed off the create_table(...)
// CALLS, not the variable naming convention: each call's 3rd/4th args say
// exactly which variable holds the table name and which holds the column
// SQL, so this still works even if a block doesn't follow the
// "x_table" / "x_table_script" naming exactly. Unrelated assignments
// elsewhere in the file (the //dna options header, etc.) are harmless —
// they just sit unused in scriptVars/nameVars unless an actual
// create_table(...) call references them.
//
// Understands TWO syntaxes, auto-detected — no flag needed, both can even
// appear in the same file since the $ sigil makes them mutually exclusive:
//   PHP:  $client_table_script = "...";   $client_table = 'clients';
//         create_table($mysqliconn, $dbname, $client_table, $client_table_script);
//   Node: const client_table_script = `...`;   const client_table = 'clients';
//         create_table(connection, dbname, client_table, client_table_script);
// Node style accepts "..." or `...` for the column script, and const/let/var.
function parseDnaCreationScript(raw) {
  const scriptVars = {}; // varName -> multi-line column SQL
  const nameVars = {};   // varName -> table name

  const collect = (regex, target, groupPicker) => {
    let m;
    while ((m = regex.exec(raw)) !== null) {
      target[m[1]] = groupPicker(m);
    }
  };

  // PHP: $varName = "...";
  collect(/\$(\w+)\s*=\s*"([\s\S]*?)"\s*;/g, scriptVars, (m) => m[2]);
  // Node: const/let/var varName = "..."; or `...`;
  collect(/(?:const|let|var)\s+(\w+)\s*=\s*(?:"([\s\S]*?)"|`([\s\S]*?)`)\s*;/g, scriptVars, (m) => m[2] !== undefined ? m[2] : m[3]);

  // PHP: $varName = '...';
  collect(/\$(\w+)\s*=\s*'([^']*)'\s*;/g, nameVars, (m) => m[2]);
  // Node: const/let/var varName = '...';
  collect(/(?:const|let|var)\s+(\w+)\s*=\s*'([^']*)'\s*;/g, nameVars, (m) => m[2]);

  const tables = [];
  const errors = [];

  const collectCalls = (regex, styleLabel) => {
    let m;
    while ((m = regex.exec(raw)) !== null) {
      const [, tableVar, scriptVar] = m;
      const tableName = nameVars[tableVar];
      const columnsSql = scriptVars[scriptVar];
      if (!tableName || !columnsSql) {
        const missing = [!tableName ? `"${tableVar}" (table name)` : null, !columnsSql ? `"${scriptVar}" (column script)` : null].filter(Boolean).join(' and ');
        errors.push(`create_table(..., ${tableVar}, ${scriptVar}) [${styleLabel}] — could not resolve ${missing}`);
        continue;
      }
      tables.push({ tableName, columnsSql: columnsSql.trim() });
    }
  };

  // PHP: create_table($mysqliconn, $dbname, $x, $y);
  collectCalls(/create_table\(\s*\$\w+\s*,\s*\$\w+\s*,\s*\$(\w+)\s*,\s*\$(\w+)\s*\)\s*;/g, 'PHP');
  // Node: create_table(connection, dbname, x, y);  (bare identifiers, no $ — can't collide with the PHP regex above)
  collectCalls(/create_table\(\s*\w+\s*,\s*\w+\s*,\s*(\w+)\s*,\s*(\w+)\s*\)\s*;/g, 'Node');

  return { tables, errors };
}

const DEFAULT_DNA_FILE = 'create_table_.txt';

const DNA_STUB_CONTENT = `//dna options== Digital Nexus Architecture (DNA)
const dna_file_name = "db_creation_Script";
const create_dna = "yes"; // yes | no
const overwrite_dna_file = "yes"; // yes | no
//dna options==
//======= create table in db
//=========== CLIENTS TABLE (example — replace with your own tables)
// Double quotes here on purpose, not backticks: SQL identifiers are
// ALSO backtick-quoted (\`client_id\`), and a backtick-delimited JS
// template literal containing backtick-quoted SQL would need every
// inner backtick escaped as \\\` — double quotes sidestep that entirely.
const client_table_script = "
\`primkey\` int(11) PRIMARY KEY AUTO_INCREMENT,
\`client_id\` varchar(100) NOT NULL,
\`client_name\` varchar(255) NOT NULL,
\`phone_number\` varchar(50),
\`email\` varchar(255),
\`national_id\` varchar(100),
\`reg_date\` datetime DEFAULT CURRENT_TIMESTAMP
";
const client_table = 'clients';
create_table(connection, dbname, client_table, client_table_script);
`;

// Counts columns by lines starting with a backtick-quoted identifier
// rather than a naive split(','), since a column definition like
// \`price_per_night\` decimal(10,2) NOT NULL has a comma INSIDE it that
// would otherwise inflate the count.
function countDnaColumns(columnsSql) {
  return (columnsSql.match(/^\s*`\w+`/gm) || []).length;
}

async function interactiveCreateTablesFromScript(connection) {
  const filePathInput = await ask(`Path to DNA table-creation script [${DEFAULT_DNA_FILE}]: `);
  const filePath = filePathInput && path.isAbsolute(filePathInput)
    ? filePathInput
    : path.join(__dirname, filePathInput || DEFAULT_DNA_FILE);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, DNA_STUB_CONTENT);
    console.log(`No file found — scaffolded a starter with a worked example at ${path.relative(__dirname, filePath)}.`);
    console.log('Paste your real $xxx_table_script / $xxx_table / create_table(...) blocks in, then run this again.');
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const { tables, errors } = parseDnaCreationScript(raw);

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} create_table(...) call(s) couldn't be resolved:`);
    errors.forEach((e) => console.log(`   - ${e}`));
  }

  if (tables.length === 0) {
    return console.log('No valid create_table(...) blocks found in this file.');
  }

  const [existingRows] = await connection.query('SHOW TABLES');
  const existingNames = new Set(existingRows.map((row) => Object.values(row)[0]));

  console.log(`\nDetected ${tables.length} table(s) in ${path.relative(__dirname, filePath)}:`);
  tables.forEach((t, i) => {
    const colCount = countDnaColumns(t.columnsSql);
    const status = existingNames.has(t.tableName) ? 'already exists — IF NOT EXISTS will leave it untouched' : 'new';
    console.log(`  ${i + 1}. ${t.tableName}  (${colCount} columns, ${status})`);
  });

  const pickInput = await ask('\nPick which to create — number(s) comma-separated, "a" for all, blank to cancel: ');
  if (!pickInput) return console.log('Cancelled.');

  let selected;
  if (pickInput.toLowerCase() === 'a') {
    selected = tables;
  } else {
    const indices = pickInput.split(',').map((s) => parseInt(s.trim(), 10) - 1);
    selected = indices.map((i) => tables[i]).filter(Boolean);
    if (selected.length === 0) return console.log('Cancelled — no valid selection.');
  }

  console.log(`\nAbout to run CREATE TABLE IF NOT EXISTS for: ${selected.map((t) => t.tableName).join(', ')}`);
  if (!(await askYesNo('Proceed? (y/n) '))) return console.log('Cancelled.');

  for (const t of selected) {
    await createTable(connection, t.tableName, t.columnsSql);
  }
}

async function addColumn(connection, tableName, columnName, columnDef) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(columnName, 'column name');
  const sql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDef}`;
  await connection.query(sql);
  console.log(`✅ Added column "${columnName}" to "${tableName}".`);
}

async function dropColumn(connection, tableName, columnName) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(columnName, 'column name');
  const sql = `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``;
  await connection.query(sql);
  console.log(`✅ Dropped column "${columnName}" from "${tableName}".`);
}

// Reconstructs a full column definition (type + null + default + extra)
// from a SHOW COLUMNS row. Needed because MySQL's CHANGE COLUMN / MODIFY
// COLUMN both require restating the ENTIRE definition, not just the piece
// you're changing — leave off AUTO_INCREMENT/DEFAULT and the column
// silently loses it. Same numeric-vs-quoted default detection already
// used in interactiveCreateTable/interactiveAddColumn above, so a numeric
// default doesn't come out wrapped in quotes.
function buildColumnDefSql(col) {
  let def = col.Type;
  def += col.Null === 'NO' ? ' NOT NULL' : ' NULL';
  if (col.Default !== null && col.Default !== undefined) {
    const raw = String(col.Default);
    const isExpr = /^CURRENT_TIMESTAMP/i.test(raw);
    const isNumeric = /^-?\d+(\.\d+)?$/.test(raw);
    def += ` DEFAULT ${isExpr || isNumeric ? raw : `'${raw}'`}`;
  }
  if (col.Extra) def += ` ${col.Extra}`;
  return def;
}

// Uses CHANGE COLUMN (not RENAME COLUMN) so this works on MySQL 5.x too,
// not just 8.0+. `col` is the SHOW COLUMNS row for oldName — caller
// already has it from listColumns, no extra round-trip needed.
async function renameColumn(connection, tableName, oldName, newName, col) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(oldName, 'column name');
  assertIdentifier(newName, 'column name');
  const colDef = buildColumnDefSql(col);
  const sql = `ALTER TABLE \`${tableName}\` CHANGE COLUMN \`${oldName}\` \`${newName}\` ${colDef}`;
  await connection.query(sql);
  console.log(`✅ Renamed column "${oldName}" -> "${newName}" on "${tableName}".`);
}

// afterColName = null means FIRST (move to the very front of the table).
async function reorderColumn(connection, tableName, colName, col, afterColName) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(colName, 'column name');
  if (afterColName) assertIdentifier(afterColName, 'column name');
  const colDef = buildColumnDefSql(col);
  const positionSql = afterColName ? `AFTER \`${afterColName}\`` : 'FIRST';
  const sql = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${colName}\` ${colDef} ${positionSql}`;
  await connection.query(sql);
  console.log(`✅ Moved column "${colName}" to ${afterColName ? `after "${afterColName}"` : 'FIRST'} on "${tableName}".`);
}

// Changes a column's SQL type (VARCHAR -> FLOAT, BLOB -> TEXT, etc) in
// place. `colDef` is a full definition string (already built via
// buildColumnDefSql against a col object with .Type overridden) — no
// AFTER/FIRST clause, so MODIFY COLUMN leaves its position untouched,
// same as a bare column-type change would in any DB tool.
async function modifyColumnType(connection, tableName, colName, colDef) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(colName, 'column name');
  const sql = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${colName}\` ${colDef}`;
  await connection.query(sql);
  console.log(`✅ Changed type of "${colName}" on "${tableName}" -> ${colDef}`);
}

async function listColumns(connection, tableName) {
  assertIdentifier(tableName, 'table name');
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return rows;
}

/* ================= RECYCLE-ON-OVERWRITE (same approach as clone-module.js) ================= */

function buildRunTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

function backupExistingFile(filePath, runTimestamp) {
  const folder = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  let backupPath = path.join(folder, '_recycled', `${base}.${runTimestamp}${ext}`);
  let attempt = 1;
  while (fs.existsSync(backupPath)) {
    attempt += 1;
    backupPath = path.join(folder, '_recycled', `${base}.${runTimestamp}-${attempt}${ext}`);
  }

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(filePath, backupPath);
  console.log(`   ♻️  existing file backed up -> ${path.relative(__dirname, backupPath)}`);
}

// Looks for a schema file already sitting anywhere under the module root,
// under a DIFFERENT path than the one we're about to write (default
// "schema.js" at the module root, a previous custom "<Prefix><Entity>Schema.js"
// at the root, OR the current convention of living inside the API
// list-folder next to route.js). Recursive because the schema file's
// depth relative to moduleRootDir isn't fixed — frontend keeps it at the
// root, backend now colocates it with route.js one level down. Reads the
// exported const name straight out of the file so the caller can update
// every other file that still imports the old name/path.
function detectExistingSchemaFile(moduleRootDir, excludeFullPath) {
  if (!fs.existsSync(moduleRootDir)) return null;
  let found = null;

  function walk(dir) {
    if (found) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (found) return;
      if (entry.name === '_recycled' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (path.resolve(full) === path.resolve(excludeFullPath)) continue;

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name.toLowerCase() === 'schema.js' || /Schema\.js$/.test(entry.name)) {
        found = full;
      }
    }
  }

  walk(moduleRootDir);
  if (!found) return null;

  const content = fs.readFileSync(found, 'utf8');
  const varMatch = content.match(/export const (\w+)\s*=/);
  return { fileName: path.basename(found), fullPath: found, varName: varMatch ? varMatch[1] : null };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Renames every reference to the schema's old import path + exported
// symbol, in every text file under moduleRootDir except the schema file
// itself (that one's already been written under its new name). This is
// what keeps list/profile/uiControl/dataControl/logicControl/import/route
// files working after the schema file/variable gets renamed. Matches the
// import path at ANY relative depth ('./Schema', '../schema', '../../x')
// so it works whether the importer sits next to the schema file (the API's
// route.js, colocated in list/) or a level away (frontend pages) — the
// depth itself (the ../ or ./ prefix) is preserved as-is; only the file
// BASE name segment gets swapped, since a rename never changes where the
// schema file sits relative to a given importer.
function syncSchemaReferences(moduleRootDir, oldVarName, newVarName, oldFileBase, newFileBase, skipFullPath) {
  if (!fs.existsSync(moduleRootDir)) return { filesUpdated: 0 };
  let filesUpdated = 0;
  const TEXT_EXT = new Set(['.js', '.jsx', '.ts', '.tsx']);
  const pathRegex = new RegExp(`(from\\s+['"])((?:\\.\\.?\\/)*)${escapeRegExp(oldFileBase)}(['"])`, 'g');

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_recycled' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (path.resolve(full) === path.resolve(skipFullPath)) continue;

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue;

      const content = fs.readFileSync(full, 'utf8');
      pathRegex.lastIndex = 0;
      const mentionsOldPath = pathRegex.test(content);
      const mentionsOldVar = oldVarName && content.includes(oldVarName);
      if (!mentionsOldPath && !mentionsOldVar) continue;

      // Protect the import-path text behind a placeholder before doing the
      // var-name replace, then swap the placeholder in last. Needed because
      // newFileBase and newVarName are usually the SAME string (e.g. both
      // "ActiveClustersSchema") — replacing the var name first would also
      // match inside the freshly-written path text and double the prefix
      // (e.g. "ActiveActiveClustersSchema"). Doing path -> var -> unplaceholder
      // avoids that regardless of whether old/new names overlap.
      const PATH_PLACEHOLDER = '__DB_CLI_SCHEMA_PATH__';
      pathRegex.lastIndex = 0;
      let updated = content.replace(pathRegex, (m, prefix, dots, suffix) => `${prefix}${dots}${PATH_PLACEHOLDER}${suffix}`);
      if (oldVarName) {
        updated = updated.split(oldVarName).join(newVarName);
      }
      updated = updated.split(PATH_PLACEHOLDER).join(newFileBase);

      if (updated !== content) {
        fs.writeFileSync(full, updated);
        filesUpdated += 1;
      }
    }
  }

  walk(moduleRootDir);
  return { filesUpdated };
}

/* ================= PROMPT HELPERS ================= */

// Tab-completion for table names. `completionWords` is only filled while a
// prompt that expects a table name is active (see askWithTables), so Tab does
// nothing at every other prompt. completionIsList = the prompt takes a bulk
// list ("t1 -> Mod --x, t2 -> ..."): then only the word at the START of the
// current entry is completed — never the module name after "->" or a flag.
let completionWords = [];
let completionIsList = false;

function tableCompleter(line) {
  if (completionWords.length === 0) return [[], line];
  let segment = line;
  if (completionIsList) {
    segment = line.slice(Math.max(line.lastIndexOf(','), line.lastIndexOf(';')) + 1).trimStart();
    if (/\s/.test(segment)) return [[], line]; // past the table name already (arrow, module, flags)
  }
  const word = (segment.match(/(\S*)$/) || ['', ''])[1];
  const hits = completionWords.filter((w) => w.toLowerCase().startsWith(word.toLowerCase()));
  return [hits, word];
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, completer: tableCompleter });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

let tableNameCache = [];
async function refreshTableNames(connection) {
  const [rows] = await connection.query('SHOW TABLES');
  tableNameCache = rows.map((row) => Object.values(row)[0]).sort();
  return tableNameCache;
}

// Prints table names in aligned columns that fit the terminal width.
function printTableNames(names = tableNameCache, { csv = false } = {}) {
  if (names.length === 0) return console.log('  (no tables yet)');
  const width = process.stdout.columns || 100;
  const colWidth = Math.min(Math.max(...names.map((n) => n.length)) + 2, width - 2);
  const perRow = Math.max(1, Math.floor((width - 2) / colWidth));
  console.log(`\nTables in "${DB_CONFIG.database}" (${names.length}):`);
  for (let i = 0; i < names.length; i += perRow) {
    console.log('  ' + names.slice(i, i + perRow).map((n) => n.padEnd(colWidth)).join('').trimEnd());
  }
  // One comma-separated line, ready to copy and paste (then delete the tables you don't want).
  if (csv) console.log(`\nAs a comma-separated list (copy / paste, then trim):\n${names.join(',')}`);
  console.log('');
}

// Like ask(), but Tab completes table names (press Tab twice to list all
// matches). asList = the answer is a bulk list, not a single table name.
async function askWithTables(q, { asList = false } = {}) {
  completionWords = tableNameCache;
  completionIsList = asList;
  try {
    return await ask(q);
  } finally {
    completionWords = [];
    completionIsList = false;
  }
}
// Bulk-list history: every list you build is saved (one per line) in db-cli-bulk-history.txt next to this
// script, newest last. At the bulk prompt, Up/Down walk through them like shell history; Enter re-runs one
// (edit it first if you like). The file is plain text — delete a line to forget it, or paste your own lists in.
const BULK_HISTORY_FILE = path.join(__dirname, 'db-cli-bulk-history.txt');
const BULK_HISTORY_MAX = 50;

function loadBulkHistory() {
  try {
    return fs.readFileSync(BULK_HISTORY_FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (e) { return []; }
}

function saveBulkHistory(entry) {
  const line = String(entry).replace(/\s*[\r\n]+\s*/g, ', ').trim();
  if (!line) return;
  try {
    const list = loadBulkHistory().filter((l) => l !== line); // re-using a list moves it to the newest slot
    list.push(line);
    fs.writeFileSync(BULK_HISTORY_FILE, `${list.slice(-BULK_HISTORY_MAX).join('\n')}\n`);
  } catch (e) { /* history is a convenience; never block a build */ }
}

// Like askWithTables, but Up/Down recall the saved bulk lists instead of earlier menu answers.
async function askBulkLine(q) {
  const previous = rl.history;
  rl.history = loadBulkHistory().reverse(); // readline wants newest first
  try {
    return await askWithTables(q, { asList: true });
  } finally {
    rl.history = previous;
  }
}

async function askYesNo(q) {
  return /^(y|yes)$/i.test(await ask(q));
}
// Same as askYesNo but blank Enter counts as "yes" — for prompts where the
// safe/expected default IS proceeding (e.g. "use these smart defaults?"),
// as opposed to destructive confirmations where blank should mean "no".
async function askYesNoDefaultYes(q) {
  const answer = (await ask(q)).toLowerCase();
  return answer === '' || answer === 'y' || answer === 'yes';
}

async function pickType() {
  console.log('\n  Type:');
  TYPE_CHOICES.forEach((t, i) => console.log(`    ${i + 1}. ${t}  (${TYPE_MAP[t]})`));
  const choice = await ask('  Pick a number [1]: ');
  const key = TYPE_CHOICES[parseInt(choice || '1', 10) - 1] || 'text';
  return TYPE_MAP[key];
}

// Separate from pickType/TYPE_MAP on purpose — TYPE_MAP is the small,
// schema-field-oriented set used when CREATING a column from scratch.
// Modifying an EXISTING column's type needs to reach things TYPE_MAP
// doesn't cover at all (BLOB, ENUM, JSON, LONGTEXT) and needs to accept
// an arbitrary raw SQL type (e.g. "VARCHAR(100)", "ENUM('a','b')") since
// there's no way to enumerate every legal MySQL type up front.
const RAW_TYPE_PRESETS = [
  'VARCHAR(255)', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'INT', 'BIGINT', 'DECIMAL(12,2)', 'FLOAT', 'DOUBLE',
  'DATE', 'DATETIME', 'TINYINT(1)', 'BLOB', 'LONGBLOB', 'JSON',
];

async function pickRawSqlType(currentType) {
  console.log(`\n  Current type: ${currentType}`);
  console.log('  Pick a new type, or type your own raw SQL type directly (e.g. VARCHAR(100), ENUM(\'a\',\'b\')):');
  RAW_TYPE_PRESETS.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
  const choice = await ask('  Number, or raw SQL type (blank = keep current): ');
  if (!choice) return currentType;
  const idx = parseInt(choice, 10);
  if (!isNaN(idx) && RAW_TYPE_PRESETS[idx - 1]) return RAW_TYPE_PRESETS[idx - 1];
  return choice; // treat as a raw type string typed in directly
}

/* ================= .ENV VIEW / EDIT ================= */

const ENV_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const ENV_PATH = path.join(__dirname, '.env');

const ENV_TO_CONFIG_KEY = { DB_HOST: 'host', DB_USER: 'user', DB_PASS: 'password', DB_NAME: 'database' };

function maskValue(key, value) {
  if (key === 'DB_PASS' && value) return '*'.repeat(value.length);
  return value || '(empty)';
}

async function interactiveViewEditEnv() {
  const current = loadEnv();
  console.log('');
  diagnoseEnv();
  console.log('');
  ENV_KEYS.forEach((key) => {
    const value = current[key] !== undefined ? current[key] : `(using default: ${DB_CONFIG[ENV_TO_CONFIG_KEY[key]] || '(empty)'})`;
    console.log(`  ${key} = ${key === 'DB_PASS' && current[key] !== undefined ? maskValue(key, current[key]) : value}`);
  });

  if (!(await askYesNo('\nEdit these values? (y/n) '))) return;

  const updated = { ...current };
  for (const key of ENV_KEYS) {
    const existing = current[key] || '';
    const prompt = key === 'DB_PASS'
      ? `  ${key} [${maskValue(key, existing)}] (blank = keep current): `
      : `  ${key} [${existing || '(empty)'}] (blank = keep current): `;
    const input = await ask(prompt);
    if (input !== '') updated[key] = input;
  }

  const content = ENV_KEYS.map((key) => `${key}=${updated[key] || ''}`).join('\n') + '\n';
  fs.writeFileSync(ENV_PATH, content);
  console.log(`\n✅ Saved to ${ENV_PATH}`);
  console.log('👉 Restart db-cli.js for the new values to take effect (the current connection stays on the old ones).');
}

async function interactiveCreateTable(connection) {
  const tableName = await ask('\nTable name: ');
  if (!tableName) return console.log('Cancelled — no table name given.');

  const columns = ['`id` int(11) PRIMARY KEY AUTO_INCREMENT'];
  console.log('Add columns one at a time. Leave name blank when done.\n');

  while (true) {
    const colName = await ask(`Column ${columns.length} name (blank to finish): `);
    if (!colName) break;

    const sqlType = await pickType();
    const required = await askYesNo('  Required? (y/n) [n]: ');
    const defaultVal = await ask('  Default value (blank for none): ');

    let line = `\`${colName}\` ${sqlType} ${required ? 'NOT NULL' : 'NULL'}`;
    if (defaultVal) {
      const isNumeric = /^-?\d+(\.\d+)?$/.test(defaultVal);
      line += ` DEFAULT ${isNumeric ? defaultVal : `'${defaultVal}'`}`;
    }
    columns.push(line);
    console.log(`  ✅ added: ${line}\n`);
  }

  columns.push('`created_at` datetime DEFAULT CURRENT_TIMESTAMP');
  const columnsSql = columns.join(',\n  ');
  console.log(`\nAbout to run:\nCREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${columnsSql}\n)\n`);

  if (await askYesNo('Create this table? (y/n) ')) {
    await createTable(connection, tableName, columnsSql);
  } else {
    console.log('Cancelled.');
  }
}

async function pickExistingTable(connection, promptLabel = 'Pick a table (number): ') {
  const [tables] = await connection.query('SHOW TABLES');
  const tableNames = tables.map((row) => Object.values(row)[0]);
  if (tableNames.length === 0) {
    console.log('No tables found — create one first.');
    return null;
  }
  console.log('\nTables:');
  tableNames.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  tableNameCache = [...tableNames].sort();
  const choice = await askWithTables(promptLabel.replace(/: ?$/, ' — or type the name, Tab completes: '));
  return tableNames[parseInt(choice, 10) - 1] || tableNames.find((t) => t === choice) || null;
}

async function interactiveAddColumn(connection) {
  const tableName = await pickExistingTable(connection);
  if (!tableName) return console.log('Cancelled.');

  const colName = await ask('New column name: ');
  if (!colName) return console.log('Cancelled — no column name given.');

  const sqlType = await pickType();
  const required = await askYesNo('  Required? (y/n) [n]: ');
  const defaultVal = await ask('  Default value (blank for none): ');

  let columnDef = `${sqlType} ${required ? 'NOT NULL' : 'NULL'}`;
  if (defaultVal) {
    const isNumeric = /^-?\d+(\.\d+)?$/.test(defaultVal);
    columnDef += ` DEFAULT ${isNumeric ? defaultVal : `'${defaultVal}'`}`;
  }

  console.log(`\nAbout to run:\nALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${columnDef}\n`);
  if (await askYesNo('Add this column? (y/n) ')) {
    await addColumn(connection, tableName, colName, columnDef);
  } else {
    console.log('Cancelled.');
  }
}

async function interactiveDropColumn(connection) {
  const tableName = await pickExistingTable(connection);
  if (!tableName) return console.log('Cancelled.');

  const columns = await listColumns(connection, tableName);
  columns.forEach((c, i) => console.log(`  ${i + 1}. ${c.Field}`));
  const colName = columns[parseInt(await ask('Pick a column to drop (number): '), 10) - 1]?.Field;
  if (!colName) return console.log('Cancelled.');

  if (await askYesNo(`⚠️  Permanently delete "${colName}" and its data? (y/n) `)) {
    await dropColumn(connection, tableName, colName);
  } else {
    console.log('Cancelled.');
  }
}

async function interactiveRenameColumn(connection) {
  const tableName = await pickExistingTable(connection);
  if (!tableName) return console.log('Cancelled.');

  const columns = await listColumns(connection, tableName);
  columns.forEach((c, i) => console.log(`  ${i + 1}. ${c.Field}  (${c.Type})`));
  const col = columns[parseInt(await ask('Pick a column to rename (number): '), 10) - 1];
  if (!col) return console.log('Cancelled.');

  if (col.Key === 'PRI') {
    console.log('⚠️  This is the primary key — renaming it will break anything hardcoded to its old name (routes, joins, schema.js).');
    if (!(await askYesNo('Still continue? (y/n) '))) return console.log('Cancelled.');
  }

  const newName = await ask(`New name for "${col.Field}": `);
  if (!newName) return console.log('Cancelled — no new name given.');
  if (newName === col.Field) return console.log('Cancelled — new name is the same as the current one.');

  console.log(`\nAbout to run:\nALTER TABLE \`${tableName}\` CHANGE COLUMN \`${col.Field}\` \`${newName}\` ${buildColumnDefSql(col)}\n`);
  console.log('⚠️  Renaming a DB column does NOT update schema.js — the field key there will now');
  console.log('   point at a column that no longer exists. Rebuild the schema (menu option 7) or');
  console.log('   hand-edit both schema.js files (frontend + backend) right after this.');

  if (await askYesNo('Rename this column? (y/n) ')) {
    await renameColumn(connection, tableName, col.Field, newName, col);
  } else {
    console.log('Cancelled.');
  }
}

async function interactiveReorderColumn(connection) {
  const tableName = await pickExistingTable(connection);
  if (!tableName) return console.log('Cancelled.');

  const columns = await listColumns(connection, tableName);
  columns.forEach((c, i) => console.log(`  ${i + 1}. ${c.Field}  (${c.Type})`));
  const col = columns[parseInt(await ask('Pick a column to move (number): '), 10) - 1];
  if (!col) return console.log('Cancelled.');

  console.log(`\nMove "${col.Field}" to:`);
  console.log('  0. FIRST (top of table)');
  columns.forEach((c, i) => {
    if (c.Field !== col.Field) console.log(`  ${i + 1}. right after "${c.Field}"`);
  });

  const posChoice = await ask('Pick a position (number): ');
  let afterColName = null; // null == FIRST

  if (posChoice !== '0') {
    const target = columns[parseInt(posChoice, 10) - 1];
    if (!target || target.Field === col.Field) return console.log('Cancelled — invalid position.');
    afterColName = target.Field;
  }

  console.log(`\nAbout to run:\nALTER TABLE \`${tableName}\` MODIFY COLUMN \`${col.Field}\` ${buildColumnDefSql(col)} ${afterColName ? `AFTER \`${afterColName}\`` : 'FIRST'}\n`);
  console.log('ℹ️  This only changes physical column order in the DB. schema.js field/section order');
  console.log('   is independent — edit `sections[].fields` there to change display order.');

  if (await askYesNo('Move this column? (y/n) ')) {
    await reorderColumn(connection, tableName, col.Field, col, afterColName);
  } else {
    console.log('Cancelled.');
  }
}

async function interactiveModifyColumnType(connection) {
  const tableName = await pickExistingTable(connection);
  if (!tableName) return console.log('Cancelled.');

  const columns = await listColumns(connection, tableName);
  columns.forEach((c, i) => console.log(`  ${i + 1}. ${c.Field}  (${c.Type})`));
  const col = columns[parseInt(await ask('Pick a column to change type (number): '), 10) - 1];
  if (!col) return console.log('Cancelled.');

  console.log(`\nCurrent: \`${col.Field}\` ${buildColumnDefSql(col)}`);

  const newType = await pickRawSqlType(col.Type);
  if (newType === col.Type) return console.log('Cancelled — type unchanged.');

  const nullDefaultSummary = `${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}${col.Default != null ? `, DEFAULT ${col.Default}` : ''}`;
  const keepNullDefault = await askYesNoDefaultYes(`Keep current NULL/DEFAULT settings (${nullDefaultSummary})? (Enter = yes) `);

  let newCol = { ...col, Type: newType };
  if (!keepNullDefault) {
    const required = await askYesNo('  Required (NOT NULL)? (y/n) [n]: ');
    newCol.Null = required ? 'NO' : 'YES';
    const defaultVal = await ask('  Default value (blank for none): ');
    newCol.Default = defaultVal || null;
  }

  const colDef = buildColumnDefSql(newCol);

  console.log(`\nAbout to run:\nALTER TABLE \`${tableName}\` MODIFY COLUMN \`${col.Field}\` ${colDef}\n`);
  console.log(`⚠️  Changing "${col.Field}" from ${col.Type} -> ${newType} can lose or truncate data`);
  console.log('   already in the table (non-numeric text into a numeric type, oversized values into a');
  console.log('   smaller one, binary data through a text type, etc). MySQL will either reject rows it');
  console.log('   can\'t convert or silently truncate/zero them depending on sql_mode — back up first');
  console.log('   if this table has data you care about.');
  console.log('ℹ️  schema.js\'s field `type` (text/money/select/etc.) is a separate UI-level concept —');
  console.log('   update it by hand, or rebuild via menu option 8, to match the new column type.');

  if (await askYesNo("Change this column's type? (y/n) ")) {
    await modifyColumnType(connection, tableName, col.Field, colDef);
  } else {
    console.log('Cancelled.');
  }
}

async function interactiveListColumns(connection) {
  const tableName = await pickExistingTable(connection);
  if (!tableName) return console.log('Cancelled.');

  const columns = await listColumns(connection, tableName);
  console.table(columns.map((c) => ({ Field: c.Field, Type: c.Type, Null: c.Null, Default: c.Default })));
}

// Port of the old PHP dump script: for one table (or every table when left
// blank) prints "//Table name : x" then "// columns : "a" , "b" , ..." in
// the exact same format — this is the raw text format schemamap.txt gets
// hand-built from, so a straight paste of this output is enough to build
// a schema map from without touching phpMyAdmin or the old PHP endpoint.
//
// Simplification vs the PHP version: that used
// `SHOW TABLES FROM db WHERE Tables_in_db = 'x'`, which depends on
// reconstructing the dynamic `Tables_in_<dbname>` column name. Fetching
// all table names with a plain SHOW TABLES and filtering client-side (exact
// match, same as the PHP's `=`, not a LIKE wildcard) gets the identical
// result without that fragility.
async function interactiveDumpTablesAndColumns(connection) {
  await refreshTableNames(connection);
  const filter = await askWithTables('Filter to one table — Tab completes (blank = dump ALL tables): ');

  const [tableRows] = await connection.query('SHOW TABLES');
  let tableNames = tableRows.map((row) => Object.values(row)[0]);

  if (filter) {
    tableNames = tableNames.filter((t) => t === filter);
    if (tableNames.length === 0) {
      return console.log(`No table named "${filter}" found.`);
    }
  }

  let output = '';
  for (const tableName of tableNames) {
    const columns = await listColumns(connection, tableName);
    output += `//Table name : ${tableName}\n\n`;
    output += '// columns : ' + columns.map((c) => `"${c.Field}"`).join(' , ') + ' , \n\n';
  }

  console.log('\n' + output);

  const defaultOutName = `${DB_CONFIG.database}-tables-dump.txt`;
  const saveChoice = await ask(`Save this to a file too? (Enter = yes, "${defaultOutName}" / n = skip / type a different filename): `);

  if (saveChoice.toLowerCase() === 'n') return;

  const outFileName = saveChoice && saveChoice.toLowerCase() !== 'y' ? saveChoice : defaultOutName;
  const outPath = path.join(__dirname, outFileName);

  if (fs.existsSync(outPath)) {
    backupExistingFile(outPath, buildRunTimestamp());
  }
  fs.writeFileSync(outPath, output);
  console.log(`✅ Written to ${path.relative(__dirname, outPath)}`);
}


// Maps a MySQL column type to a schema field type
function sqlTypeToFieldType(sqlType) {
  const t = sqlType.toLowerCase();
  if (t.startsWith('decimal') || t.startsWith('float') || t.startsWith('double')) return 'money';
  if (t.startsWith('int') || t.startsWith('bigint') || t.startsWith('smallint')) return 'number';
  if (t === 'tinyint(1)') return 'boolean';
  if (t === 'text' || t === 'longtext' || t === 'mediumtext') return 'textarea';
  if (t === 'date') return 'date';
  if (t === 'datetime' || t === 'timestamp') return 'datetime';
  return 'text';
}

// Friendlier default labels for system columns (key -> label).
const LABEL_OVERRIDES = { reg_date: 'Created On' };

function toLabel(fieldKey) {
  if (LABEL_OVERRIDES[fieldKey]) return LABEL_OVERRIDES[fieldKey];
  return fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Module (screen) names for people: "fuel_sales" -> "Fuel sales", "sales_kra_logs" -> "Sales KRA logs".
// Words in MODULE_ACRONYMS print in capitals; add your own.
const MODULE_ACRONYMS = new Set(['kra', 'sms', 'pos', 'api', 'url', 'vat', 'kyc', 'ussd', 'etims', 'gps', 'qr', 'otp', 'atm', 'erp', 'crm', 'id', 'ip', 'tv', 'fdc', 'lpg']);
function formatModuleWords(words) {
  const list = words.filter(Boolean);
  const out = list.map((w) => (MODULE_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  if (out.length && !MODULE_ACRONYMS.has(list[0].toLowerCase())) out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1);
  return out.join(' ');
}
// "Fuel deliveries" -> "Fuel delivery", "Business branches" -> "Business branch", "Fuel sales" -> "Fuel sale"
function singularLabel(text) {
  const parts = text.split(' ');
  let w = parts[parts.length - 1];
  if (!(w.length > 1 && w === w.toUpperCase())) {
    if (/ies$/i.test(w) && w.length > 4) w = `${w.slice(0, -3)}y`;
    else if (/(ss|us|is)$/i.test(w)) { /* status, analysis, business: already singular */ }
    else if (/(ch|sh|x|z|ss)es$/i.test(w)) w = w.slice(0, -2);
    else if (/s$/i.test(w)) w = w.slice(0, -1);
  }
  parts[parts.length - 1] = w;
  return parts.join(' ');
}

function toPascalCase(str) {
  return str.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

// Fields every table has that shouldn't become editable schema fields.
const SCHEMA_AUTO_FIELDS = new Set(['created_at', 'updated_at']);

// Columns that should be dropped from the FRONTEND schema entirely (not
// just an attribute trimmed off them, like label/searchable — the whole
// field entry, plus any showInList/sections reference to it). They still
// flow into the BACKEND schema untouched, since the backend/API may still
// need them (e.g. a cached join column paired with its id column). Add
// more field names here as needed — this is the one place to edit.
const FRONTEND_SKIP_FIELDS = new Set(['hive_site_id', 'hive_site_name']);

// Serializes a field descriptor object into a single schema.js field-entry
// line. `excludeKeys` lets each output target (frontend vs backend) drop
// attributes it doesn't want without needing two separate classification
// passes — the field OBJECT is always built with every attribute; only the
// serialized STRING differs per target.
//
// `endpointAsModuleApi`: a groupedSelect field's `endpoint` is always this
// module's OWN apiBase (set in classifySmartField) — same value `moduleApi`
// already resolves live at the top of the FRONTEND schema file. Hardcoding
// it as a quoted string duplicates that URL and goes stale the same way
// the old apiBase/apiRoutes.json duplication did; emit a bare `moduleApi`
// reference instead. Frontend-only: the BACKEND schema has no `moduleApi`
// in scope (no getApiRoutes import there), so it keeps the literal string.
function serializeFieldEntry(field, excludeKeys = [], endpointAsModuleApi = false) {
  const parts = Object.entries(field)
    .filter(([k]) => !excludeKeys.includes(k))
    .map(([k, v]) => {
      if (endpointAsModuleApi && k === 'endpoint' && field.type === 'groupedSelect') {
        return `${k}: moduleApi`;
      }
      return typeof v === 'string' ? `${k}: '${v}'` : `${k}: ${v}`;
    });
  return `{ ${parts.join(', ')} },`;
}

function buildSystemFieldObject(col) {
  const type = sqlTypeToFieldType(col.Type);
  return { key: col.Field, label: toLabel(col.Field), type, system: true, editable: false };
}

/* ================= AUTO-LINK TO GLOBAL RELATIONS (schemamap.js output) ================= */

// If a globalRelations.js (generated by schemamap.js) already exists for
// this app, reads it back so interactiveBuildSchema can automatically
// swap a plain FK-looking column for a ...resolveField(...)/...resolveJoin(...)
// call instead of a hand-typed field — same as you'd add by hand
// afterward, just done up front. Returns null (feature silently skipped,
// schema builds exactly as before) if no map exists yet for this app.
//
// Reads the FRONTEND copy specifically (app/<ns>/DataControl/<ns>Schema.js)
// since it's the one whose location is known without yet knowing which
// module/apiListFolder we're building — the relation KEYS are identical on
// both sides anyway (resolveField/resolveJoin are just two different
// shapes derived from the same globalRelations object), so either copy
// would give the same match results.
function loadGlobalRelationsMap(appNamespace) {
  if (!appNamespace) return null;
  const relationsPath = path.join(__dirname, 'app', appNamespace, 'DataControl', `${appNamespace}Schema.js`);
  if (!fs.existsSync(relationsPath)) {
    // Was previously silent here — the only path a "why didn't it link"
    // debugging session had was the generic "no global relations map
    // found yet" message further down, with no way to tell a genuinely
    // missing file apart from db-cli.js just looking in the wrong place
    // (e.g. db-cli.js's own folder isn't the same project root
    // schemamap.js was run from). Printing the exact path checked turns
    // that into a one-look diagnosis.
    console.log(`   (checked for a global relations map at ${relationsPath} — not found)`);
    return null;
  }

  const content = fs.readFileSync(relationsPath, 'utf8');
  const match = content.match(/export const globalRelations = (\{[\s\S]*?\n\});/);
  if (!match) {
    console.log(`⚠️  Found ${path.relative(__dirname, relationsPath)} but couldn't locate its globalRelations object — building fields normally.`);
    return null;
  }

  try {
    // Trusted content: this file only ever contains what schemamap.js
    // itself generated, not arbitrary user/DB input — same trust level as
    // the rest of this local dev tool.
    // eslint-disable-next-line no-eval
    // The extracted object text can reference `apiRoute.<key>.base`
    // (schemamap.js now emits live endpoint lookups, not string
    // literals) — but that `apiRoute` was declared OUTSIDE the slice
    // we're eval-ing (`const apiRoute = getApiRoutes();`, a few lines up
    // in the real file), so evaluating the object text in isolation
    // would throw "apiRoute is not defined". Doesn't matter for OUR
    // purposes: matchColumnToRelation/buildResolveCallLine below only
    // ever read `.table` and `.cacheField` off each relation, never
    // `.endpoint` — that only matters at runtime in the browser. A
    // stub that swallows any property access (self-referential Proxy,
    // so `apiRoute.systemusers.base` and any other depth all resolve
    // without throwing) is all `eval` needs to succeed here.
    const apiRoute = new Proxy({}, { get: (_, __) => apiRoute });
    const globalRelations = eval('(' + match[1] + ')');
    return { relationsPath, globalRelations };
  } catch (err) {
    console.log(`⚠️  Found ${path.relative(__dirname, relationsPath)} but couldn't parse its globalRelations object (${err.message}) — building fields normally.`);
    return null;
  }
}

// Finds the best relation match for a DB column name. Exact match first
// (no key override needed — the column IS the relation key), then a
// suffix match for renamed FK columns (e.g. "sold_by_staff_id" matching
// the "staff_id" relation, same pattern used by hand in FuelsalesSchema).
// Longest relation key wins on suffix matches, so a more specific relation
// is preferred over a shorter, coincidental one. Polymorphic "__" keys
// (e.g. "related_record_id__app_users") can't realistically suffix-match
// a real column name, so ambiguous columns correctly fall through
// unmatched rather than getting silently (and maybe wrongly) resolved.
// Returns null if nothing matches; caller falls through to normal column
// classification.
function matchColumnToRelation(columnName, globalRelations) {
  const keys = Object.keys(globalRelations);
  if (keys.includes(columnName)) {
    return { relationKey: columnName, needsKeyOverride: false };
  }
  const suffixMatches = keys
    .filter((k) => columnName.endsWith(`_${k}`))
    .sort((a, b) => b.length - a.length);
  if (suffixMatches.length > 0) {
    return { relationKey: suffixMatches[0], needsKeyOverride: true };
  }
  return null;
}

// Builds the "..resolveField('x')" / "...resolveJoin('x')" call text for a
// matched column. Adds { key: '...' } only when the real column name
// differs from the relation key, and always adds { as: '...' } set to the
// relation's own cacheField — so the cache column on the row comes out as
// something readable ("station_name") instead of the auto-generated
// "_fuel_stations_station_name_location_id" default.
function buildResolveCallLine(fnName, linked, indent) {
  const overrideParts = [];
  if (linked.needsKeyOverride) overrideParts.push(`key: '${linked.columnKey}'`);
  if (linked.as) overrideParts.push(`as: '${linked.as}'`);
  // resolveField (the form input) gets a third-of-a-row width by default;
  // resolveJoin is backend-only, where a UI width means nothing.
  if (fnName === 'resolveField') overrideParts.push('colSpan: 4');
  const overrides = overrideParts.length ? `, { ${overrideParts.join(', ')} }` : '';
  return `${indent}...${fnName}('${linked.relationKey}'${overrides}),`;
}

// `preset` (bulk mode only): { tableName, moduleName, pascalName, listName, writeChoice }.
// When given, every question is answered from the preset / sensible defaults
// instead of asked — table, module name, list name, "use these defaults",
// extra computed fields (none) and the write target. The one prompt that
// still appears is the stale-schema "recycle the old file?" question, because
// that one rewrites other files and shouldn't be auto-answered.
// Returns true when something was written, so the bulk loop can report it.
async function interactiveBuildSchema(connection, preset = null) {
  const bulk = !!preset;
  const tableName = bulk ? preset.tableName : await pickExistingTable(connection, 'Pick a table to introspect (number): ');
  if (!tableName) return console.log('Cancelled.');

  const defaultModuleName = (bulk && preset.moduleName) || tableName.replace(/_/g, '');
  const defaultAppNamespace = path.basename(__dirname);

  // Single custom-name input, matching clone-module.js's --list-name.
  // clone-module.js always derives BOTH the API list-subfolder name AND
  // the schema file/variable prefix from the SAME --list-name value (see
  // clone-module.js's customPrefixCap) — they are never independently
  // chosen there, so asking for them separately here just reintroduces
  // the mismatch risk (schema written under a name route.js never
  // imports) in a different shape. One answer drives both.
  //
  // Guard: if what's typed is actually the module/entity name itself
  // (not a genuine custom name like "active"), it's not really a
  // --list-name value — using it as a schema prefix would double the
  // entity (e.g. module "deals" + prefix "deals" -> "DealsDealsSchema").
  // In that case it's still honored as the folder name, but NOT applied
  // as a schema prefix (treated the same as leaving it blank there).
  const customNameInput = bulk
    ? (preset.listName || '')
    : await ask(`Custom name used with clone-module.js's --list-name (blank = default "list" folder / plain schema naming, e.g. "active"): `);
  const apiListFolder = customNameInput || 'list';
  const looksLikeModuleNameItself = customNameInput && customNameInput.toLowerCase() === defaultModuleName.toLowerCase();
  if (looksLikeModuleNameItself) {
    console.log(`   ⚠️  "${customNameInput}" matches the module name itself — using it as the API folder name, but NOT as a schema prefix (that would double up to "${toPascalCase(defaultModuleName)}${toPascalCase(defaultModuleName)}Schema"). If you meant a genuine custom name like "active", re-enter it.`);
  }
  // "ActiveCustomers" + list name "active" -> the module name already carries
  // the prefix, so don't add it again (would give ActiveActiveCustomersSchema).
  // clone-module.js applies the same rule in every mode, keeping names equal.
  const prefixAlreadyInModule = customNameInput && !looksLikeModuleNameItself
    && defaultModuleName.toLowerCase().startsWith(customNameInput.toLowerCase());
  if (prefixAlreadyInModule) {
    console.log(`   ℹ️  Module "${defaultModuleName}" already starts with "${customNameInput}" — using it as the API folder name, not adding it again as a schema prefix.`);
  }
  const schemaPrefixSeed = (looksLikeModuleNameItself || prefixAlreadyInModule) ? '' : customNameInput;

  const defaultApiBase = `/api/${defaultAppNamespace}/${defaultModuleName}/${apiListFolder}`;
  const defaultImportApiBase = `/api/${defaultAppNamespace}/${defaultModuleName}/import`;

  console.log(`\nDefaults for "${tableName}":`);
  console.log(`  moduleName  = ${defaultModuleName}`);
  console.log(`  appNamespace = ${defaultAppNamespace}`);
  console.log(`  apiBase     = ${defaultApiBase}`);
  console.log(`  importApiBase = ${defaultImportApiBase}`);

  let moduleName = defaultModuleName;
  let appNamespace = defaultAppNamespace;
  let apiBase = defaultApiBase;
  let importApiBase = defaultImportApiBase;

  if (!bulk && !(await askYesNoDefaultYes('Use these? (Enter = yes, n = edit one at a time) '))) {
    moduleName = (await ask(`Module name (variable/folder name) [${defaultModuleName}]: `)) || defaultModuleName;
    const appNamespaceInput = await ask(`App namespace [${defaultAppNamespace}] (type "-" for none): `);
    appNamespace = appNamespaceInput === '-' ? '' : (appNamespaceInput || defaultAppNamespace);
    const recomputedApiBase = appNamespace ? `/api/${appNamespace}/${moduleName}/${apiListFolder}` : `/api/${moduleName}/${apiListFolder}`;
    apiBase = (await ask(`apiBase [${recomputedApiBase}]: `)) || recomputedApiBase;
    // importApiBase is recomputed from moduleName/appNamespace directly
    // (module root), NOT derived from apiBase — apiBase now points inside
    // the list subfolder, but import/route.js never moves.
    const recomputedImportApiBase = appNamespace ? `/api/${appNamespace}/${moduleName}/import` : `/api/${moduleName}/import`;
    importApiBase = (await ask(`importApiBase [${recomputedImportApiBase}]: `)) || recomputedImportApiBase;
  }

  // Schema prefix follows the SAME custom-name answer given above for the
  // API folder (schemaPrefixSeed) — this is what clone-module.js actually
  // does (one --list-name value drives both). Re-guard against the FINAL
  // moduleName here in case it was overridden in the manual-edit block
  // above, so a late-typed module name can't reintroduce the duplication.
  // Bulk entries keep the casing typed in the list ("CreditNote"), so the
  // schema variable matches what clone-module.js produces from the same list
  // ("CreditNoteSchema"), instead of flattening to "CreditnoteSchema".
  const pascalModule = (bulk && preset.pascalName && preset.pascalName.toLowerCase() === moduleName.toLowerCase())
    ? preset.pascalName
    : toPascalCase(moduleName);
  const defaultSchemaVarName = `${pascalModule}Schema`;
  const schemaPrefixInput = schemaPrefixSeed && !moduleName.toLowerCase().startsWith(schemaPrefixSeed.toLowerCase()) ? schemaPrefixSeed : '';
  const schemaPrefixCap = schemaPrefixInput
    ? schemaPrefixInput.charAt(0).toUpperCase() + schemaPrefixInput.slice(1).toLowerCase()
    : '';
  const schemaVarName = schemaPrefixCap ? `${schemaPrefixCap}${defaultSchemaVarName}` : defaultSchemaVarName;
  // Both frontend AND backend now use the entity-named filename convention
  // (e.g. "DealsSchema.js", or "ActiveDealsSchema.js" with a custom
  // prefix) — never the literal "schema.js". Matches the golden template
  // on both sides: clone-module.js's plain entity token-swap renames the
  // template's own "Smarttemplatev1Schema" file/import into "DealsSchema"
  // everywhere it appears, with no custom prefix required for that base
  // rename — the custom prefix only adds on top of it.
  const schemaFileName = `${schemaVarName}.js`;
  const frontendSchemaFileName = schemaFileName;
  const backendSchemaFileName = schemaFileName;
  console.log(`\nSchema will export "${schemaVarName}" in "${schemaFileName}" on both sides (backend colocated inside the "${apiListFolder}" API folder).`);
  // apiRoutes.json is keyed by moduleName normally (e.g. "clusters"). When a
  // custom schema prefix is given, the routes key gets the same prefix
  // (lowercase, e.g. "activeclusters") so multiple differently-prefixed
  // schema variants of the same module folder don't collide on one key —
  // the actual apiBase/importApiBase URLs underneath are unchanged.
  const routeKey = schemaPrefixInput ? `${schemaPrefixInput.toLowerCase()}${moduleName}` : moduleName;

  // Hoisted up from where these were originally computed (right before the
  // final "Will write:" write-choice prompt) — needed early now, so the
  // relative import path to globalRelations.js is known before fields get
  // built below, not just when it's time to write files.
  const frontendOutPath = appNamespace
    ? path.join(__dirname, 'app', appNamespace, moduleName, frontendSchemaFileName)
    : path.join(__dirname, 'app', moduleName, frontendSchemaFileName);
  const frontendModuleRoot = path.dirname(frontendOutPath);

  // Backend schema.js is colocated with route.js inside the API list-folder
  // (e.g. api/<app>/<module>/list/DealsSchema.js next to list/route.js) —
  // the golden template's route.js imports it same-folder style
  // (`from './DealsSchema'`), not from a level up. apiModuleRoot (one level
  // higher, at the module itself) is tracked separately so reference-syncing
  // below still walks the WHOLE module — list/, import/, and any siblings —
  // not just the list subfolder the schema file happens to live in.
  const apiModuleRoot = appNamespace
    ? path.join(__dirname, 'app', 'api', appNamespace, moduleName)
    : path.join(__dirname, 'app', 'api', moduleName);
  const apiOutPath = path.join(apiModuleRoot, apiListFolder, backendSchemaFileName);

  // Auto-link setup: load the existing globalRelations map (if any) for
  // this app, and work out the relative import path FROM wherever this
  // new module's schema files will actually land TO wherever
  // globalRelations.js already lives — computed with path.relative() so it
  // stays correct regardless of how many folders deep either side is,
  // rather than hardcoding a "../" count that could silently drift.
  function toRelativeImportPath(fromDir, toFileNoExt) {
    let rel = path.relative(fromDir, toFileNoExt).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
  }

  const globalRelationsInfo = loadGlobalRelationsMap(appNamespace);
  let frontendRelationsImportPath = null;
  let backendRelationsImportPath = null;
  if (globalRelationsInfo) {
    frontendRelationsImportPath = toRelativeImportPath(frontendModuleRoot, globalRelationsInfo.relationsPath.replace(/\.js$/, ''));
    const backendRelationsPath = path.join(__dirname, 'app', 'api', appNamespace, `${appNamespace}Schema.js`);
    backendRelationsImportPath = toRelativeImportPath(path.join(apiModuleRoot, apiListFolder), backendRelationsPath.replace(/\.js$/, ''));
  }

  const allColumns = await listColumns(connection, tableName);
  if (allColumns.length < 2) {
    return console.log(`❌ "${tableName}" has fewer than 2 columns — need at least a primary key + a record id column to build a schema.`);
  }

  const [primkeyColumn, recordIdColumn] = allColumns;
  const droppedSensitive = allColumns.slice(2).filter((c) => matchesAny(c.Field, SMART_RULES.sensitive)).map((c) => c.Field);
  const columns = allColumns.slice(2).filter((c) => !SCHEMA_AUTO_FIELDS.has(c.Field) && !matchesAny(c.Field, SMART_RULES.sensitive));

  if (droppedSensitive.length) {
    console.log(`\n🔒 Excluded from schema (looks sensitive): ${droppedSensitive.join(', ')}`);
  }

  // Auto-link: check every column against the global relations map (if
  // one was found) BEFORE building field objects. Linked columns still go
  // through classifySmartField as normal for the BACKEND fields: array
  // (EntityDataEngine needs the plain column entry regardless), but on the
  // FRONTEND they get swapped for a ...resolveField(...) call, and on the
  // BACKEND they additionally get a ...resolveJoin(...) added to
  // batchMutations, instead of typing either by hand afterward.
  const linkedColumns = [];
  const selfJoinSkipped = new Set(); // deliberately left plain; not worth a second warning below
  if (globalRelationsInfo) {
    columns.forEach((c) => {
      const match = matchColumnToRelation(c.Field, globalRelationsInfo.globalRelations);
      if (match) {
        const relation = globalRelationsInfo.globalRelations[match.relationKey];

        // Self-referencing match: this column happens to share a name
        // with a relation key that exists because OTHER tables look THIS
        // table up by it (e.g. "shifts" itself has a shift_code column,
        // and globalRelations also has a "shift_code" key because
        // "banking" references shifts by it). Auto-linking it here would
        // make this table join to itself on its own natural key — never
        // what's wanted for this kind of lookup relation. Leave it as a
        // plain field instead.
        //
        // Only EXACT key matches are skipped. A prefixed column such as
        // "manager_staff_id" on staff (matches the staff_id relation via
        // the "_staff_id" suffix) is a deliberate hierarchy link — parent_id,
        // manager_id, referred_by_... — so it is linked like any other FK.
        if (relation.table === tableName && !match.needsKeyOverride) {
          selfJoinSkipped.add(c.Field);
          console.log(`   ℹ️  Skipped auto-linking "${c.Field}" — it matches the "${match.relationKey}" relation, but that relation points at THIS table (${tableName}), which would create a self-join.`);
          return;
        }

        linkedColumns.push({
          columnKey: c.Field,
          relationKey: match.relationKey,
          needsKeyOverride: match.needsKeyOverride,
          as: relation.cacheField,
        });
      }
    });
  }
  // De-duplicate the cache-column names ("as") the linked columns write onto
  // the row. A relation's cacheField is just that table's display column, so
  // many relations share one ("name"), and it can also equal one of THIS
  // table's own columns — then two keys with the same name fight over one
  // slot on the row (and 'name' shows up twice in showInList). Real DB
  // columns always keep their names. An alias that collides with a real
  // column, or that is wanted by MORE THAN ONE linked column, is derived
  // from the FK column for every column involved (never just the "later"
  // ones, so the result doesn't depend on column order):
  //   organiser_id + "name"        -> organiser_name
  //   created_by   + "name"        -> created_by_name
  //   buyer_staff_id  + "staff_name" (staff_id used twice) -> buyer_staff_name
  //   seller_staff_id + "staff_name"                       -> seller_staff_name
  // Aliases that are already unique are left exactly as the relation names them.
  const aliasRenames = [];
  {
    const takenKeys = new Set(allColumns.map((c) => c.Field));
    takenKeys.add('row_count');
    const stripIdSuffix = (s) => s.replace(/_(id|code|no|number)$/i, '');
    const aliasWanted = {};
    linkedColumns.forEach((l) => { if (l.as) aliasWanted[l.as] = (aliasWanted[l.as] || 0) + 1; });

    const usedAliases = new Set(linkedColumns.filter((l) => l.as && aliasWanted[l.as] === 1 && !takenKeys.has(l.as)).map((l) => l.as));
    linkedColumns.forEach((l) => {
      if (!l.as) return; // relation has no cache field -> resolveField/resolveJoin fall back to their own generated key
      const shared = aliasWanted[l.as] > 1;
      const clashesWithColumn = takenKeys.has(l.as);
      if (!shared && !clashesWithColumn) return;

      const original = l.as;
      const colBase = stripIdSuffix(l.columnKey);
      const relBase = stripIdSuffix(l.relationKey);
      // "staff_name" under relation "staff_id" -> tail "name"; "name" stays "name".
      const tail = original.toLowerCase().startsWith(`${relBase.toLowerCase()}_`) ? original.slice(relBase.length + 1) : original;
      const stem = `${colBase}_${tail}`;
      let candidate = stem;
      for (let n = 2; takenKeys.has(candidate) || usedAliases.has(candidate); n += 1) candidate = `${stem}_${n}`;
      l.as = candidate;
      usedAliases.add(candidate);
      aliasRenames.push({ column: l.columnKey, from: original, to: candidate, reason: clashesWithColumn ? 'same name as a column of this table' : 'also wanted by another linked column' });
    });
  }
  const linkedByColumnKey = new Map(linkedColumns.map((l) => [l.columnKey, l]));
  // Linked columns that the FRONTEND schema drops (FRONTEND_SKIP_FIELDS) don't
  // produce a resolveField line, so they must not trigger its import either.
  const frontendLinkedCount = linkedColumns.filter((l) => !FRONTEND_SKIP_FIELDS.has(l.columnKey)).length;

  // FK-shaped columns (…_id / …_code) that did NOT get linked. This is the
  // quiet failure: such a column becomes a plain text/number input with no
  // dropdown and nothing says why. Only worth reporting when a relations map
  // exists (without one nothing can link, and that is already announced below).
  if (globalRelationsInfo) {
    const unlinkedFk = columns
      .filter((c) => /_(id|code)$/i.test(c.Field) && !linkedByColumnKey.has(c.Field) && !selfJoinSkipped.has(c.Field) && !FRONTEND_SKIP_FIELDS.has(c.Field))
      .map((c) => c.Field);
    if (unlinkedFk.length) {
      console.log(`\n⚠️  FK-shaped column(s) with NO relation, left as plain fields: ${unlinkedFk.join(', ')}`);
      console.log(`   If any of these should be a dropdown, add them to schemamap.txt, run schemamap.js and rebuild this schema.`);
    }
  }

  if (linkedColumns.length) {
    console.log(`\n🔗 Auto-linked ${linkedColumns.length} column(s) to ${path.relative(__dirname, globalRelationsInfo.relationsPath)}:`);
    linkedColumns.forEach((l) => console.log(`   - ${l.columnKey} -> ${buildResolveCallLine('resolveField', l, '').replace(/,$/, '')} (frontend), ${buildResolveCallLine('resolveJoin', l, '').replace(/,$/, '')} added to batchMutations (backend)`));

    aliasRenames.forEach((r) => console.log(`   ✏️  renamed cache column for "${r.column}": "${r.from}" -> "${r.to}" (${r.reason}) so the two don't overwrite each other on the row`));
  } else if (globalRelationsInfo) {
    console.log(`\nℹ️  Found ${path.relative(__dirname, globalRelationsInfo.relationsPath)} but no column here matches a known relation — building fields normally.`);
  } else {
    console.log(`\nℹ️  No global relations map found yet for "${appNamespace}" — building fields normally. Run schemamap.js first to enable auto-linking.`);
  }

  const systemFieldObjects = [buildSystemFieldObject(primkeyColumn), buildSystemFieldObject(recordIdColumn)];

  // Frontend-only view of the columns: sections, showInList, and the
  // fields array itself never mention FRONTEND_SKIP_FIELDS. The backend
  // schema keeps using the full `columns` list below, unaffected.
  const frontendColumns = columns.filter((c) => !FRONTEND_SKIP_FIELDS.has(c.Field));
  const skippedFromFrontend = columns.filter((c) => FRONTEND_SKIP_FIELDS.has(c.Field)).map((c) => c.Field);
  if (skippedFromFrontend.length) {
    console.log(`\n🚫 Skipped from FRONTEND schema only (still in backend): ${skippedFromFrontend.join(', ')}`);
  }

  const LIST_COLUMN_COUNT = 7;
  // Upload columns (photo / file / image ...) lead the list view and get their own form section;
  // the regular columns keep the usual first-7 / rest split.
  const uploadColumns = frontendColumns.filter(isUploadColumn);
  const regularColumns = frontendColumns.filter((c) => !isUploadColumn(c));
  if (uploadColumns.length) console.log(`\n🖼️  Upload column(s): ${uploadColumns.map((c) => c.Field).join(', ')} - first in the list, own form section, imageClass "${UPLOAD_DEFAULT_IMAGE_CLASS}".`);
  const listColumnsSlice = [...uploadColumns, ...regularColumns].slice(0, LIST_COLUMN_COUNT);
  const basicColumnsSlice = regularColumns.slice(0, LIST_COLUMN_COUNT);
  // Grid/list view shows the READABLE cached value for a linked column
  // (e.g. "contact_name") instead of the raw FK id ("contact_id") a
  // person would otherwise have to look up to make sense of — same
  // reasoning as why buildResolveCallLine always sets an "as" cache
  // field. exportColumns (the CSV upload TEMPLATE) and sections (the
  // FORM layout) both deliberately keep the raw id instead: importing by
  // a display name would need a name->id lookup this codebase doesn't
  // have, and the liveSearch field itself is keyed on the raw id —
  // swapping it for the cache field in sections would render the
  // read-only display field in place of the editable dropdown. Tracked
  // in a parallel exportKeys array so the two only diverge on linked
  // columns; row_count and any extra computed fields added below stay
  // identical in both.
  const showInListKeys = ['row_count', ...listColumnsSlice.map((c) => {
    const linked = linkedByColumnKey.get(c.Field);
    // A linked column with no cache alias has nothing readable to swap in
    // (previously this wrote the literal string 'undefined' into showInList).
    return linked && linked.as ? linked.as : c.Field;
  })];
  //const exportKeys = [...listColumnsSlice.map((c) => c.Field)];
  const exportKeys = [recordIdColumn.Field, ...basicColumnsSlice.map((c) => c.Field)]; // files can't travel in a CSV
  // Same positional split feeds `sections`: first LIST_COLUMN_COUNT real
  // columns -> "Basic Information", everything else -> "Other Details".
  // Hand-tune this afterward same as you always have — this just gets the
  // rough cut in place instantly.
  const basicSectionKeys = basicColumnsSlice.map((c) => c.Field);
  const otherSectionKeys = regularColumns.slice(LIST_COLUMN_COUNT).map((c) => c.Field);
  const uploadSectionKeys = uploadColumns.map((c) => c.Field);

  const computedDefaultFieldObjects = [
    { key: 'row_count', label: '#', type: 'number', computed: true, editable: false },
  ];

  // This is the ONE shared field OBJECT list — same fields, same order,
  // used to derive BOTH the frontend schema (full, minus `searchable`) and
  // the backend schema (trimmed, minus `label`). Fields aren't a
  // "frontend-only" concept: EntityDataEngine needs the same key/type/
  // computed/editable info server-side, just without the UI-only label.
  const fieldObjects = [
    ...systemFieldObjects,
    ...columns.map((c) => classifySmartField(c, apiBase)).filter(Boolean),
    ...computedDefaultFieldObjects,
  ];
  const fieldKeys = [
    `${primkeyColumn.Field} (system)`,
    `${recordIdColumn.Field} (system)`,
    ...columns.map((c) => `${c.Field}${exportKeys.includes(c.Field) ? ' (list)' : ''}`),
    'row_count (computed, list)',
  ];

  console.log(`\n📋 Showing in list view (first ${LIST_COLUMN_COUNT} + row_count): ${showInListKeys.join(', ')}`);
  console.log(`\nFound ${fieldObjects.length} field(s) for "${tableName}" (includes ${primkeyColumn.Field}, ${recordIdColumn.Field}, row_count): ${fieldKeys.join(', ')}`);
  console.log('You can add more extra display-only fields now — any other computed');
  console.log('value the backend adds that isn\'t an actual DB column.\n');

  while (!bulk && await askYesNo('Add an extra (computed, non-DB) field? (y/n) ')) {
    const key = await ask('  Field key: ');
    if (!key) { console.log('  Skipped — no key given.'); continue; }
    if (fieldObjects.some((f) => f.key === key) || linkedColumns.some((l) => l.as === key) || allColumns.some((c) => c.Field === key)) {
      console.log(`  ⚠️  "${key}" is already a column / field / cache column on this schema — pick a different key so they don't overwrite each other.`);
      continue;
    }
    const label = (await ask(`  Label [${toLabel(key)}]: `)) || toLabel(key);
    fieldObjects.push({ key, label, type: 'text', computed: true });
    fieldKeys.push(`${key} (computed)`);
    console.log(`  ✅ added: ${key} (computed: true — won't be written to the DB)`);

    if (await askYesNo(`  Also show "${key}" in list view? (y/n) `)) {
      showInListKeys.push(key);
      exportKeys.push(key);
      console.log(`  ✅ added "${key}" to showInList`);
    }

    console.log(`  Current field list: ${fieldKeys.join(', ')}\n`);
  }

  console.log(`\n📋 Final field list (${fieldObjects.length} total): ${fieldKeys.join(', ')}`);
  console.log(`📋 Final showInList: [${showInListKeys.join(', ')}]`);

  // Frontend never needs `searchable` (that's a backend/API filtering
  // concern), and drops FRONTEND_SKIP_FIELDS entirely; backend never needs
  // `label` (UI-only display text) but keeps every field, including those
  // skipped from the frontend.
  const fieldLinesFrontend = fieldObjects
    .filter((f) => !FRONTEND_SKIP_FIELDS.has(f.key))
    .map((f) => {
      const linked = linkedByColumnKey.get(f.key);
      if (linked) return buildResolveCallLine('resolveField', linked, '    ');
      const line = '    ' + serializeFieldEntry(f, ['searchable'], true);
      return BADGE_HINT_RULE.test(f.key)
        ? `${line}\n    //   ↑ colour it: add  badges: { active: 'green', inactive: 'red', pending: 'amber' }  inside the braces above`
        : line;
    })
    .join('\n');

  const fieldLinesBackend = fieldObjects
    .map((f) => '    ' + serializeFieldEntry(f, ['label']))
    .join('\n');

  // Safety net: a key can only appear once in the list view.
  const showInListLiteral = `[${[...new Set(showInListKeys)].map((k) => `'${k}'`).join(', ')}]`;
  // exportColumns tracks exportKeys (raw ids), not showInListKeys, since
  // a linked column's showInList entry is now the display name
  // ("contact_name") — see the comment where both arrays are built above.
  const exportColumnsLiteral = `[${exportKeys.map((k) => `'${k}'`).join(', ')}]`;
  // Screen name people see ("Fuel sales"): from the TABLE's words when the module is just that table
  // without underscores (fuel_sales -> fuelsales), else from the typed module name's capitals (CreditNote -> "Credit note").
  const label = formatModuleWords(
    tableName.replace(/_/g, '').toLowerCase() === moduleName.toLowerCase()
      ? tableName.split('_')
      : pascalModule.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')
  );
  const singular = singularLabel(label).toLowerCase();

  // Header the user sees in the CSV for the system record_id column — a
// human-meaningful unique reference (account number, order number, room
// code...) instead of the internal "record_id". Default: <table>_identifier.
const defaultImportIdAlias = `${tableName}_identifier`;
let importIdAlias = defaultImportIdAlias;

if (!bulk) {
  const aliasInput = await ask(`CSV header for the record id column, e.g. account_number, room_code [${defaultImportIdAlias}]: `);
  if (aliasInput) importIdAlias = aliasInput.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

// Must not collide with a real column, or the import header mapping becomes ambiguous.
if (allColumns.some((c) => c.Field.toLowerCase() === importIdAlias)) {
  console.log(`   ⚠️  "${importIdAlias}" is already a column on "${tableName}" — using "${importIdAlias}_ref" instead.`);
  importIdAlias = `${importIdAlias}_ref`;
}

  const basicFieldsLiteral = `[${basicSectionKeys.map((k) => `'${k}'`).join(', ')}]`;
  const otherFieldsLiteral = `[${otherSectionKeys.map((k) => `'${k}'`).join(', ')}]`;
  const uploadSectionLine = uploadSectionKeys.length
    ? `    { key: 'uploads', label: 'Photos & Files', columns: 3, fields: [${uploadSectionKeys.map((k) => `'${k}'`).join(', ')}] },\n`
    : '';
  const sectionsBlock = otherSectionKeys.length
    ? `  sections: [
${uploadSectionLine}    { key: 'basic_information', label: 'Basic Information', columns: 3, fields: ${basicFieldsLiteral} },
    { key: 'other_details', label: 'Other Details', columns: 3, fields: ${otherFieldsLiteral} },
  ],`
    : `  sections: [
${uploadSectionLine}    { key: 'basic_information', label: 'Basic Information', columns: 3, fields: ${basicFieldsLiteral} },
  ],`;

  // ---------- FRONTEND schema (full — unchanged shape) ----------
  const schemaJsFrontend = `// This is the ONLY file that changes when you clone this module.
// See SCHEMA-SPEC.md for the full reference — quick version below.
// Rough cut auto-generated by db-cli.js (rule-based column-name matching,
// no AI) — hand-tune sections/profileActions/groupedSelect below same as
// any other cloned module.
//
// FRONTEND schema — full UI shape (showInList, profileActions, apiBase,
// rowLinks, customBlocks, sections, moduleRole, etc). The trimmed backend
// counterpart lives alongside this at the api/ path and only carries
// entity/fields/batchMutations/roles.

import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';${frontendLinkedCount ? `\nimport { resolveField } from '${frontendRelationsImportPath}';` : ''}
// Use default base root (/)
const apiRoutes = getApiRoutes();
const moduleApi = apiRoutes.${routeKey}.base;

export const ${schemaVarName} = {
  entity: '${tableName}',              // DB table name; also drives default role names
                                     // (view_${moduleName} / manage_${moduleName}) and apiBase
  label: '${label}',                 // optional, defaults to entity capitalized
  apiBase: moduleApi,

  //api endpint for importing data from csv
  importDataEndpoint : apiRoutes.${routeKey}.import,

    //api endpint for importing data from csv
  importDataEndpoint : apiRoutes.${routeKey}.import,

  // Friendly CSV header for the system record id (${recordIdColumn.Field}). Shown in the
  // downloaded template and mapped back to ${recordIdColumn.Field} on upload. Use something
  // a person understands: account_number, order_number, room_code, street_code...
  excel_import_record_id_alias: '${importIdAlias}',

  // Page-level UI gate — checked once, for the WHOLE grid AND the WHOLE
  // profile/form page, via mosyACTRLHasRole. No moduleRole set -> open to
  // anyone (same additive convention as every other role/flag in this
  // file). This is a different layer than the per-action \`role\` flag
  // inside individual moduleActions entries below: moduleRole controls
  // whether someone can reach the page at all; a per-action role controls
  // whether one specific button shows up once they're already in. Same
  // UI-only caveat as those: route.js needs the equivalent server-side
  // check for this to be real enforcement, not just hiding.
  moduleRole: 'view_${moduleName}',


  gridOptions : {
   checkBoxes : false,
   checkFunction : "gridCheckBoxAction"  
  },

  multiGridRows: [
    // {
    //   key: 'order_items',
    //   parentTable: 'gps_logs',
    //   title: 'Log summary',
    //   columns: [
    //     { key: 'speed', label: 'Speed' },
    //     { key: 'latitude', label: 'Lat' },
    //     { key: 'longitude', label: 'Long' , sum: true},
    //     { key: 'remark', label: 'Selling price' }
    //   ],
    //   viewMoreLink: '../gpslogs/list',
    //   filter: { order_id: '{record_id}' },
    // },
  ],

  rowLinks: [],

  // Actions available from the list view, form and grid in display order.
  //{ 
  // key: 'filter_by_client', -- name of the action 
  // label: 'Filter by account', -- button label 
  // icon: 'user', -- icon of the buttons
  // grid:true, -- show on grid or not, 
  // type: 'action', -- indicates action on form registry 
  // form: false, -- show on form or not, 
  // rowAction: false --show on row drop down or not
  // variant : 'outline-primary', -- button color  variant
  // navigateTo: '/supererpv5/revenueplan/profile', -- route to navigate to -  for link buttons only 
  // colorClass:"bg-success text-white", -- button color classname 
  // confirm: 'Are you sure you want to delete this revenueplan?', -- confirmation message for delete button
  // editOnly: true, -- show on edit only or not
  // role: 'manage_revenueplan' -- role required for this action
  //},

  profileActions: [
    { key: 'back', label: 'Back to list', icon: 'arrow-left', variant: 'outline-secondary', navigateTo: '/${appNamespace ? appNamespace + '/' : ''}${moduleName}/list', grid: false, form: true },
    { key: 'save', label: 'Save', icon: 'save', variant: 'primary', grid: false, form: true, rowAction: false },
    { key: 'delete', label: 'Delete', icon: 'trash', variant: 'outline-danger', confirm: 'Are you sure you want to delete this ${singular}?', editOnly: true, grid: false, form: true, rowAction: true, role: 'manage_${moduleName}' },
    { key: 'view', label: 'View more', icon: 'edit', rowAction: true },
    { key: 'new', label: 'New ${singularLabel(label)}', icon: 'plus', variant: 'outline-primary', navigateTo: '/${appNamespace ? appNamespace + '/' : ''}${moduleName}/profile', grid: true, form: false, rowAction: false },
    { key: 'clone', label: 'Clone Record', icon: 'copy', variant: 'outline-secondary', editOnly: true, grid: false, form: true, rowAction: false, role: 'manage_${moduleName}' },
    //{ key: 'filterByDate', label: 'Filter by date', icon: 'calendar', variant: 'outline-primary', type: 'action', grid: true, form: false, rowAction: false },

    // Related-record buttons (view_<from>_<to>) are written between these two
    // lines by build-relations.js. Anything inside is regenerated on every run;
    // put hand-written actions OUTSIDE the markers.
    // <auto-relations:actions>
    // </auto-relations:actions>
  ],



  // customBlocks — the escape hatch for UI that doesn't fit the rigid
  // field-grid: a raw component, handed the SAME values/setValue/errors/
  // schema/isEditing/row context a real field gets. A block's \`key\` just
  // sits in a section's \`fields\` array exactly like a real field key —
  // wherever it appears there is where it renders. Empty by default;
  // uncomment and point at a real component when a field needs custom UI
  // (see SCHEMA-SPEC.md for the full pattern, e.g. companies/schema.js).
  customBlocks: [
    // { key: 'some_field', component: SomeComponent, colSpan: 7 },
  ],

  fieldGroups: [],
  // Field keys shown as columns in list view, in display order.
  showInList: ${showInListLiteral},

  //export columns these columns are used to generate upload csv template file
  exportColumns: ${exportColumnsLiteral},

${sectionsBlock}

  fields: [
    // key: DB column name | label: shown on screen | type: drives input + SQL type
${fieldLinesFrontend}
    //  live search field sample 
    // { key: 'permissions', label: 'Permissions',
    //   type: 'liveSearch', colSpan: 6,
    //   endpoint: '/api/assetguard/systemmodules',
    //   searchTable: 'system_modules',
    //   valueField: 'record_id',      // id column on system_modules
    //   displayField: 'module_name',  // label column on system_modules — what search results/defaultValue text actually render
    //   labelKey: 'permission_name',  // cached label already joined onto THIS row (system_roles) — only used to seed defaultValue on load
    // },
    // more fields... see SCHEMA-SPEC.md for the full field option list
    // (searchable, editable, options, priority, db overrides)

    // ─────────────────────────────────────────────────────────────
    // BADGES GUIDE — conditional colour badges on any column (SmartGridClean)
    // Add a \`badges\` key to a field above. Rules run top to bottom, first match wins,
    // no match = plain text. Comparisons use the RAW value (so "KES 1,200" still works).
    //
    //   // operator rules
    //   { key: 'quantity', label: 'Quantity', type: 'number',
    //     badges: [
    //       { op: '<',  value: 3,  tone: 'red',   label: 'Low' },   // label optional, replaces the text
    //       { op: '>=', value: 10, tone: 'green' },
    //       { tone: 'gray' },                                       // no op = catch-all "else"
    //     ] },
    //
    //   // shorthand: plain object = equality map (best for status-like columns)
    //   { key: 'status', label: 'Status', type: 'text',
    //     badges: { active: 'green', inactive: 'red', pending: 'amber' } },
    //
    //   // range / list / text / empty
    //   { op: 'between', value: [1, 999], tone: 'amber' }
    //   { op: 'in',      value: ['paid', 'active'], tone: 'green' }
    //   { op: 'contains', value: 'overdue', tone: 'red' }
    //   { op: 'empty', tone: 'gray', label: 'None' }
    //
    //   // colour THIS column by ANOTHER column's value
    //   { key: 'unit_price', type: 'money', badges: [{ on: 'quantity', op: '<', value: 3, tone: 'red' }] },
    //
    //   // icon + custom class + function escape hatch (frontend only)
    //   { op: '>', value: 999, tone: 'green', icon: 'arrow-up', class: 'my-class' }
    //   { op: 'fn', fn: (v, row) => row.paid < row.total, tone: 'red' }
    //
    // ops   : = != < <= > >= between in notIn contains empty notEmpty fn
    // tones : green | amber | red | blue | gray | purple | dark
    // ─────────────────────────────────────────────────────────────

    //  live search field sample
  ],

  filters: [
    { key: 'all', label: 'All', query: {} },
  ],

  actions: [
    // { key: 'some_action', label: 'Do Something', appliesTo: { status: 'x' } },
    // "key" must match a function registered in lib/actionsRegistry.js
  ],

// for button color classes  
// dyn-btn-accent-amber  { border-color: transparent; color: #b45309; }
// dyn-btn-accent-green  { border-color: transparent; color: #047857; }
// dyn-btn-accent-purple { border-color: transparent; color: #6d28d9; }
// dyn-btn-accent-pink   { border-color: transparent; color: #be185d; }
// dyn-btn-accent-red    { border-color: transparent; color: #b91c1c; }
// dyn-btn-accent-yellow { border-color: transparent; color: #a16207; }
// dyn-btn-accent-blue   { border-color: transparent; color: #1d4ed8; }
// dyn-btn-accent-teal   { border-color: transparent; color: #0f766e; }

  // Optional: only needed if permission keys don't follow the
  // view_<entity> / manage_<entity> default.
  // roles: { view: 'view_${moduleName}', manage: 'manage_${moduleName}' },
};
`;

  // ---------- BACKEND schema (trimmed — data shape only) ----------
  // Deliberately excludes everything UI-only: showInList, exportColumns,
  // profileActions, apiBase, importDataEndpoint, rowLinks, customBlocks,
  // fieldGroups, sections, moduleRole, filters, actions, label — both at
  // the top level (never had it) AND now per-field (label is a display
  // string, not something EntityDataEngine needs to do CRUD/joins/roles).
  const batchMutationsLines = linkedColumns.map((l) => buildResolveCallLine('resolveJoin', l, '    ')).join('\n');
  const batchMutationsBlock = linkedColumns.length
    ? `batchMutations: {
${batchMutationsLines}
  },`
    : `batchMutations: {
    // "_staff_full_name_staff_id": {
    //   type: "join", table: "staff", link: "staff_id:record_id",
    //   select: { "_staff_full_name_staff_id": "full_name" }
    // },
  },`;

  const schemaJsBackend = `// Auto-generated by db-cli.js — BACKEND schema (trimmed).
// This is the data-shape-only counterpart to the frontend schema.js at the
// matching app/ path. It intentionally does NOT include showInList,
// profileActions, apiBase, rowLinks, customBlocks, sections, moduleRole,
// filters, or actions — those are UI concerns and live in the frontend
// schema only. Field entries also omit \`label\` here (UI-only display
// text) even though the frontend fields carry it. Edit
// fields/batchMutations/roles here; edit everything else there. Keep the
// \`fields\` array in sync between the two by regenerating both together
// (this tool writes both from the same column read).
${linkedColumns.length ? `\nimport { resolveJoin } from '${backendRelationsImportPath}';\n` : ''}
export const ${schemaVarName} = {
  entity: '${tableName}',

  moduleRole: 'view_${tableName}',

  fields: [
    // key: DB column name | type: drives SQL/validation (label omitted —
    // UI-only, lives in the frontend schema)
${fieldLinesBackend}
  ],

  // Optional: joins enriching each row with data from another table.
  // Same shape as your existing *BatchMutations.js files.
  ${batchMutationsBlock}

  roles: { view: 'view_${moduleName}', manage: 'manage_${moduleName}' },
};
`;

  if (!bulk) {
    console.log('\n----- FRONTEND schema preview -----\n' + schemaJsFrontend);
    console.log('\n----- BACKEND schema preview -----\n' + schemaJsBackend);

    console.log('\nWill write:');
    console.log(`  1. ${path.relative(__dirname, frontendOutPath)}  (frontend — full)`);
    console.log(`  2. ${path.relative(__dirname, apiOutPath)}  (backend — trimmed: entity/fields/batchMutations/roles, colocated with route.js)`);
    if (appNamespace) {
      console.log(`  3. app/${appNamespace}/AppRoutes/apiRoutes.json  (route entry for "${routeKey}")`);
    } else {
      console.log(`  3. ⚠️  no app namespace set — apiRoutes.json entry will be SKIPPED (moduleApi in the frontend schema will fail to resolve)`);
    }
  }

const writeChoice = bulk
  ? preset.writeChoice
  : await ask('Write to both? (y = both / f = frontend only / a = api only / - = skip): ');

const targets = [];
let writingFrontend = false;
if (writeChoice === '' || writeChoice.toLowerCase() === 'y') {
  targets.push({ outPath: frontendOutPath, content: schemaJsFrontend, moduleRootDir: frontendModuleRoot });
  targets.push({ outPath: apiOutPath, content: schemaJsBackend, moduleRootDir: apiModuleRoot });
  writingFrontend = true;
} else if (writeChoice.toLowerCase() === 'f') {
  targets.push({ outPath: frontendOutPath, content: schemaJsFrontend, moduleRootDir: frontendModuleRoot });
  writingFrontend = true;
} else if (writeChoice.toLowerCase() === 'a') {
  targets.push({ outPath: apiOutPath, content: schemaJsBackend, moduleRootDir: apiModuleRoot });
} else if (writeChoice === '-') {
  return console.log('Not written — copy the output above manually if needed.');
} else {
  return console.log('Not written — unrecognized choice.');
}

const RUN_TIMESTAMP = buildRunTimestamp();

for (const { outPath, content, moduleRootDir } of targets) {
  const newFileName = path.basename(outPath);
  const stale = detectExistingSchemaFile(moduleRootDir, outPath);

  if (fs.existsSync(outPath)) {
    backupExistingFile(outPath, RUN_TIMESTAMP);
  }

  const targetDir = path.dirname(outPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`   📁 created ${path.relative(__dirname, targetDir)} (didn't exist yet)`);
  }
  fs.writeFileSync(outPath, content);
  console.log(`✅ Written to ${path.relative(__dirname, outPath)}`);

 
if (stale) {
  console.log(`   ↳ found another schema file "${stale.fileName}"${stale.varName ? ` (exports ${stale.varName})` : ''} in ${path.relative(__dirname, moduleRootDir)}.`);
  const migrate = await askYesNo(`   Is "${stale.fileName}" an OLD version of THIS schema (should be recycled + all references repointed to "${newFileName}")? (y/n — "n" leaves it alone as a separate schema) `);
  if (migrate) {
    backupExistingFile(stale.fullPath, RUN_TIMESTAMP);
    const oldFileBase = stale.fileName.replace(/\.js$/, '');
    const newFileBase = newFileName.replace(/\.js$/, '');
    const { filesUpdated } = syncSchemaReferences(moduleRootDir, stale.varName, schemaVarName, oldFileBase, newFileBase, outPath);
    console.log(`   ↳ updated ${filesUpdated} other file(s) to match.`);
  } else {
    console.log(`   ↳ leaving "${stale.fileName}" untouched.`);
  }
}

}



// The frontend schema references apiRoutes.<routeKey>.base / .import at
// runtime (via getApiRoutes()), instead of hardcoding the URL string. Keep
// app/<appNamespace>/AppRoutes/apiRoutes.json in sync whenever we write
// (or would have written) the frontend schema, same "one file to route
// them all" idea as the routes-writer script this mirrors.
if (writingFrontend) {
  updateApiRoutesJson(appNamespace, routeKey, apiBase, importApiBase);
}

// What was just built, so the caller can offer to clone the matching module.
return { entity: pascalModule, list: customNameInput, table: tableName };
}

/* ================= CHAIN INTO clone-module.js ================= */

// Same pattern as new-mosyapp.js: ask y/n, then spawnSync the next script
// with inherited stdio. `items` = [{ entity: 'ActiveCustomers', list: 'active' }, ...]
// from interactiveBuildSchema(). Runs clone-module.js in bulk form — one entry
// per module — from this script's own folder (the project root db-cli.js
// already writes under). --keep-schemas is the important part: the schema
// files db-cli.js just generated sit at the exact paths the clone would write
// its template schema to, and without it they'd be swapped for blank ones. It
// protects ONLY schema files — every other existing file is recycled and
// replaced, exactly like running `node clone-module.js <Name>` yourself.
async function offerCloneModules(items) {
  const seen = new Set();
  const unique = items.filter((i) => {
    const key = `${i.entity}|${(i.list || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const valid = unique.filter((i) => /^[A-Z][a-zA-Z0-9]*$/.test(i.entity));
  unique.filter((i) => !valid.includes(i)).forEach((i) => console.log(`⚠️  Can't clone "${i.entity}" — module names for clone-module.js must be PascalCase letters/numbers. Skipped.`));
  if (valid.length === 0) return;

  const cloneScript = path.join(__dirname, 'clone-module.js');
  if (!fs.existsSync(cloneScript)) {
    return console.log(`\nℹ️  clone-module.js not found next to db-cli.js (${cloneScript}) — can't offer to create the module(s).`);
  }

  // "table -> Module" lets clone-module.js build menu labels/groups from the table's words (fuel_sales -> "Fuel sales").
  const list = valid.map((i) => `${i.table ? `${i.table} -> ` : ''}${i.entity}${i.list ? ` --${i.list}` : ''}`).join(' , ');
  console.log(`\nModule(s) for the schema(s) just built: ${valid.map((i) => `${i.entity}${i.list ? ` (--${i.list})` : ''}`).join(', ')}`);

  if (!(await askYesNo('\n👉 Create the client module(s) now with clone-module.js (also adds them to the sidebar menu config)? (y/n) '))) {
    return console.log(`\nℹ️  Skipped. Run it later with: node clone-module.js --keep-schemas --bulk="${list}"   (then: node build-relations.js)`);
  }

  console.log(`\n🚀 Running: node clone-module.js --keep-schemas --bulk="${list}"\n`);
  rl.pause(); // hand the terminal to the child
  const result = spawnSync(process.execPath, [cloneScript, '--keep-schemas', `--bulk=${list}`], { stdio: 'inherit', cwd: __dirname });
  rl.resume();

  if (result.error) return console.error(`❌ Could not start clone-module.js: ${result.error.message}`);
  if (result.status !== 0) return console.error('❌ clone-module.js exited with an error (see above). Fix it and re-run the command shown earlier.');

  // Last link of the chain: schemas -> clone -> related-record actions.
  // It has to come AFTER the clone because the clone recycles and replaces the
  // template's actionsRegistry.js, which is where these actions get written.
  runBuildRelations();
}

// Spawns build-relations.js (same folder) the way clone-module.js is spawned:
// inherited stdio, this script's folder as the project root. It scans every
// module on disk, so it is safe to run for one module or all of them.
function runBuildRelations() {
  const script = path.join(__dirname, 'build-relations.js');
  if (!fs.existsSync(script)) {
    return console.log(`\nℹ️  build-relations.js not found next to db-cli.js (${script}) — related-record buttons (view_<from>_<to>) were not generated.`);
  }
  console.log('\n🔗 Running: node build-relations.js\n');
  rl.pause();
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: __dirname });
  rl.resume();
  if (result.error) console.error(`❌ Could not start build-relations.js: ${result.error.message}`);
  else if (result.status !== 0) console.error('❌ build-relations.js exited with an error (see above). Re-run it with: node build-relations.js');
}

// Reads (or creates) app/<appNamespace>/AppRoutes/apiRoutes.json and
// upserts the entry for this module — mirrors the shape produced by the
// standalone routes-writer script (base / delete / import per module key),
// but keyed by the SAME apiBase/importApiBase this tool already computed
// for the schema, so the two never drift apart. `routeKey` is the plain
// moduleName UNLESS a custom schema prefix was given, in which case it's
// "<prefix><moduleName>" (e.g. "activeclusters") — the URLs underneath
// still point at the real module folder, only the lookup key changes, so
// differently-prefixed schema variants of the same module don't collide.
function updateApiRoutesJson(appNamespace, routeKey, apiBase, importApiBase) {
  if (!appNamespace) {
    console.log('⚠️  No app namespace set — skipping apiRoutes.json update (moduleApi will have nothing to resolve against).');
    return;
  }

  const routesDir = path.join(__dirname, 'app', appNamespace, 'AppRoutes');
  const routesPath = path.join(routesDir, 'apiRoutes.json');

  let routes = {};
  if (fs.existsSync(routesPath)) {
    try {
      routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    } catch (err) {
      // Starting from {} and writing would replace every other module's routes
      // with this one entry. Park the unreadable file in _recycled/ first so
      // nothing is lost, and say so.
      const backupPath = path.join(routesDir, '_recycled', `apiRoutes.${buildRunTimestamp()}.json`);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(routesPath, backupPath);
      console.log(`⚠️  Could not parse existing apiRoutes.json (${err.message}) — starting a fresh file. The unreadable original was copied to ${path.relative(__dirname, backupPath)}.`);
      routes = {};
    }
  }

  routes[routeKey] = {
    base: apiBase,
    delete: `${apiBase}/delete`,
    import: importApiBase,
  };

  fs.mkdirSync(routesDir, { recursive: true });
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 4));
  console.log(`✅ Updated ${path.relative(__dirname, routesPath)} — "${routeKey}": ${JSON.stringify(routes[routeKey])}`);
}

/* ================= BULK BUILD SCHEMA ================= */

// Parses a comma / semicolon / newline separated list of entries like:
//
//   system_users -> Users , clients_tbl -> ActiveCustomers --active
//
// Each entry: table [-> Module] [--listname] [--profile=name]
//   - "-> Module" is optional; without it the module defaults to the table
//     name with underscores removed, same as single mode.
//   - "--active" (bare flag) or "--list=active" / "--list-name=active" is the
//     custom list name — the same value single mode asks for as "custom name
//     used with clone-module.js's --list-name".
//   - "--profile=..." is accepted so a list copied from clone-module.js
//     doesn't error; db-cli.js has no use for it and ignores it.
// clone-module.js bulk mode reads this exact format too, so one list drives both.
function parseBulkList(raw) {
  const entries = [];
  const errors = [];
  const chunks = raw.split(/[,;\r\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const chunk of chunks) {
    let list = '';
    const rest = [];
    let bad = false;

    for (const word of chunk.split(/\s+/)) {
      if (!word.startsWith('--')) { rest.push(word); continue; }
      const body = word.slice(2);
      const eq = body.indexOf('=');
      const key = eq < 0 ? body : body.slice(0, eq);
      const val = eq < 0 ? '' : body.slice(eq + 1);
      const keyLc = key.toLowerCase();
      if (['list', 'listname', 'list-name'].includes(keyLc) && val) list = val;
      else if (['profile', 'profilename', 'profile-name'].includes(keyLc) && val) { /* clone-module.js only */ }
      else if (eq < 0 && key) list = key;
      else { errors.push(`"${chunk}" — unrecognised flag "${word}"`); bad = true; }
    }
    if (bad) continue;

    const parts = rest.join(' ').split(/\s*(?:->|→|=>)\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0 || parts.length > 2) {
      errors.push(`"${chunk}" — expected "table -> Module" or just "table"`);
      continue;
    }
    const [table, module = ''] = parts;
    if (!IDENTIFIER.test(table)) {
      errors.push(`"${chunk}" — table name "${table}" must be letters, numbers, underscores`);
      continue;
    }
    if (module && !/^[A-Za-z][A-Za-z0-9]*$/.test(module)) {
      errors.push(`"${chunk}" — module name "${module}" must be letters/numbers only (e.g. Users, CreditNote)`);
      continue;
    }
    if (list && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(list)) {
      errors.push(`"${chunk}" — list name "${list}" may only use letters, numbers, "_" and "-"`);
      continue;
    }
    entries.push({ table, module, list });
  }
  return { entries, errors };
}

// Builds schema files for MANY tables in one go. `preloadedRaw` comes from
// `node db-cli.js --bulk="..."`; from the menu the list is typed/pasted (one
// line, comma-separated, or several lines ending with a blank) or a path to a
// .csv/.txt file holding it. Shows a plan, asks once, then runs every entry
// through the same interactiveBuildSchema() as single mode with the
// questions pre-answered. One bad entry never stops the rest.
async function interactiveBulkBuildSchema(connection, preloadedRaw = '') {
  let raw = preloadedRaw;
  let typedList = ''; // only lists typed at the prompt are saved (not files or --bulk=)
  if (raw && fs.existsSync(raw)) raw = fs.readFileSync(raw, 'utf8');

  if (!raw) {
    console.log('\nBulk build — one entry per table:   table -> Module [--listname]');
    console.log('  e.g.  system_users -> Users , clients_tbl -> ActiveCustomers --active');
    console.log('  Separate entries with commas or new lines. "-> Module" is optional. Or give a path to a .csv/.txt file.');
    console.log('  Press Tab to complete a table name (Tab twice lists all matches).');
    const savedCount = loadBulkHistory().length;
    if (savedCount) console.log(`  Press Up/Down to recall a list you built before (${savedCount} saved in ${path.basename(BULK_HISTORY_FILE)}).`);
    printTableNames(await refreshTableNames(connection), { csv: true });
    const lines = [];
    while (true) {
      const line = await askBulkLine(lines.length ? '  ... (blank to finish) ' : '> ');
      if (!line) break;
      lines.push(line);
      if (lines.length === 1 && fs.existsSync(line)) { raw = fs.readFileSync(line, 'utf8'); lines.length = 0; break; }
    }
    if (!raw) { raw = lines.join('\n'); typedList = raw; }
  }
  if (!raw.trim()) return console.log('Cancelled — nothing entered.');

  const { entries, errors } = parseBulkList(raw);
  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} entr${errors.length === 1 ? 'y' : 'ies'} couldn't be parsed and will be skipped:`);
    errors.forEach((e) => console.log(`   - ${e}`));
  }
  if (entries.length === 0) return console.log('No valid entries found.');

  // Resolve each table against the real DB (exact name first, then
  // case-insensitive) so a typo is caught in the plan, not mid-run.
  const [tableRows] = await connection.query('SHOW TABLES');
  const dbTables = tableRows.map((row) => Object.values(row)[0]);
  const jobs = [];
  const missing = [];
  for (const e of entries) {
    const real = dbTables.includes(e.table) ? e.table : dbTables.find((t) => t.toLowerCase() === e.table.toLowerCase());
    if (!real) { missing.push(e.table); continue; }
    const moduleName = (e.module || real.replace(/_/g, '')).toLowerCase();
    jobs.push({
      tableName: real,
      moduleName,
      pascalName: e.module ? e.module.charAt(0).toUpperCase() + e.module.slice(1) : '',
      listName: e.list,
    });
  }
  if (missing.length) console.log(`\n⚠️  Not found in "${DB_CONFIG.database}", skipped: ${missing.join(', ')}`);
  if (jobs.length === 0) return console.log('Nothing left to build.');
  if (typedList) saveBulkHistory(typedList); // remembered for Up/Down at the next bulk prompt

  const seen = new Set();
  console.log(`\nPlan — ${jobs.length} schema(s) for app "${path.basename(__dirname)}":`);
  jobs.forEach((j, i) => {
    const key = `${j.moduleName}|${(j.listName || '').toLowerCase()}`;
    const dup = seen.has(key);
    seen.add(key);
    const prefix = j.listName && !j.moduleName.startsWith(j.listName.toLowerCase()) ? j.listName.charAt(0).toUpperCase() + j.listName.slice(1).toLowerCase() : '';
    const varName = `${prefix}${j.pascalName && j.pascalName.toLowerCase() === j.moduleName ? j.pascalName : toPascalCase(j.moduleName)}Schema`;
    console.log(`  ${String(i + 1).padStart(2)}. ${j.tableName}  ->  module "${j.moduleName}"  list "${j.listName || 'list'}"  exports ${varName}${dup ? '   ⚠️ same module+list as an earlier entry — will overwrite it' : ''}`);
  });

  const writeAnswer = (await ask('\nWrite all? (Enter / y = frontend + api, f = frontend only, a = api only, n = cancel): ')).toLowerCase();
  if (writeAnswer === 'n' || writeAnswer === '-') return console.log('Cancelled.');
  if (!['', 'y', 'f', 'a'].includes(writeAnswer)) return console.log('Cancelled — unrecognized choice.');

  const ok = [];
  const failed = [];
  const built = [];
  for (const [i, job] of jobs.entries()) {
    console.log(`\n━━━━ [${i + 1}/${jobs.length}] ${job.tableName} -> ${job.moduleName}${job.listName ? ` (--${job.listName})` : ''} ━━━━`);
    try {
      const wrote = await interactiveBuildSchema(connection, { ...job, writeChoice: writeAnswer });
      (wrote ? ok : failed).push(job.tableName);
      if (wrote) built.push(wrote);
    } catch (err) {
      console.error(`❌ ${job.tableName}: ${err.message}`);
      failed.push(job.tableName);
    }
  }

  console.log(`\n══════ Bulk done: ${ok.length}/${jobs.length} built${failed.length ? `, not built: ${failed.join(', ')}` : ''} ══════`);
  await offerCloneModules(built);
}

/* ================= MENU ================= */

async function showMenu(connection) {
  console.log(`
What do you want to do?
  --- Structure ---
  t. Show all table names
  1. Create table
  2. Create tables from script file (DNA format — paste multi-table script, pick which to run)
  3. Add column
  4. Drop column
  5. Rename column
  6. Reorder column
  7. Modify column type
  8. List columns
  --- Code ---
  9. Build schema.js from a table
  10. BULK build schema.js from many tables (list: table -> Module --listname, ...)
  11. Dump all tables + columns (for schemamap.txt / documentation)
  r. Build related-record buttons for every module on disk (runs build-relations.js)
  --- Settings ---
  12. View/edit .env
  13. Exit
`);
  const choice = await ask('Pick a number: ');

  if (choice.toLowerCase() === 't') printTableNames(await refreshTableNames(connection));
  else if (choice.toLowerCase() === 'r') runBuildRelations();
  else if (choice === '1') await interactiveCreateTable(connection);
  else if (choice === '2') await interactiveCreateTablesFromScript(connection);
  else if (choice === '3') await interactiveAddColumn(connection);
  else if (choice === '4') await interactiveDropColumn(connection);
  else if (choice === '5') await interactiveRenameColumn(connection);
  else if (choice === '6') await interactiveReorderColumn(connection);
  else if (choice === '7') await interactiveModifyColumnType(connection);
  else if (choice === '8') await interactiveListColumns(connection);
  else if (choice === '9') {
    const built = await interactiveBuildSchema(connection);
    if (built) await offerCloneModules([built]);
  }
  else if (choice === '10') await interactiveBulkBuildSchema(connection);
  else if (choice === '11') await interactiveDumpTablesAndColumns(connection);
  else if (choice === '12') await interactiveViewEditEnv();
  else return; // exit

  if (await askYesNo('\nDo something else? (y/n) ')) await showMenu(connection);
}

/* ================= ENTRY ================= */

(async () => {
  diagnoseEnv();
  console.log(`\n🔌 Connecting to ${DB_CONFIG.user}@${DB_CONFIG.host}/${DB_CONFIG.database} ...`);

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.log(`⚠️  Database "${DB_CONFIG.database}" doesn't exist yet.`);
      const create = await askYesNo(`Create it now? (y/n) `);

      if (!create) {
        console.log('Cancelled.');
        rl.close();
        process.exit(1);
      }

      const rootConnection = await mysql.createConnection({
        host: DB_CONFIG.host,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
      });
      await rootConnection.query(`CREATE DATABASE \`${DB_CONFIG.database}\``);
      await rootConnection.end();
      console.log(`✅ Database "${DB_CONFIG.database}" created.`);

      connection = await mysql.createConnection(DB_CONFIG);
    } else {
      console.error(`❌ Could not connect: ${err.message}`);
      console.error(`   Using: host=${DB_CONFIG.host} user=${DB_CONFIG.user} database=${DB_CONFIG.database}`);
      console.error('   Create a .env next to this script to override (DB_HOST, DB_USER, DB_PASS, DB_NAME).');
      rl.close();
      process.exit(1);
    }
  }

  try {
    // `node db-cli.js --bulk="a -> A, b -> B --active"` (or --bulk=file.csv)
    // skips the menu and goes straight to bulk schema building.
    const bulkArg = process.argv.slice(2).find((a) => a.startsWith('--bulk='));
    if (bulkArg) await interactiveBulkBuildSchema(connection, bulkArg.slice('--bulk='.length));
    else await showMenu(connection);
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    rl.close();
    await connection.end();
  }
})();