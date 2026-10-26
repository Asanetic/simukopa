'use client';
import { useMemo, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useReportController } from './useReportController';
import { exportTableToExcel } from '../../../MosyUtils/exportToExcel';
import { mosyPrintToPdf } from '../../../MosyUtils/hiveUtils';
// UI-only page-level gate — same convention as useEntityGridController
import { mosyACTRLHasRole } from '../../../auth/authAccesControl';
// Platform subscription gate — same insertion point as the grid's accessDenied
import { useBillingGuard } from '../../../novabilling/client';
import { computeReport, forecastReport, addPeriods, periodsBetween, FORECAST_MAX, validateReport, periodOf, TONE_LABELS } from '../logicControl/reportLogic';

// ════════════════════════════════════════════════════════════════
// useReportGridController — the ONE place ALL report-grid BEHAVIOR lives
// (mirror of useEntityGridController). A template (ReportGrid.jsx, or any
// other layout) needs NOTHING but
//   const g = useReportGridController(schema, { fixedQuery, title, description });
// and then pure markup wiring `g.*` to props. If a template has to import
// reportLogic, the engine, or the role/billing helpers itself, that feature
// leaked out of this hook and belongs back in here.
//
//   g.columns        visible fields, each with resolved type + align
//   g.rows           [{ label, display:{key:'KES 9.8M'}, vars:{key:9800000}, remark:{tone,text,why}, tone }]
//   g.totals         same shape, or null
//   g.types          { fieldKey: int|money|percent|delta|number } — inferred column types
//   g.headline       { text, tone } | null
//   g.view           'general' | 'smart'  (g.setView to change; pinned when the template passes view)
//   g.hasSmart       true when the schema has anything smart (remarks, headline or smart:true columns) -> show the switch
//   g.remarkMode     'column' | 'row'     (global setting, g.setRemarkMode to change)
//   g.controls       { view, why, remarks, dates, groupBy, reset, export, print } booleans from schema.controls
//   g.runCellAction(rowIdx|'t', fieldKey)  runs field.filterTo from schema.actionRegistry with a ctx
//   g.sample         true while showing schema.sampleRows
// ════════════════════════════════════════════════════════════════

// ── GLOBAL REPORT SETTINGS — one localStorage key, callable from anywhere ──
//   import { setReportPrefs } from '.../useReportGridController';
//   setReportPrefs({ remarkMode: 'row', density: 'compact' })
const PREFS_KEY = 'mosy.report.prefs';
const PREFS_EVENT = 'mosy-report-prefs';
const PREF_DEFAULTS = Object.freeze({ remarkMode: 'column', density: 'comfortable', hints: true, views: Object.freeze({}) });

let prefsRaw = null;
let prefsSnap = PREF_DEFAULTS;
const readRaw = () => { try { return localStorage.getItem(PREFS_KEY); } catch { return null; } };

export function getReportPrefs() {
  if (typeof window === 'undefined') return PREF_DEFAULTS;
  const raw = readRaw();
  if (raw === prefsRaw) return prefsSnap;
  let r = {};
  try { r = JSON.parse(raw || '{}') || {}; } catch { r = {}; }
  prefsRaw = raw;
  prefsSnap = {
    remarkMode: r.remarkMode === 'row' ? 'row' : 'column',
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    hints: r.hints !== false, // hover explanation cards; the reader can switch them off from the card itself
    views: r.views && typeof r.views === 'object' ? r.views : {}, // { reportEntity: 'general' | 'smart' } — the reader's choice per report
  };
  return prefsSnap;
}

export function setReportPrefs(patch = {}) {
  if (typeof window === 'undefined') return;
  let cur = {};
  try { cur = JSON.parse(readRaw() || '{}') || {}; } catch { cur = {}; }
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...patch })); } catch { /* storage unavailable */ }
  prefsRaw = undefined; // force re-read
  window.dispatchEvent(new Event(PREFS_EVENT));
}

const subscribePrefs = (cb) => {
  const onStorage = (e) => { if (!e || e.key === null || e.key === PREFS_KEY) cb(); };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener('storage', onStorage); // other tabs
  return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener('storage', onStorage); };
};
export const useReportPrefs = () => useSyncExternalStore(subscribePrefs, getReportPrefs, () => PREF_DEFAULTS);

const NUMERIC = new Set(['int', 'number', 'money', 'percent', 'delta']);

export function useReportGridController(
  schema,
  { fixedQuery = {}, title, description, sample = false, view: viewProp } = {}
) {
  const c = useReportController(schema, { fixedQuery, sample });
  const prefs = useReportPrefs();

  // Page-level gate — no moduleRole on the schema means open to anyone.
  const accessDenied = schema.moduleRole ? !mosyACTRLHasRole(schema.moduleRole) : false;
  const billing = useBillingGuard();

  // Schema mistakes surface once in the console, written as "what to fix".
  const problems = useMemo(() => validateReport(schema), [schema]);
  useEffect(() => {
    if (problems.length && typeof console !== 'undefined') {
      problems.forEach((p) => console.warn(`[reportControl] ${p}`));
    }
  }, [problems]);

  // The maths — pure, so the server can run the exact same code for SMS/email summaries.
  const computed = useMemo(() => {
    try {
      return { ...computeReport(schema, c.rawRows), computeError: null };
    } catch (err) {
      console.error('[useReportGridController] computeReport failed:', err);
      return { rows: [], totals: null, headline: null, types: {}, computeError: err.message };
    }
  }, [schema, c.rawRows]);

  // ── GENERAL vs SMART — one schema, two faces ──
  //   general  numbers only: fields, totals, hover explanations. No remarks, no headline, no row tint.
  //   smart    general + the verdicts: headline banner, tinted rows, Details · Remark · Status, and any field marked smart:true.
  // Per field:  showInList:false (or hidden:true) -> never shown, still computed (formulas and remarks can use it)
  //             smart:true                        -> shown in the smart view only
  // Which face: the `view` option (template/page pins it) > the reader's saved choice for this report > schema.view > 'smart'.
  const hasSmart = (Array.isArray(schema.remarks) && schema.remarks.length > 0) || Boolean(schema.headline) || (schema.fields || []).some((f) => f.smart);
  const pinned = viewProp === 'general' || viewProp === 'smart' ? viewProp : null;
  const saved = prefs.views?.[schema.entity];
  const wanted = pinned || (saved === 'general' || saved === 'smart' ? saved : null) || (schema.view === 'general' ? 'general' : 'smart');
  const smartOn = hasSmart && wanted === 'smart';

  const shown = useMemo(
    () => (smartOn
      ? computed
      : { ...computed, headline: null, rows: computed.rows.map((r) => ({ ...r, remark: null, tone: 'neutral' })) }),
    [computed, smartOn]
  );

  // ── FORECAST — schema.forecast extends the grid with coming periods (client-side, on the loaded history) ──
  //   g.forecast.rows   rows shaped like g.rows, flagged forecast:true, with band:{key:{low,high,text}}
  //   g.forecast.notes  one sentence per forecast key ("Based on 10 months … next 7 months ≈ 84")
  //   g.showForecast    the reader's toggle (default on); g.toggleForecast()
  const [showForecast, setShowForecast] = useState(true);
  const [horizon, setHorizon] = useState(null); // how many periods ahead the reader asked for; null -> the schema's own `next`
  const forecastOut = useMemo(() => {
    if (!Array.isArray(schema.forecast) || !schema.forecast.length || c.loading || c.error || computed.computeError) return { rows: [], notes: [] };
    try { return forecastReport(schema, computed, { groupBy: c.groupBy, next: horizon }); } catch (err) { console.error('[reportControl] forecast failed:', err); return { rows: [], notes: [] }; }
  }, [schema, computed, c.groupBy, c.loading, c.error, horizon]);
  // g.forecastHorizon: { next, unit, last, upTo, inputType, max, setNext(n), setUpTo(group) } — null when there is nothing to project
  const forecastHorizon = useMemo(() => {
    if (!forecastOut.last || !forecastOut.unit) return null;
    const gb = forecastOut.groupBy;
    const n = forecastOut.next;
    return {
      next: n, unit: forecastOut.unit, last: forecastOut.last, max: FORECAST_MAX,
      upTo: addPeriods(gb, forecastOut.last, n),
      minUpTo: addPeriods(gb, forecastOut.last, 1),
      inputType: gb === 'month' ? 'month' : gb === 'day' ? 'date' : 'number',
      setNext: (v) => { const x = Math.round(Number(v)); if (Number.isFinite(x) && x >= 1) setHorizon(Math.min(FORECAST_MAX, x)); },
      setUpTo: (g) => { if (!g) return; const x = periodsBetween(gb, forecastOut.last, g); if (x >= 1) setHorizon(Math.min(FORECAST_MAX, x)); },
      reset: () => setHorizon(null),
      changed: horizon !== null,
    };
  }, [forecastOut, horizon]);
  const hasForecast = forecastOut.rows.length > 0 || forecastOut.notes.length > 0;

  // schema.showInList = ['key', …] picks AND orders the columns (per-field showInList:false still hides). Omit -> every field in schema order.
  const columns = useMemo(
    () => (Array.isArray(schema.showInList)
      ? schema.showInList.map((k) => (schema.fields || []).find((f) => f.key === k)).filter(Boolean)
      : (schema.fields || []))
      .filter((f) => !f.hidden && f.showInList !== false && (!f.smart || smartOn))
      .map((f) => {
        const type = computed.types[f.key] || f.type || 'number';
        return { ...f, type, align: f.align || (NUMERIC.has(type) ? 'right' : undefined) };
      }),
    [schema, computed.types, smartOn]
  );

  const hasRemarks = smartOn && Array.isArray(schema.remarks) && schema.remarks.length > 0;

  const resolvedTitle = title || schema.label || schema.entity;
  const resolvedDescription = description || schema.description;
  const tableId = `${schema.entity}_report_table`;
  const printCardId = `${schema.entity}_report_card`;

  const handleRefresh = () => c.refresh(fixedQuery, { clearAdvanced: true });
  const handleExport = () => exportTableToExcel(tableId, `${schema.entity}.xlsx`);
  const handlePrint = () => mosyPrintToPdf({ elemId: printCardId, defaultTitle: resolvedTitle });

  // Date range inputs: <input type="month"> when grouped by month, otherwise <input type="date">.
  const dateInputType = c.groupBy === 'month' ? 'month' : 'date';
  const rangeStart = c.advancedQuery.date_start || '';
  const rangeEnd = c.advancedQuery.date_end || '';
  const setRange = (start, end) => c.setDateRange('date', start, end);

  const toneLabel = (tone) => (schema.toneLabels || TONE_LABELS)[tone] || tone;

  // ── CONTROLS — which buttons exist, decided in the schema: controls:{ why:false, view:false, … } (default all on) ──
  const controls = useMemo(() => {
    const on = (k) => !(schema.controls && schema.controls[k] === false);
    return { view: on('view'), why: on('why'), remarks: on('remarks'), dates: on('dates'), groupBy: on('groupBy'), reset: on('reset'), export: on('export'), print: on('print') };
  }, [schema]);

  // ── CLICK A CELL -> open a module. field.filterTo = key in schema.actionRegistry (or a function). ──
  const router = useRouter();
  const runCellAction = (at, key) => {
    const f = (schema.fields || []).find((x) => x.key === key);
    if (!f || !f.filterTo) return false;
    const fn = typeof f.filterTo === 'function' ? f.filterTo : (schema.actionRegistry || {})[f.filterTo];
    if (typeof fn !== 'function') { console.warn(`[reportControl] filterTo "${f.filterTo}" is not in schema.actionRegistry`); return false; }
    const isTotals = at === 't';
    const row = isTotals ? shown.totals : shown.rows[Number(at)];
    if (!row) return false;
    const group = isTotals ? null : row.group;
    const gb = c.groupBy || schema.groupBy;
    const period = isTotals ? { start: rangeStart || null, end: rangeEnd || null } : periodOf(gb, group);
    const ctx = {
      report: schema,
      schema,
      cell: {
        key, label: f.label, value: row.vars[key], display: row.display[key],
        group, ids: row.ids || (group === null || group === undefined ? [] : [group]), groupLabel: row.label, groupBy: gb, isTotals,
        period, rangeStart: period ? period.start : null, rangeEnd: period ? period.end : null,
      },
      row: { ...row.vars, _group: group, label: row.label },
      rows: shown.rows.map((r) => ({ ...r.vars, _group: r.group, label: r.label })),
      query: { ...fixedQuery, ...c.advancedQuery },
      fixedQuery,
      refresh: handleRefresh,
      router,
      setFilterValue: c.setFilterValue,
      setDateRange: c.setDateRange,
    };
    try { fn(ctx); return true; } catch (err) { console.error('[reportControl] filterTo action failed:', err); return false; }
  };

  const [showWhy, setShowWhy] = useState(false); // "why this remark?" — shows the rule that fired

  return {
    ...c, // rawRows, loading, error, sample, groupBy, advancedQuery, setFilterValue, setDateRange, …

    accessDenied,
    billingBlocked: billing.isBlocked,
    billingStatus: billing.status,
    billingPayUrl: billing.payUrl,
    billingRecheck: billing.recheck,

    title: resolvedTitle,
    description: resolvedDescription,

    // computed report
    columns,
    rows: shown.rows,
    totals: shown.totals,
    types: shown.types,
    headline: shown.headline,
    computeError: computed.computeError,
    forecast: forecastOut,
    forecastHorizon,
    hasForecast,
    showForecast,
    toggleForecast: () => setShowForecast((v) => !v),
    problems,
    groupLabel: schema.groupLabel || 'Group',
    groupByOptions: schema.groupByOptions || null,
    toneLabel,

    // schema-driven controls + cell click-through
    controls,
    runCellAction,

    // general / smart
    hasSmart,
    view: smartOn ? 'smart' : 'general',
    viewPinned: Boolean(pinned),
    setView: (mode) => setReportPrefs({ views: { ...(getReportPrefs().views || {}), [schema.entity]: mode === 'general' ? 'general' : 'smart' } }),

    // remarks
    hasRemarks,
    remarkMode: prefs.remarkMode,
    setRemarkMode: (mode) => setReportPrefs({ remarkMode: mode }),
    showWhy,
    toggleWhy: () => setShowWhy((v) => !v),

    // date range
    dateInputType,
    rangeStart,
    rangeEnd,
    setRange,

    density: prefs.density,
    hints: prefs.hints,
    setHints: (on) => setReportPrefs({ hints: !!on }),
    handleRefresh,
    handleExport,
    handlePrint,
    tableId,
    printCardId,
  };
}
