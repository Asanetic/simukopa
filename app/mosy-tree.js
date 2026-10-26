#!/usr/bin/env node
// mosy-tree.js — prints your project tree (no deps, works on Windows / Mac / Linux) and saves it to project-tree.txt
//
//   node mosy-tree.js                     whole project, 5 levels deep
//   node mosy-tree.js --depth 7           deeper
//   node mosy-tree.js --only app/api/ticksy,app/ticksy,moduleControl,reportControl,apiUtils
//                                         only those folders (paths relative to the project root)
//   node mosy-tree.js --max 40            show at most 40 entries per folder (the rest become "(+N more)")
// Run it from your project root (the folder that has package.json). Paste the output (or project-tree.txt) back to Claude.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const DEPTH = Number(opt('depth', 5));
const MAX = Number(opt('max', 30));
const ONLY = opt('only', '') ? opt('only', '').split(',').map((s) => s.trim().replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '')) : null;
const SKIP = new Set(['novatemplates','.history','terminal','_recycled','node_modules', '.next', '.git', '.vercel', '.turbo', 'dist', 'build', 'coverage', 'storage', '.cache', '.idea', '.vscode', '__pycache__']);
const root = process.cwd();

const lines = [];
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

function walk(dir, prefix, depth) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries = entries.filter((e) => !SKIP.has(e.name) && !e.name.startsWith('.DS_Store'));
  entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  const shown = entries.slice(0, MAX);
  const hidden = entries.length - shown.length;
  shown.forEach((e, i) => {
    const last = i === shown.length - 1 && hidden === 0;
    lines.push(`${prefix}${last ? '`-- ' : '|-- '}${e.name}${e.isDirectory() ? '/' : ''}`);
    if (e.isDirectory() && depth < DEPTH) walk(path.join(dir, e.name), prefix + (last ? '    ' : '|   '), depth + 1);
  });
  if (hidden > 0) lines.push(`${prefix}\`-- (+${hidden} more)`);
}

lines.push(`${path.basename(root)}/`);
if (ONLY) {
  ONLY.forEach((p) => {
    const full = path.join(root, p);
    if (!fs.existsSync(full)) { lines.push(`|-- ${p}   (not found)`); return; }
    lines.push(`|-- ${p}/`);
    walk(full, '|   ', 1);
  });
} else walk(root, '', 1);

const out = lines.join('\n');
console.log(out);
fs.writeFileSync(path.join(root, 'project-tree.txt'), out + '\n');
console.error(`\nSaved to ${rel(path.join(root, 'project-tree.txt')) || 'project-tree.txt'}.`);