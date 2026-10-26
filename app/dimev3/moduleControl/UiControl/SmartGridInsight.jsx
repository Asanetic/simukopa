'use client';
import { useMemo, useRef, useState, useEffect, Fragment } from 'react';
import { useEntityGridController } from '../dataControl/useEntityGridController';
import EntityRowOptions from './Entityrowoptions';
import mosyThemeConfigs from '../../../appConfigs/mosyTheme';
import { MosyImageViewer } from '../../UiControl/componentControl';
import { MosyUIGuard } from '../../UiControl/MosyUiGuard';
import BillingUpgradeBar from '../../../MosyUtils/BillingUpgradeBar';
import { BillingInlineNotice } from '../../../novabilling/BillingNotice';
import { magicTrimText } from '../../../MosyUtils/hiveUtils';
import defaultLogoAsset from '../../../img/logo/logo.png';
import { ActiveFiltersBar } from './Activefiltersbar';
import FileThumb from './FileThumb';
import './SmartGridInsight.css';

const defaultLogo = defaultLogoAsset.src || defaultLogoAsset;

// ════════════════════════════════════════════════════════════════
// SmartGridInsight — 3rd TEMPLATE for the same grid engine.
// Same props + same `useEntityGridController` call as SmartGrid /
// SmartGridPro. Markup + CSS only (sgi- namespace).
// Drop-in swap: <SmartGridPro .../>  ->  <SmartGridInsight .../>
//
// Layout: header (title + primary actions + Export menu)
//         -> KPI cards (`stats`) -> breakdown panels (`breakdowns`)
//         -> ONE toolbar row: search · ActiveFiltersBar · Refresh · schema.actions
//         -> table card (title, page size, table, pager)
//
// UI-only extras (all optional, ignored by the other templates):
//   stats:      [{ label, value, sub, change, icon, tone }]   or (g) => [...]
//               change: '+12.5%' -> green/red chip before `sub`
//   breakdowns: [{ key, title, type: 'donut'|'bars', centerLabel, centerValue,
//                  items: [{ label, value, display, pct, color }] }]  or (g) => [...]
//   tableTitle: heading on the table card (defaults to schema.tableTitle || 'Records')
//   schema field extras:
//     type: 'status' -> tinted pill      (statusTones: { matched: 'green' })
//     type: 'tag'    -> dotted chip      (tagTones: { 'm-pesa': 'green' }, tagIcons: { 'm-pesa': 'mobile' })
//     accent: true   -> accent-coloured text (e.g. invoice numbers)
//     align: 'right' -> right-aligned column (sum:true fields already are)
// ════════════════════════════════════════════════════════════════

const DEFAULT_CELL_TRIM = 60;
const PAGE_BASE = 1; // set to 0 if the hook's `page` is zero-indexed
const MAX_VISIBLE_ACTIONS = 3;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000, 2000];
const PALETTE = ['#22b573', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#64748b'];

const STATUS_TONES = {
  matched: 'green', completed: 'green', complete: 'green', success: 'green', successful: 'green',
  paid: 'green', active: 'green', approved: 'green', verified: 'green', reconciled: 'green',
  pending: 'amber', processing: 'amber', partial: 'amber', draft: 'amber', unmatched: 'amber', waiting: 'amber',
  failed: 'red', cancelled: 'red', canceled: 'red', rejected: 'red', reversed: 'red', inactive: 'red',
  overdue: 'red', duplicate: 'red', 'amount mismatch': 'red', mismatch: 'red',
};
const TAG_TONES = {
  'm-pesa': 'green', mpesa: 'green', bank: 'blue', 'bank transfer': 'blue', card: 'purple',
  cash: 'amber', 'airtel money': 'red', airtel: 'red',
};

const resolve = (v, g) => (typeof v === 'function' ? v(g) : v);
const lc = (v) => String(v ?? '').toLowerCase();

function TrimmedCell({ value, trim }) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  return <span title={text}>{magicTrimText(text, trim ?? DEFAULT_CELL_TRIM)}</span>;
}

function StatusPill({ value, tones }) {
  if (value === null || value === undefined || value === '') return null;
  const tone = tones?.[lc(value)] || STATUS_TONES[lc(value)] || 'gray';
  return <span className={`sgi-pill sgi-pill-${tone}`}>{String(value)}</span>;
}

function TagChip({ value, tones, icons }) {
  if (value === null || value === undefined || value === '') return null;
  const tone = tones?.[lc(value)] || TAG_TONES[lc(value)] || 'gray';
  const icon = icons?.[lc(value)];
  return (
    <span className={`sgi-tag sgi-tag-${tone}`}>
      <span className="sgi-tag-dot">{icon && <i className={`fa fa-${icon}`}></i>}</span>
      {String(value)}
    </span>
  );
}

function variantClass(variant) {
  switch (variant) {
    case 'outline-success': case 'success': return 'sgi-btn-success';
    case 'outline-warning': case 'warning': return 'sgi-btn-warning';
    case 'outline-danger': case 'danger': return 'sgi-btn-danger';
    case 'dark': case 'primary': case 'outline-primary': return 'sgi-btn-primary';
    default: return '';
  }
}

function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setOpen]);
  return ref;
}

// Popover menu used for "More" overflow and the Export menu.
function MenuButton({ label, icon, items, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  if (!items.length) return null;
  return (
    <div className="sgi-menu-wrap" ref={ref}>
      <button type="button" className={`sgi-btn ${className}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon && <i className={`fa fa-${icon}`}></i>}
        <span>{label}</span>
        <i className="fa fa-angle-down sgi-caret"></i>
      </button>
      {open && (
        <div className={`sgi-menu sgi-menu-${align}`}>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`sgi-menu-item ${it.colorClass || ''}`.trim()}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.icon && <i className={`fa fa-${it.icon} ${it.iconClass || ''}`}></i>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionGroup({ actions, onRun, primaryFirst = false, align = 'left' }) {
  if (!actions?.length) return null;
  const visible = actions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflow = actions.slice(MAX_VISIBLE_ACTIONS);
  return (
    <>
      {visible.map((a, i) => {
        const cls = a.variant ? variantClass(a.variant) : primaryFirst && i === 0 ? 'sgi-btn-solid' : '';
        return (
          <button key={a.key} type="button" className={`sgi-btn ${cls} ${a.colorClass || ''}`.trim()} onClick={() => onRun(a)}>
            {a.icon && <i className={`fa fa-${a.icon}`}></i>}
            <span>{a.label}</span>
          </button>
        );
      })}
      <MenuButton
        label="More"
        icon="ellipsis-h"
        align={align}
        items={overflow.map((a) => ({ ...a, onClick: () => onRun(a) }))}
      />
    </>
  );
}

// ── KPI cards ───────────────────────────────────────────────────
function StatCards({ stats, g }) {
  const list = resolve(stats, g);
  if (!Array.isArray(list) || !list.length) return null;
  return (
    <div className="sgi-stats">
      {list.map((s, i) => {
        const change = s.change != null ? String(s.change) : null;
        const up = change ? !change.trim().startsWith('-') : true;
        return (
          <div className="sgi-card sgi-stat" key={s.key || s.label || i}>
            <div className={`sgi-stat-icon sgi-solid-${s.tone || 'blue'}`}>
              <i className={`fa fa-${s.icon || 'bar-chart'}`}></i>
            </div>
            <div className="sgi-stat-body">
              <div className="sgi-stat-label">{s.label}</div>
              <div className="sgi-stat-value">{s.value}</div>
              {(change || s.sub != null) && (
                <div className="sgi-stat-sub">
                  {change && (
                    <span className={`sgi-chip ${up ? 'is-up' : 'is-down'}`}>
                      <i className={`fa fa-arrow-${up ? 'up' : 'down'}`}></i> {change.replace(/^[-+]/, '')}
                    </span>
                  )}
                  {s.sub != null && <span>{s.sub}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Breakdown panels ────────────────────────────────────────────
function normalize(items = []) {
  const total = items.reduce((s, it) => s + (Number(it.value) || 0), 0) || 1;
  return items.map((it, i) => ({
    ...it,
    color: it.color || PALETTE[i % PALETTE.length],
    pct: it.pct ?? ((Number(it.value) || 0) / total) * 100,
  }));
}
const pctLabel = (p) => `${Number(p).toFixed(1)}%`;

function Donut({ items, centerLabel, centerValue }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="sgi-donut">
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={r} className="sgi-donut-track" />
        {items.map((it) => {
          const len = (it.pct / 100) * c;
          const seg = (
            <circle
              key={it.label}
              cx="55" cy="55" r={r}
              fill="none" stroke={it.color} strokeWidth="16"
              strokeDasharray={`${Math.max(len - 1.2, 0)} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="sgi-donut-center">
          {centerLabel && <span>{centerLabel}</span>}
          {centerValue && <strong>{centerValue}</strong>}
        </div>
      )}
    </div>
  );
}

function Breakdown({ b }) {
  const items = normalize(b.items);
  const max = Math.max(...items.map((i) => i.pct), 1);
  return (
    <div className="sgi-card sgi-breakdown">
      <h3 className="sgi-panel-title">{b.title}</h3>
      {items.length === 0 ? (
        <div className="sgi-empty-mini">No data for this period.</div>
      ) : b.type === 'donut' ? (
        <div className="sgi-donut-wrap">
          <Donut items={items} centerLabel={b.centerLabel} centerValue={b.centerValue} />
          <ul className="sgi-legend">
            {items.map((it) => (
              <li key={it.label}>
                <span className="sgi-legend-dot" style={{ background: it.color }} />
                <span className="sgi-legend-label">{it.label}</span>
                <span className="sgi-legend-value">{it.display ?? it.value}</span>
                <span className="sgi-legend-pct">{pctLabel(it.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="sgi-bars">
          {items.map((it) => (
            <li key={it.label}>
              <span className="sgi-bar-label">{it.label}</span>
              <span className="sgi-bar-track">
                <span className="sgi-bar-fill" style={{ width: `${(it.pct / max) * 100}%`, background: b.color || undefined }} />
              </span>
              <span className="sgi-legend-value">{it.display ?? it.value}</span>
              <span className="sgi-legend-pct">{pctLabel(it.pct)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Sub-grids (unchanged behaviour) ─────────────────────────────
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
    <div className="sgi-subgrid">
      <div className="sgi-subgrid-head">
        <span className="sgi-subgrid-title">{config.title}</span>
        {viewMoreHref && (
          <a href={viewMoreHref} className="sgi-subgrid-more multigrid_view_more skip_print no-export">
            View more <i className="fa fa-angle-right"></i>
          </a>
        )}
      </div>
      {items.length === 0 ? (
        <div className="sgi-empty-mini">No {(config.title || 'records').toLowerCase()} found.</div>
      ) : (
        <table className="sgi-subgrid-table">
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

// ── Pager: « ‹ 1 2 3 … 128 › » ─────────────────────────────────
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
    <div className="sgi-pager">
      <button type="button" className="sgi-page" disabled={current <= 1} onClick={() => go(1)} aria-label="First page">
        <i className="fa fa-angle-double-left"></i>
      </button>
      <button type="button" className="sgi-page" disabled={current <= 1} onClick={() => go(current - 1)} aria-label="Previous page">
        <i className="fa fa-angle-left"></i>
      </button>
      {buildPageList(current, total).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="sgi-page-gap">…</span>
        ) : (
          <button key={p} type="button" className={`sgi-page ${p === current ? 'is-active' : ''}`} onClick={() => go(p)}>
            {p}
          </button>
        )
      )}
      <button type="button" className="sgi-page" disabled={current >= total} onClick={() => go(current + 1)} aria-label="Next page">
        <i className="fa fa-angle-right"></i>
      </button>
      <button type="button" className="sgi-page" disabled={current >= total} onClick={() => go(total)} aria-label="Last page">
        <i className="fa fa-angle-double-right"></i>
      </button>
    </div>
  );
}

// ── Cell renderer ───────────────────────────────────────────────
function Cell({ f, item, g, schema, customProfilePath }) {
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
  const value = g.formatFieldValue(f, item);
  if (f.type === 'status') return <StatusPill value={value} tones={f.statusTones} />;
  if (f.type === 'tag') return <TagChip value={value} tones={f.tagTones} icons={f.tagIcons} />;
  return <TrimmedCell value={value} trim={f.trim} />;
}

// ════════════════════════════════════════════════════════════════
export default function SmartGridInsight({
  moduleActions,
  schema,
  fixedQuery = {},
  title,
  description,
  customProfilePath = './profile',
  dataOut = {},
  hiddenActions = [],
  stats = [],
  breakdowns = [],
  tableTitle,
}) {
  // ── Same engine, untouched ──
  const g = useEntityGridController(schema, { fixedQuery, title, description, moduleActions, dataOut });

  const isActionHidden = (key) => hiddenActions.includes(key);
  const visibleToolbarActions = g.toolbarActions.filter((a) => !isActionHidden(a.key));
  const visibleGridProfileActions = g.gridProfileActions.filter((a) => !isActionHidden(a.key));

  const themeVars = useMemo(
    () => ({
      '--sgi-accent': mosyThemeConfigs.btnBg,
      '--sgi-accent-contrast': mosyThemeConfigs.btnTxt,
      '--sgi-accent-dark': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 85%, #000000)`,
      '--sgi-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 10%, transparent)`,
    }),
    []
  );

  if (g.accessDenied) {
    return <MosyUIGuard moduleName={schema?.label || schema?.entity} reason={`You don't have the "${schema.moduleRole}" role required to view this.`} />;
  }

  if (g.billingBlocked) {
    return (
      <div className="sgi-card col-md-12 p-0 m-0">
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

  const exportItems = [
    !isActionHidden('export') && { key: 'excel', label: 'Export to Excel', icon: 'file-excel-o', iconClass: 'sgi-ic-excel', onClick: () => g.handleExport('excel') },
    !isActionHidden('print') && { key: 'print', label: 'Print list', icon: 'print', onClick: g.handlePrint },
  ].filter(Boolean);

  const breakdownList = resolve(breakdowns, g);
  const recordLabel = (schema?.recordLabel || 'entries').toLowerCase();
  const isRight = (f) => f.sum || f.align === 'right';

  return (
    <div className="sgi-root" style={themeVars}>
      {/* ── Header ── */}
      <div className="sgi-header">
        <div className="sgi-heading">
          <h2 className="sgi-title">{g.title}</h2>
          {g.description && <p className="sgi-description">{g.description}</p>}
        </div>
        <div className="sgi-header-actions">
          <ActionGroup actions={visibleGridProfileActions} onRun={g.runProfileAction} primaryFirst align="right" />
          <MenuButton label="Export" icon="download" items={exportItems} align="right" />
        </div>
      </div>

      <StatCards stats={stats} g={g} />

      {Array.isArray(breakdownList) && breakdownList.length > 0 && (
        <div className={`sgi-breakdowns count-${Math.min(breakdownList.length, 3)}`}>
          {breakdownList.map((b, i) => <Breakdown key={b.key || b.title || i} b={b} />)}
        </div>
      )}

      {/* ── Table card ── */}
      <div className="sgi-card sgi-table-card">
        {/* one toolbar row: search · filters · refresh · schema.actions · page size */}
        <div className="sgi-toolbar">
          <h3 className="sgi-panel-title sgi-table-title">
            {tableTitle || schema?.tableTitle || 'Records'}
            {totalRecords != null && <span className="sgi-count">{Number(totalRecords).toLocaleString()}</span>}
          </h3>

          <div className="sgi-toolbar-controls">
            <div className="sgi-search">
              <i className="fa fa-search sgi-search-icon"></i>
              <input
                type="text"
                className="sgi-search-input"
                placeholder={schema?.searchPlaceholder || 'Search...'}
                value={g.searchInput}
                onChange={(e) => g.handleSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && g.submitSearch()}
              />
              {g.searchInput && (
                <button type="button" className="sgi-search-go" onClick={g.submitSearch} aria-label="Search">
                  <i className="fa fa-arrow-right"></i>
                </button>
              )}
            </div>

            {!isActionHidden('refresh') && (
              <button type="button" className="sgi-btn sgi-btn-icon" onClick={g.handleRefresh} title="Reset & refresh" aria-label="Refresh">
                <i className="fa fa-refresh"></i>
              </button>
            )}

            <ActionGroup actions={visibleToolbarActions} onRun={g.runToolbarAction} align="right" />

            <label className="sgi-pagesize" title="Rows per page">
              <select value={g.pageSize} onChange={(e) => g.setPageSize(Number(e.target.value))} aria-label="Rows per page">
                {pageSizeOptions.map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </label>
          </div>

          <div className="sgi-active-filters">
            <ActiveFiltersBar
              schema={schema}
              advancedQuery={g.advancedQuery}
              clearFilterValue={g.clearFilterValue}
              setDateRange={g.setDateRange}
              onClearAll={g.handleRefresh}
            />
          </div>
        </div>

        {g.checkBoxesEnabled && g.selectedRows.length > 0 && (
          <button type="button" className="sgi-selection-bar" onClick={g.handleCheckedRowsAction}>
            <i className="fa fa-check-square"></i>
            <span>{g.selectedRows.length} selected</span>
            <span className="sgi-selection-cta">Bulk actions <i className="fa fa-angle-right"></i></span>
          </button>
        )}

        {g.visibleFields.length > 0 && (
          <>
            <div className="sgi-table-wrap" id={g.printCardId}>
              <table className="sgi-table" id={g.tableId}>
                <thead>
                  <tr>
                    {g.checkBoxesEnabled && (
                      <th className="sgi-check-col">
                        <input type="checkbox" className="sgi-check" checked={g.allOnPageSelected} onChange={g.toggleSelectAll} aria-label="Select all rows on this page" />
                      </th>
                    )}
                    {g.visibleFields.map((f) => (
                      <th key={f.key} className={isRight(f) ? 'sgi-num' : ''}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.loading ? (
                    <tr>
                      <td colSpan={g.totalColCount} className="sgi-state">
                        <span className="sgi-spinner" aria-hidden="true"></span> Loading...
                      </td>
                    </tr>
                  ) : g.error ? (
                    <tr>
                      <td colSpan={g.totalColCount} className="sgi-state sgi-state-error">{g.error}</td>
                    </tr>
                  ) : g.rows.length === 0 ? (
                    <tr>
                      <td colSpan={g.totalColCount} className="sgi-state">
                        <i className="fa fa-inbox sgi-state-icon"></i>
                        <div>No results found.</div>
                      </td>
                    </tr>
                  ) : (
                    g.rows.map((item, idx) => {
                      const id = g.getRowId(item);
                      const selected = g.checkBoxesEnabled && g.selectedIds.has(id);
                      return (
                        <Fragment key={id ?? `row-${idx}`}>
                          <tr className={`sgi-row ${selected ? 'is-selected' : ''}`}>
                            {g.checkBoxesEnabled && (
                              <td className="sgi-check-col">
                                <input type="checkbox" className="sgi-check" checked={selected} onChange={() => g.toggleRow(id)} aria-label={`Select row ${idx + 1}`} />
                              </td>
                            )}
                            {g.visibleFields.map((f) => (
                              <td
                                key={f.key}
                                data-label={f.label}
                                className={`${isRight(f) ? 'sgi-num' : ''} ${f.accent ? 'sgi-accent-text' : ''}`.trim() || undefined}
                              >
                                <Cell f={f} item={item} g={g} schema={schema} customProfilePath={customProfilePath} />
                              </td>
                            ))}
                          </tr>
                          {g.hasMultiGridRows && (
                            <tr className="sgi-subgrid-row">
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
                {g.visibleFields.some((f) => f.sum) && (
                  <tfoot>
                    <tr className="sgi-tfoot">
                      {g.checkBoxesEnabled && <td className="sgi-check-col"></td>}
                      {g.visibleFields.map((f) => (
                        <td key={f.key} className={isRight(f) ? 'sgi-num' : ''}>{f.sum ? g.columnTotals?.[f.key] : ''}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="sgi-footer">
              <div className="sgi-footer-info">
                {g.rows.length > 0 &&
                  (totalRecords != null
                    ? `Showing ${from} to ${to} of ${Number(totalRecords).toLocaleString()} ${recordLabel}`
                    : `Showing ${from} to ${to} · Page ${pageIdx + 1} of ${g.pageCount || 1}`)}
              </div>
              <Pager page={g.page} pageCount={g.pageCount} onPageChange={g.setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
