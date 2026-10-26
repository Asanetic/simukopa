#!/usr/bin/env node
/**
 * Clones the module template into a new module, renaming every
 * case-variant of the entity word (PascalCase, lowercase, UPPERCASE)
 * in both filenames and file contents.
 *
 * Run from the PROJECT ROOT (e.g. C:\xampp\htdocs\nextv2\mainapps\superpos>) — no need to cd in.
 *
 * FromEntity is the placeholder token that's actually baked into the
 * template files (e.g. "Smarttemplatev1"), not a literal word — whatever
 * case-variant of it appears in the template gets swapped for ToEntity.
 *
 * --app defaults to the app this script physically lives in (same trick
 * db-cli.js uses: path.basename(__dirname)), so it can usually be omitted.
 * --source defaults to "_mosy_module_v1", so it can usually be omitted too:
 *
 *   node clone-module.js Smarttemplatev1 Deals
 *   -> clones  app/superpos/_mosy_module_v1        -> app/superpos/deals
 *              app/api/superpos/_mosy_module_v1     -> app/api/superpos/deals
 *
 * Override either default explicitly:
 *
 *   node clone-module.js Smarttemplatev1 Deals --app=supererpv2 --source=_mosy_module_v1
 *   -> clones  app/supererpv2/_mosy_module_v1        -> app/supererpv2/deals
 *              app/api/supererpv2/_mosy_module_v1     -> app/api/supererpv2/deals
 *
 * If your project has no app-namespace folder (module lives directly under app/),
 * pass --app=- to opt out of the default:
 *   node clone-module.js Smarttemplatev1 Deals --app=-
 *   -> clones  app/_mosy_module_v1 -> app/deals  (and api/ counterpart)
 *
 * NESTED BUNDLES: --nest=<parentFolder> groups the module under an extra
 * parent folder (e.g. a "sales" bucket holding several sub-modules).
 *
 * RENAMING list/profile: --list-name=<name> / --profile-name=<name> rename
 * the "list" and "profile" page.jsx folders in place — they stay nested
 * inside the module, they just get different names. dataControl/uiControl/
 * logicControl and everything else are unaffected. Leave either flag off
 * to keep that folder's default "list"/"profile" name.
 *
 * The same custom name (from --list-name, or --profile-name if that's the
 * only one given) is also used as a prefix on the "<Entity>Schema",
 * "<Entity>List", and "<Entity>Profile" identifiers wherever they appear —
 * schema.js's own export, every file that imports it, and the uiControl
 * component filenames themselves. So --list-name=active on a "Clusters"
 * module turns ClustersSchema/ClustersList/ClustersProfile into
 * ActiveClustersSchema/ActiveClustersList/ActiveClustersProfile everywhere,
 * and uiControl/ClustersList.jsx becomes uiControl/ActiveClustersList.jsx.
 * Leave both flags off to keep the standard entity-only naming.
 *
 *   node clone-module.js Smarttemplatev1 DailySales --app=superpos --nest=sales
 *   -> clones  app/superpos/sales/dailysales/          (dataControl, uiControl, logicControl, list/, profile/)
 *              app/api/superpos/sales/dailysales/ ...same on the API side
 *
 *   node clone-module.js Smarttemplatev1 Clusters --app=assetguard --list-name=active --profile-name=activeprofile
 *   -> clones  app/assetguard/clusters/            (dataControl, logicControl)
 *              app/assetguard/clusters/active/      (was list/, page.jsx lives here)
 *              app/assetguard/clusters/activeprofile/ (was profile/, page.jsx lives here)
 *              app/assetguard/clusters/uiControl/ActiveClustersList.jsx     (was ClustersList.jsx)
 *              app/assetguard/clusters/uiControl/ActiveClustersProfile.jsx (was ClustersProfile.jsx)
 *              app/assetguard/clusters/schema.js exports ActiveClustersSchema (was ClustersSchema), and every
 *              importing file across the module is updated to match
 *              app/api/assetguard/clusters/ ...same rename applied on the API side
 *
 * SAFE TO RE-RUN: if the destination folder already exists, cloning proceeds
 * into it (files are merged in). If an individual destination FILE already
 * exists, it's moved into a "_recycled" folder inside that module (with a
 * timestamp appended for uniqueness) before the new file is written — so
 * nothing is ever silently overwritten or lost.
 *
 * BULK MODE: clone many modules in one go from a comma / semicolon / newline
 * separated list. Entry format (same one db-cli.js bulk mode reads, so ONE
 * list works for both scripts):
 *
 *     [table ->] Module [--listname] [--profile=name]
 *
 *   node clone-module.js --bulk="system_users -> Users , clients_tbl -> ActiveCustomers --active"
 *   node clone-module.js --bulk-file=modules.csv
 *   node clone-module.js --bulk            (no value: paste the list when prompted)
 *   node clone-module.js --modules         (just print the existing module folders)
 *
 * At the --bulk paste prompt the existing module folders under app/<app> (and
 * app/api/<app>) are shown on screen and Tab completes them (Tab twice lists all
 * matches) — handy for adding another --listname variant to a module that exists.
 * Folders are matched by the module name lower-cased, e.g. "activecustomers".
 *
 * --keep-existing: never replace files already in the destination (default: the old file
 * is moved to _recycled/ and the template version written).
 * --keep-schemas: same, but ONLY for schema files; everything else is recycled and replaced
 * exactly like a normal run. db-cli.js passes this when it chains into this script right
 * after generating the schema files, so those aren't swapped back for blank template ones.
 *
 * "ActiveCustomers --active" no longer doubles the prefix (ActiveActiveCustomersSchema) in
 * ANY mode: if the module name already starts with the list name, the identifier prefix is
 * skipped. db-cli.js applies the same rule, so generated and cloned names always match.
 *
 * MENU CONFIG: once the cloning is finished it shows the modules it found for the sidebar menu and, only
 * on y, writes app/<app>/AppRoutes/<app>MenuConfig.js (created if missing). Modules are GROUPED by the first
 * word of their table name so a big app doesn't get 40 menu nodes: fuel_stations, fuel_pumps, fuel_sales ->
 * one "Fuel" node with Stations / Pumps / Sales; modules with no partner keep their own menu node. A Dashboard entry (first in the menu, -> routes.<app>/dashboard/main) is added when the menu has none. Labels come from
 * the table name with underscores as spaces ("Fuel sales"). Additive only; modules already linked are skipped,
 * and an existing menu file is copied to _recycled/ before it's changed.
 *   --menu-regroup      tidy an existing menu: re-group the modules already in the menu file (blocks this
 *                       script generated are replaced by grouped ones; blocks you wrote are kept). It works
 *                       from the menu file itself - it never lists the folders on disk. (--menu = same thing)
 *   --menu-add=a,b      add just these tables/modules to the menu (e.g. --menu-add=fuel_sales,clients)
 *   --menu-groups="Sales=fuel_sales,sales_orders;Tanks=tank*"   choose the groups yourself (or put the lines
 *                       in app/<app>/AppRoutes/menuGroups.txt); anything you don't list is grouped automatically
 *   --menu-flat         old style: one submenu per module with Add New / Manage / View / Import
 *   --no-dashboard      don't add the Dashboard entry (it is added first in the menu when no
 *                       /dashboard/main link exists yet)
 *   --yes               don't ask, just do it     --no-menu       skip the step
 *   --menu-dir=<folder> where the file lives (relative to the project root)
 *
 * SINGLE mode no longer needs the template token: `node clone-module.js Deals` uses
 * "Smarttemplatev1" as FromEntity (override with --from=). The two-argument form
 * `node clone-module.js Smarttemplatev1 Deals` still works exactly as before.
 *
 * - The table part is ignored here (only db-cli.js needs it); "Users" alone is fine too.
 * - "--active" (or --list=active / --list-name=active) is that entry's list name, exactly
 *   like --list-name does in single mode. With no --profile=, the profile folder becomes
 *   "<list>profile" (active -> activeprofile), the convention in the examples above.
 * - FromEntity defaults to "Smarttemplatev1"; change with --from=Name.
 * - --app, --nest, --source apply to every module in the batch. A global --list-name /
 *   --profile-name is used for entries that don't give their own.
 * - QUOTE the list on the command line: a bare "->" is a redirect to the shell.
 *   (Pasting at the --bulk prompt or using --bulk-file avoids quoting entirely.)
 * - One failing entry (e.g. bad name) is reported and the rest still run.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);

// "--name=value" -> value (everything after the FIRST "="), or undefined.
function getFlag(name) {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.slice(name.length + 3);
}
const hasFlag = (name) => args.some((x) => x === `--${name}` || x.startsWith(`--${name}=`));
const positional = args.filter((a) => !a.startsWith('--'));

// Same trick db-cli.js uses: the folder this script physically lives in
// tells us which app we're in, so --app can be omitted when running against
// "this" app. Pass --app=- explicitly if the project has no app-namespace
// folder at all (module lives directly under app/).
const defaultAppNamespace = path.basename(__dirname);
const appArgRaw = getFlag('app');
const appArg = appArgRaw === '-' ? '' : (appArgRaw || defaultAppNamespace);

// Default source folder is the shared golden template. Override with
// --source= to clone from something else (e.g. an existing sibling module).
const DEFAULT_SOURCE_FOLDER = '_mosy_module_v1';
const DEFAULT_FROM_ENTITY = 'Smarttemplatev1';
const sourceArg = getFlag('source');
const nestArg = getFlag('nest');
// --keep-existing: never replace a file that's already in the destination (the
// default is to move it into _recycled/ and write the template version). Used
// when db-cli.js chains into this script AFTER it has already generated the
// schema files, so those aren't swapped back to blank template ones.
const keepExisting = hasFlag('keep-existing');
// --keep-schemas: like --keep-existing but ONLY for schema files (*Schema.js /
// schema.js). Every other existing file is recycled and replaced exactly like a
// normal run. This is what db-cli.js passes: it has just generated the schema
// files, and those are the only ones that must not be swapped for template ones.
const keepSchemas = hasFlag('keep-schemas');
const SCHEMA_FILE = /schema\.js$/i;
// Rename the "list"/"profile" page.jsx folders in place, still nested
// inside the module (e.g. clusters/active instead of clusters/list).
// Leave either off to keep that folder's default name.
const listNameArg = getFlag('list-name');
const profileNameArg = getFlag('profile-name');

const sourceFolderName = sourceArg || DEFAULT_SOURCE_FOLDER;

// Run from project root always. --app inserts the namespace folder
// (e.g. "superpos") between app/ and the module, matching your real layout.
// --nest inserts an additional grouping folder (e.g. "sales") for the
// DESTINATION only: app/<app>/<nest>/<module>. The template source is NOT
// expected to live inside the nest folder — it's a shared golden copy that
// sits at the normal app/<app>/ level regardless of where clones land.
const projectRoot = process.cwd();
const frontendSourceBase = path.join(projectRoot, 'app', ...(appArg ? [appArg] : []));
const backendSourceBase = path.join(projectRoot, 'app', 'api', ...(appArg ? [appArg] : []));
const frontendDestBase = path.join(frontendSourceBase, ...(nestArg ? [nestArg] : []));
const backendDestBase = path.join(backendSourceBase, ...(nestArg ? [nestArg] : []));

// Text file extensions safe to search/replace inside. Everything else (images, fonts) copies as-is.
const TEXT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.md', '.html']);
const PREFIXABLE_SUFFIXES = ['Schema', 'List', 'Profile'];

// "list" and "profile" are fixed Mosy conventions (not entity words) for
// the two page.jsx folders. --list-name=/--profile-name= let you rename
// them to something else while keeping them nested inside the module,
// e.g. clusters/active instead of clusters/list.
const RENAMEABLE_FOLDER_NAMES = new Set(['list', 'profile']);

// One timestamp per run, shared by every backup made during this invocation —
// makes it easy to tell which files got recycled together. Includes
// milliseconds so two runs seconds (or less) apart never collide.
function buildRunTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}
const RUN_TIMESTAMP = buildRunTimestamp();

// Moves an existing destination file into "<destRoot>/_recycled/<same relative
// path>", with the run timestamp appended to the filename for uniqueness.
// Falls back to an incrementing suffix in the rare case that path is somehow
// still taken (e.g. clock skew) — a backup is NEVER silently overwritten.
function backupExistingFile(destPath, destRoot) {
  const relPath = path.relative(destRoot, destPath);
  const ext = path.extname(relPath);
  const withoutExt = relPath.slice(0, relPath.length - ext.length);

  let backupPath = path.join(destRoot, '_recycled', `${withoutExt}.${RUN_TIMESTAMP}${ext}`);
  let attempt = 1;
  while (fs.existsSync(backupPath)) {
    attempt += 1;
    backupPath = path.join(destRoot, '_recycled', `${withoutExt}.${RUN_TIMESTAMP}-${attempt}${ext}`);
  }

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(destPath, backupPath);
  console.log(`   ♻️  existing file backed up -> ${path.relative(projectRoot, backupPath)}`);
}

/* ================= SIDEBAR MENU CONFIG ================= */

// After the module(s) are cloned, clone-module.js offers to add them to the
// app's sidebar menu: app/<app>/AppRoutes/<app>MenuConfig.js (folder via
// --menu-dir=, skip with --no-menu, auto-confirm with --yes). It shows the
// plan first and only writes after a y.
//
// GROUPED (the default) - modules are grouped so a 40-module app is ~8 menu nodes, not 40:
//
//   Fuel            <- fuel_stations, fuel_pumps, fuel_sales ...   (shared first word of the table name)
//     Stations      -> fuel_stations   (its own submenu: Add New / Manage / View / Import)
//     Pumps         -> fuel_pumps
//     Sales         -> fuel_sales
//   Tank            <- tanks, tank_devices, tank_logs
//   Clients         <- a module with no partner keeps its OWN node (Add New / Manage / View / Import)
//   Dashboard       <- always first; added when no /dashboard/main link is in the menu (--no-dashboard to skip)
//
//   - A word becomes a group when at least TWO tables start with it (tanks + tank_logs -> "Tank").
//   - Labels are made from the TABLE name: underscores become spaces ("fuel_sales" -> "Fuel sales",
//     "sales_kra_logs" -> "Sales KRA logs"). Words in ACRONYMS below are upper-cased.
//   - Inside a group every module is its own submenu with Add New / Manage / View / Import, the same four
//     links db-cli/clone-module have always made (--menu-flat = no groups, one top-level submenu per module).
//
// YOUR OWN GROUPS - say exactly what goes where, either on the command line
//   --menu-groups="Sales=fuel_sales,sales_orders,sales_*;Tanks=tanks,tank_logs"
// or in a text file (one group per line, # for comments) that is picked up automatically:
//   app/<app>/AppRoutes/menuGroups.txt
//       Sales = fuel_sales, sales_orders, sales_order_items
//       Tanks = tank*
// (--menu-groups=<file> also works.) Names are table or module names, underscores optional;
// a trailing * means "starts with". Anything you don't list is grouped automatically.
//
// A new file exports `<app>SidebarConfig` (e.g. votersappSidebarConfig); an existing file keeps
// whatever export name it already has. Additive only: modules already linked are skipped and
// nothing is reordered or removed. A group that already exists in the file (they carry
// `// <menu-group:key>` marker lines) just gets the new links added to it. The existing file is
// copied into <menu folder>/_recycled/ (timestamped) before any change.
//
//   node clone-module.js --menu-regroup   re-group the modules ALREADY in the menu file: the blocks THIS script
//                                          generated earlier are replaced by grouped ones (blocks you wrote
//                                          yourself are left alone; a copy of the old file goes to _recycled/).
//                                          It reads the menu file only - folders on disk are never listed, so a
//                                          folder that was never in the menu can't appear. (--menu does the same)
//   node clone-module.js --menu-add=fuel_sales,clients   add just these tables/modules
const noMenu = hasFlag('no-menu');
const autoYes = hasFlag('yes');
const menuDirArg = getFlag('menu-dir');
const menuFlat = hasFlag('menu-flat');
const menuRegroup = hasFlag('menu-regroup');
const menuGroupsArg = getFlag('menu-groups');
const noDashboard = hasFlag('no-dashboard');

// Words shown in capitals in menu labels. Add your own.
const ACRONYMS = new Set(['kra', 'sms', 'pos', 'api', 'url', 'vat', 'kyc', 'ussd', 'etims', 'gps', 'qr', 'otp', 'atm', 'erp', 'crm', 'id', 'ip', 'tv', 'fdc', 'lpg']);

// Menu icons follow the words of the table name (Font Awesome 4 names, like "fa fa-dashboard"):
// fuel_pump_nozzles -> tint, sales_orders -> shopping-cart, shifts -> clock-o ...
// The LAST word that has an icon wins ("fuel_staff" -> staff's icon, not fuel's), so the thing the table
// holds beats its prefix. Add or change entries freely; keys are singular, lower case.
const ICON_WORDS = {
  fuel: 'tint', pump: 'tint', nozzle: 'tint', tank: 'database', device: 'microchip', telematic: 'signal', level: 'sliders',
  station: 'map-marker', branch: 'sitemap', business: 'briefcase', point: 'desktop', location: 'map-marker', region: 'globe',
  staff: 'id-badge', employee: 'id-badge', user: 'user', admin: 'user-secret', role: 'key', permission: 'lock', setting: 'cog', system: 'cog',
  client: 'users', customer: 'users', contact: 'address-book-o', member: 'users', tenant: 'users', student: 'graduation-cap', patient: 'heartbeat',
  vehicle: 'car', fleet: 'truck', delivery: 'truck', shipment: 'truck', supplier: 'handshake-o', vendor: 'handshake-o',
  sale: 'shopping-cart', order: 'shopping-cart', cart: 'shopping-cart', item: 'list', product: 'cube', inventory: 'cubes', stock: 'cubes',
  payment: 'credit-card', invoice: 'file-text-o', receipt: 'file-text-o', quotation: 'file-text-o', price: 'tag', category: 'tags',
  tax: 'percent', kra: 'university', analysis: 'bar-chart', analytic: 'bar-chart', report: 'bar-chart', summary: 'list-alt', dashboard: 'dashboard',
  shift: 'clock-o', schedule: 'calendar', event: 'calendar', ticket: 'ticket', booking: 'calendar-check-o', room: 'bed', house: 'home', property: 'building-o',
  banking: 'bank', bank: 'bank', deposit: 'bank', finance: 'money', transaction: 'exchange', expense: 'money', income: 'money', loan: 'money', wallet: 'money', account: 'book',
  log: 'history', history: 'history', audit: 'history', message: 'envelope-o', sms: 'comment-o', notification: 'bell', document: 'file-o', file: 'file-o', note: 'sticky-note-o',
};
const ICON_DEFAULT_GROUP = 'fa fa-folder-o';
const ICON_DEFAULT_ITEM = 'fa fa-circle-o';
// Generic trailing words that only decide the icon when nothing else in the name has one:
// "telematics_logs" -> the telematics icon, not the log icon.
const ICON_WEAK = new Set(['log', 'history', 'summary', 'item', 'level']);
function iconFor(words, fallback) {
  const list = (Array.isArray(words) ? words : String(words).split(/[\s_]+/)).map((w) => singularWord(String(w).toLowerCase())).filter(Boolean);
  for (const weakPass of [false, true]) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (ICON_WORDS[list[i]] && ICON_WEAK.has(list[i]) === weakPass) return `fa fa-${ICON_WORDS[list[i]]}`;
    }
  }
  return fallback;
}

const capFirst = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ["fuel","sales"] -> "Fuel sales"; ["sales","kra","logs"] -> "Sales KRA logs"
function formatWords(words) {
  const list = words.filter(Boolean);
  const out = list.map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  if (out.length && !ACRONYMS.has(list[0].toLowerCase())) out[0] = capFirst(out[0]);
  return out.join(' ');
}

function singularWord(w) {
  if (w.length > 1 && w === w.toUpperCase()) return w; // acronym
  if (/ies$/i.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/(ch|sh|x|z|ss)es$/i.test(w)) return w.slice(0, -2);
  return /s$/i.test(w) ? w.slice(0, -1) : w;
}
function menuSingular(text) {
  const parts = text.split(' ');
  parts[parts.length - 1] = singularWord(parts[parts.length - 1]);
  return parts.join(' ');
}

// The table behind a module, read from the schema already on disk (entity: 'fuel_sales').
function schemaInfoFromDisk(basePath) {
  const dir = path.join(frontendSourceBase, ...basePath.split('/'));
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).filter((f) => /schema\.js$/i.test(f)).sort((a, b) => a.length - b.length);
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const entity = /\bentity\s*:\s*['"]([^'"]+)['"]/.exec(text);
    if (entity) return { table: entity[1], label: (/^\s*label\s*:\s*['"]([^'"]+)['"]/m.exec(text) || [])[1] || '' };
  }
  return {};
}

// A menu entry. tokens = the words of the name ("fuel","sales"); variant = list-name prefix ("active").
function buildMenuItem({ moduleFolder, basePath, table, pascalName, variant, listFolder, profileFolder }) {
  basePath = basePath || [nestArg, moduleFolder].filter(Boolean).join('/');
  const info = table ? {} : schemaInfoFromDisk(basePath);
  const tbl = table || info.table || '';
  // Use the table's words only when the module is the plain name of that table (fuel_sales -> fuelsales);
  // a hand-picked module name (clients_tbl -> ActiveCustomers) keeps its own words.
  const fromTable = tbl && /^[A-Za-z0-9_]+$/.test(tbl) && norm(tbl) === norm(moduleFolder);
  const tokens = fromTable
    ? tbl.split('_').filter(Boolean)
    : (pascalName || info.label || moduleFolder).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_]+/).filter(Boolean);
  const item = {
    moduleFolder, table: fromTable ? tbl : '', tokens, variant: variant || '',
    basePath,
    listFolder: listFolder || 'list', profileFolder: profileFolder || 'profile',
  };
  item.words = formatWords(item.variant ? [item.variant, ...tokens] : tokens);
  return item;
}

function menuItemFromClone({ ToEntity, toLower, listName, profileName, customPrefixCap, table }) {
  return buildMenuItem({
    moduleFolder: toLower, table, pascalName: ToEntity, variant: customPrefixCap,
    listFolder: listName, profileFolder: profileName,
  });
}

function menuLinks(item, name = item.words) {
  return [
    [`Add New ${menuSingular(name)}`, item.profileFolder],
    [`Manage ${name}`, `${item.listFolder}?setgv=sheet`],
    [`View ${name}`, `${item.listFolder}?setgv=table`],
    [`Import ${name}`, 'import'],
  ];
}

// "<app>SidebarConfig", e.g. votersapp -> votersappSidebarConfig. App names with
// hyphens/dots become camelCase (my-app -> myAppSidebarConfig) so it's a valid
// JS identifier; a leading digit gets an underscore.
function menuExportName() {
  const parts = appArg.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  let base = parts.map((w, i) => (i === 0 ? w : capFirst(w))).join('');
  if (/^\d/.test(base)) base = `_${base}`;
  return `${base}SidebarConfig`;
}

const menuRouteRef = () => (/^[A-Za-z_$][\w$]*$/.test(appArg) ? `routes.${appArg}` : `routes["${appArg}"]`);
const menuHref = (item, suffix) => `(routes) => \`\${${menuRouteRef()}}/${item.basePath}/${suffix}\``;

/* ---- flat blocks (--menu-flat): one submenu per module with four links ---- */

function buildMenuBlock(item) {
  const entries = menuLinks(item).map(([text, suffix]) => `      {\n        label: "${text}",\n        href: ${menuHref(item, suffix)},\n        roles: []\n      }`);
  return [
    '  // ============================================================',
    `  // ${item.words.toUpperCase()}  (added by clone-module.js)`,
    '  // ============================================================',
    '',
    '  {',
    '    type: "submenu",',
    `    label: "${item.words}",`,
    `    icon: "${iconFor(item.tokens, ICON_DEFAULT_GROUP)}",`,
    '    roles: [],',
    '    items: [',
    '',
    entries.join(',\n'),
    '',
    '    ]',
    '  }',
  ].join('\n');
}

/* ---- grouped blocks (default) ---- */

// Manual groups: "Sales=fuel_sales,sales_*;Tanks=tanks" (or lines in a file).
function parseManualGroups(raw) {
  const groups = [];
  for (const chunk of raw.split(/[;\r\n]+/)) {
    const line = chunk.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([^=:]+?)\s*[=:]\s*(.+)$/.exec(line);
    if (!m) { console.log(`⚠️  Menu groups: couldn't read "${line}" - expected  Label = table1, table2`); continue; }
    const patterns = m[2].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    groups.push({ label: m[1].trim(), key: norm(m[1]), patterns });
  }
  return groups;
}

function loadManualGroups() {
  let raw = '';
  if (menuGroupsArg !== undefined) {
    raw = fs.existsSync(menuGroupsArg) ? fs.readFileSync(menuGroupsArg, 'utf8') : menuGroupsArg;
  } else if (appArg) {
    const file = path.join(projectRoot, 'app', appArg, 'AppRoutes', 'menuGroups.txt');
    if (fs.existsSync(file)) raw = fs.readFileSync(file, 'utf8');
  }
  return raw ? parseManualGroups(raw) : [];
}

function matchesPattern(item, pattern) {
  const p = norm(pattern.replace(/\*$/, ''));
  if (!p) return false;
  const names = [norm(item.table), norm(item.moduleFolder)].filter(Boolean);
  return pattern.endsWith('*') ? names.some((n) => n.startsWith(p)) : names.includes(p);
}

const groupKeyOf = (item) => norm(singularWord(item.tokens[0] || item.moduleFolder));
const existingGroupKeys = (content) => new Set([...(content || '').matchAll(/\/\/ <menu-group:([a-z0-9]+)>/g)].map((m) => m[1]));

// Label of an item inside its group: the group word is dropped ("Fuel sales" in "Fuel" -> "Sales").
function itemLabelIn(item, groupKey) {
  const words = item.variant ? [item.variant, ...item.tokens] : item.tokens;
  const tokens = item.variant ? words.slice(1) : words;
  if (tokens.length > 1 && norm(singularWord(tokens[0])) === groupKey) {
    return formatWords(item.variant ? [item.variant, ...tokens.slice(1)] : tokens.slice(1));
  }
  return item.words;
}

// -> ordered [{ key, label, items }]
function planGroups(items, existingKeys, manual) {
  const placed = new Map(); // item -> { key, label }
  const rest = [];
  for (const it of items) {
    const g = manual.find((m) => m.patterns.some((p) => matchesPattern(it, p)));
    if (g) placed.set(it, { key: g.key, label: g.label });
    else rest.push(it);
  }
  // a word shared by 2+ different tables (or by a group already in the file) makes a group
  const tablesByKey = new Map();
  rest.forEach((it) => {
    const k = groupKeyOf(it);
    if (!tablesByKey.has(k)) tablesByKey.set(k, new Set());
    tablesByKey.get(k).add(it.moduleFolder);
  });
  for (const it of rest) {
    const k = groupKeyOf(it);
    const qualifies = (tablesByKey.get(k).size >= 2 || existingKeys.has(k)) && k;
    if (qualifies) {
      const multi = rest.find((o) => groupKeyOf(o) === k && o.tokens.length > 1) || it;
      placed.set(it, { key: k, label: formatWords([multi.tokens[0]]) });
    } else {
      // no partner to group with: it keeps its own menu node (the classic Add New / Manage / View / Import)
      placed.set(it, { key: `solo:${it.basePath}|${it.listFolder}`, label: it.words, standalone: true });
    }
  }
  const groups = new Map();
  for (const it of items) {
    const { key, label, standalone } = placed.get(it);
    if (!groups.has(key)) groups.set(key, { key, label, items: [], standalone: !!standalone });
    groups.get(key).items.push(it);
  }
  return [...groups.values()];
}

// Inside a group every module is its own submenu with the four standard links (the group word is dropped
// from the name: group "Sales" -> "Orders" -> Add New Order / Manage Orders / View Orders / Import Orders).
function groupItemLines(group) {
  return group.items.map((it) => {
    const name = itemLabelIn(it, group.key);
    const links = menuLinks(it, name).map(([text, suffix]) => [
      '          {',
      `            label: "${text}",`,
      `            href: ${menuHref(it, suffix)},`,
      '            roles: []',
      '          }',
    ].join('\n')).join(',\n');
    return [
      '      {',
      '        type: "submenu",',
      `        label: "${name}",`,
      `        icon: "${iconFor(it.tokens, ICON_DEFAULT_ITEM)}",`,
      '        roles: [],',
      '        items: [',
      links,
      '        ]',
      '      },',
    ].join('\n');
  }).join('\n');
}

function buildGroupBlock(group) {
  return [
    '  // ============================================================',
    `  // ${group.label.toUpperCase()}  (menu group - added by clone-module.js)`,
    '  // ============================================================',
    '',
    '  {',
    '    type: "submenu",',
    `    label: "${group.label}",`,
    `    icon: "${iconFor(group.label, ICON_DEFAULT_GROUP)}",`,
    '    roles: [],',
    '    items: [',
    `      // <menu-group:${group.key}>`,
    groupItemLines(group),
    `      // </menu-group:${group.key}>`,
    '    ]',
    '  }',
  ].join('\n');
}

// Adds links to a group that is already in the file (found by its marker lines). null = no such group.
function addToExistingGroup(content, group) {
  const close = `// </menu-group:${group.key}>`;
  const idx = content.indexOf(close);
  if (idx === -1) return null;
  const lineStart = content.lastIndexOf('\n', idx) + 1;
  return `${content.slice(0, lineStart)}${groupItemLines(group)}\n${content.slice(lineStart)}`;
}

// --menu-regroup: drops the blocks this script generated (flat or grouped); everything else stays.
function removeGeneratedBlocks(content) {
  const re = /^  \/\/ =+\n  \/\/ [^\n]*\(([^)\n]*)added by clone-module\.js\)\n  \/\/ =+\n\n  \{\n[\s\S]*?\n  \},?[ \t]*\n?/gm;
  let removed = 0;
  const out = content.replace(re, () => { removed += 1; return ''; });
  return { content: out.replace(/\n{3,}/g, '\n\n'), removed };
}

const isLinkedInMenu = (content, item) =>
  content.includes(`/${item.basePath}/${item.profileFolder}`) || content.includes(`/${item.basePath}/${item.listFolder}?setgv=`);

// Home entry, added at the TOP of the menu whenever the file has no dashboard link yet
// (any href containing /dashboard/main counts as one). Skip with --no-dashboard.
const hasDashboardLink = (content) => /\/dashboard\/main/.test(content || '');
function buildDashboardBlock() {
  return [
    '  // ============================================================',
    '  // HOME  (added by clone-module.js)',
    '  // ============================================================',
    '',
    '  {',
    '    type: "link",',
    '    label: "Dashboard",',
    '    icon: "fa fa-dashboard",',
    `    href: (routes) => \`\${${menuRouteRef()}}/dashboard/main\`,`,
    '    roles: []',
    '  },',
  ].join('\n');
}
// Puts `block` first in the sidebar array. null = file doesn't look like `export const ...SidebarConfig = [`.
function insertAtTopOfSidebarConfig(content, block) {
  const m = /export\s+const\s+\w*[Ss]idebarConfig\s*=\s*\[/.exec(content);
  if (!m) return null;
  const at = m.index + m[0].length;
  return `${content.slice(0, at)}\n\n${block}\n${content.slice(at)}`;
}

// Appends `block` as the last element of `export const <anything>SidebarConfig = [ ... ];`
// (whatever name the file already exports - an existing file's name is never changed).
// Returns the new file text, or null if the file doesn't look the way this
// expects (the caller then prints the block to paste by hand instead of
// risking a bad edit to a file that's been customised).
function insertIntoSidebarConfig(content, block) {
  if (!/export\s+const\s+\w*[Ss]idebarConfig\s*=\s*\[/.test(content)) return null;
  const end = content.lastIndexOf('];');
  if (end === -1) return null;
  let i = end - 1;
  while (i >= 0 && /\s/.test(content[i])) i -= 1;
  let before = content.slice(0, i + 1);
  const last = content[i];
  if (last === '}') before += ',';
  else if (last !== ',' && last !== '[') return null;
  return `${before}\n\n${block}\n${content.slice(end)}`;
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.on('close', () => { if (!answered) resolve(false); }); // stdin closed / not interactive
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(/^(y|yes)$/i.test(answer.trim()));
    });
  });
}

// Menu entries for the NAMED modules only (--menu-add=fuel_sales,clients). Names are table or module names;
// a module is found by its folder (underscores dropped) - the app folder is never listed. A "page" folder is
// a sub-folder of THAT module holding page.jsx/js/tsx/ts; names ending in "profile" are profile pages, the
// rest (except import/) are list pages. A list pairs with "<list>profile" if present, else "profile".
function menuItemsForModules(names) {
  const items = [];
  const PAGE_FILES = ['page.jsx', 'page.js', 'page.tsx', 'page.ts'];
  const isProfile = (n) => /profile$/i.test(n);

  for (const name of names) {
    const mod = norm(name);
    const modDir = path.join(frontendDestBase, mod);
    if (!mod || !fs.existsSync(modDir)) { console.log(`⚠️  Menu: no module folder "${path.relative(projectRoot, modDir).split(path.sep).join('/')}" for "${name}" - skipped.`); continue; }
    const pages = fs.readdirSync(modDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && e.name.toLowerCase() !== 'import'
        && PAGE_FILES.some((f) => fs.existsSync(path.join(modDir, e.name, f))))
      .map((e) => e.name);
    const lists = pages.filter((n) => !isProfile(n));
    const profiles = fs.readdirSync(modDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && isProfile(e.name)).map((e) => e.name);
    if (lists.length === 0) { console.log(`⚠️  Menu: "${name}" has no list page yet - skipped.`); continue; }
    for (const list of lists) {
      const profile = profiles.includes(`${list}profile`) ? `${list}profile` : (profiles.includes('profile') ? 'profile' : (profiles[0] || 'profile'));
      const variant = list !== 'list' && !mod.startsWith(list.toLowerCase()) ? list : '';
      items.push(buildMenuItem({ moduleFolder: mod, table: '', pascalName: '', variant, listFolder: list, profileFolder: profile }));
    }
  }
  return items;
}

// For --menu-regroup: the modules ALREADY in the menu file (in the blocks this script generated, flat or
// grouped), read from their links. Nothing is discovered from the folders on disk, so a folder that was
// never in the menu can't sneak in. Only each module's own schema is read, to get its table's words.
function menuItemsFromConfig(content) {
  const re = /^  \/\/ =+\n  \/\/ [^\n]*added by clone-module\.js\)\n  \/\/ =+\n\n  \{\n[\s\S]*?\n  \},?[ \t]*\n?/gm;
  const found = new Map(); // basePath|list -> { basePath, list }
  for (const block of content.match(re) || []) {
    for (const m of block.matchAll(/href:\s*\(routes\)\s*=>\s*`\$\{[^}]+\}\/([^`]+)`/g)) {
      const segs = m[1].split('/');
      const last = segs.pop();
      const lm = /^([^?]+)\?setgv=/.exec(last);
      if (!lm || !segs.length) continue; // only the list links identify a module + its list page
      const key = `${segs.join('/')}|${lm[1]}`;
      if (!found.has(key)) found.set(key, { basePath: segs.join('/'), list: lm[1] });
    }
  }
  return [...found.values()].map(({ basePath, list }) => {
    const moduleFolder = basePath.split('/').pop();
    const dir = path.join(frontendSourceBase, ...basePath.split('/'));
    const profile = [`${list}profile`, 'profile'].find((n) => fs.existsSync(path.join(dir, n))) || (list === 'list' ? 'profile' : `${list}profile`);
    const variant = list !== 'list' && !moduleFolder.startsWith(list.toLowerCase()) ? list : '';
    return buildMenuItem({ moduleFolder, basePath, table: '', pascalName: '', variant, listFolder: list, profileFolder: profile });
  });
}

function printMenuPlan(groups, routeRef) {
  groups.forEach((g, i) => {
    if (g.standalone) { console.log(`  ${i + 1}. ${g.label}   (own menu: Add New / Manage / View / Import)`); return; }
    console.log(`  ${i + 1}. ${g.label}  (${g.items.length})`);
    g.items.forEach((it) => console.log(`       ${itemLabelIn(it, g.key).padEnd(28)} ${routeRef}/${it.basePath}/   (Add New / Manage / View / Import)`));
  });
}

async function offerMenuConfig(items, { regroup = false } = {}) {
  if (noMenu) return;
  if (!appArg) {
    console.log('\nℹ️  Menu config skipped: no app namespace (--app=-), so there is no routes.<app> key to build the links from.');
    return;
  }

  const menuDir = menuDirArg ? path.resolve(projectRoot, menuDirArg) : path.join(projectRoot, 'app', appArg, 'AppRoutes');
  const menuPath = path.join(menuDir, `${appArg}MenuConfig.js`);
  const rel = path.relative(projectRoot, menuPath).split(path.sep).join('/');
  // The file may use Windows (CRLF) line endings: work on LF text, write back in the style it had.
  const rawExisting = fs.existsSync(menuPath) ? fs.readFileSync(menuPath, 'utf8') : null;
  const crlf = rawExisting !== null && rawExisting.includes('\r\n');
  const existing = rawExisting === null ? null : rawExisting.replace(/\r\n/g, '\n');

  // --menu-regroup (items === null): the modules to place are the ones ALREADY in this file - never the folder listing.
  if (items === null) {
    if (existing === null) {
      console.log(`\nℹ️  Menu: ${rel} doesn't exist yet - nothing to regroup. Clone a module first, or add some with --menu-add=table1,table2.`);
      return;
    }
    items = menuItemsFromConfig(existing);
    if (items.length === 0) {
      console.log(`\nℹ️  Menu: no generated module links found in ${rel} - nothing to regroup (blocks you wrote yourself are never touched).`);
      return;
    }
  }

  // --menu-regroup: take the generated blocks out first, then those modules count as "not linked yet".
  let base = existing;
  let removedBlocks = 0;
  if (regroup && existing !== null) {
    const r = removeGeneratedBlocks(existing);
    base = r.content;
    removedBlocks = r.removed;
  }

  const seen = new Set();
  const unique = items.filter((it) => {
    const key = `${it.basePath}|${it.listFolder}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const toAdd = unique.filter((it) => !(base !== null && isLinkedInMenu(base, it)));
  const skipped = unique.length - toAdd.length;

  const needDashboard = !noDashboard && !hasDashboardLink(base);
  if (toAdd.length === 0 && removedBlocks === 0 && !needDashboard) {
    console.log(unique.length
      ? `\n🧭 Menu: ${skipped} module(s) already linked in ${rel} - nothing to add.`
      : '\n🧭 Menu: no modules found to add.');
    return;
  }

  const routeRef = menuRouteRef();
  const manual = menuFlat ? [] : loadManualGroups();
  const groups = menuFlat ? [] : planGroups(toAdd, existingGroupKeys(base), manual);
  if (manual.length && regroup) { // only meaningful when the whole menu is being placed
    const unmatched = manual.flatMap((g) => g.patterns.filter((p) => !unique.some((it) => matchesPattern(it, p))).map((p) => `${g.label}: ${p}`));
    if (unmatched.length) console.log(`⚠️  Menu groups: no module matched ${unmatched.join(', ')}`);
  }

  console.log(`\n🧭 Found ${toAdd.length} module(s) to add to the sidebar menu${skipped ? ` (${skipped} already linked, skipped)` : ''}${menuFlat ? ' - one submenu per module (--menu-flat)' : ` - grouped into ${groups.length} menu node(s)`}.`);
  console.log(`   File: ${rel} - ${existing === null ? 'will be created' : 'exists; a copy goes to _recycled/ first, then these are added'}`);
  if (removedBlocks) console.log(`   --menu-regroup: ${removedBlocks} block(s) generated earlier by this script will be replaced; blocks you wrote yourself are kept.`);
  console.log('');
  if (needDashboard) console.log(`  + Dashboard (first in the menu)   ${routeRef}/dashboard/main\n`);
  if (menuFlat) {
    const labelWidth = Math.max(...toAdd.flatMap((it) => menuLinks(it).map(([t]) => t.length)));
    toAdd.forEach((it, i) => {
      console.log(`  ${i + 1}. ${it.words}`);
      menuLinks(it).forEach(([text, suffix]) => console.log(`       ${text.padEnd(labelWidth)}  ${routeRef}/${it.basePath}/${suffix}`));
    });
  } else {
    printMenuPlan(groups, routeRef);
  }

  if (!autoYes && !(await askYesNo(`\nAdd ${toAdd.length} module(s)${needDashboard ? ' and the Dashboard entry' : ''} to the menu? (y/n) `))) {
    console.log(`ℹ️  Skipped. Run it later with: node clone-module.js --menu${regroup ? '-regroup' : ''}`);
    return;
  }

  let content = base;
  if (content === null) {
    content = [
      `// ${appArg}MenuConfig.js`,
      '//',
      `// Sidebar menu for the "${appArg}" app. Extended by clone-module.js: modules you`,
      '// confirm are added below, grouped by the first word of their table name',
      '// (fuel_stations, fuel_pumps -> "Fuel"). Modules already here are never duplicated,',
      '// and the file is copied to _recycled/ before any change - so reorder, rename,',
      '// regroup, add dashboards or quick actions and set `roles` freely.',
      '// Your own grouping: app/<app>/AppRoutes/menuGroups.txt  ("Sales = fuel_sales, sales_orders").',
      '',
      `export const ${menuExportName()} = [`,
      '',
      '];',
      '',
    ].join('\n');
  }

  const manualPaste = [];
  let added = 0;
  let dashboardAdded = false;
  if (menuFlat) {
    for (const it of toAdd) {
      const updated = insertIntoSidebarConfig(content, buildMenuBlock(it));
      if (updated === null) manualPaste.push(buildMenuBlock(it));
      else { content = updated; added += 1; }
    }
  } else {
    for (const g of groups) {
      if (g.standalone) {
        const block = buildMenuBlock(g.items[0]);
        const updated = insertIntoSidebarConfig(content, block);
        if (updated === null) manualPaste.push(block);
        else { content = updated; added += 1; }
        continue;
      }
      const into = addToExistingGroup(content, g);
      if (into !== null) { content = into; added += g.items.length; continue; }
      const updated = insertIntoSidebarConfig(content, buildGroupBlock(g));
      if (updated === null) manualPaste.push(buildGroupBlock(g));
      else { content = updated; added += g.items.length; }
    }
  }

  if (needDashboard) {
    const withDash = insertAtTopOfSidebarConfig(content, buildDashboardBlock());
    if (withDash === null) manualPaste.push(buildDashboardBlock());
    else { content = withDash; added += 0; dashboardAdded = true; }
  }

  if (added > 0 || removedBlocks > 0 || dashboardAdded) {
    if (existing !== null) {
      let backupPath = path.join(menuDir, '_recycled', `${appArg}MenuConfig.${RUN_TIMESTAMP}.js`);
      for (let n = 2; fs.existsSync(backupPath); n += 1) backupPath = path.join(menuDir, '_recycled', `${appArg}MenuConfig.${RUN_TIMESTAMP}-${n}.js`);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(menuPath, backupPath);
      console.log(`   ♻️  existing menu config backed up -> ${path.relative(projectRoot, backupPath).split(path.sep).join('/')}`);
    }
    fs.mkdirSync(menuDir, { recursive: true });
    fs.writeFileSync(menuPath, crlf ? content.replace(/\n/g, '\r\n') : content);
    console.log(`✅ Menu: ${existing === null ? 'created' : 'updated'} ${rel} - added ${added} module(s)${dashboardAdded ? ' + Dashboard' : ''}.`);
  }
  if (manualPaste.length) {
    console.log(`⚠️  Couldn't safely edit ${rel} (no "export const ...SidebarConfig = [ ... ];" ending in an item). Paste ${manualPaste.length === 1 ? 'this' : 'these'} in yourself:\n`);
    manualPaste.forEach((b) => console.log(`${b}\n`));
  }
}

/* ================= CLONE ONE MODULE ================= */

// Everything the old top-level script did, wrapped so it can run once
// (single mode) or once per entry (bulk mode). Throws instead of calling
// process.exit so a bulk run can report a failed entry and carry on.
function cloneModule({ FromEntity, ToEntity, listName, profileName, skipDuplicatePrefix = false, table = '' }) {
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(FromEntity) || !/^[A-Z][a-zA-Z0-9]*$/.test(ToEntity)) {
    throw new Error(`Both entity names must be PascalCase, e.g. "Staff", "Client", "CreditNote" (got "${FromEntity}" -> "${ToEntity}").`);
  }

  const fromLower = FromEntity.toLowerCase();
  const toLower = ToEntity.toLowerCase();
  const fromUpper = FromEntity.toUpperCase();
  const toUpper = ToEntity.toUpperCase();

  const PAIRS = [
    { src: path.join(frontendSourceBase, sourceFolderName), dest: path.join(frontendDestBase, toLower) },
    { src: path.join(backendSourceBase, sourceFolderName), dest: path.join(backendDestBase, toLower) },
  ];
  const existingPairs = PAIRS.filter((p) => fs.existsSync(p.src));

  if (existingPairs.length === 0) {
    throw new Error(`No source folder found. Looked for:\n${PAIRS.map((p) => `   ${p.src}`).join('\n')}`);
  }

  // Destination folders are allowed to already exist — we merge into them.
  // Individual files that already exist get backed up (see backupExistingFile).
  for (const { dest } of existingPairs) {
    if (fs.existsSync(dest)) {
      console.log(`ℹ️  Target folder already exists, merging into it: ${path.relative(projectRoot, dest)}`);
    }
  }

  // Optional custom prefix layered on top of the normal entity swap for the
  // three compound identifiers tied to the list/profile pages: "<Entity>Schema",
  // "<Entity>List", "<Entity>Profile" (e.g. ClustersSchema, ClustersList,
  // ClustersProfile). Derived from the list name (preferred) or the profile
  // name if that's the only one given — matching the convention that the list
  // name is the base and the profile name is usually "<list name>profile".
  let customPrefixRaw = listName || profileName || '';
  // Bulk mode only: "ActiveCustomers --active" would otherwise become
  // ActiveActiveCustomersSchema. When the module name already starts with the
  // list name, the prefix is already there — skip it (folders still rename).
  // db-cli.js bulk mode applies the identical rule so the names keep matching.
  if (skipDuplicatePrefix && customPrefixRaw && ToEntity.toLowerCase().startsWith(customPrefixRaw.toLowerCase())) {
    console.log(`ℹ️  "${ToEntity}" already starts with "${customPrefixRaw}" — not adding it again as an identifier prefix.`);
    customPrefixRaw = '';
  }
  const customPrefixCap = customPrefixRaw
    ? customPrefixRaw.charAt(0).toUpperCase() + customPrefixRaw.slice(1).toLowerCase()
    : '';

  function renameTokens(str) {
    let result = str
      .split(FromEntity).join(ToEntity)   // Staff -> Client
      .split(fromLower).join(toLower)      // staff -> client
      .split(fromUpper).join(toUpper);     // STAFF -> CLIENT

    if (customPrefixCap) {
      for (const suffix of PREFIXABLE_SUFFIXES) {
        const standardToken = `${ToEntity}${suffix}`;                 // e.g. "ClustersSchema"
        const customToken = `${customPrefixCap}${ToEntity}${suffix}`; // e.g. "ActiveClustersSchema"
        result = result.split(standardToken).join(customToken);
      }
    }
    return result;
  }

  const keptFiles = [];

  // isRoot is true only for the very first call per module (frontend or
  // backend base) — the list/profile rename only ever applies to those
  // folders sitting directly under the module root, never to nested
  // folders elsewhere in the tree that happen to share the name.
  function cloneDir(src, dest, destRoot, isRoot = false) {
    fs.mkdirSync(dest, { recursive: true });

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);

      let destName;
      const lowerName = entry.name.toLowerCase();
      if (isRoot && entry.isDirectory() && RENAMEABLE_FOLDER_NAMES.has(lowerName)) {
        const customName = lowerName === 'list' ? listName : profileName;
        destName = customName || entry.name; // no rename requested -> keep "list"/"profile" as-is
      } else {
        destName = renameTokens(entry.name);
      }
      const destPath = path.join(dest, destName);

      if (entry.isDirectory()) {
        if (destName !== entry.name) {
          console.log(`   ↳ renaming "${entry.name}/" -> "${destName}/"`);
        }
        cloneDir(srcPath, destPath, destRoot, false);
      } else {
        if (fs.existsSync(destPath)) {
          if (keepExisting || (keepSchemas && SCHEMA_FILE.test(entry.name))) {
            keptFiles.push(path.relative(projectRoot, destPath));
            continue;
          }
          backupExistingFile(destPath, destRoot);
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext)) {
          const content = fs.readFileSync(srcPath, 'utf8');
          fs.writeFileSync(destPath, renameTokens(content));
        } else {
          fs.copyFileSync(srcPath, destPath); // binary — copy untouched
        }
      }
    }
  }

  console.log(`📁 Cloning module "${fromLower}" -> "${toLower}"`);
  console.log(`   ${FromEntity} -> ${ToEntity}`);
  console.log(`   ${fromLower} -> ${toLower}`);
  console.log(`   ${fromUpper} -> ${toUpper}`);
  console.log(`   app    = ${appArg || '(none)'}${appArgRaw ? '' : ' (defaulted)'}`);
  console.log(`   source = ${sourceFolderName}${sourceArg ? '' : ' (defaulted)'}\n`);

  for (const { src, dest } of existingPairs) {
    // dest is also the recycled-backup root for everything under it, so
    // backups land at <dest>/_recycled/... mirroring the real folder structure.
    cloneDir(src, dest, dest, true);
    console.log(`✅ ${path.relative(projectRoot, src)} -> ${path.relative(projectRoot, dest)}`);
  }

  const schemaPath = path.join('app', ...(appArg ? [appArg] : []), ...(nestArg ? [nestArg] : []), toLower, 'schema.js').split(path.sep).join('/');
  if (keepExisting || keepSchemas) {
    console.log(`\n⏭️  ${keptFiles.length} file(s) already existed and were left untouched${keptFiles.length ? `: ${keptFiles.map((f) => path.basename(f)).join(', ')}` : ''}.`);
    console.log(`👉 The schema files came from db-cli.js — hand-tune them as needed.`);
  } else {
    console.log(`\n👉 Now edit ${schemaPath} — that's the only file that needs changing.`);
    console.log(`👉 Then run db-cli.js to create the "${toLower}" table.`);
  }
  if (listName || profileName) {
    const moduleDir = schemaPath.replace('/schema.js', '');
    console.log(`👉 List page renamed to ${moduleDir}/${listName || 'list'}, profile page renamed to ${moduleDir}/${profileName || 'profile'}.`);
    if (customPrefixCap) {
      console.log(`👉 ${customPrefixCap}${ToEntity}Schema/List/Profile identifiers and uiControl filenames updated everywhere they're referenced in the module.`);
    }
  }

  return { ToEntity, toLower, listName, profileName, customPrefixCap, table };
}

/* ================= BULK LIST PARSING ================= */

// Parses a comma / semicolon / newline separated list of entries like:
//
//   system_users -> Users , clients_tbl -> ActiveCustomers --active
//
// Each entry: [table ->] Module [--listname] [--profile=name]
//   - "--active" (bare flag) or "--list=active" / "--list-name=active" sets the list name
//   - "--profile=activeprofile" overrides the profile folder name
// Same format db-cli.js's bulk mode understands, so one list works for both.
// In THIS script the table part is ignored (only db-cli needs it); an entry
// with no arrow is read as just the module name.
function parseBulkList(raw) {
  const entries = [];
  const errors = [];
  const chunks = raw.split(/[,;\r\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const chunk of chunks) {
    let list = '';
    let profile = '';
    const rest = [];
    let bad = false;

    for (const word of chunk.split(/\s+/)) {
      if (!word.startsWith('--')) { rest.push(word); continue; }
      const body = word.slice(2);
      const eq = body.indexOf('=');
      const key = (eq < 0 ? body : body.slice(0, eq));
      const val = eq < 0 ? '' : body.slice(eq + 1);
      const keyLc = key.toLowerCase();
      if (['list', 'listname', 'list-name'].includes(keyLc) && val) list = val;
      else if (['profile', 'profilename', 'profile-name'].includes(keyLc) && val) profile = val;
      else if (eq < 0 && key) list = key;
      else { errors.push(`"${chunk}" — unrecognised flag "${word}"`); bad = true; }
    }
    if (bad) continue;

    const parts = rest.join(' ').split(/\s*(?:->|→|=>)\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0 || parts.length > 2) {
      errors.push(`"${chunk}" — expected "table -> Module" or just "Module"`);
      continue;
    }
    const module = parts[parts.length - 1];
    const NAME_OK = /^[A-Za-z][A-Za-z0-9_-]*$/;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(module)) {
      errors.push(`"${chunk}" — module name "${module}" must be letters/numbers only (e.g. Users, CreditNote)`);
      continue;
    }
    if ((list && !NAME_OK.test(list)) || (profile && !NAME_OK.test(profile))) {
      errors.push(`"${chunk}" — list/profile names may only use letters, numbers, "_" and "-"`);
      continue;
    }
    entries.push({ table: parts.length === 2 ? parts[0] : '', module, list, profile });
  }
  return { entries, errors };
}

// Reads a multi-line list from the terminal (blank line to finish) so a long
// list can be pasted without worrying about shell quoting — a bare "->" on a
// command line is treated by the shell as a redirect, so the CLI form needs quotes.
function promptForList(moduleNames = []) {
  // Tab completes the MODULE name of the entry being typed: the word at the
  // start of an entry, or the word right after "->". Nothing is suggested for
  // a --flag or once the word is finished (a space follows it).
  const completer = (line) => {
    if (moduleNames.length === 0) return [[], line];
    let seg = line.slice(Math.max(line.lastIndexOf(','), line.lastIndexOf(';')) + 1);
    const arrow = Math.max(seg.lastIndexOf('->'), seg.lastIndexOf('=>'), seg.lastIndexOf('→'));
    if (arrow >= 0) seg = seg.slice(arrow + (seg[arrow] === '→' ? 1 : 2));
    seg = seg.trimStart();
    if (/\s/.test(seg) || seg.startsWith('--')) return [[], line];
    return [moduleNames.filter((m) => m.toLowerCase().startsWith(seg.toLowerCase())), seg];
  };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, completer });
  console.log('List the modules to create — e.g.  Users , ActiveCustomers --active');
  console.log('(one entry per line or comma-separated; blank line to finish. "table -> Module" is accepted too, the table part is ignored here)');
  if (moduleNames.length) console.log('Press Tab to complete an existing module name (Tab twice lists all matches).');
  printModuleNames(moduleNames);
  return new Promise((resolve) => {
    const lines = [];
    rl.setPrompt('> ');
    rl.prompt();
    rl.on('line', (line) => {
      if (!line.trim()) { rl.close(); return; }
      lines.push(line);
      rl.prompt();
    });
    rl.on('close', () => resolve(lines.join('\n')));
  });
}

/* ================= EXISTING MODULES (on-screen list + Tab) ================= */

// Module folders that already exist under app/<app>[/<nest>] (frontend) and
// app/api/<app>[/<nest>] (backend) — the same idea as db-cli.js listing table
// names, but here the names that matter are modules. A folder counts as a
// module when it shares at least one sub-folder/file name with the template
// (dataControl, uiControl, ...; "list"/"profile" are ignored since they can be
// renamed), so AppRoutes/, DataControl/, api/ etc. don't clutter the list.
// If the template itself can't be found, every non-hidden folder is listed.
function listExistingModules() {
  const ignore = new Set(['list', 'profile', '_recycled']);
  let templateChildren = null;
  for (const base of [frontendSourceBase, backendSourceBase]) {
    const tpl = path.join(base, sourceFolderName);
    if (fs.existsSync(tpl)) {
      const kids = fs.readdirSync(tpl).map((n) => n.toLowerCase()).filter((n) => !ignore.has(n));
      templateChildren = new Set([...(templateChildren || []), ...kids]);
    }
  }

  const names = new Set();
  for (const base of [frontendDestBase, backendDestBase]) {
    if (!fs.existsSync(base)) continue;
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
      if (templateChildren && templateChildren.size) {
        const kids = fs.readdirSync(path.join(base, e.name)).map((n) => n.toLowerCase());
        if (!kids.some((k) => templateChildren.has(k))) continue;
      }
      names.add(e.name);
    }
  }
  return [...names].sort();
}

// Prints names in aligned columns that fit the terminal width.
function printModuleNames(names) {
  const where = path.relative(projectRoot, frontendDestBase).split(path.sep).join('/') || 'app';
  if (!names.length) return console.log(`\n(no existing modules found under ${where})\n`);
  const width = process.stdout.columns || 100;
  const colWidth = Math.min(Math.max(...names.map((n) => n.length)) + 2, width - 2);
  const perRow = Math.max(1, Math.floor((width - 2) / colWidth));
  console.log(`\nExisting modules in ${where} (${names.length}):`);
  for (let i = 0; i < names.length; i += perRow) {
    console.log('  ' + names.slice(i, i + perRow).map((n) => n.padEnd(colWidth)).join('').trimEnd());
  }
  console.log('');
}

/* ================= RUN ================= */

async function runBulk() {
  let raw = getFlag('bulk');
  const filePath = getFlag('bulk-file') || (raw && fs.existsSync(raw) ? raw : '');
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Bulk file not found: ${filePath}`);
      process.exit(1);
    }
    raw = fs.readFileSync(filePath, 'utf8');
  }
  if (!raw) raw = await promptForList(listExistingModules());
  if (!raw.trim()) {
    console.error('❌ Nothing to clone — the list was empty.');
    process.exit(1);
  }

  const FromEntity = getFlag('from') || positional[0] || DEFAULT_FROM_ENTITY;
  const { entries, errors } = parseBulkList(raw);

  if (errors.length) {
    console.error(`⚠️  Skipping ${errors.length} entr${errors.length === 1 ? 'y' : 'ies'} that couldn't be parsed:`);
    errors.forEach((e) => console.error(`   - ${e}`));
  }
  if (entries.length === 0) {
    console.error('❌ No valid entries found.');
    process.exit(1);
  }

  // Per-entry list name wins; otherwise fall back to a global --list-name.
  // A per-entry list name with no explicit --profile= gets the documented
  // "<list>profile" convention (e.g. active -> activeprofile). Everything
  // else (--app, --nest, --source) is shared by the whole batch.
  const jobs = entries.map((e) => {
    const listName = e.list || listNameArg || '';
    const profileName = e.profile || (e.list ? `${e.list}profile` : profileNameArg || '');
    return { FromEntity, ToEntity: e.module.charAt(0).toUpperCase() + e.module.slice(1), listName, profileName, skipDuplicatePrefix: true, table: e.table };
  });

  console.log(`\n📦 Bulk clone: ${jobs.length} module(s) from "${FromEntity}"\n`);
  jobs.forEach((j, i) => console.log(`  ${i + 1}. ${j.ToEntity}${j.listName ? `   list="${j.listName}" profile="${j.profileName}"` : ''}`));

  const failed = [];
  const menuItems = [];
  for (const [i, job] of jobs.entries()) {
    console.log(`\n━━━━ [${i + 1}/${jobs.length}] ${job.ToEntity} ━━━━`);
    try {
      menuItems.push(menuItemFromClone(cloneModule(job)));
    } catch (err) {
      console.error(`❌ ${job.ToEntity}: ${err.message}`);
      failed.push(job.ToEntity);
    }
  }

  console.log(`\n══════ Bulk done: ${jobs.length - failed.length}/${jobs.length} cloned${failed.length ? `, failed: ${failed.join(', ')}` : ''} ══════`);
  await offerMenuConfig(menuItems);
  if (failed.length) process.exit(1);
}

async function runSingle() {
  // One positional = just the NEW module name; the template token defaults to
  // "Smarttemplatev1" (override with --from=). Two = the original
  // "<FromEntity> <ToEntity>" form, unchanged.
  const [FromEntity, ToEntity] = positional.length === 1
    ? [getFlag('from') || DEFAULT_FROM_ENTITY, positional[0]]
    : positional;

  if (!FromEntity || !ToEntity) {
    console.error('❌ Usage: node clone-module.js <ToEntity> [--app=namespace] [--list-name=name]   (FromEntity defaults to "Smarttemplatev1")');
    console.error('   or:    node clone-module.js <FromEntity> <ToEntity> [--app=namespace] [--source=folderName]');
    console.error(`   FromEntity is the placeholder token baked into the template files (default "${DEFAULT_FROM_ENTITY}").`);
    console.error('   Example: node clone-module.js Deals');
    console.error(`   --app defaults to "${path.basename(__dirname)}" (this script's folder); pass --app=- for none.`);
    console.error(`   --source defaults to "_mosy_module_v1".`);
    console.error('   --list-name=/--profile-name= rename the list/ and profile/ page.jsx folders in place (still nested inside the module), e.g. clusters/active instead of clusters/list.');
    console.error('   Example: node clone-module.js Smarttemplatev1 Deals');
    console.error('   Example: node clone-module.js Smarttemplatev1 Deals --app=supererpv2 --source=_mosy_module_v1');
    console.error('   Example: node clone-module.js Smarttemplatev1 Clusters --list-name=active --profile-name=activeprofile');
    console.error('   BULK:    node clone-module.js --bulk="system_users -> Users , clients_tbl -> ActiveCustomers --active"');
    console.error('            node clone-module.js --bulk-file=modules.csv      (or --bulk with no value to paste a list)');
    process.exit(1);
  }

  let cloned;
  try {
    cloned = cloneModule({ FromEntity, ToEntity, listName: listNameArg || '', profileName: profileNameArg || '', skipDuplicatePrefix: true });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
  await offerMenuConfig([menuItemFromClone(cloned)]);
}

if (hasFlag('modules')) {
  // node clone-module.js --modules   -> just print the existing module names and exit
  printModuleNames(listExistingModules());
} else if (hasFlag('menu') || menuRegroup || hasFlag('menu-add')) {
  // --menu / --menu-regroup  -> re-group the modules already in the menu file (never lists the folders)
  // --menu-add=a,b           -> add just these tables/modules
  const addNames = (getFlag('menu-add') || '').split(/[,;\s]+/).filter(Boolean);
  const run = addNames.length
    ? offerMenuConfig(menuItemsForModules(addNames), { regroup: false })
    : offerMenuConfig(null, { regroup: true });
  run.catch((err) => { console.error('❌', err.message); process.exit(1); });
} else if (hasFlag('bulk') || hasFlag('bulk-file')) {
  runBulk().catch((err) => { console.error('❌', err.message); process.exit(1); });
} else {
  runSingle().catch((err) => { console.error('❌', err.message); process.exit(1); });
}
