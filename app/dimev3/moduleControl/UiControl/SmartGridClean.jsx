'use client';
import { useMemo, useRef, useState, useEffect, useSyncExternalStore, Fragment } from 'react';
import { useEntityGridController } from '../dataControl/useEntityGridController';
import EntityRowOptions from './Entityrowoptions';
import mosyThemeConfigs from '../../../appConfigs/mosyTheme';
import { MosyUIGuard } from '../../UiControl/MosyUiGuard';
import BillingUpgradeBar from '../../../MosyUtils/BillingUpgradeBar';
import { BillingInlineNotice } from '../../../novabilling/BillingNotice';
import { magicTrimText, mosyFormatDateOnly } from '../../../MosyUtils/hiveUtils';
import { MosyCard } from '../../../components/MosyCard';
import { ActiveFiltersBar } from './Activefiltersbar';
import FileThumb from './FileThumb';
import './SmartGridClean.css';

// ════════════════════════════════════════════════════════════════
// SmartGridClean — clean / minimalist TEMPLATE for the same grid engine.
// Same props + same `useEntityGridController` call as SmartGrid /
// SmartGridInsight. Markup + CSS only (sgc- namespace).
// Drop-in swap: <SmartGridInsight .../>  ->  <SmartGridClean .../>
//
// Layout: header (title + description | header actions + Export menu)
//         -> toolbar (search · Reset · toolbar actions · "More" overflow)
//         -> ActiveFiltersBar (only renders when a filter is active)
//         -> table card (uppercase muted headers, airy rows)
//         -> footer ("Showing x to y of z" + pager)
//
// ── ACTION PLACEMENT ────────────────────────────────────────────
// Every action (schema.profileActions with grid:true, and schema.actions)
// lands in one of two zones:
//   zone: 'header'   -> top-right, next to Export   (New Payment, Manage…)
//   zone: 'toolbar'  -> row under the title         (Filter by Student…)
// Default when `zone` is omitted: type:'action' -> toolbar, else header.
// schema.actions default to toolbar. Solid (filled) button: `primary:true`
// or variant 'primary'/'dark'; if none is flagged the FIRST header action
// is filled. Overflow past maxHeaderActions / maxToolbarActions collapses
// into a popover ("More" / toolbarMoreLabel).
//
// ── PER-COLUMN STYLING (schema-driven) ──────────────────────────
// Any schema field may carry these (all optional, all on the column itself —
// no separate schema-level object):
//   cellStyle:   'color:#1d4ed8; font-size:22px; font-weight:700'
//                | { color:'#1d4ed8', fontSize: 22 }
//                | (value, row) => style      // conditional styling
//   cellClass:   extra class on the value element
//   headerStyle: same shapes as cellStyle (function gets no args), for <th>
//   align:       'right' | 'center'  (sum:true columns are right-aligned)
//   width:       '140px' (min-width on the column)
//   subKey:      another row key shown as a small muted line UNDER the value
//                (student name + reference)
//   subStyle:    style for that second line
//   stack:       'datetime' -> splits a date/datetime into date + muted time
//   trim:        max chars before magicTrimText kicks in (default 60)
//   wrap:        true -> let this column wrap onto several lines (default:
//                one line per cell; long text is shortened by `trim`)
//   type:'status' -> tinted pill  (statusTones: { paid: 'green' }; tones: green|amber|red|blue|gray)
//   type:'tag'    -> dotted chip  (tagTones: { cash: 'amber' }, tagIcons: { cash: 'money' })
//
// ── INTERACTION (all opt-out props) ─────────────────────────────
//   hoverFocus             row tint + left bar; hovered cell scales up, row-mates fade
//   copyOnDblClick         double-click a cell to copy its value (toast confirms)
//   density                'comfortable' | 'compact'
//   tableMaxHeight ('')    set e.g. '70vh' to scroll the table inside that height (sticky header);
//                          default '' = the page scrolls. Row-action menus always have room (see --sgc-menu-room).
// hoverFocus / copyOnDblClick / density / presentation / replay are GLOBAL
// settings (see GLOBAL GRID SETTINGS below — one localStorage key, callable from a side
// menu, system settings, the console…). A prop passed here overrides the global value
// for this one grid; leave the prop out and the grid follows the global setting.
// Rows fade/slide in on load, search and page change (respects reduced-motion).
//
// ── PRESENTATION MODE (global setting `presentation`, default on) ─
// Built for screen recordings / talks. Header slides in, buttons pop in
// staggered, the card rises with an accent sweep, rows cascade cell by cell,
// money columns COUNT UP from 0 (countUp:true/false per field; default on for
// type:'money'), skeleton shimmer while loading. Hover: row lifts with a deep
// shadow + cursor spotlight, hovered value zooms with a glow, buttons /
// pills / pager pop. Settings live OUTSIDE the grid: flip them with
// togglePresentation('off'), setDensity('compact') or setGridPrefs({...}). replay:false keeps the hover effects but skips the
// entrance choreography + count-up. replayGrids() re-runs the entrance on every
// mounted grid. A `presentation={false}` prop pins one grid off regardless.
//
// cellStyle is applied to the value only, never the <td>, so a big font
// can't distort the row's padding or the muted sub-line.
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// GLOBAL GRID SETTINGS — one localStorage key, callable from anywhere.
//   import SmartGridClean, { togglePresentation, setDensity, replayGrids, setGridPrefs } from '.../SmartGridClean';
//
//   togglePresentation('on')     // or 'off' / true / false; no argument flips it
//   setDensity('compact')        // or 'comfortable'
//   replayGrids()                // re-run the entrance on every mounted grid
//   setGridPrefs({ presentation:'off', replay:false, density:'compact', hoverFocus:true, copyOnDblClick:true })
//   resetGridPrefs()
//
// Or from the console / a settings page:
//   localStorage.setItem('mosy.grid.prefs', JSON.stringify({ presentation:'on', replay:true }))
// Mounted grids (and other tabs) update live. on|true|1 and off|false|0 are all accepted;
// anything missing/broken falls back to the defaults. A prop on a grid overrides the global value.
// ════════════════════════════════════════════════════════════════
const PREFS_KEY = 'mosy.grid.prefs';
const PREFS_EVENT = 'mosy-grid-prefs';
const PREF_DEFAULTS = Object.freeze({ presentation: true, replay: true, density: 'comfortable', hoverFocus: true, copyOnDblClick: true, replayTick: 0 });
const asBool = (v, d) => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (['on', 'true', '1', 'yes'].includes(t)) return true;
    if (['off', 'false', '0', 'no'].includes(t)) return false;
  }
  return d;
};
let prefsRaw = null;
let prefsSnap = PREF_DEFAULTS;
const readPrefsRaw = () => { try { return localStorage.getItem(PREFS_KEY); } catch { return null; } };
export function getGridPrefs() {
  if (typeof window === 'undefined') return PREF_DEFAULTS;
  const raw = readPrefsRaw();
  if (raw === prefsRaw) return prefsSnap;
  let r = {};
  try { r = JSON.parse(raw || '{}') || {}; } catch { r = {}; }
  const d = PREF_DEFAULTS;
  prefsRaw = raw;
  prefsSnap = {
    presentation: asBool(r.presentation, d.presentation),
    replay: asBool(r.replay, d.replay),
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    hoverFocus: asBool(r.hoverFocus, d.hoverFocus),
    copyOnDblClick: asBool(r.copyOnDblClick, d.copyOnDblClick),
    replayTick: Number.isFinite(Number(r.replayTick)) ? Number(r.replayTick) : 0,
  };
  return prefsSnap;
}
export function setGridPrefs(patch = {}) {
  if (typeof window === 'undefined') return;
  let cur = {};
  try { cur = JSON.parse(readPrefsRaw() || '{}') || {}; } catch { cur = {}; }
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...patch })); } catch {}
  prefsRaw = undefined; // force re-read
  window.dispatchEvent(new Event(PREFS_EVENT));
}
export function resetGridPrefs() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(PREFS_KEY); } catch {}
  prefsRaw = undefined;
  window.dispatchEvent(new Event(PREFS_EVENT));
}
export const togglePresentation = (value) =>
  setGridPrefs({ presentation: value === undefined ? !getGridPrefs().presentation : asBool(value, true) });
export const setDensity = (value) =>
  setGridPrefs({ density: value === 'compact' || value === true ? 'compact' : 'comfortable' });
export const replayGrids = () => setGridPrefs({ replayTick: Date.now() });

// ── SETTINGS PANEL — one call opens it in a MosyCard, or render it as a page ──
//   import { openGridSettings, GridSettingsPanel } from '.../SmartGridClean';
//   <button onClick={openGridSettings}>Grid settings</button>   // sidebar item → modal
//   <GridSettingsPanel variant="page" />                         // full System Settings page section
// Every button just calls the functions above; grids update live. Styles: .sgcs-* in SmartGridClean.css.
function SettingsSeg({ value, options, onChange, label }) {
  return (
    <div className="sgcs-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={value === o.value ? 'is-on' : ''}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
const ON_OFF = [{ value: true, label: 'On' }, { value: false, label: 'Off' }];

export function GridSettingsPanel({
  variant = 'modal', // 'modal' = rows only (inside MosyCard) · 'page' = heading + side note + rows (System Settings)
  eyebrow = 'Settings',
  title = 'Grid & presentation',
  subtitle = 'Customize how data grids look and behave across the system.',
  note = 'Control how data grids are displayed and interacted with across the system. These settings are saved in your browser and apply to all grids in the system.',
}) {
  const p = useGridPrefs();
  const themeVars = { '--sgcs-accent': mosyThemeConfigs.btnBg, '--sgcs-accent-contrast': mosyThemeConfigs.btnTxt };
  const row = (label, hint, control) => (
    <div className="sgcs-row">
      <div className="sgcs-text">
        <div className="sgcs-label">{label}</div>
        <div className="sgcs-hint">{hint}</div>
      </div>
      {control}
    </div>
  );
  
  const rows = (
    <div className="sgcs-rows">
      {row('Presentation mode', 'Animated entrance, count-up and hover effects.',
        <SettingsSeg label="Presentation mode" value={p.presentation} options={ON_OFF} onChange={togglePresentation} />)}
      {row('Entrance replay', 'Off keeps hover effects, skips the entrance.',
        <SettingsSeg label="Entrance replay" value={p.replay} options={ON_OFF} onChange={(v) => setGridPrefs({ replay: v })} />)}
      {row('Density', 'Row spacing across every grid.',
        <SettingsSeg label="Density" value={p.density} onChange={setDensity}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />)}
      {row('Hover focus', 'Row tint and zoomed cell on hover.',
        <SettingsSeg label="Hover focus" value={p.hoverFocus} options={ON_OFF} onChange={(v) => setGridPrefs({ hoverFocus: v })} />)}
      {row('Copy on double-click', 'Double-click a cell to copy it.',
        <SettingsSeg label="Copy on double-click" value={p.copyOnDblClick} options={ON_OFF} onChange={(v) => setGridPrefs({ copyOnDblClick: v })} />)}
      <div className="sgcs-actions">
        <button type="button" className="sgcs-btn sgcs-btn-strong" onClick={replayGrids} disabled={!p.presentation}>Replay entrance</button>
        <button type="button" className="sgcs-btn" onClick={resetGridPrefs}>Reset defaults</button>
      </div>
    </div>
  );

  if (variant !== 'page') return <div className="sgcs sgcs-modal" style={themeVars}>{rows}</div>;
  return (
    <div className="sgcs sgcs-page" style={themeVars}>
      <div className="sgcs-head">
        <div>
          {eyebrow && <div className="sgcs-eyebrow">{eyebrow}</div>}
          <h1 className="sgcs-h1">{title}</h1>
          {subtitle && <p className="sgcs-sub">{subtitle}</p>}
        </div>
        <span className="sgcs-saved"><i className="sgcs-dot"></i>Saved in this browser</span>
      </div>
      <div className="sgcs-card">
        <aside className="sgcs-aside">
          <h2 className="sgcs-aside-title">{title}</h2>
          <p>{note}</p>
        </aside>
        {rows}
      </div>
    </div>
  );
}
export function openGridSettings() {
  MosyCard('Grid Settings', <GridSettingsPanel />); // default id — registered by DynamicModalProvider in AdminFooter
}

const subscribePrefs = (cb) => {
  const onStorage = (e) => { if (!e || e.key === null || e.key === PREFS_KEY) cb(); };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener('storage', onStorage); // other tabs
  return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener('storage', onStorage); };
};
export const useGridPrefs = () => useSyncExternalStore(subscribePrefs, getGridPrefs, () => PREF_DEFAULTS);

const DEFAULT_CELL_TRIM = 60;
const PAGE_BASE = 1; // set to 0 if the hook's `page` is zero-indexed
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000, 2000];

// ── style helpers ───────────────────────────────────────────────
const styleCache = new Map();
function parseStyle(input) {
  if (!input) return undefined;
  if (typeof input === 'object') return input;
  if (styleCache.has(input)) return styleCache.get(input);
  const out = {};
  // split on ';' but not inside parentheses (url(...), rgb(...))
  String(input).split(/;(?![^(]*\))/).forEach((decl) => {
    const i = decl.indexOf(':');
    if (i < 0) return;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).replace(/!important/i, '').trim(); // React inline styles can't carry !important
    if (!prop || !val) return;
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = val;
  });
  styleCache.set(input, out);
  return out;
}
// Never let a bad cellStyle (throwing function, malformed value) break the grid — fall back to unstyled.
const resolveStyle = (s, ...args) => {
  try {
    return parseStyle(typeof s === 'function' ? s(...args) : s);
  } catch {
    return undefined;
  }
};

function TrimmedCell({ value, trim }) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  return <span title={text}>{magicTrimText(text, trim ?? DEFAULT_CELL_TRIM)}</span>;
}

// ── status pills / tag chips (field type 'status' | 'tag') ─────
// Override per field: statusTones: { matched: 'green' }, tagTones, tagIcons.
const STATUS_TONES = {
  matched: 'green', completed: 'green', complete: 'green', success: 'green', successful: 'green',
  paid: 'green', active: 'green', approved: 'green', verified: 'green', reconciled: 'green',
  pending: 'amber', processing: 'amber', partial: 'amber', draft: 'amber', unmatched: 'amber', waiting: 'amber',
  failed: 'red', cancelled: 'red', canceled: 'red', rejected: 'red', reversed: 'red', inactive: 'red',
  overdue: 'red', duplicate: 'red', mismatch: 'red',
};
const TAG_TONES = {
  'm-pesa': 'green', mpesa: 'green', 'mobile money': 'green', bank: 'blue', 'bank transfer': 'blue',
  card: 'purple', cash: 'amber', cheque: 'blue', barter: 'gray',
};
const lc = (v) => String(v ?? '').toLowerCase();

function StatusPill({ value, tones }) {
  if (value === null || value === undefined || value === '') return null;
  const tone = tones?.[lc(value)] || STATUS_TONES[lc(value)] || 'gray';
  return <span className={`sgc-pill sgc-pill-${tone}`}>{String(value)}</span>;
}

function TagChip({ value, tones, icons }) {
  if (value === null || value === undefined || value === '') return null;
  const tone = tones?.[lc(value)] || TAG_TONES[lc(value)] || 'gray';
  const icon = icons?.[lc(value)];
  return (
    <span className={`sgc-tag sgc-tag-${tone}`}>
      <span className="sgc-tag-dot">{icon && <i className={`fa fa-${icon}`}></i>}</span>
      {String(value)}
    </span>
  );
}

// "2026-10-06 18:33:00" -> { date: '06 Oct 2026', time: '18:33' }
function splitDateTime(raw) {
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  let date;
  try { date = mosyFormatDateOnly(raw); } catch { date = ''; }
  if (!date || date === 'Invalid Date') date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return { date, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// ── actions ─────────────────────────────────────────────────────
function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setOpen]);
  return ref;
}

function MenuButton({ label, icon, items, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  if (!items.length) return null;
  return (
    <div className="sgc-menu-wrap" ref={ref}>
      <button type="button" className="sgc-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon && <i className={`fa fa-${icon} sgc-btn-ic`}></i>}
        <span>{label}</span>
        <i className="fa fa-angle-down sgc-caret"></i>
      </button>
      {open && (
        <div className={`sgc-menu sgc-menu-${align}`}>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`sgc-menu-item ${it.colorClass || ''}`.trim()}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.icon && <i className={`fa fa-${it.icon}`}></i>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const isSolid = (a) => a.primary === true || a.variant === 'primary' || a.variant === 'dark';
const dangerCls = (a) => (String(a.variant || '').includes('danger') ? 'sgc-btn-danger' : '');

function ActionGroup({ actions, max, moreLabel = 'More', solidFirst = false, align = 'left' }) {
  if (!actions.length) return null;
  const visible = actions.slice(0, max);
  const overflow = actions.slice(max);
  const solidKey = actions.find(isSolid)?.key ?? (solidFirst ? actions[0].key : null);
  return (
    <>
      {visible.map((a, i) => (
        <button
          key={a.key}
          type="button"
          className={`sgc-btn ${a.key === solidKey ? 'sgc-btn-solid' : ''} ${dangerCls(a)} ${a.colorClass || ''}`.trim()}
          onClick={a._run}
          style={{ '--b': i }}
        >
          {a.icon && <i className={`fa fa-${a.icon} sgc-btn-ic`}></i>}
          <span>{a.label}</span>
        </button>
      ))}
      <MenuButton
        label={moreLabel}
        icon="filter"
        align={align}
        items={overflow.map((a) => ({ ...a, onClick: a._run }))}
      />
    </>
  );
}

// ── sub-grids (same behaviour as the other templates) ───────────
function MiniGrid({ config, row, buildViewMoreHref }) {
  const items = Array.isArray(row?.[config.key]) ? row[config.key] : [];
  const totals = useMemo(() => {
    const t = {};
    (config.columns || []).forEach((c) => {
      if (c.sum) t[c.key] = items.reduce((s, r) => s + Number(r[c.key] || 0), 0);
    });
    return t;
  }, [items, config.columns]);
  const hasTotals = Object.keys(totals).length > 0;
  const viewMoreHref = buildViewMoreHref(config, row);

  return (
    <div className="sgc-subgrid">
      <div className="sgc-subgrid-head">
        <span className="sgc-subgrid-title">{config.title}</span>
        {viewMoreHref && (
          <a href={viewMoreHref} className="sgc-subgrid-more multigrid_view_more skip_print no-export">
            View more <i className="fa fa-angle-right"></i>
          </a>
        )}
      </div>
      {items.length === 0 ? (
        <div className="sgc-empty-mini">No {(config.title || 'records').toLowerCase()} found.</div>
      ) : (
        <table className="sgc-subgrid-table">
          <thead>
            <tr>
              <th>#</th>
              {config.columns.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={r.record_id ?? r.primkey ?? r.id ?? i}>
                <td>{r.row_count ?? i + 1}</td>
                {config.columns.map((c) => <td key={c.key}>{c.format ? c.format(r[c.key], r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
          {hasTotals && (
            <tfoot>
              <tr>
                <td></td>
                {config.columns.map((c) => <td key={c.key}>{c.sum ? totals[c.key] : ''}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}

// ── pager: ‹ 1 2 3 … 12 › ───────────────────────────────────────
function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4, 5].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 4, total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

function Pager({ page, pageCount, onPageChange }) {
  const current = Number(page) - PAGE_BASE + 1;
  const total = Math.max(1, Number(pageCount) || 1);
  const go = (p) => {
    if (p < 1 || p > total || p === current) return;
    onPageChange(p - 1 + PAGE_BASE);
  };
  return (
    <div className="sgc-pager">
      <button type="button" className="sgc-page" disabled={current <= 1} onClick={() => go(current - 1)} aria-label="Previous page">
        <i className="fa fa-angle-left"></i>
      </button>
      {buildPageList(current, total).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="sgc-page-gap">…</span>
        ) : (
          <button key={p} type="button" className={`sgc-page ${p === current ? 'is-active' : ''}`} onClick={() => go(p)}>
            {p}
          </button>
        )
      )}
      <button type="button" className="sgc-page" disabled={current >= total} onClick={() => go(current + 1)} aria-label="Next page">
        <i className="fa fa-angle-right"></i>
      </button>
    </div>
  );
}

// ── cell ────────────────────────────────────────────────────────
// Number that counts up from 0 to its value (presentation mode). Keeps the
// original formatting around it: "KES 17,800" -> pre "KES ", 17800, post "".
function CountUp({ text, delay = 0, duration = 1100 }) {
  const parsed = useMemo(() => {
    const m = String(text).match(/-?\d[\d,]*(\.\d+)?/);
    if (!m) return null;
    const num = parseFloat(m[0].replace(/,/g, ''));
    if (!Number.isFinite(num)) return null;
    return {
      pre: text.slice(0, m.index),
      post: text.slice(m.index + m[0].length),
      num,
      dec: m[1] ? m[1].length - 1 : 0,
      comma: m[0].includes(','),
    };
  }, [text]);
  const [val, setVal] = useState(parsed ? 0 : null);

  useEffect(() => {
    if (!parsed) return undefined;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVal(parsed.num);
      return undefined;
    }
    let raf;
    setVal(0);
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = p === 1 ? 1 : 1 - 2 ** (-10 * p); // easeOutExpo: fast start, long settle
        setVal(parsed.num * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.num, parsed?.dec, delay]);

  if (!parsed) return <>{text}</>;
  const shown = (val ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: parsed.dec,
    maximumFractionDigits: parsed.dec,
    useGrouping: parsed.comma,
  });
  return <>{parsed.pre}{shown}{parsed.post}</>;
}

// ── conditional badges (field.badges) ───────────────────────────
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const toNum = (v) => (isBlank(v) ? NaN : Number(String(v).replace(/,/g, '')));
const looseEq = (a, b) => {
  const na = toNum(a), nb = toNum(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return lc(a).trim() === lc(b).trim();
};
const cmp = (a, b) => {
  const na = toNum(a), nb = toNum(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return lc(a).localeCompare(lc(b)); // dates in ISO format also sort correctly
};

function ruleMatches(r, raw, row) {
  if (!r.op) return true; // catch-all
  const v = r.value;
  switch (r.op) {
    case '=': case '==': return looseEq(raw, v);
    case '!=': return !looseEq(raw, v);
    case '<': return !isBlank(raw) && cmp(raw, v) < 0;
    case '<=': return !isBlank(raw) && cmp(raw, v) <= 0;
    case '>': return !isBlank(raw) && cmp(raw, v) > 0;
    case '>=': return !isBlank(raw) && cmp(raw, v) >= 0;
    case 'between': return !isBlank(raw) && Array.isArray(v) && cmp(raw, v[0]) >= 0 && cmp(raw, v[1]) <= 0;
    case 'in': return Array.isArray(v) && v.some((x) => looseEq(raw, x));
    case 'notIn': return Array.isArray(v) && !v.some((x) => looseEq(raw, x));
    case 'contains': return lc(raw).includes(lc(v));
    case 'empty': return isBlank(raw);
    case 'notEmpty': return !isBlank(raw);
    case 'fn': return typeof r.fn === 'function' && !!r.fn(raw, row);
    default: return false;
  }
}

// returns { tone, cls, label, icon } or null (→ plain text)
function resolveBadge(f, item) {
  if (!f.badges) return null;
  try {
    const rules = Array.isArray(f.badges)
      ? f.badges
      : Object.entries(f.badges).map(([value, tone]) => ({ op: '=', value, tone })); // shorthand map
    for (const r of rules) {
      const raw = item[r.on || f.key];
      if (ruleMatches(r, raw, item)) return { tone: r.tone || 'gray', cls: r.class || '', label: r.label, icon: r.icon };
    }
  } catch { /* a bad rule must never break the grid */ }
  return null;
}

function Cell({ f, item, g, schema, customProfilePath, show = false, rowIdx = 0, colIdx = 0, baseMs = 200 }) {
  if (f.key === 'row_count') {
    return (
      <EntityRowOptions
        schema={schema}
        row={item}
        profilePath={customProfilePath}
        onChildDataOut={g.handleRowEvent}
        onRunAction={g.handleRunAction}
      />
    );
  }
  if (f.type === 'image' || f.type === 'file') {
    return <FileThumb field={f} value={item[f.key]} />;
  }

  const formatted = g.formatFieldValue(f, item);
  const mainStyle = resolveStyle(f.cellStyle, item[f.key], item);
  const subValue = f.subKey ? item[f.subKey] : null;

  // stack:'datetime' -> date as the value, time as the muted second line
  let main = <TrimmedCell value={formatted} trim={f.trim} />;
  let badge;

  if (f.type === 'status') main = <StatusPill value={formatted} tones={f.statusTones} />;
  else if (f.type === 'tag') main = <TagChip value={formatted} tones={f.tagTones} icons={f.tagIcons} />;
  else if (f.badges && (badge = resolveBadge(f, item)) && (!isBlank(formatted) || badge.label)) {
    const b = badge;
    main = (
      <span className={`sgc-pill sgc-pill-${b.tone} ${b.cls}`.trim()}>
        {b.icon && <i className={`fa fa-${b.icon}`} style={{ marginRight: 6 }}></i>}
        {b.label ?? formatted}
      </span>
    );
  }

  else if (show && f.countUp !== false && (f.countUp === true || f.type === 'money') && formatted !== null && formatted !== undefined && formatted !== '') {
    main = <span><CountUp text={String(formatted)} delay={baseMs + Math.min(rowIdx, 12) * 60 + colIdx * 35 + 250} /></span>;
  }

  let sub = subValue !== null && subValue !== undefined && subValue !== '' ? String(subValue) : null;
  if (f.stack === 'datetime') {
    const dt = splitDateTime(item[f.key]);
    if (dt) {
      main = <span>{dt.date}</span>;
      sub = dt.time;
    }
  }

  return (
    <div className="sgc-cell">
      <div className={`sgc-cell-main ${f.wrap ? 'sgc-wrap' : ''} ${f.cellClass || ''}`.trim()} style={mainStyle}>{main}</div>
      {sub && <div className="sgc-cell-sub" style={resolveStyle(f.subStyle, sub, item)} title={sub}>{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
export default function SmartGridClean({
  moduleActions,
  schema,
  fixedQuery = {},
  title,
  description,
  customProfilePath = './profile',
  dataOut = {},
  hiddenActions = [],
  maxHeaderActions = 3,
  maxToolbarActions = 3,
  toolbarMoreLabel = 'More Filters',
  tableTitle,
  className = 'p-3', // breathing space around the whole grid (Bootstrap spacing class); pass '' for none
  hoverFocus: hoverFocusProp, // undefined → follow the global setting
  copyOnDblClick: copyOnDblClickProp, // undefined → follow the global setting
  density: densityProp, // 'comfortable' | 'compact'; undefined → follow the global setting
  tableMaxHeight = '', // e.g. '70vh' → table scrolls inside that height with a sticky header; '' = page scrolls
  presentation: presentationProp, // true/false pins THIS grid; undefined → follow the global setting
  replay: replayProp, // true/false pins THIS grid's entrance animation; undefined → global
}) {
  // ── Same engine, untouched ──
  const g = useEntityGridController(schema, { fixedQuery, title, description, moduleActions, dataOut });

  const isHidden = (key) => hiddenActions.includes(key);

  // ── global grid settings (localStorage 'mosy.grid.prefs') ──
  // Precedence: explicit prop  >  global setting  >  built-in default.
  const prefs = useGridPrefs();
  const hoverFocus = hoverFocusProp ?? prefs.hoverFocus;
  const copyOnDblClick = copyOnDblClickProp ?? prefs.copyOnDblClick;
  const compact = (densityProp ?? prefs.density) === 'compact';

  // ── double-click a cell to copy it ──
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const copyCell = async (f, item) => {
    const text = String(g.formatFieldValue(f, item) ?? '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { return; }
    }
    try { window.getSelection()?.removeAllRanges(); } catch {}
    setToast(`Copied: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1600);
  };
  const copyable = (f) => copyOnDblClick && f.key !== 'row_count' && f.type !== 'image' && f.type !== 'file';

  // ── presentation mode + replay (both global) ──
  const show = presentationProp ?? prefs.presentation;
  const entrance = replayProp ?? prefs.replay; // false → hover effects stay, entrance + count-up are skipped
  // `replayTick` is stored, so remember the value we loaded with: only a CHANGE
  // after mount counts as a replay request (a stale stored tick must not replay on every visit).
  const [baseTick] = useState(() => getGridPrefs().replayTick);
  const replayKey = prefs.replayTick === baseTick ? 0 : prefs.replayTick;
  const baseMs = replayKey ? 550 : 200; // after a replay the card animates in first, so rows wait for it

  // Columns come straight from the hook; styling attributes live on each field.
  const columns = g.visibleFields;

  // Action zones
  const zoneOf = (a, fallback) => a.zone || fallback;
  const tagged = [
    ...g.gridProfileActions.map((a) => ({ ...a, _run: () => g.runProfileAction(a), _zone: zoneOf(a, a.type === 'action' ? 'toolbar' : 'header') })),
    ...g.toolbarActions.map((a) => ({ ...a, _run: () => g.runToolbarAction(a), _zone: zoneOf(a, 'toolbar') })),
  ].filter((a) => !isHidden(a.key));
  const headerActions = tagged.filter((a) => a._zone === 'header');
  const toolbarActions = tagged.filter((a) => a._zone !== 'header');

  const themeVars = useMemo(
    () => ({
      '--sgc-accent': mosyThemeConfigs.btnBg,
      '--sgc-accent-contrast': mosyThemeConfigs.btnTxt,
      '--sgc-accent-dark': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 85%, #000000)`,
      '--sgc-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 10%, transparent)`,
    }),
    []
  );

  if (g.accessDenied) {
    return <MosyUIGuard moduleName={schema?.label || schema?.entity} reason={`You don't have the "${schema.moduleRole}" role required to view this.`} />;
  }
  if (g.billingBlocked) {
    return (
      <div className="sgc-root" style={themeVars}>
        <BillingUpgradeBar isBlocked={g.billingBlocked} payUrl={g.billingPayUrl} onRecheck={g.billingRecheck} />
        <BillingInlineNotice status={g.billingStatus} onRefresh={g.billingRecheck} />
      </div>
    );
  }

  const totalRecords = g.totalCount ?? g.totalRecords ?? g.total ?? null;
  const pageIdx = Number(g.page) - PAGE_BASE;
  const from = g.rows.length ? pageIdx * Number(g.pageSize) + 1 : 0;
  const to = from ? from + g.rows.length - 1 : 0;
  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(Number(g.pageSize))
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, Number(g.pageSize)].sort((a, b) => a - b);
  const recordLabel = (schema?.recordLabel || 'records').toLowerCase();

  const exportItems = [
    !isHidden('export') && { key: 'excel', label: 'Export to Excel', icon: 'file-excel-o', onClick: () => g.handleExport('excel') },
    !isHidden('print') && { key: 'print', label: 'Print list', icon: 'print', onClick: g.handlePrint },
  ].filter(Boolean);

  const alignOf = (f) => (f.align === 'right' || (f.sum && !f.align) ? 'sgc-right' : f.align === 'center' ? 'sgc-center' : '');

  return (
    <div className={`sgc-root ${show ? 'sgc-show' : ''} ${show && !entrance ? 'sgc-no-entrance' : ''} ${hoverFocus ? 'sgc-hover-focus' : ''} ${compact ? 'sgc-compact' : ''} ${className}`.replace(/\s+/g, ' ').trim()} style={themeVars}>
      {toast && <div className="sgc-toast" role="status"><i className="fa fa-check-circle"></i>{toast}</div>}
      {/* key={replayKey}: bumping it remounts everything below, replaying every entrance animation + count-up */}
      <div key={replayKey} className="sgc-stage" style={{ '--base': `${baseMs}ms` }}>
      {/* ── Header ── */}
      <div className="sgc-header">
        <div className="sgc-heading">
          <h2 className="sgc-title">{g.title}</h2>
          {g.description && <p className="sgc-description">{g.description}</p>}
        </div>
        <div className="sgc-header-actions">
          <ActionGroup actions={headerActions} max={maxHeaderActions} solidFirst align="right" />
          <MenuButton label="Export" icon="download" items={exportItems} align="right" />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="sgc-toolbar">
        <div className="sgc-search">
          <i className="fa fa-search sgc-search-icon"></i>
          <input
            type="text"
            className="sgc-search-input"
            placeholder={schema?.searchPlaceholder || 'Search...'}
            value={g.searchInput}
            onChange={(e) => g.handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && g.submitSearch()}
          />
          {g.searchInput && (
            <button type="button" className="sgc-search-go" onClick={g.submitSearch} aria-label="Search">
              <i className="fa fa-arrow-right"></i>
            </button>
          )}
        </div>

        {!isHidden('refresh') && (
          <button type="button" className="sgc-btn" onClick={g.handleRefresh} title="Reset & refresh">
            <i className="fa fa-refresh sgc-btn-ic"></i><span>Reset</span>
          </button>
        )}

        <ActionGroup actions={toolbarActions} max={maxToolbarActions} moreLabel={toolbarMoreLabel} align="right" />

      </div>

      <ActiveFiltersBar
        schema={schema}
        advancedQuery={g.advancedQuery}
        clearFilterValue={g.clearFilterValue}
        setDateRange={g.setDateRange}
        onClearAll={g.handleRefresh}
      />

      {g.checkBoxesEnabled && g.selectedRows.length > 0 && (
        <button type="button" className="sgc-selection-bar" onClick={g.handleCheckedRowsAction}>
          <i className="fa fa-check-square"></i>
          <span>{g.selectedRows.length} selected</span>
          <span className="sgc-selection-cta">Bulk actions <i className="fa fa-angle-right"></i></span>
        </button>
      )}

      {/* ── Table card ── */}
      {columns.length > 0 && (
        <div className="sgc-card">
          {tableTitle && <h3 className="sgc-table-title">{tableTitle}</h3>}
          <div
            className={`sgc-table-wrap ${tableMaxHeight ? 'sgc-scroll' : ''}`.trim()}
            id={g.printCardId}
            style={tableMaxHeight ? { maxHeight: `calc(${tableMaxHeight} + var(--sgc-menu-room))` } : undefined}
          >
            <table className="sgc-table" id={g.tableId}>
              <thead>
                <tr>
                  {g.checkBoxesEnabled && (
                    <th className="sgc-check-col">
                      <input type="checkbox" className="sgc-check" checked={g.allOnPageSelected} onChange={g.toggleSelectAll} aria-label="Select all rows on this page" />
                    </th>
                  )}
                  {columns.map((f) => (
                    <th
                      key={f.key}
                      className={`${alignOf(f)} ${f.key === 'row_count' ? 'sgc-idx-col' : ''}`.trim() || undefined}
                      style={{ ...(f.width ? { minWidth: f.width } : null), ...resolveStyle(f.headerStyle) }}
                    >
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.loading ? (
                  show ? (
                    // shimmering skeleton rows instead of a spinner — reads much better on camera
                    <>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={`sk-${i}`} className="sgc-skel-row" aria-hidden="true">
                          {g.checkBoxesEnabled && <td className="sgc-check-col"></td>}
                          {columns.map((f, ci) => (
                            <td key={f.key}><span className="sgc-skel-bar" style={{ width: `${40 + ((i * 17 + ci * 23) % 50)}%` }}></span></td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ) : (
                    <tr><td colSpan={g.totalColCount} className="sgc-state"><span className="sgc-spinner" aria-hidden="true"></span> Loading...</td></tr>
                  )
                ) : g.error ? (
                  <tr><td colSpan={g.totalColCount} className="sgc-state sgc-state-error">{g.error}</td></tr>
                ) : g.rows.length === 0 ? (
                  <tr>
                    <td colSpan={g.totalColCount} className="sgc-state">
                      <i className="fa fa-inbox sgc-state-icon"></i>
                      <div>No results found.</div>
                    </td>
                  </tr>
                ) : (
                  g.rows.map((item, idx) => {
                    const id = g.getRowId(item);
                    const selected = g.checkBoxesEnabled && g.selectedIds.has(id);
                    return (
                      <Fragment key={id ?? `row-${idx}`}>
                        <tr
                          className={`sgc-row ${selected ? 'is-selected' : ''}`}
                          style={{ '--i': Math.min(idx, 12) }}
                          onMouseMove={show ? (e) => {
                            // cursor spotlight: the row's glow follows the mouse (CSS vars, no re-render)
                            const r = e.currentTarget.getBoundingClientRect();
                            e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
                            e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
                          } : undefined}
                        >
                          {g.checkBoxesEnabled && (
                            <td className="sgc-check-col">
                              <input type="checkbox" className="sgc-check" checked={selected} onChange={() => g.toggleRow(id)} aria-label={`Select row ${idx + 1}`} />
                            </td>
                          )}
                          {columns.map((f, ci) => (
                            <td
                              key={f.key}
                              style={{ '--c': ci }}
                              data-label={f.label}
                              className={`${alignOf(f)} ${f.key === 'row_count' ? 'sgc-idx-cell' : ''}`.trim() || undefined}
                              onDoubleClick={copyable(f) ? () => copyCell(f, item) : undefined}
                              title={copyable(f) ? 'Double-click to copy' : undefined}
                            >
                              <Cell f={f} item={item} g={g} schema={schema} customProfilePath={customProfilePath} show={show && entrance} rowIdx={idx} colIdx={ci} baseMs={baseMs} />
                            </td>
                          ))}
                        </tr>
                        {g.hasMultiGridRows && (
                          <tr className="sgc-subgrid-row">
                            <td colSpan={g.totalColCount}>
                              {schema.multiGridRows.map((mg) => (
                                <MiniGrid key={mg.key} config={mg} row={item} buildViewMoreHref={g.buildSubGridViewMoreHref} />
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              {columns.some((f) => f.sum) && (
                <tfoot>
                  <tr className="sgc-tfoot">
                    {g.checkBoxesEnabled && <td className="sgc-check-col"></td>}
                    {columns.map((f) => (
                      <td key={f.key} className={alignOf(f) || undefined}>
                        {f.sum ? <div className="sgc-cell-main" style={resolveStyle(f.cellStyle, g.columnTotals?.[f.key], {})}>{g.columnTotals?.[f.key]}</div> : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="sgc-footer">
            <div className="sgc-footer-info">
              {g.rows.length > 0 &&
                (totalRecords != null
                  ? `Showing ${from} to ${to} of ${Number(totalRecords).toLocaleString()} ${recordLabel}`
                  : `Showing ${from} to ${to} · Page ${pageIdx + 1} of ${g.pageCount || 1}`)}
            </div>
            <div className="sgc-footer-right">
              <label className="sgc-pagesize" title="Rows per page">
                <select value={g.pageSize} onChange={(e) => g.setPageSize(Number(e.target.value))} aria-label="Rows per page">
                  {pageSizeOptions.map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
              </label>
              <Pager page={g.page} pageCount={g.pageCount} onPageChange={g.setPage} />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
