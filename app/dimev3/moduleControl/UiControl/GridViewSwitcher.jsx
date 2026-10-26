'use client';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import saAuthConfigs from '../../../auth/featureConfig/saAuthConfigs';
 

/**
 * GridViewSwitcher — one module, two grid styles.
 *
 *   <GridViewSwitcher
 *     table={SmartGrid}
 *     sheet={ExcelSheetGrid}
 *     start="table"          // used only when nothing has been chosen yet
 *     storageKey="enrollments" // recommended: lets setGridView() find this module
 *     showToggle             // optional: show Table | Sheet buttons (hidden by default)
 *     {...props}
 *   />
 *
 * Which view renders (first match wins):
 *   1. ?setgv=sheet | table in the URL  -> saved to storage, then stripped from the URL
 *   2. the view saved in storage
 *   3. start
 *
 * From anywhere else (button, menu, handler):
 *   import { setGridView } from './GridViewSwitcher';
 *   setGridView('sheet', 'enrollments');   // (view, storageKey) — switches live
 *
 * Links (sidebar etc.):  `${base}/enrollments/list?setgv=sheet`
 */
const PARAM = 'setgv';
const EVENT = 'gvs:set';
const ICON = { table: 'fa fa-table', sheet: 'fa fa-th' };
const valid = (v) => v === 'table' || v === 'sheet';
// All views live in ONE storage entry: { "<storageKey>": "table" | "sheet" }
// Per-app: same sessionPrefix the footer uses, so apps on one domain don't share views.
const MAP = (() => {
  let p = '';
  try { p = (saAuthConfigs && saAuthConfigs.sessionPrefix) || ''; } catch (e) { /* ignore */ }
  return p ? `${p}_gvs_map` : 'gvs_map';
})();
const OLD_MAP = 'gvs-map'; // earlier shared key, folded in once
const LEGACY = 'gvs:'; // old format: one entry per module

const readMap = () => {
  try {
    const m = JSON.parse(localStorage.getItem(MAP) || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) { return {}; }
};
const writeMap = (m) => {
  try { localStorage.setItem(MAP, JSON.stringify(m)); } catch (e) { /* storage unavailable */ }
};

// One-time cleanup: fold old "gvs:<module>" entries into the map, then delete them.
let migrated = false;
const migrateLegacy = () => {
  if (migrated) return;
  migrated = true;
  try {
    const m = readMap();
    try {
      const prev = JSON.parse(localStorage.getItem(OLD_MAP) || 'null');
      if (prev && typeof prev === 'object') {
        Object.keys(prev).forEach((n) => { if (valid(prev[n]) && !m[n]) m[n] = prev[n]; });
        localStorage.removeItem(OLD_MAP);
        writeMap(m);
      }
    } catch (e) { /* ignore */ }
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY)) old.push(k);
    }
    if (!old.length) return;
    old.forEach((k) => {
      const v = localStorage.getItem(k);
      const name = k.slice(LEGACY.length);
      if (valid(v) && !m[name]) m[name] = v;
      localStorage.removeItem(k);
    });
    writeMap(m);
  } catch (e) { /* ignore */ }
};

const readSaved = (k) => {
  migrateLegacy();
  const v = readMap()[k];
  return valid(v) ? v : null;
};
const writeSaved = (k, v) => {
  const m = readMap();
  m[k] = v;
  writeMap(m);
};

/** Forget saved views: one module (clearGridViews('enrollments')) or all of them. */
export function clearGridViews(storageKey) {
  try {
    if (storageKey) { const m = readMap(); delete m[storageKey]; writeMap(m); }
    else localStorage.removeItem(MAP);
  } catch (e) { /* ignore */ }
}

/** Call from anywhere to change a module's view. Updates storage and any mounted switcher. */
export function setGridView(view, storageKey = 'default') {
  if (!valid(view)) return;
  writeSaved(storageKey, view);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: storageKey, view } }));
  }
}

function Switcher({
  table: TableView,
  sheet: SheetView,
  start = 'table',
  showToggle = false,
  labels = {},
  storageKey,
  ...rest
}) {
  const key = storageKey || rest.schema?.key || rest.schema?.title || rest.title || 'default';
  const params = useSearchParams();
  const urlView = params ? params.get(PARAM) : null;

  // null until resolved on the client, so the wrong grid never mounts/fetches first
  const [view, setView] = useState(null);
  const [dirty, setDirty] = useState(false);

  // URL > storage > start
  useEffect(() => {
    if (valid(urlView)) {
      writeSaved(key, urlView);
      setView(urlView);
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete(PARAM);
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      } catch (e) { /* ignore */ }
      return;
    }
    setView((prev) => prev || readSaved(key) || start);
  }, [urlView, key, start]);

  // live changes from setGridView()
  useEffect(() => {
    const h = (e) => { if (e.detail && e.detail.key === key && valid(e.detail.view)) setView(e.detail.view); };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [key]);

  const onDirtyChange = useCallback((d) => {
    setDirty(!!d);
    if (rest.onDirtyChange) rest.onDirtyChange(d);
  }, [rest.onDirtyChange]);

  const choose = (v) => {
    if (v === view) return;
    if (dirty && !window.confirm('You have unsaved changes. Switch view anyway?')) return;
    setDirty(false);
    writeSaved(key, v);
    setView(v);
  };

  if (!view) return null;
  const Active = view === 'sheet' ? SheetView : TableView;
  if (!showToggle) return <Active key={view} {...rest} onDirtyChange={onDirtyChange} />;

  const items = [
    ['table', labels.table || 'Table'],
    ['sheet', labels.sheet || 'Sheet'],
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
        <div
          role="tablist"
          style={{
            display: 'inline-flex', border: '1px solid #d0d5dd', borderRadius: 8,
            overflow: 'hidden', background: '#fff',
          }}
        >
          {items.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              onClick={() => choose(k)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                fontSize: 13, border: 0, cursor: 'pointer',
                background: view === k ? '#1d4ed8' : 'transparent',
                color: view === k ? '#fff' : '#344054',
              }}
            >
              <i className={ICON[k]}></i>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <Active key={view} {...rest} onDirtyChange={onDirtyChange} />
    </div>
  );
}

// useSearchParams needs a Suspense boundary in Next builds; keep it inside so callers don't care.
export default function GridViewSwitcher(props) {
  return (
    <Suspense fallback={null}>
      <Switcher {...props} />
    </Suspense>
  );
}
