'use client';
import { Fragment, useMemo, useRef, useState, useEffect } from 'react';
// Everything below is an existing util — nothing is re-implemented here.
// Adjust the relative paths to where this file sits (same folder as SmartGrid).
import { useEntityGridController } from '../dataControl/useEntityGridController';
import EntityPaginationUi from './EntityPaginationUi';
import { ActiveFiltersBar } from './Activefiltersbar';
import { FIELD_COMPONENTS, TextInput } from './FormFields';
import { MosyImageViewer } from '../../UiControl/componentControl'; // same viewer the form's ImageInput uses
import defaultLogoAsset from '../../../img/logo/logo.png'; // same fallback asset FormFields uses — adjust path if needed
import mosyThemeConfigs from '../../../appConfigs/mosyTheme';
import { MosyUIGuard } from '../../UiControl/MosyUiGuard';
import BillingUpgradeBar from '../../../MosyUtils/BillingUpgradeBar';
import { BillingInlineNotice } from '../../../novabilling/BillingNotice';
import { mosyACTRLHasRole } from '../../../auth/authAccesControl';
import { MosyAlertCard, closeMosyModal } from '../../../MosyUtils/ActionModals';
import { mosySnackWidgetManager } from '../../../MosyUtils/MosySnackWidget';
import { mosyFormatDateOnly, mosyFormatDateTime } from '../../../MosyUtils/hiveUtils';
import { mediaHref } from './FileThumb';
import './ExcelSheetGrid.css';
import './SheetFileCells.css'; // file / image cell styles (thumbnail, drop highlight, open/remove buttons)

// ════════════════════════════════════════════════════════════════
// ExcelSheetGrid — 4th grid TEMPLATE: spreadsheet-style create + edit.
//
// Same engine as SmartGrid / SmartGridPro / SmartGridInsight:
//   const g = useEntityGridController(schema, { fixedQuery, title, ... })
// so these come for free and behave identically to the other grids:
//   rows (existing records) · search · refresh · pagination · page size ·
//   URL-driven filter scoping (ActiveFiltersBar) · schema.moduleRole gate ·
//   billing gate · schema.actions toolbar buttons · schema.profileActions
//   flagged grid:true · g.create / g.update / g.remove (EntityDataEngine).
//
// Cell editors are the SAME components DynamicForm renders:
//   FIELD_COMPONENTS[field.type] with { field, value, setValue, readOnly,
//   schema, row } — select, groupedSelect, liveSearch, date, datetime,
//   password, boolean, textarea, number/money, text...
//
// Persistence mirrors useEntityFormController exactly:
//   save new row      -> g.create(values)            values = every schema field
//   save edited row   -> g.update(btoa(id), values)  update takes the base64
//                        token (what the form gets from the URL's dataNode);
//                        create/update both return { ok, message, id }
//   delete            -> MosyAlertCard confirm -> g.remove(rawId)  (remove
//                        base64s internally, same as the form's atob(token))
//   clone             -> copies schema.fields minus system/computed ones
//                        (the form's cloneRecord rule) into NEW unsaved rows
//                        you can tweak, then Save creates them.
//   Button label/icon/confirm text/role come from schema.profileActions
//   ('save' | 'submit', 'delete', 'clone'); roles via mosyACTRLHasRole.
//   Validation = the form's rule (field.required && !value) per row.
//   schema.computeOnChange(key, nextValues) runs after every change.
//
// Columns: schema.sheetFields (explicit keys) else schema.sections' field
// order (same order as the form) else schema.fields; system/hidden/image/
// richtext skipped; editable:false / computed columns are shown read-only.
//
// Props:
//   schema (required) · moduleActions · fixedQuery · dataOut · title · description
//   fixedValues   merged into every create/update payload (e.g. { shop_id })
//   defaults      per-column starting values for new rows
//   loadExisting  (true) show + edit the grid's existing records; false =
//                 pure data-entry sheet (the hook still loads page 1 but
//                 those rows are ignored)
//   allowNew (true) · minRows (1) · maxRows (1000) · draftKey
//   maxVisibleActions (4) custom buttons shown before the rest tuck under "More" (Add/Clone/Delete/Undo don't count)
//   hiddenActions (['new']) keys to hide on top of the schema rules: 'addRow','undo','clone','delete',
//                 'refresh', or any schema action key
//   onSaved({ created, updated, deleted })
//
// Keys: arrows · Tab/Shift+Tab · Enter/F2 edit · type to overwrite (text
//   cells) · Enter = commit & down · Esc = cancel edit · Del clear · Space
//   toggles checkbox cells · Ctrl+D fill down · Ctrl+Z undo · Ctrl+S save ·
//   Ctrl+V paste a block from Excel. Dropdown / live-search cells own their
//   Enter: pick with mouse or their keys, then Tab (or click away).
//
// File / image columns (schema field type 'file' | 'image'):
//   Enter / double-click / click an active cell -> file dialog (multi-select ok)
//   drag a file from the desktop onto a cell      -> attach
//   Ctrl+V with a screenshot or copied file       -> attach to the active cell
//   several files at once                         -> fill consecutive NEW rows down the column
//   Del / the ✕ button                            -> remove · ↗ button opens the file in a new tab
//   per-field schema options: accept ('.pdf,image/*'), maxSizeMb (default 10)
//   Styles live in SheetFileCells.css (imported above — nothing to append to ExcelSheetGrid.css).
// ════════════════════════════════════════════════════════════════

const uid = () => Math.random().toString(36).slice(2, 10);
const HISTORY_LIMIT = 50;
const isEmpty = (v) => v === '' || v === null || v === undefined;
const SKIP_TYPES = new Set(['richtext', 'hidden']);
const FILE_TYPES = new Set(['image', 'file']); // value contract = the form's ImageInput: a File object (new pick) or the stored path string
const isFileObj = (v) => typeof File !== 'undefined' && v instanceof File;
const NON_IMG_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)$/i; // known non-images get a file icon; everything else goes through the image viewer like the form does
const defaultLogo = defaultLogoAsset?.src || defaultLogoAsset;
const mediaUrl = (v) => `/api/mediaroom?media=${typeof window !== 'undefined' ? window.btoa(String(v)) : ''}`; // same URL the form's MosyImageViewer uses
const PICKER = new Set(['groupedSelect', 'liveSearch', 'select']); // dropdown-style cells
const SEARCH_PICKER = new Set(['groupedSelect', 'liveSearch']); // SmartDropdown-backed: type-to-search
const TEXT_LIKE = new Set([undefined, 'text', 'tel', 'email', 'number', 'money', 'textarea']);
const toToken = (id) => (typeof window !== 'undefined' ? window.btoa(String(id)) : String(id));
const sameId = (a, b) => String(a) === String(b);

// ── File / image helpers ─────────────────────────────────────────
// Per-column schema options (all optional):
//   accept:    '.pdf,image/*'   (same string an <input accept> takes; images default to image/*)
//   maxSizeMb: 10               (alias: maxSize) — larger files are rejected with a message
const DEFAULT_MAX_MB = 10;
const acceptOf = (col) => col?.accept || (col?.type === 'image' ? 'image/*' : '');
const maxMbOf = (col) => Number(col?.maxSizeMb ?? col?.maxSize ?? DEFAULT_MAX_MB);
function acceptsFile(accept, file) {
  if (!accept) return true;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}
// '' when the file is fine, otherwise a short human reason.
function fileProblem(col, file) {
  if (!acceptsFile(acceptOf(col), file)) return `not an allowed type (${acceptOf(col)})`;
  const max = maxMbOf(col);
  if (max > 0 && file.size > max * 1024 * 1024) return `larger than ${max} MB`;
  return '';
}
const openHref = (href) => { if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer'); };

const pad = (n) => String(n).padStart(2, '0');
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowLocal = () => { const d = new Date(); return `${todayLocal()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function normalizeDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // d/m/yyyy
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

// Shorten a filename for a cell, keeping the extension: "Joseph_Ngigi_Business_Profile (1).docx" -> "Joseph_Ng…cx"-style
// is unreadable, so trim the base name and keep ".docx": "Joseph_Ngig….docx".
function shortName(name, max = 14) {
  const n = String(name || '');
  if (n.length <= max) return n;
  const m = n.match(/(\.[a-z0-9]{1,5})$/i);
  const ext = m ? m[1] : '';
  const base = ext ? n.slice(0, -ext.length) : n;
  return `${base.slice(0, Math.max(4, max - ext.length - 1))}…${ext}`;
}

// Compact cell view of an image/file value: thumbnail (or file icon) + name.
function FileCell({ col, value, canEdit, onClear }) {
  const isNew = isFileObj(value);
  // Object URL lives in state so it is created/revoked in an effect (safe under React StrictMode double-mount).
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!isNew || !/^image\//.test(value.type)) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value, isNew]);
  if (isEmpty(value)) return <span className="sgx-cell-text sgx-file-empty"><i className="fa fa-upload"></i>{canEdit ? ' Upload / drop' : ''}</span>;
  const name = isNew ? value.name : String(value).split('/').pop();
  // Images: thumbnail only (no text, saves space). Documents: icon + short name.
  const isImage = isNew ? /^image\//.test(value.type) : !NON_IMG_EXT.test(String(value));
  let thumb;
  if (isNew) {
    // Just picked, not saved: preview the local file (the media endpoint doesn't have it yet) — same as the form.
    thumb = url ? <img className="sgx-thumb" src={url} alt="" /> : <i className="fa fa-file-o sgx-file-ic"></i>;
  } else if (NON_IMG_EXT.test(String(value))) {
    thumb = <i className="fa fa-file-o sgx-file-ic"></i>;
  } else {
    // Saved value: fetched from the API exactly like the form's ImageInput (MosyImageViewer + /api/mediaroom).
    thumb = (
      <span className="sgx-thumb-wrap">
        <MosyImageViewer media={mediaUrl(value)} mediaRoot="" defaultLogo={col?.defaultLogo || defaultLogo} imageClass="sgx-thumb" />
      </span>
    );
  }
  const stop = (e) => e.stopPropagation(); // don't let the cell's own mousedown re-open the file dialog
  const open = (e) => {
    e.stopPropagation();
    if (!isNew) { openHref(mediaHref(value)); return; }
    const u = url || URL.createObjectURL(value);
    openHref(u);
    if (!url) setTimeout(() => URL.revokeObjectURL(u), 60000);
  };
  return (
    <span className={`sgx-cell-text sgx-file ${isNew ? 'is-new-file' : ''}`} title={name}>
      {thumb}
      {!isImage && <span className="sgx-file-name">{shortName(name)}</span>}
      {isNew && <i className="fa fa-circle sgx-file-dot" title="New file — not saved yet"></i>}
      <button type="button" className="sgx-file-btn" onMouseDown={stop} onClick={open} title="Open in new tab" aria-label="Open file">
        <i className="fa fa-external-link"></i>
      </button>
      {canEdit && (
        <button type="button" className="sgx-file-btn sgx-file-btn-x" onMouseDown={stop} onClick={(e) => { e.stopPropagation(); onClear(); }} title="Remove file" aria-label="Remove file">
          <i className="fa fa-times"></i>
        </button>
      )}
    </span>
  );
}

function displayText(col, row) {
  const v = row[col.key];
  switch (col.type) {
    case 'liveSearch': return row[col.labelKey || `${col.key}__label`] ?? (isEmpty(v) ? '' : String(v));
    case 'password': return isEmpty(v) ? '' : '••••••••';
    case 'date': return isEmpty(v) ? '' : mosyFormatDateOnly(v);
    case 'datetime': return isEmpty(v) ? '' : mosyFormatDateTime(v);
    case 'boolean': return v ? '✓' : '';
    default: return isEmpty(v) ? '' : String(v);
  }
}

function variantCls(variant) {
  if (!variant) return '';
  if (variant.includes('danger')) return 'sgx-btn-danger';
  if (variant === 'primary' || variant === 'dark') return 'sgx-btn-solid';
  return '';
}

// Toolbar button that tucks overflow actions into a popover (same idea as SmartGrid's "More").
function SheetButton({ item, inMenu = false }) {
  const base = inMenu ? 'sgx-more-item' : 'sgx-btn';
  return (
    <button type="button" className={`${base} ${item.cls || ''}`.trim()} onClick={item.onClick} disabled={item.disabled} title={item.title}>
      {item.icon && <i className={`fa fa-${item.icon}`}></i>}<span>{item.label}</span>
    </button>
  );
}

function SheetMore({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="sgx-more-wrap" ref={ref}>
      <button type="button" className="sgx-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <i className="fa fa-ellipsis-h"></i><span>More</span>
      </button>
      {open && (
        <div className="sgx-more-panel">
          {items.map((it) => (
            <SheetButton key={it.key} inMenu item={{ ...it, onClick: () => { setOpen(false); it.onClick(); } }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cell editor: renders the REAL form field component ─────────
function EditorHost({ col, row, schema, setField, onFinish, seed }) {
  const hostRef = useRef(null);
  const Component = FIELD_COMPONENTS[col.type] || TextInput;
  const complex = !!Component.selfLabeled; // dropdown / live search own their Enter + popover

  useEffect(() => {
    const cands = Array.from(hostRef.current?.querySelectorAll('input:not([type=checkbox]):not([type=hidden]),select,textarea') || []);
    const el = cands.find((n) => n.offsetParent !== null && !n.readOnly && !n.disabled) || cands[0];
    if (!el) return;
    el.focus();
    if (/^(text|search|tel|email|url|password)$/.test(el.type || '')) {
      try { const l = el.value.length; el.setSelectionRange(l, l); } catch {}
    }
    if (!SEARCH_PICKER.has(col.type)) return undefined;
    // SmartDropdown-backed fields: behave like the form — list open, typing filters.
    if (seed && el.tagName === 'INPUT') {
      try {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, seed);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {}
    }
    const t = setTimeout(() => {
      const host = hostRef.current;
      if (!host || host.querySelector('li,[role=option],[role=listbox]')) return; // already open
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.click();
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LiveSearch only reports the picked id; also stash its display label on
  // the row so the cell can show text once the editor closes.
  const field = useMemo(() => {
    if (col.type === 'groupedSelect') return { ...col, label: '' }; // SmartDropdown draws its own <label>; a cell has no room for it
    if (col.type !== 'liveSearch') return col;
    const lk = col.labelKey || `${col.key}__label`;
    return {
      ...col,
      label: '',
      labelKey: lk,
      onFullSelect: (item, r, sv) => ({ ...((typeof col.onFullSelect === 'function' && col.onFullSelect(item, r, sv)) || {}), [lk]: item[col.displayField] }),
    };
  }, [col]);

  // groupedSelect values are plain text (labelField === the field's own key),
  // so — like the form's "Add new" — a value typed into the box and not picked
  // from the list is still a legitimate value. SmartDropdown only reports
  // onSelect for list picks; keep what was typed and apply it on close unless
  // a pick happened or the edit was cancelled.
  const typedRef = useRef(null);
  const pickedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startValue = useRef(row[col.key]);
  useEffect(() => () => {
    if (col.type !== 'groupedSelect' || pickedRef.current || cancelledRef.current) return;
    const t = typedRef.current;
    if (t != null && String(t).trim() !== '' && String(t).trim() !== String(startValue.current ?? '').trim()) setField(row._id, col.key, String(t).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancelledRef.current = true; onFinish(0, 0, true); }
    else if (e.key === 'Tab') { e.preventDefault(); onFinish(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter' && !complex) {
      if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onFinish(1, 0);
    }
  };

  return (
    <div
      ref={hostRef}
      className={`sgx-host ${complex ? 'sgx-host-complex' : ''}`}
      onKeyDown={onKeyDown}
      onInput={(e) => { if (e.target && e.target.tagName === 'INPUT') typedRef.current = e.target.value; }}
      onBlur={(e) => { if (!complex && !hostRef.current.contains(e.relatedTarget)) onFinish(0, 0); }}
    >
      <Component
        field={field}
        value={row[col.key]}
        setValue={(key, val) => { if (key === col.key) pickedRef.current = true; setField(row._id, key, val); }}
        readOnly={false}
        schema={schema}
        row={row}
      />
    </div>
  );
}

export default function ExcelSheetGrid({
  schema,
  moduleActions,
  fixedQuery = {},
  dataOut = {},
  title,
  description,
  fixedValues = {},
  defaults = {},
  loadExisting = true,
  allowNew = true,
  minRows = 1,
  maxRows = 1000,
  draftKey,
  hiddenActions = ['new'],
  maxVisibleActions = 3,
  onSaved,
  onDirtyChange,
}) {
  // ── Same engine as every other grid template ─────────────────
  const g = useEntityGridController(schema, { fixedQuery, title, description, moduleActions, dataOut });
  const hidden = (k) => hiddenActions.includes(k);

  // ── Actions come from schema.profileActions ──────────────────
  // Visibility flag for the sheet:
  //   a.sheet defined  -> use it (true | false) — overrides everything
  //   a.sheet missing  -> on when grid OR form is true (backward compatible)
  // (Extra toolbar buttons beyond save/add/clone/delete/undo follow grid, or sheet:true.)
  // plus the usual `role` check via mosyACTRLHasRole and hiddenActions.
  //   save|submit  -> Save button (no visible save => sheet is READ-ONLY)
  //   addRow       -> Add row / Add N   (optional entry; absent => follows Save)
  //   clone, delete, undo -> same-named entries (undo optional; absent => follows Save)
  const profileDefs = schema?.profileActions || [];
  const findDef = (...keys) => profileDefs.find((a) => keys.includes(a.key));
  const sheetFlag = (a) => !!(a.sheet !== undefined ? a.sheet : a.grid || a.form); // sheet wins; otherwise on if grid OR form is true
  const sheetShows = (a) => !!a && sheetFlag(a) && !hidden(a.key) && (!a.role || mosyACTRLHasRole(a.role));
  const saveDef = findDef('save', 'submit');
  const addDef = findDef('addRow');
  const undoDef = findDef('undo');
  const cloneDef = findDef('clone');
  const deleteDef = findDef('delete');
  const canSave = sheetShows(saveDef);            // may edit / create / update at all
  const canAdd = allowNew && canSave && !hidden('addRow') && (addDef ? sheetShows(addDef) : true);
  const showUndo = canSave && !hidden('undo') && (undoDef ? sheetShows(undoDef) : true);
  const showClone = sheetShows(cloneDef);
  const showDelete = sheetShows(deleteDef);
  const idOf = (row) => g.getRowId(row);
  const hasId = (row) => !isEmpty(idOf(row));

  // ── Columns (same ordering the form uses) ────────────────────
  const cols = useMemo(() => {
    const fields = schema?.fields || [];
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    const explicit = Array.isArray(schema?.sheetFields);
    const keys = explicit ? schema.sheetFields : schema?.sections?.length ? schema.sections.flatMap((s) => s.fields || []) : fields.map((f) => f.key);
    const seen = new Set();
    return keys
      .filter((k) => !seen.has(k) && seen.add(k))
      .map((k) => byKey[k])
      .filter(Boolean)
      .filter((f) => f.key !== 'row_count' && (explicit || (!f.system && !SKIP_TYPES.has(f.type))))
      .map((f) => ({ ...f, _readOnly: f.editable === false || !!f.computed || f.type === 'richtext' }));
  }, [schema]);

  const defaultFor = (c) => c.default ?? defaults[c.key] ?? (c.type === 'date' ? todayLocal() : c.type === 'datetime' ? nowLocal() : '');
  const snap = (row) => JSON.stringify((schema.fields || []).map((f) => { const v = row[f.key]; return isFileObj(v) ? `file:${v.name}:${v.size}:${v.lastModified}` : v ?? ''; }));

  // "Did the user actually enter something?"  A new row only counts when an
  // editable cell differs from the baseline it was CREATED with (_base) —
  // schema defaults, today/now seeds and computed values are part of that
  // baseline, so they never make an untouched row look filled-in. Reverting
  // a cell to its baseline makes the row blank again. Whitespace == empty.
  const norm = (v) => (v === false || v === null || v === undefined ? '' : String(v).trim());
  const baseOf = (row) => {
    const b = {};
    cols.forEach((c) => { b[c.key] = row[c.key]; });
    return b;
  };
  const hasUserData = (row) => cols.some((c) => !c._readOnly && norm(row[c.key]) !== norm(row._base ? row._base[c.key] : ''));
  const isBlank = (row) => !hasId(row) && !hasUserData(row);
  const isDirty = (row) => (hasId(row) ? snap(row) !== row._orig : hasUserData(row));

  const blankRow = () => {
    const row = { _id: uid(), _orig: null, _base: null, _state: '', _errors: {}, _rowError: '' };
    (schema.fields || []).forEach((f) => { row[f.key] = ''; });
    cols.forEach((c) => { row[c.key] = defaultFor(c); });
    row._base = baseOf(row);
    return row;
  };
  const fromRecord = (rec) => {
    const row = { ...blankRow(), ...rec, _id: uid() };
    row._orig = snap(row);
    return row;
  };
  // Keep `minRows` unsaved (no-id) rows available at the bottom for entry.
  // Layout rule: unsaved/new rows are always the TOP block (entry zone),
  // saved records (server order, newest first) sit underneath.
  const order = (list) => [...list.filter((r) => !hasId(r)), ...list.filter(hasId)];
  const withTail = (list) => {
    const out = [...list];
    if (canAdd) {
      let fresh = out.filter((r) => !hasId(r)).length;
      while (fresh < minRows) { out.push(blankRow()); fresh++; }
    }
    return order(out);
  };

  // ── State ────────────────────────────────────────────────────
  const [rows, setRows] = useState(() => withTail([]));
  const rowsRef = useRef(rows);
  const history = useRef([]);
  const editStartRef = useRef(null);
  const firstSync = useRef(false);
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [editing, setEditingState] = useState(null); // { rowId, c }
  const editingRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(null); // { label, done, total }
  const [message, setMessage] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const wrapRef = useRef(null);

  const editMountedAt = useRef(0);
  const editSeedRef = useRef('');
  const fileInputRef = useRef(null);
  const pickRef = useRef(null); // { rowId, key } the open file dialog is for
  const [dropCell, setDropCell] = useState(null); // "r-c" of the file cell a drag is hovering over
  const setEditing = (v) => { editingRef.current = v; if (v) editMountedAt.current = Date.now(); setEditingState(v); };
  const commitRows = (next) => { rowsRef.current = next; setRows(next); };
  const pushHistory = () => {
    history.current.push(rowsRef.current);
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
  };
  const mutate = (fn) => { pushHistory(); commitRows(fn(rowsRef.current)); };
  const undo = () => { const prev = history.current.pop(); if (prev) commitRows(prev); };
  const notify = (type, text) => {
    setMessage({ type, text });
    if (type === 'ok' || type === 'error') mosySnackWidgetManager({ content: text, duration: type === 'ok' ? 2500 : 4000, type: type === 'ok' ? 'success' : 'error' });
  };

  // ── Server rows -> sheet (merge, never clobber unsaved work) ─
  // create()/update()/remove() reload the grid after EVERY call, so rows
  // land here repeatedly mid-batch. Rows the user has edited (dirty) and
  // unsaved new rows always win; clean rows take the fresh server copy.
  useEffect(() => {
    if (!loadExisting || g.loading) return;
    const cur = rowsRef.current;
    const curById = new Map(cur.filter(hasId).map((r) => [String(idOf(r)), r]));
    const serverIds = new Set(g.rows.map((r) => String(idOf(r))));
    let appliedCached = false;
    const persisted = g.rows.map((rec) => {
      const existing = curById.get(String(idOf(rec)));
      if (existing && isDirty(existing)) return existing;
      const fresh = fromRecord(rec);
      const cached = pendingEdits.current[String(idOf(rec))];
      if (cached) { // edits made before a refresh/close: lay them back over the fresh server copy
        delete pendingEdits.current[String(idOf(rec))];
        appliedCached = true;
        return { ...fresh, ...cached, _orig: fresh._orig };
      }
      return existing ? { ...fresh, _id: existing._id, _state: existing._state || '', _rowError: existing._rowError || '' } : fresh;
    });
    const orphans = cur.filter((r) => hasId(r) && !serverIds.has(String(idOf(r))) && (isDirty(r) || r._state === 'error'));
    const unsaved = cur.filter((r) => !hasId(r));
    const merged = withTail([...persisted, ...orphans, ...unsaved]);
    commitRows(merged);
    if (appliedCached) setDraftRestored(true);
    if (!firstSync.current && g.rows.length) {
      firstSync.current = true;
      const firstNew = merged.findIndex((r) => !hasId(r));
      setActive({ r: firstNew < 0 ? 0 : firstNew, c: 0 }); // land on the first empty row, ready to type
    } else {
      setActive((a) => ({ r: Math.min(a.r, Math.max(merged.length - 1, 0)), c: a.c }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.rows, g.loading, loadExisting]);

  // ── Draft autosave: new rows AND edits to existing rows ──────
  // Survives refresh / closed tab. Cleared automatically once everything is
  // saved (or discarded). Edits to existing records are keyed by record id and
  // laid back over the fresh server copy when that record loads again.
  const storageKey = `sgx-draft:${draftKey || schema?.entity || title || 'sheet'}`;
  const pendingEdits = useRef({}); // id -> values of an edited record not yet re-applied
  const userData = (r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith('_') && !isFileObj(v))); // File objects can't be cached — they must be re-attached after a refresh
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const saved = Array.isArray(raw) ? { fresh: raw, edits: {} } : raw || {};
      const fresh = Array.isArray(saved.fresh) ? saved.fresh : [];
      pendingEdits.current = saved.edits && typeof saved.edits === 'object' ? { ...saved.edits } : {};
      if (fresh.length) {
        history.current = [];
        commitRows(withTail([...rowsRef.current.filter(hasId), ...fresh.map((r) => ({ ...blankRow(), ...r, _id: uid() }))]));
        setDraftRestored(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const fresh = rows.filter((r) => !hasId(r) && !isBlank(r)).map(userData);
        const edits = { ...pendingEdits.current };
        rows.forEach((r) => { if (hasId(r) && isDirty(r)) edits[String(idOf(r))] = userData(r); });
        if (fresh.length || Object.keys(edits).length) localStorage.setItem(storageKey, JSON.stringify({ v: 2, fresh, edits }));
        else localStorage.removeItem(storageKey);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const discardDraft = () => {
    try { localStorage.removeItem(storageKey); } catch {}
    pendingEdits.current = {};
    history.current = [];
    // drop new rows and revert edited records to the server copy
    const serverRows = loadExisting ? g.rows.map(fromRecord) : rowsRef.current.filter((r) => hasId(r) && !isDirty(r));
    commitRows(withTail(serverRows));
    setDraftRestored(false);
  };

  // ── Field writes (same contract as the form's setValue) ──────
  const setField = (rowId, key, value) => {
    const cur = rowsRef.current;
    const i = cur.findIndex((x) => x._id === rowId);
    if (i < 0) return;
    // Date/DateTime inputs seed "today/now" the instant they mount. That is the
    // component talking, not the user — ignore it so merely opening an empty
    // date cell never marks the row as edited.
    const colDef = cols.find((c) => c.key === key);
    if (colDef && (colDef.type === 'date' || colDef.type === 'datetime') && editingRef.current
        && isEmpty(cur[i][key]) && !isEmpty(value) && Date.now() - editMountedAt.current < 400) return;
    let next = { ...cur[i], [key]: value, _state: '', _rowError: '', _errors: { ...cur[i]._errors, [key]: undefined } };
    if (typeof schema.computeOnChange === 'function') {
      const patch = schema.computeOnChange(key, next);
      if (patch) next = { ...next, ...patch };
    }
    const arr = cur.slice();
    arr[i] = next;
    commitRows(arr);
  };

  const addRows = (n = 1) => {
    if (!canAdd) return false;
    const room = Math.max(0, maxRows - rowsRef.current.length);
    const count = Math.min(n, room);
    if (count <= 0) { setMessage({ type: 'info', text: `Sheet is limited to ${maxRows} rows — save this batch first.` }); return false; }
    mutate((prev) => order([...prev, ...Array.from({ length: count }, () => blankRow())]));
    return true;
  };

  // ── Navigation ───────────────────────────────────────────────
  const focusWrap = () => wrapRef.current && wrapRef.current.focus({ preventScroll: true });
  const moveTo = (r, c) => {
    const count = rowsRef.current.length;
    let nr = r, nc = c;
    if (nc >= cols.length) { nc = 0; nr += 1; }
    if (nc < 0) { nc = cols.length - 1; nr -= 1; }
    const nNew = rowsRef.current.filter((r) => !hasId(r)).length;
    if (nr > active.r && active.r < nNew && nr >= nNew && canAdd) { if (addRows(1)) nr = nNew; } // walking off the last entry row opens a fresh one
    else if (nr >= count) nr = count - 1;
    setActive({ r: Math.max(0, nr), c: Math.max(0, Math.min(cols.length - 1, nc)) });
  };
  useEffect(() => {
    const el = wrapRef.current?.querySelector(`[data-cell="${active.r}-${active.c}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, rows.length]);

  // ── Editing ──────────────────────────────────────────────────
  const beginEdit = (r, c, initial) => {
    const col = cols[c];
    const row = rowsRef.current[r];
    if (!col || !row || col._readOnly || !canSave) return;
    setActive({ r, c });
    if (FILE_TYPES.has(col.type)) { // no inline editor: straight to the native file dialog, like the form's Choose File button
      pickRef.current = { rowId: row._id, key: col.key, accept: col.accept || (col.type === 'image' ? 'image/*' : '') };
      const input = fileInputRef.current;
      if (input) { input.accept = pickRef.current.accept; input.value = ''; input.click(); }
      return;
    }
    if (col.type === 'boolean') { mutate((prev) => prev.map((x, i) => (i === r ? { ...x, [col.key]: !x[col.key], _state: '' } : x))); return; }
    pushHistory();
    editStartRef.current = rowsRef.current;
    editSeedRef.current = initial !== undefined && SEARCH_PICKER.has(col.type) ? initial : '';
    if (initial !== undefined && TEXT_LIKE.has(col.type)) setField(row._id, col.key, initial);
    setEditing({ rowId: row._id, c });
  };

  const finishEdit = (dr = 0, dc = 0, cancel = false) => {
    const ed = editingRef.current;
    if (!ed) return;
    setEditing(null); // clears the ref synchronously so the trailing blur is a no-op
    if (cancel) { commitRows(editStartRef.current); history.current.pop(); }
    else if (rowsRef.current === editStartRef.current) history.current.pop();
    focusWrap();
    if (dr || dc) {
      const r = rowsRef.current.findIndex((x) => x._id === ed.rowId);
      moveTo((r < 0 ? active.r : r) + dr, ed.c + dc);
    }
  };

  // Removing an attached file / image asks first (the ✕ button and the Delete key share this).
  // Undo (Ctrl+Z) still restores it until the sheet is saved.
  const confirmRemoveFile = (rowId, col) => {
    const row = rowsRef.current.find((x) => x._id === rowId);
    const v = row?.[col.key];
    if (!row || isEmpty(v)) return;
    const label = col.type === 'image' ? 'image' : 'file';
    const name = isFileObj(v) ? v.name : String(v).split('/').pop();
    MosyAlertCard({
      icon: 'trash',
      yesColor: 'danger',
      message: `Remove this ${label}${name ? ` (${name})` : ''}? ${hasId(row) ? 'The change is applied when you save.' : ''}`.trim(),
      autoDismissOnClick: false,
      onYes: () => { closeMosyModal('modal1'); pushHistory(); setField(rowId, col.key, ''); focusWrap(); },
      onNo: () => { closeMosyModal('modal1'); focusWrap(); },
    });
  };

  const clearCell = () => {
    const col = cols[active.c];
    if (!col || col._readOnly || !canSave) return;
    const rowId = rowsRef.current[active.r]?._id;
    if (FILE_TYPES.has(col.type)) { confirmRemoveFile(rowId, col); return; }
    pushHistory();
    setField(rowId, col.key, '');
  };

  const fillDown = () => {
    const col = cols[active.c];
    if (!col || col._readOnly || !canSave || active.r === 0) return;
    const src = rowsRef.current[active.r - 1];
    const id = rowsRef.current[active.r]._id;
    pushHistory();
    setField(id, col.key, src[col.key]);
    if (col.type === 'liveSearch') { const lk = col.labelKey || `${col.key}__label`; setField(id, lk, src[lk]); }
    moveTo(active.r + 1, active.c);
  };

  const onGridKeyDown = (e) => {
    if (editingRef.current) return;
    const { r, c } = active;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); saveAll(); return; }
    if (mod && k === 'z') { e.preventDefault(); undo(); return; }
    if (mod && k === 'd') { e.preventDefault(); fillDown(); return; }
    if (mod) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveTo(r + 1, c); return;
      case 'ArrowUp': e.preventDefault(); moveTo(Math.max(0, r - 1), c); return;
      case 'ArrowLeft': e.preventDefault(); if (c > 0) setActive({ r, c: c - 1 }); return;
      case 'ArrowRight': e.preventDefault(); if (c < cols.length - 1) setActive({ r, c: c + 1 }); return;
      case 'Tab': e.preventDefault(); moveTo(r, e.shiftKey ? c - 1 : c + 1); return;
      case 'Enter':
      case 'F2': e.preventDefault(); beginEdit(r, c); return;
      case ' ':
        if (cols[c]?.type === 'boolean') { e.preventDefault(); beginEdit(r, c); }
        else if (cols[c] && TEXT_LIKE.has(cols[c].type)) { e.preventDefault(); beginEdit(r, c, ' '); }
        return;
      case 'Delete':
      case 'Backspace': e.preventDefault(); clearCell(); return;
      default:
        if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey && cols[c] && (TEXT_LIKE.has(cols[c].type) || SEARCH_PICKER.has(cols[c].type))) {
          e.preventDefault();
          beginEdit(r, c, e.key);
        }
    }
  };

  // ── Attach files (dialog / drag-drop / clipboard) ────────────
  // One file -> that cell. Several files started on a NEW row fill consecutive
  // rows down the column (growing the entry block); started on a saved record
  // only the first file is used so neighbouring records are never overwritten.
  const attachFiles = (fileList, r, c) => {
    const col = cols[c];
    const list = Array.from(fileList || []);
    if (!canSave || !list.length || !col || col._readOnly || !FILE_TYPES.has(col.type)) return;
    const good = [], bad = [];
    list.forEach((f) => { const p = fileProblem(col, f); if (p) bad.push(`${f.name || 'file'}: ${p}`); else good.push(f); });
    if (bad.length) notify('error', `${bad.slice(0, 3).join(' · ')}${bad.length > 3 ? ` · +${bad.length - 3} more` : ''}`);
    if (!good.length) return;
    const nNew0 = rowsRef.current.filter((x) => !hasId(x)).length;
    const onNew = r < nNew0;
    const picked = onNew ? good : good.slice(0, 1);
    const needed = canAdd && onNew ? Math.max(0, r + picked.length - nNew0) : 0;
    let applied = 0;
    mutate((prev) => {
      const next = [...prev];
      for (let i = 0; i < needed && next.length < maxRows; i++) next.splice(next.filter((x) => !hasId(x)).length, 0, blankRow());
      picked.forEach((file, i) => {
        const idx = r + i;
        if (idx >= next.length) return;
        let row = { ...next[idx], [col.key]: file, _state: '', _rowError: '', _errors: { ...next[idx]._errors, [col.key]: undefined } };
        if (typeof schema.computeOnChange === 'function') {
          const patch = schema.computeOnChange(col.key, row);
          if (patch) row = { ...row, ...patch };
        }
        next[idx] = row;
        applied++;
      });
      return next;
    });
    if (picked.length > 1) setMessage({ type: 'info', text: `${picked.length} files attached down the "${col.label || col.key}" column — review, then save.` });
    setActive({ r, c });
    return applied;
  };

  // ── Paste a block copied from Excel / Sheets ────────────────
  const coercePaste = (col, raw) => {
    const s = String(raw ?? '');
    if (col.type === 'date') return normalizeDate(s);
    if (col.type === 'number' || col.type === 'money') return s.replace(/,/g, '').trim();
    if (col.type === 'boolean') return /^(true|1|yes|y|✓)$/i.test(s.trim());
    if (col.type === 'select') {
      const hit = (col.options || []).find((o) => String(o).toLowerCase() === s.trim().toLowerCase());
      return hit ?? s.trim();
    }
    return s;
  };
  const onPaste = (e) => {
    if (editingRef.current || !canSave) return;
    // Screenshot / copied file(s) while a file or image cell is active -> attach instead of text-paste.
    const clipFiles = e.clipboardData?.files;
    if (clipFiles && clipFiles.length && FILE_TYPES.has(cols[active.c]?.type)) {
      e.preventDefault();
      attachFiles(clipFiles, active.r, active.c);
      return;
    }
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const grid = lines.map((l) => l.split('\t'));
    const nNew0 = rowsRef.current.filter((r) => !hasId(r)).length;
    const needed = canAdd && active.r < nNew0 ? Math.max(0, active.r + grid.length - nNew0) : 0; // only grow the entry block
    mutate((prev) => {
      const next = [...prev];
      for (let i = 0; i < needed && next.length < maxRows; i++) next.splice(next.filter((r) => !hasId(r)).length, 0, blankRow());
      grid.forEach((cells, ri) => {
        const idx = active.r + ri;
        if (idx >= next.length) return;
        let row = { ...next[idx], _state: '', _rowError: '', _errors: {} };
        cells.forEach((raw, ci) => {
          const col = cols[active.c + ci];
          if (!col || col._readOnly || col.type === 'liveSearch' || col.type === 'groupedSelect' || FILE_TYPES.has(col.type)) return; // can't resolve text -> id/option reliably
          row = { ...row, [col.key]: coercePaste(col, raw) };
          if (typeof schema.computeOnChange === 'function') {
            const patch = schema.computeOnChange(col.key, row);
            if (patch) row = { ...row, ...patch };
          }
        });
        next[idx] = row;
      });
      return next;
    });
    setMessage({ type: 'info', text: `Pasted ${grid.length} row${grid.length === 1 ? '' : 's'}.` });
  };

  // ── Selection ────────────────────────────────────────────────
  const toggleRow = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r._id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r._id)));

  // ── Schema-driven actions (same lookups as the form) ─────────

  // Exactly what the form submits: every schema field's value.
  const buildValues = (row) => {
    const v = {};
    (schema.fields || []).forEach((f) => { v[f.key] = row[f.key] ?? ''; });
    return { ...v, ...fixedValues };
  };

  // The form's validate(): f.required && !value (+ numeric sanity).
  const validateRow = (row) => {
    const errs = {};
    cols.forEach((c) => {
      const v = row[c.key];
      if (c.required && !v && v !== 0) errs[c.key] = `${c.label} is required`;
      else if ((c.type === 'number' || c.type === 'money') && !isEmpty(v) && Number.isNaN(Number(v))) errs[c.key] = 'Must be a number';
    });
    return errs;
  };

  const dirtyCount = rows.filter(isDirty).length;
  const errorCount = rows.filter((r) => r._state === 'error').length;

  useEffect(() => { if (onDirtyChange) onDirtyChange(dirtyCount); }, [dirtyCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before refresh / close / leaving the page with unsaved work.
  // (Edits are also cached locally, but the warning avoids surprises.)
  useEffect(() => {
    if (dirtyCount === 0) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  // Loading UX: skeleton rows until the FIRST load finishes, then a dimmed
  // overlay with a spinner for every later reload (search/page/refresh/save).
  const sawLoading = useRef(false);
  const [initialDone, setInitialDone] = useState(false);
  useEffect(() => {
    if (g.loading) sawLoading.current = true;
    else if (sawLoading.current) setInitialDone(true);
  }, [g.loading]);
  const newCount = rows.filter((r) => !hasId(r)).length;
  const showSkeleton = loadExisting && !initialDone && !g.error;
  const overlayText = busy ? `${busy.label} ${Math.min(busy.done + 1, busy.total)} of ${busy.total}…` : g.loading ? (showSkeleton ? 'Loading data…' : 'Refreshing data…') : '';

  // search / refresh / paging replace the loaded rows — never do that
  // while there are unsaved edits that would be left stranded.
  const ifClean = (fn) => (...args) => {
    if (dirtyCount > 0) { setMessage({ type: 'error', text: 'Save or undo your unsaved changes before changing the page or search.' }); return; }
    return fn(...args);
  };

  async function saveAll() {
    if (busy) return;
    if (editingRef.current) finishEdit();
    // Untouched rows are never validated or submitted; clear any stale red marks on them.
    const current = rowsRef.current.map((r) => (!hasId(r) && isBlank(r) && (r._state === 'error' || Object.keys(r._errors || {}).some((k) => r._errors[k])) ? { ...r, _state: '', _errors: {}, _rowError: '' } : r));
    commitRows(current);
    if (!current.some(isDirty)) { setMessage({ type: 'info', text: 'Nothing to save — no new or changed rows.' }); return; }

    // 1) validate everything first
    let invalid = 0, firstBad = null;
    const badRows = [];
    const validated = current.map((row, i) => {
      if (!isDirty(row)) return row;
      const errs = validateRow(row);
      const keys = Object.keys(errs);
      if (!keys.length) return { ...row, _errors: {}, _state: row._state === 'error' ? '' : row._state };
      invalid += keys.length;
      badRows.push(i + 1);
      if (!firstBad) firstBad = { r: i, c: cols.findIndex((c) => c.key === keys[0]) };
      return { ...row, _errors: errs, _state: 'error', _rowError: '' };
    });
    commitRows(validated);
    if (invalid) {
      setMessage({ type: 'error', text: `${invalid} cell${invalid === 1 ? '' : 's'} in row${badRows.length === 1 ? '' : 's'} ${badRows.slice(0, 8).join(', ')}${badRows.length > 8 ? '…' : ''} need fixing before saving (marked in red). Empty rows are ignored.` });
      if (firstBad) setActive(firstBad);
      focusWrap();
      return;
    }

    // 2) persist row by row through the SAME engine calls the form uses
    setMessage(null);
    const queue = validated.filter(isDirty).map((r) => r._id);
    let created = 0, updated = 0, failed = 0;
    const createdVals = [], updatedVals = [], removeIds = new Set();
    const patchRow = (id, patch) => commitRows(rowsRef.current.map((r) => (r._id === id ? { ...r, ...patch } : r)));

    for (let n = 0; n < queue.length; n++) {
      setBusy({ label: 'Saving', done: n, total: queue.length });
      const row = rowsRef.current.find((r) => r._id === queue[n]);
      if (!row) continue;
      const values = buildValues(row);
      const isUpdate = hasId(row);
      try {
        const res = isUpdate ? await g.update(toToken(idOf(row)), values) : await g.create(values);
        if (res && res.ok === false) throw new Error(res.message || 'Save failed');
        if (isUpdate) {
          updated++; updatedVals.push(values);
          patchRow(row._id, { _orig: snap(row), _state: 'saved', _errors: {}, _rowError: '' });
        } else {
          created++; createdVals.push(values);
          removeIds.add(row._id); // the engine reloaded the grid; the saved record comes back as a normal row
        }
      } catch (err) {
        failed++;
        patchRow(row._id, { _state: 'error', _rowError: err?.message || 'Save failed' });
      }
    }

    const kept = rowsRef.current.filter((r) => !removeIds.has(r._id));
    history.current = [];
    commitRows(withTail(kept));
    setSelected(new Set());
    setBusy(null);
    focusWrap();
    if (!failed) { try { if (!kept.some(isDirty) && !Object.keys(pendingEdits.current).length) localStorage.removeItem(storageKey); } catch {} }
    const parts = [created && `${created} created`, updated && `${updated} updated`].filter(Boolean).join(', ');
    notify(failed ? 'error' : 'ok', failed
      ? `${parts || 'Nothing saved'}; ${failed} failed — hover the ⚠ on a row for the reason, fix and save again.`
      : `${parts} successfully.`);
    if ((created || updated) && onSaved) onSaved({ created: createdVals, updated: updatedVals, deleted: [] });
  }

  // ── Delete: same MosyAlertCard confirm the form uses ─────────
  const removeLocal = (ids) => {
    commitRows(withTail(rowsRef.current.filter((r) => !ids.has(r._id))));
    setSelected(new Set());
  };

  async function runDelete(chosen) {
    const persisted = chosen.filter(hasId);
    const gone = new Set(chosen.filter((r) => !hasId(r)).map((r) => r._id));
    const deleted = [];
    let failed = 0;
    for (let n = 0; n < persisted.length; n++) {
      setBusy({ label: 'Deleting', done: n, total: persisted.length });
      try {
        const res = await g.remove(String(idOf(persisted[n]))); // raw id — remove() base64s it itself
        if (res && res.ok === false) throw new Error(res.message || 'Delete failed');
        gone.add(persisted[n]._id);
        deleted.push(buildValues(persisted[n]));
      } catch (err) {
        failed++;
        commitRows(rowsRef.current.map((r) => (r._id === persisted[n]._id ? { ...r, _state: 'error', _rowError: err?.message || 'Delete failed' } : r)));
      }
    }
    history.current = [];
    removeLocal(gone);
    setBusy(null);
    notify(failed ? 'error' : 'ok', failed ? `${deleted.length} deleted, ${failed} failed.` : `${gone.size} row${gone.size === 1 ? '' : 's'} removed.`);
    if (deleted.length && onSaved) onSaved({ created: [], updated: [], deleted });
  }

  const deleteSelected = () => {
    const chosen = rowsRef.current.filter((r) => selected.has(r._id));
    if (!chosen.length) return;
    const persisted = chosen.filter(hasId);
    if (!persisted.length) { removeLocal(new Set(chosen.map((r) => r._id))); return; }
    MosyAlertCard({
      icon: 'trash',
      yesColor: 'danger',
      message: `${deleteDef?.confirm || 'Are you sure you want to delete this record?'} (${persisted.length} selected)`,
      autoDismissOnClick: false,
      onYes: async () => { closeMosyModal('modal1'); await runDelete(chosen); },
      onNo: () => closeMosyModal('modal1'),
    });
  };

  // ── Clone: the form's rule (skip system + computed fields), but into
  // editable NEW rows so several can be adjusted before one Save.
  const cloneSelected = () => {
    const chosen = rowsRef.current.filter((r) => selected.has(r._id));
    if (!chosen.length) return;
    const cloneable = (schema.fields || []).filter((f) => !f.system && !f.computed);
    mutate((prev) => {
      const copies = chosen.map((r) => {
        const copy = blankRow();
        cloneable.forEach((f) => { copy[f.key] = r[f.key] ?? ''; });
        const lk = (f) => f.labelKey || `${f.key}__label`;
        cloneable.filter((f) => f.type === 'liveSearch').forEach((f) => { copy[lk(f)] = r[lk(f)]; });
        return copy;
      });
      const base = prev.filter((r) => hasId(r) || !isBlank(r));
      return withTail([...base, ...copies]).slice(0, Math.max(maxRows, base.length + copies.length));
    });
    setSelected(new Set());
    setMessage({ type: 'info', text: `${chosen.length} cloned as new row${chosen.length === 1 ? '' : 's'} at the bottom — edit if needed, then save.` });
  };


  // ── Totals / theme ───────────────────────────────────────────
  const totals = useMemo(() => {
    const t = {};
    cols.forEach((c) => { if (c.sum) t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0); });
    return t;
  }, [rows, cols]);
  const hasSums = cols.some((c) => c.sum);

  const themeVars = useMemo(() => ({
    '--sgx-accent': mosyThemeConfigs.btnBg,
    '--sgx-accent-contrast': mosyThemeConfigs.btnTxt,
    '--sgx-accent-dark': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 85%, #000000)`,
    '--sgx-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 10%, transparent)`,
  }), []);

  // ── Gates: identical to the other grid templates ─────────────
  if (g.accessDenied) {
    return <MosyUIGuard moduleName={schema?.label || schema?.entity} reason={`You don't have the "${schema.moduleRole}" role required to view this.`} />;
  }
  if (g.billingBlocked) {
    return (
      <div className="sgx-root" style={themeVars}>
        <BillingUpgradeBar isBlocked={g.billingBlocked} payUrl={g.billingPayUrl} onRecheck={g.billingRecheck} />
        <BillingInlineNotice status={g.billingStatus} onRefresh={g.billingRecheck} />
      </div>
    );
  }
  if (!cols.length) {
    return <div className="sgx-root" style={themeVars}><div className="sgx-banner sgx-banner-error">ExcelSheetGrid: schema has no editable fields.</div></div>;
  }

  const editingComplex = editing && FIELD_COMPONENTS[cols[editing.c]?.type]?.selfLabeled;
  const saveLabel = saveDef?.label || 'Save';
  const RESERVED = ['save', 'submit', 'clone', 'delete', 'addRow', 'undo'];
  const gridExtras = (g.gridProfileActions || []).filter((a) => !hidden(a.key) && !RESERVED.includes(a.key) && (a.sheet === undefined || a.sheet)); // grid:true actions, minus those with sheet:false
  const gridExtraKeys = new Set(gridExtras.map((a) => a.key));
  const sheetOnlyExtras = profileDefs.filter((a) => a.sheet === true && !gridExtraKeys.has(a.key) && !hidden(a.key) && !RESERVED.includes(a.key) && (!a.role || mosyACTRLHasRole(a.role))); // sheet:true on actions that aren't grid:true
  const extraActions = [
    ...[...gridExtras, ...sheetOnlyExtras].map((a) => ({ a, run: () => g.runProfileAction(a) })),
    ...g.toolbarActions.filter((a) => !hidden(a.key)).map((a) => ({ a, run: () => g.runToolbarAction(a) })),
  ];

  // Add / Clone / Delete / Undo are always shown and are NOT counted.
  // Custom buttons (schema actions) are counted: the first `maxVisibleActions`
  // show, any beyond that go under "More".
  const coreItems = [
    canAdd && { key: 'addRow', label: addDef?.label || 'Add new', icon: addDef?.icon || 'plus', onClick: () => addRows(1) },
    showClone && { key: 'clone', label: cloneDef.label || 'Clone', icon: cloneDef.icon || 'copy', onClick: cloneSelected, disabled: !selected.size || !!busy },
    showDelete && { key: 'delete', label: `${deleteDef.label || 'Delete'}${selected.size ? ` (${selected.size})` : ''}`, icon: deleteDef.icon || 'trash', onClick: deleteSelected, disabled: !selected.size || !!busy, cls: 'sgx-btn-danger' },
    showUndo && { key: 'undo', label: undoDef?.label || 'Undo', icon: undoDef?.icon || 'undo', onClick: undo, disabled: !history.current.length, title: 'Ctrl+Z' },
  ].filter(Boolean);
  const customItems = extraActions.map(({ a, run }) => ({ key: a.key, label: a.label, icon: a.icon, onClick: run, disabled: !!busy, cls: `${variantCls(a.variant)} ${a.colorClass || ''}`.trim() }));
  const visibleItems = [...coreItems, ...customItems.slice(0, maxVisibleActions)];
  const overflowItems = customItems.slice(maxVisibleActions);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="sgx-root" style={themeVars}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          const pick = pickRef.current;
          e.target.value = '';
          if (!files.length || !pick || !canSave) return;
          const r = rowsRef.current.findIndex((x) => x._id === pick.rowId);
          const c = cols.findIndex((x) => x.key === pick.key);
          if (r < 0 || c < 0) return;
          // same as the form: the File itself goes into the values, the engine switches to multipart
          attachFiles(files, r, c);
          focusWrap();
        }}
      />
      <div className="sgx-header">
        <div>
          <h2 className="sgx-title">{title || g.title || schema?.label}</h2>
          {(description || g.description) && <p className="sgx-description">{description || g.description}</p>}
        </div>
        {canSave && (
          <button type="button" className="sgx-btn sgx-btn-solid sgx-btn-save" onClick={saveAll} disabled={!!busy || !dirtyCount}>
            <i className={`fa fa-${busy ? 'spinner fa-spin' : saveDef?.icon || 'save'}`}></i>
            <span>{busy ? `${busy.label} ${busy.done + 1}/${busy.total}…` : `${saveLabel}${dirtyCount ? ` (${dirtyCount})` : ''}`}</span>
          </button>
        )}
      </div>

      {draftRestored && (
        <div className="sgx-banner sgx-banner-info">
          <span><i className="fa fa-history"></i> Unsaved changes restored from your last session — review them and press Save.</span>
          <button type="button" className="sgx-link" onClick={discardDraft}>Discard changes</button>
        </div>
      )}
      {g.error && <div className="sgx-banner sgx-banner-error"><span>{g.error}</span></div>}
      {message && (
        <div className={`sgx-banner sgx-banner-${message.type}`} role="status">
          <span>{message.text}</span>
          <button type="button" className="sgx-link" onClick={() => setMessage(null)} aria-label="Dismiss"><i className="fa fa-times"></i></button>
        </div>
      )}

      <div className="sgx-card">
        <div className="sgx-toolbar">
          {canAdd && <button type="button" className="sgx-btn d-none" onClick={() => addRows(5)}><i className="fa fa-plus-square-o"></i><span>{addDef?.addManyLabel || 'Add 5'}</span></button>}
          {visibleItems.map((it) => <SheetButton key={it.key} item={it} />)}
          <SheetMore items={overflowItems} />
          <span className="sgx-toolbar-info">
            {g.loading && <i className="fa fa-spinner fa-spin sgx-loading"></i>}
            {dirtyCount} unsaved{errorCount ? ` · ${errorCount} with errors` : ''}
          </span>
        </div>

        {loadExisting && (
          <div className="sgx-toolbar sgx-toolbar-search">
            <div className="sgx-search">
              <i className="fa fa-search sgx-search-icon"></i>
              <input
                type="text"
                className="sgx-search-input"
                placeholder={schema?.searchPlaceholder || 'Search existing records...'}
                value={g.searchInput}
                onChange={(e) => g.handleSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ifClean(g.submitSearch)()}
              />
            </div>
            <button type="button" className="sgx-btn sgx-btn-solid sgx-btn-go" onClick={() => ifClean(g.submitSearch)()} title="Search (Enter)"><i className="fa fa-arrow-right"></i><span>Go</span></button>
            {!hidden('refresh') && (
              <button type="button" className="sgx-btn" onClick={ifClean(g.handleRefresh)} title="Reset & refresh"><i className="fa fa-refresh"></i><span>Refresh</span></button>
            )}
            <div className="sgx-active-filters">
              <ActiveFiltersBar schema={schema} advancedQuery={g.advancedQuery} clearFilterValue={g.clearFilterValue} setDateRange={g.setDateRange} onClearAll={ifClean(g.handleRefresh)} />
            </div>
          </div>
        )}

        <div className="sgx-sheet-box">
        {(g.loading || busy) && !showSkeleton && (
          <div className="sgx-overlay" role="status" aria-live="polite">
            <span className="sgx-overlay-card"><i className="fa fa-spinner fa-spin"></i> {overlayText}</span>
          </div>
        )}
        {(g.loading || busy) && <div className="sgx-progress" aria-hidden="true"><span></span></div>}
        <div
          className={`sgx-wrap ${editingComplex ? 'sgx-wrap--pop' : ''}`}
          ref={wrapRef}
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          onPaste={onPaste}
          role="grid"
          aria-label={g.title || 'Data entry sheet'}
        >
          <table className="sgx-table">
            <thead>
              <tr>
                <th className="sgx-rownum">
                  {/* same flex layout + spacer as the row cells so the checkbox lines up vertically */}
                  <label className="sgx-rownum-inner">
                    <input type="checkbox" className="sgx-check" checked={allSelected} onChange={toggleAll} aria-label="Select all rows" />
                    <span className="sgx-rownum-n"></span>
                  </label>
                </th>
                {cols.map((c) => (
                  <th key={c.key} style={c.width ? { minWidth: c.width, width: c.width } : undefined} className={c.type === 'number' || c.type === 'money' ? 'sgx-num' : ''}>
                    {c.label || c.key}{c.required && <span className="sgx-req" title="Required"> *</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showSkeleton && Array.from({ length: 7 }).map((_, i) => (
                <tr key={`sk-${i}`} className="sgx-row sgx-skel-row" aria-hidden="true">
                  <td className="sgx-rownum"><span className="sgx-skel" style={{ width: 14 }}></span></td>
                  {cols.map((c, ci) => <td key={c.key}><span className="sgx-skel" style={{ width: `${45 + ((i * 7 + ci * 13) % 45)}%` }}></span></td>)}
                </tr>
              ))}
              {showSkeleton && <tr className="sgx-skel-note"><td colSpan={cols.length + 1}><i className="fa fa-spinner fa-spin"></i> Loading data…</td></tr>}
              {!showSkeleton && rows.map((row, r) => {
                const isSel = selected.has(row._id);
                const dirtyExisting = hasId(row) && isDirty(row);
                const isNewRow = !hasId(row);
                const afterNew = isNewRow && r === newCount - 1 && (
                  <>
                    {canAdd && (
                      <tr className="sgx-addrow" onClick={() => { if (addRows(1)) { setActive({ r: newCount, c: 0 }); focusWrap(); } }}>
                        <td colSpan={cols.length + 1}><span className="sgx-band-in"><i className="fa fa-plus"></i> Add another row</span></td>
                      </tr>
                    )}
                  </>
                );
                const trEl = (
                  <tr className={`sgx-row ${isNewRow ? 'is-new' : ''} ${isSel ? 'is-selected' : ''} ${row._state === 'error' ? 'is-error' : ''} ${row._state === 'saved' ? 'is-saved' : ''}`}>
                    <td className="sgx-rownum" title={row._rowError || (dirtyExisting ? 'Edited — not saved yet' : undefined)}>
                      <label className="sgx-rownum-inner">
                        <input type="checkbox" className="sgx-check" checked={isSel} onChange={() => toggleRow(row._id)} aria-label={`Select row ${r + 1}`} />
                        <span className="sgx-rownum-n">
                          {row._state === 'error' ? <i className="fa fa-exclamation-circle sgx-ic-err"></i>
                            : row._state === 'saved' ? <i className="fa fa-check sgx-ic-ok"></i>
                            : dirtyExisting ? <i className="fa fa-pencil sgx-ic-edit"></i>
                            : isNewRow ? <i className="fa fa-plus sgx-ic-new"></i>
                            : r - newCount + 1}
                        </span>
                      </label>
                    </td>
                    {cols.map((c, ci) => {
                      const isActive = active.r === r && active.c === ci;
                      const isEd = editing && editing.rowId === row._id && editing.c === ci;
                      const err = row._errors?.[c.key];
                      const right = c.type === 'number' || c.type === 'money';
                      return (
                        <td
                          key={c.key}
                          data-cell={`${r}-${ci}`}
                          role="gridcell"
                          onDragOver={FILE_TYPES.has(c.type) && !c._readOnly && canSave ? (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (dropCell !== `${r}-${ci}`) setDropCell(`${r}-${ci}`); } } : undefined}
                          onDragLeave={FILE_TYPES.has(c.type) ? () => setDropCell((d) => (d === `${r}-${ci}` ? null : d)) : undefined}
                          onDrop={FILE_TYPES.has(c.type) && !c._readOnly && canSave ? (e) => { e.preventDefault(); setDropCell(null); attachFiles(e.dataTransfer.files, r, ci); focusWrap(); } : undefined}
                          className={`sgx-cell ${dropCell === `${r}-${ci}` ? 'is-drop' : ''} ${isActive ? 'is-active' : ''} ${err ? 'has-error' : ''} ${c._readOnly ? 'is-readonly' : ''} ${right ? 'sgx-num' : ''} ${isEd ? 'is-editing' : ''}`}
                          title={err || undefined}
                          onMouseDown={() => { if (isEd) return; if (editingRef.current) finishEdit(); const wasActive = active.r === r && active.c === ci; setActive({ r, c: ci }); if (wasActive && (PICKER.has(c.type) || FILE_TYPES.has(c.type)) && !c._readOnly) setTimeout(() => beginEdit(r, ci), 0); }}
                          onDoubleClick={() => beginEdit(r, ci)}
                        >
                          {isEd ? (
                            <EditorHost col={c} row={row} schema={schema} setField={setField} onFinish={finishEdit} seed={editSeedRef.current} />
                          ) : FILE_TYPES.has(c.type) ? (
                            <FileCell col={c} value={row[c.key]} canEdit={canSave && !c._readOnly} onClear={() => confirmRemoveFile(row._id, c)} />
                          ) : c.type === 'boolean' ? (
                            <span className="sgx-cell-text sgx-bool">{row[c.key] ? <i className="fa fa-check-square-o"></i> : <i className="fa fa-square-o"></i>}</span>
                          ) : (
                            <span className={`sgx-cell-text ${PICKER.has(c.type) && !c._readOnly ? 'sgx-has-caret' : ''}`} title={displayText(c, row)}>{displayText(c, row)}{PICKER.has(c.type) && !c._readOnly && <i className="fa fa-caret-down sgx-caret"></i>}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
                return (
                  <Fragment key={row._id}>
                    {trEl}
                    {afterNew}
                  </Fragment>
                );
              })}
            </tbody>
            {hasSums && (
              <tfoot>
                <tr className="sgx-tfoot">
                  <td className="sgx-rownum"></td>
                  {cols.map((c) => (
                    <td key={c.key} className={c.type === 'number' || c.type === 'money' ? 'sgx-num' : ''}>
                      {c.sum ? totals[c.key].toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </div>

        {loadExisting && (
          <div className="sgx-pagination-wrap">
            <EntityPaginationUi
              page={g.page}
              pageCount={g.pageCount}
              onPageChange={ifClean(g.setPage)}
              pageSize={g.pageSize}
              onPageSizeChange={ifClean(g.setPageSize)}
            />
          </div>
        )}

        <div className="sgx-footer">
          <span className="sgx-hint"><kbd>Tab</kbd> next · <kbd>Enter</kbd> edit / commit &amp; down · <kbd>Esc</kbd> cancel · <kbd>Ctrl</kbd>+<kbd>D</kbd> fill down · <kbd>Ctrl</kbd>+<kbd>V</kbd> paste from Excel · <kbd>Ctrl</kbd>+<kbd>S</kbd> save</span>
        </div>
      </div>
    </div>
  );
}
