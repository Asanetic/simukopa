'use client';
import { useMemo, useRef, useState, useEffect, useSyncExternalStore, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useReportGridController } from '../dataControl/useReportGridController';
import { explainCell, explainRemark, explainGroup, explainForecast, whyText } from '../logicControl/reportLogic';
import mosyThemeConfigs from '../../../appConfigs/mosyTheme';
import { MosyUIGuard } from '../../UiControl/MosyUiGuard';
import BillingUpgradeBar from '../../../MosyUtils/BillingUpgradeBar';
import { BillingInlineNotice } from '../../../novabilling/BillingNotice';
import './ReportGrid.css';

// ════════════════════════════════════════════════════════════════
// ReportGrid — the report TEMPLATE. Markup + CSS only (rg- namespace).
// Same relationship to useReportGridController as SmartGridClean has to
// useEntityGridController: every behavior comes from the hook, this file
// only draws it.
//
// Layout: header (title + description | Export menu)
//         -> headline banner (one sentence about the latest row, toned)
//         -> toolbar (date range · group-by · remark placement · why? · Reset)
//         -> filter chips (only when a range is set)
//         -> table card: one row per group, derived columns, remark, totals row
//
// REMARKS — placement is a global setting (setReportPrefs({ remarkMode })):
//   'column' -> last column, wide, wrapping text            (default)
//   'row'    -> its own full-width line directly under each data row
// Each remark carries a tone (bad | watch | good | neutral) shown as a tinted
// row + a badge WITH a shape glyph, so colour is never the only signal. The
// "Why?" toggle prints the rule that fired under each remark — the page
// teaches the reader how the verdict was reached.
//
// PRESENTATION MODE — same global switch as SmartGridClean (localStorage 'mosy.grid.prefs'):
//   presentation  on|off   cinematic entrance + count-up + hover effects   (default on)
//   replay        on|off   off keeps the hover effects, skips the entrance
//   hoverFocus    on|off   hovered value zooms, row-mates fade
//   replayTick             replayGrids() bumps it -> this report re-runs its entrance too
// Flip them with SmartGridClean's togglePresentation() / setGridPrefs() / replayGrids() —
// modules and reports follow ONE setting. This file only READS the key (it never imports the module grid).
// Choreography: title -> description -> buttons -> headline (words rise, shine sweeps, arrow draws)
//   -> toolbar -> card rises + accent sweep -> rows fly in cell by cell, tone bar grows, numbers COUNT UP
//   -> status pills pop (problem/watch pills pulse) -> remarks fade in -> totals row lands last.
// Changing the date range / remark placement re-runs the row cascade. Export & Print settle the
// numbers first so a file never captures a half-counted value.
//
// GENERAL vs SMART — the SAME schema serves both. General = numbers only (fields, totals, hover
// explanations). Smart = general + headline, tinted rows, Details · Remark · Status and any field with smart:true.
// Per field: showInList:false hides it (still computed); smart:true shows it in smart view only.
// A page pins one with <ReportGrid view="general" /> (e.g. Reports menu) or view="smart" (e.g. Insights menu);
// otherwise a View switch appears and the reader's choice is remembered per report.
//
// EXPLAIN-ON-HOVER — rest the cursor on any cell and a card says how that value came about:
//   measure   "Adds up amount in payments for Jul 2026" · only where status = paid · placed by payment_date
//   formula   Attended ÷ Tickets sold  ->  1,970 ÷ 3,400 × 100 = 57.9%   (the row's real numbers)
//   change    (KES 8.4M − KES 11.2M) ÷ KES 11.2M = −25.0%
//   totals    "worked out on the totals row, not an average of the rows above"
//   status / remark / details   the rule that fired, the numbers it looked at, why earlier rules didn't
// The text is built in logicControl/reportLogic.js (explainCell / explainRemark / explainGroup).
// A field can replace the generated lead sentence with its own words: { key:'show_rate', explain:'…' }.
// explain={false} turns it off for one report.
//
// Props (all optional except schema)
//   fixedQuery        extra params always sent to the API
//   title/description override schema.label / schema.description
//   hiddenActions     ['export','print','refresh'] to hide those buttons
//   sample            true -> force schema.sampleRows even if an API route exists
//   tableMaxHeight    e.g. '70vh' -> table scrolls inside that height (sticky header)
//   className         breathing space around the whole report ('p-3' default)
//   presentation / replay / hoverFocus   true|false pins THIS report; omit -> follow the global setting
//   explain           false -> no hover explanation card (default on)
//   view              'general' | 'smart' pins the face of the report and hides the switch
// ════════════════════════════════════════════════════════════════

const GLYPH = { bad: '✕', watch: '▲', good: '✓', neutral: '●' };

// ── global presentation prefs (read-only mirror of SmartGridClean's 'mosy.grid.prefs') ──
const PREFS_KEY = 'mosy.grid.prefs';
const PREFS_EVENT = 'mosy-grid-prefs';
const PREF_DEFAULTS = Object.freeze({ presentation: true, replay: true, hoverFocus: true, replayTick: 0 });
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
function readPrefs() {
  if (typeof window === 'undefined') return PREF_DEFAULTS;
  let raw = null;
  try { raw = localStorage.getItem(PREFS_KEY); } catch { raw = null; }
  if (raw === prefsRaw) return prefsSnap;
  let r = {};
  try { r = JSON.parse(raw || '{}') || {}; } catch { r = {}; }
  prefsRaw = raw;
  prefsSnap = {
    presentation: asBool(r.presentation, true),
    replay: asBool(r.replay, true),
    hoverFocus: asBool(r.hoverFocus, true),
    replayTick: Number.isFinite(Number(r.replayTick)) ? Number(r.replayTick) : 0,
  };
  return prefsSnap;
}
const subscribePrefs = (cb) => {
  const onStorage = (e) => { if (!e || e.key === null || e.key === PREFS_KEY) cb(); };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener('storage', onStorage); };
};
const usePresentationPrefs = () => useSyncExternalStore(subscribePrefs, readPrefs, () => PREF_DEFAULTS);

// Number that counts up from 0 to its value. Keeps the formatting around it:
// "KES 17.0M" -> pre "KES ", 17.0, post "M"; "−25.0%" -> pre "−", 25.0, post "%".
// instant -> shows the final text (used while exporting / printing).
function CountUp({ text, delay = 0, duration = 1100, instant = false }) {
  const parsed = useMemo(() => {
    const m = String(text).match(/\d[\d,]*(\.\d+)?/);
    if (!m) return null;
    const num = parseFloat(m[0].replace(/,/g, ''));
    if (!Number.isFinite(num)) return null;
    return { pre: text.slice(0, m.index), post: text.slice(m.index + m[0].length), num, dec: m[1] ? m[1].length - 1 : 0, comma: m[0].includes(',') };
  }, [text]);
  const [val, setVal] = useState(parsed ? 0 : null);
  // the start delay is read once per run; a later change of `delay` (e.g. the entrance finishing) must not restart the count
  const delayRef = useRef(delay);
  delayRef.current = delay;

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
    }, delayRef.current);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.num, parsed?.dec]);

  if (!parsed || instant) return <>{text}</>;
  const shown = (val ?? 0).toLocaleString('en-US', { minimumFractionDigits: parsed.dec, maximumFractionDigits: parsed.dec, useGrouping: parsed.comma });
  return <>{parsed.pre}{shown}{parsed.post}</>;
}

// Self-contained line icons (no icon-font dependency), drawn in currentColor.
const ICONS = {
  download: <><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8" /><path d="M12 17.2h.01" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-3.2" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.6 3.2" /><path d="M20 20v-4h-4" /></>,
  up: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  down: <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  sheet: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
};
function Icon({ name, size = 16, className = '' }) {
  return (
    <svg className={`rg-ic ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// Status pill: filled, with a round icon. Shape + word, so colour is never the only signal.
const PILL_MARK = { bad: '!', watch: '!', good: '✓', neutral: '' };
function StatusPill({ tone, label }) {
  return (
    <span className={`rg-pill rg-pill-${tone}`}>
      <span className="rg-pill-ic" aria-hidden="true">{PILL_MARK[tone]}</span>
      {label}
    </span>
  );
}

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

function MenuButton({ label, icon, items }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  if (!items.length) return null;
  return (
    <div className="rg-menu-wrap" ref={ref}>
      <button type="button" className="rg-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon && <Icon name={icon} className="rg-btn-ic" />}
        <span>{label}</span>
        <Icon name="chevron" size={14} className="rg-caret" />
      </button>
      {open && (
        <div className="rg-menu">
          {items.map((it) => (
            <button key={it.key} type="button" className="rg-menu-item" onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={15} />}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Seg({ value, options, onChange, label }) {
  return (
    <div className="rg-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'is-on' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The hover card. Rendered in a portal (fixed position) so the table's scroll area can never clip it.
const TIP_W = 340;
function ExplainCard({ tip, accent, onEnter, onLeave, onHideAll }) {
  if (!tip || typeof document === 'undefined') return null;
  const { rect, data } = tip;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - TIP_W / 2, window.innerWidth - TIP_W - 8));
  const below = window.innerHeight - rect.bottom > 260 || rect.top < 260;
  const style = { left, width: TIP_W, '--tip-accent': accent, ...(below ? { top: rect.bottom + 10 } : { bottom: window.innerHeight - rect.top + 10 }) };
  return createPortal(
    <div className={`rg-tip ${below ? 'rg-tip-below' : 'rg-tip-above'} ${data.tone ? `rg-tip-${data.tone}` : ''}`.trim()} role="tooltip" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="rg-tip-title">{data.title}</div>
      {data.lead && <p className="rg-tip-lead">{data.lead}</p>}
      {data.formula && <div className="rg-tip-formula">{data.formula}</div>}
      {data.working && (
        <div className="rg-tip-calc">
          {data.working.result ? (<><span className="rg-tip-expr">{data.working.text}</span><span className="rg-tip-eq">= <b>{data.working.result}</b></span></>) : <b>{data.working.text}</b>}
        </div>
      )}
      {data.rule && <div className="rg-tip-rule">{data.rule}</div>}
      {data.facts && data.facts.length > 0 && (
        <div className="rg-tip-facts">{data.facts.map((f) => <span key={f.name} className="rg-tip-fact">{f.name} <b>{f.value}</b></span>)}</div>
      )}
      {data.lines && data.lines.length > 0 && <ul className="rg-tip-lines">{data.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {data.link && <div className="rg-tip-link">{data.link} <span aria-hidden="true">{'→'}</span></div>}
      {onHideAll && <div className="rg-tip-foot"><button type="button" onClick={onHideAll}>Hide all hints</button></div>}
    </div>,
    document.body
  );
}

// One body cell. delta columns get an arrow + colour; null shows a muted "n/a".
// `anim` (presentation mode) -> numbers count up, staggered by row / column.
function Cell({ f, row, anim = null }) {
  const text = row.display[f.key];
  const raw = row.vars[f.key];
  if (raw === null || raw === undefined) return <span className="rg-na rg-val">{text}</span>;
  const counted = anim && f.countUp !== false && /\d/.test(String(text))
    ? <CountUp text={String(text)} instant={anim.instant} delay={anim.base + Math.min(anim.rowIdx, 12) * 60 + anim.colIdx * 35 + 250} />
    : text;
  if (f.type === 'delta') {
    const dir = raw > 0 ? 'up' : raw < 0 ? 'down' : 'flat';
    return (
      <span className={`rg-delta rg-delta-${dir} rg-val`}>
        <span className="rg-glyph rg-arrow" aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''}</span>
        <span>{counted}</span>
      </span>
    );
  }
  return <span className="rg-val">{counted}</span>;
}

// ════════════════════════════════════════════════════════════════
export default function ReportGrid({
  schema,
  fixedQuery = {},
  title,
  description,
  hiddenActions = [],
  sample = false,
  tableMaxHeight = '',
  className = 'p-3',
  presentation: presentationProp, // true/false pins THIS report; undefined -> global setting
  replay: replayProp,
  hoverFocus: hoverFocusProp,
  explain = true, // false -> no hover explanation card
  view, // 'general' | 'smart' pins the face (hides the switch); omit -> the reader's choice / schema.view
}) {
  const g = useReportGridController(schema, { fixedQuery, title, description, sample, view });
  const isHidden = (key) => hiddenActions.includes(key) || g.controls[key === 'refresh' ? 'reset' : key] === false;

  // ── presentation mode (global, shared with SmartGridClean) ──
  const prefs = usePresentationPrefs();
  const show = presentationProp ?? prefs.presentation;
  const entrance = replayProp ?? prefs.replay;
  const hoverFocus = hoverFocusProp ?? prefs.hoverFocus;
  const [baseTick] = useState(() => readPrefs().replayTick);
  const replayKey = prefs.replayTick === baseTick ? 0 : prefs.replayTick;
  // rows wait for the card on first paint / replay; later re-cascades (range, remark mode) start at once
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    setBooted(false);
    const t = setTimeout(() => setBooted(true), 2400);
    return () => clearTimeout(t);
  }, [replayKey]);
  const entranceMs = replayKey ? 550 : 200;
  const bodyBase = booted ? 0 : entranceMs;
  // Export / Print read the table text — let any running count-up land on its real numbers first.
  const [instant, setInstant] = useState(false);
  // ── explain-on-hover (delegated: one listener, cells carry data-x="c|r|g : rowIndex|t : fieldKey") ──
  const hintsOn = explain && g.hints;
  const [tip, setTip] = useState(null);
  const tipTimer = useRef(null);
  const hideTimer = useRef(null);
  const tipEl = useRef(null);
  const hideTip = () => { clearTimeout(tipTimer.current); clearTimeout(hideTimer.current); tipEl.current = null; setTip(null); };
  // leaving a cell hides the card after a beat, so the mouse can travel onto the card and use its links
  const softHide = () => { clearTimeout(tipTimer.current); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(hideTip, 180); };
  const keepTip = () => clearTimeout(hideTimer.current);
  useEffect(() => () => { clearTimeout(tipTimer.current); clearTimeout(hideTimer.current); }, []);
  useEffect(() => {
    if (!tip) return undefined;
    const off = (e) => { if (e.type === 'scroll' || e.key === 'Escape') hideTip(); };
    window.addEventListener('scroll', off, true);
    window.addEventListener('keydown', off);
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('keydown', off); };
  }, [tip]);
  useEffect(() => { hideTip(); }, [g.rows, g.remarkMode]);
  const onExplainOver = (e) => {
    if (!hintsOn) return;
    clearTimeout(hideTimer.current);
    const el = e.target.closest ? e.target.closest('[data-x]') : null;
    if (!el || el === tipEl.current) return;
    clearTimeout(tipTimer.current);
    tipEl.current = el;
    tipTimer.current = setTimeout(() => {
      const [kind, at, key] = String(el.getAttribute('data-x')).split(':');
      const idx = at === 't' ? 'totals' : Number(at);
      const out = { rows: g.rows, totals: g.totals, types: g.types || {} };
      let data = null;
      try {
        data = kind === 'f' ? explainForecast(schema, g.forecast, idx, key) : kind === 'c' ? explainCell(schema, out, idx, key) : kind === 'r' ? explainRemark(schema, out, idx) : explainGroup(schema, out, idx);
      } catch (err) { data = null; }
      if (data && kind === 'c') {
        const lf = schema.fields.find((x) => x.key === key);
        if (lf && lf.filterTo) data = { ...data, link: lf.filterLabel || 'Click to see the records behind this' };
      }
      setTip(data ? { rect: el.getBoundingClientRect(), data } : null);
    }, tip ? 120 : 380); // quick when moving between cells, patient when first arriving
  };
  // ── click a linked cell (field.filterTo) -> g.runCellAction ──
  const goAttr = (idx, f) => (f.filterTo ? { 'data-go': `${idx}:${f.key}`, role: 'button', tabIndex: 0, 'aria-label': `${f.label}: ${f.filterLabel || 'open records'}` } : {});
  const runGo = (el) => {
    const raw = el && el.getAttribute('data-go');
    if (!raw) return;
    const [at, key] = raw.split(':');
    hideTip();
    g.runCellAction(at, key);
  };
  const onGridClick = (e) => runGo(e.target.closest ? e.target.closest('[data-go]') : null);
  const onGridKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest ? e.target.closest('[data-go]') : null;
    if (!el) return;
    e.preventDefault();
    runGo(el);
  };
  const settle = (fn) => () => {
    setInstant(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { fn(); setTimeout(() => setInstant(false), 1200); }));
  };

  const themeVars = useMemo(
    () => ({
      '--rg-accent': mosyThemeConfigs.btnBg,
      '--rg-accent-contrast': mosyThemeConfigs.btnTxt,
      '--rg-btn-r': mosyThemeConfigs.systemBorderRadius,
      '--rg-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 10%, transparent)`,
    }),
    []
  );

  if (g.accessDenied) {
    return <MosyUIGuard moduleName={schema?.label || schema?.entity} reason={`You don't have the "${schema.moduleRole}" role required to view this.`} />;
  }
  if (g.billingBlocked) {
    return (
      <div className="rg-root" style={themeVars}>
        <BillingUpgradeBar isBlocked={g.billingBlocked} payUrl={g.billingPayUrl} onRecheck={g.billingRecheck} />
        <BillingInlineNotice status={g.billingStatus} onRefresh={g.billingRecheck} />
      </div>
    );
  }

  const columns = g.columns;
  // A rule may carry an optional short `title` ("Attendance dropped"); the Remark column shows it.
  // No titles in the schema -> that column is simply left out.
  const hasTitles = (schema?.remarks || []).some((x) => x.title);
  const titleFor = (r) => (r.rule ? schema?.remarks?.[r.rule - 1]?.title || '' : '');
  // 'Below row' placement is not approved yet: remarks always sit in the column. To bring it back, restore the toolbar switch and use g.remarkMode === 'row'.
  const rowMode = false;
  const colMode = g.hasRemarks && !rowMode;
  const colCount = columns.length + 1 + (colMode ? (hasTitles ? 3 : 2) : 0); // group + (Details, Remark?, Status)
  const alignCls = (f) => (f.align === 'right' ? 'rg-right' : f.align === 'center' ? 'rg-center' : '');
  const noun = String(g.groupLabel || 'row').toLowerCase();
  const plural = (n, w) => (n === 1 ? w : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

  const exportItems = [
    !isHidden('export') && { key: 'excel', label: 'Export to Excel', icon: 'sheet', onClick: settle(g.handleExport) },
    !isHidden('print') && { key: 'print', label: 'Print report', icon: 'print', onClick: settle(g.handlePrint) },
  ].filter(Boolean);

  const chips = [];
  if (g.rangeStart) chips.push({ key: 'from', text: `From: ${g.rangeStart}`, clear: () => g.setRange(null, g.rangeEnd) });
  if (g.rangeEnd) chips.push({ key: 'to', text: `To: ${g.rangeEnd}`, clear: () => g.setRange(g.rangeStart, null) });

  const whyLine = (r) => g.showWhy && <span className="rg-why">{whyText(schema, r)}</span>;
  // "Below row" layout: status pill, bold title, then the sentence — all on one line under the data row
  const remarkLine = (r) => (
    <div className="rg-remark">
      <StatusPill tone={r.tone} label={g.toneLabel(r.tone)} />
      {titleFor(r) && <strong className="rg-remark-title">{titleFor(r)}</strong>}
      <span className="rg-remark-text">{r.text}</span>
      {whyLine(r)}
    </div>
  );

  return (
    <div
      className={`rg-root ${show ? 'rg-show' : ''} ${show && !entrance ? 'rg-no-entrance' : ''} ${hoverFocus ? 'rg-hover-focus' : ''} ${g.density === 'compact' ? 'rg-compact' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={themeVars}
    >
      {/* key={replayKey}: bumping it remounts everything below, replaying every entrance + count-up */}
      <div key={replayKey} className="rg-stage" style={{ '--base': `${entranceMs}ms` }}>
      {/* ── Header ── */}
      <div className="rg-header">
        <div className="rg-heading">
          <h2 className="rg-title">
            <span className="rg-title-text">{g.title}</span>
            {g.sample && <span className="rg-sample" title="No live data yet — showing the schema's sampleRows">Sample data</span>}
          </h2>
          {g.description && <p className="rg-description">{g.description}</p>}
        </div>
        <div className="rg-header-actions">
          <MenuButton label="Export" icon="download" items={exportItems} />
        </div>
      </div>

      {/* ── Headline ── */}
      {g.headline && g.headline.text && (
        <div className={`rg-headline rg-headline-${g.headline.tone}`} role="status">
          {g.headline.tone === 'good' || g.headline.tone === 'bad'
            ? <Icon name={g.headline.tone === 'good' ? 'up' : 'down'} size={22} />
            : <span className="rg-glyph" aria-hidden="true">{GLYPH[g.headline.tone]}</span>}
          <span className="rg-headline-text">
            {show
              ? g.headline.text.split(' ').map((w, i) => (
                  <span key={i} className="rg-word" style={{ '--w': i }}>{w}{' '}</span>
                ))
              : g.headline.text}
          </span>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="rg-toolbar">
        {g.controls.dates && <label className="rg-field">
          <span>From</span>
          <input type={g.dateInputType} value={g.rangeStart} onChange={(e) => g.setRange(e.target.value, g.rangeEnd)} />
        </label>}
        {g.controls.dates && <label className="rg-field">
          <span>To</span>
          <input type={g.dateInputType} value={g.rangeEnd} onChange={(e) => g.setRange(g.rangeStart, e.target.value)} />
        </label>}

        {g.groupByOptions && g.controls.groupBy && (
          <label className="rg-field">
            <span>Group by</span>
            <select value={g.groupBy} onChange={(e) => g.setGroupBy(e.target.value)}>
              {g.groupByOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        )}

        {g.hasSmart && g.controls.view && !g.viewPinned && (
          <div className="rg-field">
            <span>View</span>
            <Seg
              label="Report view"
              value={g.view}
              onChange={g.setView}
              options={[{ value: 'general', label: 'General' }, { value: 'smart', label: 'Smart' }]}
            />
          </div>
        )}

        {!isHidden('refresh') && (
          <button type="button" className="rg-btn" onClick={g.handleRefresh} title="Reset & refresh">
            <Icon name="refresh" className="rg-btn-ic" /><span>Reset</span>
          </button>
        )}
        {g.hasForecast && g.forecast.rows.length > 0 && (
          <button type="button" className={`rg-btn rg-fc-toggle ${g.showForecast ? 'rg-btn-on' : ''}`} onClick={g.toggleForecast} aria-pressed={g.showForecast} title="Show or hide the projected periods">
            <Icon name="up" className="rg-btn-ic" /><span>{g.showForecast ? 'Hide forecast' : 'Show forecast'}</span>
          </button>
        )}
      </div>

      {/* ── Forecast bar: its own row, short labels, so nothing collides ── */}
      {g.forecastHorizon && g.showForecast && g.forecast.rows.length > 0 && (
        <div className="rg-toolbar rg-fc-bar">
          {(
            <>
              <label className="rg-field">
                <span>{g.forecastHorizon ? g.forecastHorizon.unit.charAt(0).toUpperCase() + g.forecastHorizon.unit.slice(1) : ''}s ahead</span>
                <input type="number" min="1" max={g.forecastHorizon.max} list="rg-fc-presets" value={g.forecastHorizon.next} onChange={(e) => g.forecastHorizon.setNext(e.target.value)} />
                <datalist id="rg-fc-presets">{[3, 6, 12, 18, 24, 36].map((n) => <option key={n} value={n} />)}</datalist>
              </label>
              <label className="rg-field">
                <span>Up to</span>
                <input type={g.forecastHorizon.inputType} min={g.forecastHorizon.minUpTo} value={g.forecastHorizon.upTo} onChange={(e) => g.forecastHorizon.setUpTo(e.target.value)} />
              </label>
            </>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="rg-chips">
          {chips.map((c) => (
            <span key={c.key} className="rg-chip">
              {c.text}
              <button type="button" onClick={c.clear} aria-label={`Clear ${c.text}`}>{'×'}</button>
            </span>
          ))}
          {chips.length > 1 && <button type="button" className="rg-chip rg-chip-clear" onClick={g.handleRefresh}>Clear all</button>}
        </div>
      )}

      {/* ── Table card ── */}
      <div className="rg-card">
        <div
          className={`rg-table-wrap ${tableMaxHeight ? 'rg-scroll' : ''}`.trim()}
          id={g.printCardId}
          style={tableMaxHeight ? { maxHeight: tableMaxHeight } : undefined}
          onMouseOver={hintsOn ? onExplainOver : undefined}
          onMouseLeave={hintsOn ? softHide : undefined}
          onClick={onGridClick}
          onKeyDown={onGridKey}
        >
          <table className={`rg-table ${rowMode ? 'rg-table-rowmode' : ''} ${!g.hasRemarks ? 'rg-table-bare' : ''}`.replace(/\s+/g, ' ').trim()} id={g.tableId}>
            <caption className="rg-sr">{g.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="rg-group-col">{g.groupLabel}</th>
                {columns.map((f) => (
                  <th key={f.key} scope="col" className={alignCls(f) || undefined}>{f.label}</th>
                ))}
                {colMode && <th scope="col" className="rg-details-col">Details</th>}
                {colMode && hasTitles && <th scope="col" className="rg-title-col">Remark</th>}
                {colMode && <th scope="col" className="rg-status-col">Status</th>}
              </tr>
            </thead>
            <tbody key={`${rowMode}|${g.loading}|${g.rows.map((r) => r.group).join(',')}`} style={{ '--base': `${bodyBase}ms` }}>
              {g.loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="rg-skel-row" aria-hidden="true">
                    {Array.from({ length: colCount }).map((__, ci) => (
                      <td key={ci}><span className="rg-skel-bar" style={{ width: `${40 + ((i * 17 + ci * 23) % 50)}%` }}></span></td>
                    ))}
                  </tr>
                ))
              ) : g.error || g.computeError ? (
                <tr><td colSpan={colCount} className="rg-state rg-state-error">{g.error || g.computeError}</td></tr>
              ) : g.rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="rg-state">
                    <div>No data for this period.</div>
                  </td>
                </tr>
              ) : (
                g.rows.map((row, idx) => (
                  <Fragment key={row.group ?? `row-${idx}`}>
                    <tr className={`rg-row rg-tone-${row.tone} ${rowMode ? 'rg-has-remark-row' : ''}`.trim()} style={{ '--i': Math.min(idx, 12) }}>
                      <th scope="row" className="rg-group-col" style={{ '--c': 0 }} data-x={`g:${idx}`}>{row.label}</th>
                      {columns.map((f, ci) => (
                        <td key={f.key} style={{ '--c': ci + 1 }} className={alignCls(f) || undefined} data-label={f.label} data-x={`c:${idx}:${f.key}`} {...goAttr(idx, f)}>
                          <Cell f={f} row={row} anim={show && entrance ? { base: bodyBase, rowIdx: idx, colIdx: ci + 1, instant } : null} />
                        </td>
                      ))}
                      {colMode && (
                        <td className="rg-details-col" style={{ '--c': columns.length + 1 }} data-x={row.remark ? `r:${idx}` : undefined}>
                          {row.remark && <div className="rg-details">{row.remark.text}{whyLine(row.remark)}</div>}
                        </td>
                      )}
                      {colMode && hasTitles && <td className="rg-title-col" style={{ '--c': columns.length + 2 }} data-x={row.remark ? `r:${idx}` : undefined}><strong className="rg-remark-title">{row.remark ? titleFor(row.remark) : ''}</strong></td>}
                      {colMode && <td className="rg-status-col" style={{ '--c': columns.length + 3 }} data-x={row.remark ? `r:${idx}` : undefined}>{row.remark && <StatusPill tone={row.remark.tone} label={g.toneLabel(row.remark.tone)} />}</td>}
                    </tr>
                    {rowMode && row.remark && (
                      <tr className={`rg-remark-row rg-tone-${row.tone} no-export`} style={{ '--i': Math.min(idx, 12) }}>
                        <td colSpan={colCount} data-x={`r:${idx}`}><div className="rg-remark-inner">{remarkLine(row.remark)}</div></td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
              {!g.loading && !g.error && !g.computeError && g.rows.length > 0 && g.showForecast && g.forecast.rows.length > 0 && (
                <>
                  <tr className="rg-row rg-open-row">
                    <th scope="row" className="rg-group-col">{'Opening total'}<span className="rg-open-sub">{'all '}{g.rows.length}{' '}{plural(g.rows.length, noun)}{' so far'}</span></th>
                    {columns.map((f) => {
                      const fc = g.forecast.rows[0];
                      const v = fc.cum && fc.cum[f.key] ? fc.cum[f.key].baseDisplay : (g.totals && g.totals.display[f.key] !== undefined ? g.totals.display[f.key] : null);
                      return <td key={f.key} className={alignCls(f) || undefined} data-label={f.label}>{v === null ? <span className="rg-dash">–</span> : <strong>{v}</strong>}</td>;
                    })}
                    {colMode && <td className="rg-details-col" colSpan={hasTitles ? 3 : 2}>What you have before the forecast starts.</td>}
                  </tr>
                  {g.forecast.rows.map((row, idx) => (
                <tr key={`fc-${row.group}`} className="rg-row rg-forecast-row" style={{ '--i': Math.min(g.rows.length + idx, 12) }}>
                  <th scope="row" className="rg-group-col" data-x={`f:${idx}:`}>{row.label} <span className="rg-fc-badge">Forecast</span></th>
                  {columns.map((f) => (
                    <td key={f.key} className={alignCls(f) || undefined} data-label={f.label} data-x={row.display[f.key] === undefined ? undefined : `f:${idx}:${f.key}`}>
                      {row.display[f.key] === undefined
                        ? <span className="rg-dash">–</span>
                        : <>
                          <span className="rg-fc-cap">{row.label}</span>
                          <span className="rg-fc-val">{'Lower '}{row.band[f.key].text.split(' – ')[0]}{' · Avg. '}{row.display[f.key]}{' · Upper '}{row.band[f.key].text.split(' – ')[1]}</span>
                          <span className="rg-fc-cap">{'Total up to '}{row.label}</span>
                          <span className="rg-fc-cum">{'Lower '}{row.cum[f.key].lowDisplay}{' · Avg. '}{row.cum[f.key].display}{' · Upper '}{row.cum[f.key].highDisplay}</span>
                        </>}
                    </td>
                  ))}
                  {colMode && <td className={`rg-details-col rg-fc-detail rg-fc-${row.fcTone || 'neutral'}`} colSpan={hasTitles ? 3 : 2} data-x={`f:${idx}:`}>
                    {row.fcBlocks ? (
                      <>
                        {row.fcBlocks.map((bl, bi) => (
                          <div key={bi} className="rg-fc-block">
                            {bl.title && <strong className="rg-fc-title">{bl.title}</strong>}
                            {bl.lines.map((ln, li) => <div key={li}>{ln}</div>)}
                          </div>
                        ))}
                        <div className="rg-fc-foot-line">{row.fcFoot}</div>
                      </>
                    ) : 'Projected from the history above'}
                  </td>}
                </tr>
              ))}
                </>
              )}
            </tbody>
            {!g.loading && !g.error && g.rows.length > 0 && (g.totals || (g.hasForecast && g.showForecast)) && (
              <tfoot>
                {g.totals && (<>
                <tr className="rg-tfoot" style={{ '--i': Math.min(g.rows.length, 12), '--base': `${bodyBase}ms` }}>
                  <th scope="row" className="rg-group-col" data-x="g:t">{g.totals.label}</th>
                  {columns.map((f, ci) => (
                    <td key={f.key} style={{ '--c': ci + 1 }} className={alignCls(f) || undefined} data-x={`c:t:${f.key}`} {...goAttr('t', f)}>
                      <Cell f={f} row={g.totals} anim={show && entrance ? { base: bodyBase, rowIdx: g.rows.length + 2, colIdx: ci + 1, instant } : null} />
                    </td>
                  ))}
                  {colMode && hasTitles && <td className="rg-details-col rg-dash">–</td>}
                  {colMode && hasTitles && <td className="rg-title-col rg-total-note">{g.rows.length} {plural(g.rows.length, noun)} combined</td>}
                  {colMode && !hasTitles && <td className="rg-details-col rg-total-note">{g.rows.length} {plural(g.rows.length, noun)} combined</td>}
                  {colMode && <td className="rg-status-col rg-dash">–</td>}
                </tr>
                {rowMode && (
                  <tr className="rg-remark-row rg-tfoot-note no-export">
                    <td colSpan={colCount}><div className="rg-remark-inner">{g.rows.length} {plural(g.rows.length, noun)} combined</div></td>
                  </tr>
                )}
                </>)}
                {g.hasForecast && g.showForecast && (g.forecast.blocks || []).map((bl, bi) => (
                  <tr key={`fcn-${bi}`} className="rg-tfoot-note rg-fc-foot">
                    <td colSpan={colCount} className="rg-fc-footcell">
                      {bl.title && <strong className="rg-fc-title">{bl.title}</strong>}
                      {bl.lines.map((ln, li) => <div key={li}>{ln}</div>)}
                    </td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </div>
      {explain && !g.hints && (
        <div className="rg-hints-bar no-export">
          <button type="button" className="rg-hints-btn" onClick={() => g.setHints(true)} title="Turn the hover explanations back on">
            <Icon name="help" className="rg-btn-ic" /><span>Show hints</span>
          </button>
        </div>
      )}
      <ExplainCard tip={hintsOn ? tip : null} accent={themeVars['--rg-accent']} onEnter={keepTip} onLeave={softHide} onHideAll={() => { hideTip(); g.setHints(false); }} />
    </div>
  );
}
