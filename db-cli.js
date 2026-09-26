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
 */

const { execSync } = require('child_process');
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
  sensitive: [/password/i, /pass_?hash/i, /secret/i, /token/i, /api_?key/i],
  image: [/image/i, /photo/i, /logo/i, /avatar/i],
  datetime: [/created_at/i, /updated_at/i, /created_on/i, /updated_on/i, /_date$/i, /^date_/i, /_time$/i],
  textarea: [/description/i, /notes?$/i, /message/i, /remark/i, /address/i],
  money: [/^latitude$/i, /^longitude$/i, /_lat$/i, /_lng$/i, /_amount$/i, /_price$/i, /_cost$/i, /_balance$/i, /_total$/i],
  groupedSelect: [/^country$/i, /^county$/i, /^town$/i, /^region$/i, /^status$/i, /^category$/i, /^cluster$/i, /_company$/i, /^vendor$/i, /_vendor$/i],
  computedSum: [/^total_/i, /_count$/i, /_sum$/i],
  title: [/_name$/i, /^name$/i, /_code$/i, /^code$/i],
  required: /_name$|^name$/i,
};

function matchesAny(str, patterns) {
  return patterns.some((p) => p.test(str));
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

  if (matchesAny(name, SMART_RULES.image)) {
    field.type = 'image';
  } else if (matchesAny(name, SMART_RULES.datetime) || field.type === 'date' || field.type === 'datetime') {
    field.type = 'datetime';
  } else if (matchesAny(name, SMART_RULES.textarea)) {
    field.type = 'textarea';
    field.colSpan = 3;
  } else if (matchesAny(name, SMART_RULES.money)) {
    field.type = 'money';
  } else if (matchesAny(name, SMART_RULES.groupedSelect)) {
    field.type = 'groupedSelect';
    field.endpoint = apiBase;
    field.groupByField = name;
  }

  if (matchesAny(name, SMART_RULES.computedSum)) {
    field.type = 'text';
    field.computed = true;
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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
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
  const choice = await ask(promptLabel);
  return tableNames[parseInt(choice, 10) - 1] || null;
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
  const filter = await ask('Filter to one table (blank = dump ALL tables): ');

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

function toLabel(fieldKey) {
  return fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  const overrides = overrideParts.length ? `, { ${overrideParts.join(', ')} }` : '';
  return `${indent}...${fnName}('${linked.relationKey}'${overrides}),`;
}

async function interactiveBuildSchema(connection) {
  const tableName = await pickExistingTable(connection, 'Pick a table to introspect (number): ');
  if (!tableName) return console.log('Cancelled.');

  const defaultModuleName = tableName.replace(/_/g, '');
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
  const customNameInput = await ask(`Custom name used with clone-module.js's --list-name (blank = default "list" folder / plain schema naming, e.g. "active"): `);
  const apiListFolder = customNameInput || 'list';
  const looksLikeModuleNameItself = customNameInput && customNameInput.toLowerCase() === defaultModuleName.toLowerCase();
  if (looksLikeModuleNameItself) {
    console.log(`   ⚠️  "${customNameInput}" matches the module name itself — using it as the API folder name, but NOT as a schema prefix (that would double up to "${toPascalCase(defaultModuleName)}${toPascalCase(defaultModuleName)}Schema"). If you meant a genuine custom name like "active", re-enter it.`);
  }
  const schemaPrefixSeed = looksLikeModuleNameItself ? '' : customNameInput;

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

  if (!(await askYesNoDefaultYes('Use these? (Enter = yes, n = edit one at a time) '))) {
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
  const defaultSchemaVarName = `${toPascalCase(moduleName)}Schema`;
  const schemaPrefixInput = schemaPrefixSeed && schemaPrefixSeed.toLowerCase() !== moduleName.toLowerCase() ? schemaPrefixSeed : '';
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
        if (relation.table === tableName) {
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
  const linkedByColumnKey = new Map(linkedColumns.map((l) => [l.columnKey, l]));

  if (linkedColumns.length) {
    console.log(`\n🔗 Auto-linked ${linkedColumns.length} column(s) to ${path.relative(__dirname, globalRelationsInfo.relationsPath)}:`);
    linkedColumns.forEach((l) => console.log(`   - ${l.columnKey} -> ${buildResolveCallLine('resolveField', l, '').replace(/,$/, '')} (frontend), ${buildResolveCallLine('resolveJoin', l, '').replace(/,$/, '')} added to batchMutations (backend)`));

    // Two linked columns landing on the same "as" cache column name would
    // silently overwrite one with the other on the actual row — flag it
    // instead of letting that happen quietly.
    const columnsByAs = {};
    linkedColumns.forEach((l) => {
      (columnsByAs[l.as] = columnsByAs[l.as] || []).push(l.columnKey);
    });
    Object.entries(columnsByAs).forEach(([asValue, cols]) => {
      if (cols.length > 1) {
        console.log(`   ⚠️  "${asValue}" would be the cache column for ${cols.length} linked columns (${cols.join(', ')}) — they'd overwrite each other on the row. Give at least one a distinct { as: '...' } by hand.`);
      }
    });
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
  const listColumnsSlice = frontendColumns.slice(0, LIST_COLUMN_COUNT);
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
    return linked ? linked.as : c.Field;
  })];
  const exportKeys = [...listColumnsSlice.map((c) => c.Field)];

  // Same positional split feeds `sections`: first LIST_COLUMN_COUNT real
  // columns -> "Basic Information", everything else -> "Other Details".
  // Hand-tune this afterward same as you always have — this just gets the
  // rough cut in place instantly.
  const basicSectionKeys = listColumnsSlice.map((c) => c.Field);
  const otherSectionKeys = frontendColumns.slice(LIST_COLUMN_COUNT).map((c) => c.Field);

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

  while (await askYesNo('Add an extra (computed, non-DB) field? (y/n) ')) {
    const key = await ask('  Field key: ');
    if (!key) { console.log('  Skipped — no key given.'); continue; }
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
      return '    ' + serializeFieldEntry(f, ['searchable'], true);
    })
    .join('\n');
  const fieldLinesBackend = fieldObjects
    .map((f) => '    ' + serializeFieldEntry(f, ['label']))
    .join('\n');

  const showInListLiteral = `[${showInListKeys.map((k) => `'${k}'`).join(', ')}]`;
  // exportColumns tracks exportKeys (raw ids), not showInListKeys, since
  // a linked column's showInList entry is now the display name
  // ("contact_name") — see the comment where both arrays are built above.
  const exportColumnsLiteral = `[${exportKeys.map((k) => `'${k}'`).join(', ')}]`;
  const label = toPascalCase(moduleName).replace(/([A-Z])/g, ' $1').trim();
  const singular = label.toLowerCase().replace(/s$/, '');

  const basicFieldsLiteral = `[${basicSectionKeys.map((k) => `'${k}'`).join(', ')}]`;
  const otherFieldsLiteral = `[${otherSectionKeys.map((k) => `'${k}'`).join(', ')}]`;
  const sectionsBlock = otherSectionKeys.length
    ? `  sections: [
    { key: 'basic_information', label: 'Basic Information', columns: 3, fields: ${basicFieldsLiteral} },
    { key: 'other_details', label: 'Other Details', columns: 3, fields: ${otherFieldsLiteral} },
  ],`
    : `  sections: [
    { key: 'basic_information', label: 'Basic Information', columns: 3, fields: ${basicFieldsLiteral} },
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

import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';${linkedColumns.length ? `\nimport { resolveField } from '${frontendRelationsImportPath}';` : ''}
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
    { key: 'new', label: 'New ${label.replace(/s$/, '')}', icon: 'plus', variant: 'outline-primary', navigateTo: '/${appNamespace ? appNamespace + '/' : ''}${moduleName}/profile', grid: true, form: false, rowAction: false },
    { key: 'clone', label: 'Clone Record', icon: 'copy', variant: 'outline-secondary', editOnly: true, grid: false, form: true, rowAction: false, role: 'manage_${moduleName}' },
    //{ key: 'filterByDate', label: 'Filter by date', icon: 'calendar', variant: 'outline-primary', type: 'action', grid: true, form: false, rowAction: false },
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

const writeChoice = await ask('Write to both? (y = both / f = frontend only / a = api only / - = skip): ');

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
      console.log(`⚠️  Could not parse existing apiRoutes.json (${err.message}) — starting a fresh file (old one is untouched until we write below).`);
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

/* ================= MENU ================= */

async function showMenu(connection) {
  console.log(`
What do you want to do?
  --- Structure ---
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
  10. Dump all tables + columns (for schemamap.txt / documentation)
  --- Settings ---
  11. View/edit .env
  12. Exit
`);
  const choice = await ask('Pick a number: ');

  if (choice === '1') await interactiveCreateTable(connection);
  else if (choice === '2') await interactiveCreateTablesFromScript(connection);
  else if (choice === '3') await interactiveAddColumn(connection);
  else if (choice === '4') await interactiveDropColumn(connection);
  else if (choice === '5') await interactiveRenameColumn(connection);
  else if (choice === '6') await interactiveReorderColumn(connection);
  else if (choice === '7') await interactiveModifyColumnType(connection);
  else if (choice === '8') await interactiveListColumns(connection);
  else if (choice === '9') await interactiveBuildSchema(connection);
  else if (choice === '10') await interactiveDumpTablesAndColumns(connection);
  else if (choice === '11') await interactiveViewEditEnv();
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
    await showMenu(connection);
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    rl.close();
    await connection.end();
  }
})();