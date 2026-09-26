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
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const [FromEntity, ToEntity] = args.filter((a) => !a.startsWith('--'));

// Same trick db-cli.js uses: the folder this script physically lives in
// tells us which app we're in, so --app can be omitted when running against
// "this" app. Pass --app=- explicitly if the project has no app-namespace
// folder at all (module lives directly under app/).
const defaultAppNamespace = path.basename(__dirname);
const appArgRaw = args.find((a) => a.startsWith('--app='))?.split('=')[1];
const appArg = appArgRaw === '-' ? '' : (appArgRaw || defaultAppNamespace);

// Default source folder is the shared golden template. Override with
// --source= to clone from something else (e.g. an existing sibling module).
const DEFAULT_SOURCE_FOLDER = '_mosy_module_v1';
const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1];
const nestArg = args.find((a) => a.startsWith('--nest='))?.split('=')[1];
// Rename the "list"/"profile" page.jsx folders in place, still nested
// inside the module (e.g. clusters/active instead of clusters/list).
// Leave either off to keep that folder's default name.
const listNameArg = args.find((a) => a.startsWith('--list-name='))?.split('=')[1];
const profileNameArg = args.find((a) => a.startsWith('--profile-name='))?.split('=')[1];

if (!FromEntity || !ToEntity) {
  console.error('❌ Usage: node clone-module.js <FromEntity> <ToEntity> [--app=namespace] [--source=folderName]');
  console.error(`   FromEntity is the placeholder token baked into the template files (e.g. "Smarttemplatev1").`);
  console.error(`   --app defaults to "${path.basename(__dirname)}" (this script's folder); pass --app=- for none.`);
  console.error(`   --source defaults to "_mosy_module_v1".`);
  console.error('   --list-name=/--profile-name= rename the list/ and profile/ page.jsx folders in place (still nested inside the module), e.g. clusters/active instead of clusters/list.');
  console.error('   Example: node clone-module.js Smarttemplatev1 Deals');
  console.error('   Example: node clone-module.js Smarttemplatev1 Deals --app=supererpv2 --source=_mosy_module_v1');
  console.error('   Example: node clone-module.js Smarttemplatev1 Clusters --list-name=active --profile-name=activeprofile');
  process.exit(1);
}

if (!/^[A-Z][a-zA-Z0-9]*$/.test(FromEntity) || !/^[A-Z][a-zA-Z0-9]*$/.test(ToEntity)) {
  console.error('❌ Both entity names must be PascalCase, e.g. "Staff", "Client", "CreditNote".');
  process.exit(1);
}

const fromLower = FromEntity.toLowerCase();
const toLower = ToEntity.toLowerCase();
const fromUpper = FromEntity.toUpperCase();
const toUpper = ToEntity.toUpperCase();

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

const PAIRS = [
  { src: path.join(frontendSourceBase, sourceFolderName), dest: path.join(frontendDestBase, toLower) },
  { src: path.join(backendSourceBase, sourceFolderName), dest: path.join(backendDestBase, toLower) },
];

const existingPairs = PAIRS.filter((p) => fs.existsSync(p.src));

if (existingPairs.length === 0) {
  console.error(`❌ No source folder found. Looked for:`);
  PAIRS.forEach((p) => console.error(`   ${p.src}`));
  process.exit(1);
}

// Destination folders are allowed to already exist — we merge into them.
// Individual files that already exist get backed up (see backupExistingFile).
for (const { dest } of existingPairs) {
  if (fs.existsSync(dest)) {
    console.log(`ℹ️  Target folder already exists, merging into it: ${path.relative(projectRoot, dest)}`);
  }
}

// Text file extensions safe to search/replace inside. Everything else (images, fonts) copies as-is.
const TEXT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.md', '.html']);

// Optional custom prefix layered on top of the normal entity swap for the
// three compound identifiers tied to the list/profile pages: "<Entity>Schema",
// "<Entity>List", "<Entity>Profile" (e.g. ClustersSchema, ClustersList,
// ClustersProfile). Derived from --list-name (preferred) or --profile-name
// if that's the only one given — matching the convention that the list name
// is the base and the profile name is usually "<list name>profile".
// Applies everywhere those exact tokens appear: schema.js's own export,
// every file that imports it (dataControl, logicControl, import, uiControl,
// list/, profile/), and the uiControl component filenames themselves.
// Leave both --list-name/--profile-name off to keep the standard
// "<Entity>Schema"/"<Entity>List"/"<Entity>Profile" naming untouched.
const customPrefixRaw = listNameArg || profileNameArg || '';
const customPrefixCap = customPrefixRaw
  ? customPrefixRaw.charAt(0).toUpperCase() + customPrefixRaw.slice(1).toLowerCase()
  : '';
const PREFIXABLE_SUFFIXES = ['Schema', 'List', 'Profile'];

function renameTokens(str) {
  let result = str
    .split(FromEntity).join(ToEntity)   // Staff -> Client
    .split(fromLower).join(toLower)      // staff -> client
    .split(fromUpper).join(toUpper);     // STAFF -> CLIENT

  if (customPrefixCap) {
    for (const suffix of PREFIXABLE_SUFFIXES) {
      const standardToken = `${ToEntity}${suffix}`;       // e.g. "ClustersSchema"
      const customToken = `${customPrefixCap}${ToEntity}${suffix}`; // e.g. "ActiveClustersSchema"
      result = result.split(standardToken).join(customToken);
    }
  }

  return result;
}

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

// Folder names eligible for --split-list-profile pull-out. Matched
// "list" and "profile" are fixed Mosy conventions (not entity words) for
// the two page.jsx folders. --list-name=/--profile-name= let you rename
// them to something else while keeping them nested inside the module,
// e.g. clusters/active instead of clusters/list.
const RENAMEABLE_FOLDER_NAMES = new Set(['list', 'profile']);

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
      const customName = lowerName === 'list' ? listNameArg : profileNameArg;
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
console.log(`\n👉 Now edit ${schemaPath} — that's the only file that needs changing.`);
console.log(`👉 Then run db-cli.js to create the "${toLower}" table.`);
if (listNameArg || profileNameArg) {
  const moduleDir = schemaPath.replace('/schema.js', '');
  const listFolderName = listNameArg || 'list';
  const profileFolderName = profileNameArg || 'profile';
  console.log(`👉 List page renamed to ${moduleDir}/${listFolderName}, profile page renamed to ${moduleDir}/${profileFolderName}.`);
  if (customPrefixCap) {
    console.log(`👉 ${customPrefixCap}${ToEntity}Schema/List/Profile identifiers and uiControl filenames updated everywhere they're referenced in the module.`);
  }
}