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

const defaultLogo = defaultLogoAsset.src || defaultLogoAsset;

// ════════════════════════════════════════════════════════════════
// SmartGridPro — alternate TEMPLATE for the same grid engine.
// Same props, same `useEntityGridController` call as SmartGrid.jsx.
// Only the markup + CSS (sgp- namespace, SmartGridPro.css) differ.
// Drop-in swap: replace <SmartGrid .../> with <SmartGridPro .../>.
//
// Optional, UI-only additions (ignored by the old template):
//   - prop `stats`: [{ label, value, sub, icon, tone }] -> summary cards
//       tone: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'teal'
//   - schema field `type: 'status'` -> value rendered as a colored pill
//       (override colors per field with `statusTones: { paid: 'green' }`)
//   - schema field `trim` -> same per-field trim as SmartGrid
// ════════════════════════════════════════════════════════════════

const DEFAULT_CELL_TRIM = 60;

// Set to 0 if useEntityGridController's `page` is zero-indexed.
const PAGE_BASE = 1;

const MAX_VISIBLE_GRID_ACTIONS = 4;

function TrimmedCell({ value, trim }) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  return <span title={text}>{magicTrimText(text, trim ?? DEFAULT_CELL_TRIM)}</span>;
}

const DEFAULT_STATUS_TONES = {
  completed: 'green', complete: 'green', success: 'green', successful: 'green',
  paid: 'green', active: 'green', approved: 'green', verified: 'green',
  pending: 'amber', processing: 'amber', partial: 'amber', draft: 'amber', 'on hold': 'amber',
  failed: 'red', cancelled: 'red', canceled: 'red', rejected: 'red', reversed: 'red',
  inactive: 'red', overdue: 'red',
};

function StatusPill({ value, tones }) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  const tone = tones?.[text.toLowerCase()] || DEFAULT_STATUS_TONES[text.toLowerCase()] || 'gray';
  return <span className={`sgp-pill sgp-pill-${tone}`}>{text}</span>;
}

function variantClass(variant) {
  switch (variant) {
    case 'outline-success':
    case 'success':
      return 'sgp-btn-success';
    case 'outline-warning':
    case 'warning':
      return 'sgp-btn-warning';
    case 'outline-danger':
    case 'danger':
      return 'sgp-btn-danger';
    case 'dark':
    case 'primary':
    case 'outline-primary':
      return 'sgp-btn-primary';
    default:
      return '';
  }
}

function ActionGroup({ actions, onRun, primaryFirst = false }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  if (!actions || actions.length === 0) return null;

  const visible = actions.slice(0, MAX_VISIBLE_GRID_ACTIONS);
  const overflow = actions.slice(MAX_VISIBLE_GRID_ACTIONS);

  return (
    <>
      {visible.map((action, i) => {
        // First profile action (usually "New") gets the solid primary look
        // unless the schema gave it its own variant.
        const cls = action.variant
          ? variantClass(action.variant)
          : primaryFirst && i === 0
          ? 'sgp-btn-solid'
          : '';
        return (
          <button
            key={action.key}
            type="button"
            className={`sgp-btn ${cls} ${action.colorClass || ''}`.trim()}
            onClick={() => onRun(action)}
          >
            {action.icon && <i className={`fa fa-${action.icon}`}></i>}
            <span>{action.label}</span>
          </button>
        );
      })}

      {overflow.length > 0 && (
        <div className="sgp-more-wrap" ref={moreRef}>
          <button type="button" className="sgp-btn" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
            <i className="fa fa-ellipsis-h"></i>
            <span>More</span>
          </button>
          {moreOpen && (
            <div className="sgp-more-panel">
              {overflow.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className={`sgp-more-item ${action.colorClass || ''}`.trim()}
                  onClick={() => {
                    setMoreOpen(false);
                    onRun(action);
                  }}
                >
                  {action.icon && <i className={`fa fa-${action.icon}`}></i>}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function StatCards({ stats, g }) {
  const list = typeof stats === 'function' ? stats(g) : stats;
  if (!Array.isArray(list) || list.length === 0) return null;
  stats = list;
  return (
    <div className="sgp-stats">
      {stats.map((s, i) => (
        <div className="sgp-stat" key={s.key || s.label || i}>
          <div className={`sgp-stat-icon sgp-tone-${s.tone || 'blue'}`}>
            <i className={`fa fa-${s.icon || 'bar-chart'}`}></i>
          </div>
          <div className="sgp-stat-body">
            <div className="sgp-stat-label">{s.label}</div>
            <div className="sgp-stat-value">{s.value}</div>
            {s.sub !== undefined && s.sub !== null && <div className="sgp-stat-sub">{s.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    <div className="sgp-subgrid">
      <div className="sgp-subgrid-head">
        <span className="sgp-subgrid-title">{config.title}</span>
        {viewMoreHref && (
          <a href={viewMoreHref} className="sgp-subgrid-more multigrid_view_more skip_print no-export">
            View more <i className="fa fa-angle-right"></i>
          </a>
        )}
      </div>
      {items.length === 0 ? (
        <div className="sgp-subgrid-empty">No {(config.title || 'records').toLowerCase()} found.</div>
      ) : (
        <table className="sgp-subgrid-table">
          <thead>
            <tr>
              <th>#</th>
              {config.columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={r.record_id ?? r.primkey ?? r.id ?? i}>
                <td>{r.row_count ?? i + 1}</td>
                {config.columns.map((c) => (
                  <td key={c.key}>{c.format ? c.format(r[c.key], r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotals && (
            <tfoot>
              <tr>
                <td></td>
                {config.columns.map((c) => (
                  <td key={c.key}>{c.sum ? totals[c.key] : ''}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}

// Numbered pager: « 1 2 3 4 5 … 128 »
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
  const current = Number(page) - PAGE_BASE + 1; // 1-based for display
  const total = Math.max(1, Number(pageCount) || 1);
  const go = (p) => {
    if (p < 1 || p > total || p === current) return;
    onPageChange(p - 1 + PAGE_BASE);
  };
  return (
    <div className="sgp-pager">
      <button type="button" className="sgp-page" disabled={current <= 1} onClick={() => go(current - 1)} aria-label="Previous page">
        <i className="fa fa-angle-left"></i>
      </button>
      {buildPageList(current, total).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="sgp-page-gap">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={`sgp-page ${p === current ? 'is-active' : ''}`}
            onClick={() => go(p)}
          >
            {p}
          </button>
        )
      )}
      <button type="button" className="sgp-page" disabled={current >= total} onClick={() => go(current + 1)} aria-label="Next page">
        <i className="fa fa-angle-right"></i>
      </button>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function SmartGridPro({
  moduleActions,
  schema,
  fixedQuery = {},
  title,
  description,
  customProfilePath = './profile',
  dataOut = {},
  hiddenActions = [],
  stats = [],
}) {
  // ── Same engine, untouched ──
  const g = useEntityGridController(schema, { fixedQuery, title, description, moduleActions, dataOut });

  const isActionHidden = (key) => hiddenActions.includes(key);
  const visibleToolbarActions = g.toolbarActions.filter((a) => !isActionHidden(a.key));
  const visibleGridProfileActions = g.gridProfileActions.filter((a) => !isActionHidden(a.key));

  const themeVars = useMemo(
    () => ({
      '--sgp-accent': mosyThemeConfigs.btnBg,
      '--sgp-accent-contrast': mosyThemeConfigs.btnTxt,
      '--sgp-accent-dark': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 85%, #000000)`,
      '--sgp-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 12%, transparent)`,
      '--sgp-radius': mosyThemeConfigs.systemBorderRadius,
    }),
    []
  );

  if (g.accessDenied) {
    return <MosyUIGuard moduleName={schema?.label || schema?.entity} reason={`You don't have the "${schema.moduleRole}" role required to view this.`} />;
  }

  // A grid rendered standalone (e.g. inside a MosyCard modal) never passes
  // through the page-level MosyUiGuard, so it needs its own billing check.
  if (g.billingBlocked) {
    return (
      <div className="sgp-card col-md-12 p-0 m-0">
        <BillingUpgradeBar isBlocked={g.billingBlocked} payUrl={g.billingPayUrl} onRecheck={g.billingRecheck} />
        <BillingInlineNotice status={g.billingStatus} onRefresh={g.billingRecheck} />
      </div>
    );
  }

  // "Showing 1 to 10 of 1,271 entries" — uses a total if the hook exposes one.
  const totalRecords = g.totalCount ?? g.totalRecords ?? g.total ?? null;
  const pageIdx = Number(g.page) - PAGE_BASE; // 0-based
  const from = g.rows.length ? pageIdx * Number(g.pageSize) + 1 : 0;
  const to = from ? from + g.rows.length - 1 : 0;

  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(Number(g.pageSize))
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, Number(g.pageSize)].sort((a, b) => a - b);

  return (
    <div className="sgp-root p-3" style={themeVars}>
      {/* ── Page header ── */}
      <div className="sgp-header">
        <h2 className="sgp-title">{g.title}</h2>
        {g.description && <p className="sgp-description">{g.description}</p>}
      </div>

      {/* stats: array, or (g) => array derived from live grid state */}
      <StatCards stats={stats} g={g} />

      {/* ── Filter bar ── */}
      <div className="sgp-card sgp-filterbar">
        <div className="sgp-search">
          <i className="fa fa-search sgp-search-icon"></i>
          <input
            type="text"
            className="sgp-search-input"
            placeholder={schema?.searchPlaceholder || 'Search...'}
            value={g.searchInput}
            onChange={(e) => g.handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && g.submitSearch()}
          />
        </div>
        <div className="sgp-filterbar-actions">
          <button type="button" className="sgp-btn sgp-btn-solid" onClick={g.submitSearch}>
            <span>Apply</span>
          </button>
          {!isActionHidden('refresh') && (
            <button type="button" className="sgp-btn sgp-btn-ghost" onClick={g.handleRefresh} title="Reset & refresh">
              <i className="fa fa-refresh"></i>
              <span>Reset</span>
            </button>
          )}
        </div>
        <div className="sgp-active-filters">
          <ActiveFiltersBar
            schema={schema}
            advancedQuery={g.advancedQuery}
            clearFilterValue={g.clearFilterValue}
            setDateRange={g.setDateRange}
            onClearAll={g.handleRefresh}
          />
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="sgp-actionbar">
        <div className="sgp-actionbar-left">
          <ActionGroup actions={visibleGridProfileActions} onRun={g.runProfileAction} primaryFirst />
          {!isActionHidden('print') && (
            <button type="button" className="sgp-btn" onClick={g.handlePrint}>
              <i className="fa fa-print"></i>
              <span>Print List</span>
            </button>
          )}
          {!isActionHidden('export') && (
            <button type="button" className="sgp-btn" onClick={() => g.handleExport('excel')}>
              <i className="fa fa-file-excel-o sgp-ic-excel"></i>
              <span>Export to Excel</span>
            </button>
          )}
          <ActionGroup actions={visibleToolbarActions} onRun={g.runToolbarAction} />
        </div>
        <label className="sgp-pagesize">
          <span>Show</span>
          <select value={g.pageSize} onChange={(e) => g.setPageSize(Number(e.target.value))}>
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>entries</span>
        </label>
      </div>

      {g.checkBoxesEnabled && g.selectedRows.length > 0 && (
        <button type="button" className="sgp-selection-bar" onClick={g.handleCheckedRowsAction}>
          <i className="fa fa-check-square-o"></i>
          <span>{g.selectedRows.length} selected</span>
          <span className="sgp-selection-cta">Bulk actions <i className="fa fa-angle-right"></i></span>
        </button>
      )}

      {/* ── Table ── */}
      {g.visibleFields.length > 0 && (
        <div className="sgp-card sgp-table-card">
          <div className="sgp-table-wrap" id={g.printCardId}>
            <table className="sgp-table" id={g.tableId}>
              <thead>
                <tr>
                  {g.checkBoxesEnabled && (
                    <th className="sgp-check-col">
                      <input
                        type="checkbox"
                        className="sgp-check"
                        checked={g.allOnPageSelected}
                        onChange={g.toggleSelectAll}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                  )}
                  {g.visibleFields.map((f) => (
                    <th key={f.key} className={f.sum ? 'sgp-num' : ''}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.loading ? (
                  <tr>
                    <td colSpan={g.totalColCount} className="sgp-state">
                      <span className="sgp-spinner" aria-hidden="true"></span> Loading...
                    </td>
                  </tr>
                ) : g.error ? (
                  <tr>
                    <td colSpan={g.totalColCount} className="sgp-state sgp-state-error">{g.error}</td>
                  </tr>
                ) : g.rows.length === 0 ? (
                  <tr>
                    <td colSpan={g.totalColCount} className="sgp-state">
                      <i className="fa fa-inbox sgp-state-icon"></i>
                      <div>No results found.</div>
                    </td>
                  </tr>
                ) : (
                  g.rows.map((item, idx) => {
                    const id = g.getRowId(item);
                    const rowId = id ?? `row-${idx}`;
                    const selected = g.checkBoxesEnabled && g.selectedIds.has(id);
                    return (
                      <Fragment key={rowId}>
                        <tr className={`sgp-row ${selected ? 'is-selected' : ''}`}>
                          {g.checkBoxesEnabled && (
                            <td className="sgp-check-col">
                              <input
                                type="checkbox"
                                className="sgp-check"
                                checked={selected}
                                onChange={() => g.toggleRow(id)}
                                aria-label={`Select row ${idx + 1}`}
                              />
                            </td>
                          )}
                          {g.visibleFields.map((f) => (
                            <td key={f.key} data-label={f.label} className={f.sum ? 'sgp-num' : ''}>
                              {f.key === 'row_count' ? (
                                <EntityRowOptions
                                  schema={schema}
                                  row={item}
                                  profilePath={customProfilePath}
                                  onChildDataOut={g.handleRowEvent}
                                  onRunAction={g.handleRunAction}
                                />
                              ) : f.type === 'image' ? (
                                <MosyImageViewer
                                  media={`/api/mediaroom?media=${btoa(item[f.key] || '')}`}
                                  mediaRoot=""
                                  defaultLogo={f.defaultLogo || defaultLogo}
                                  imageClass={'small_thumbnail'}
                                />
                              ) : f.type === 'status' ? (
                                <StatusPill value={g.formatFieldValue(f, item)} tones={f.statusTones} />
                              ) : (
                                <TrimmedCell value={g.formatFieldValue(f, item)} trim={f.trim} />
                              )}
                            </td>
                          ))}
                        </tr>
                        {g.hasMultiGridRows && (
                          <tr className="sgp-subgrid-row">
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
                  <tr className="sgp-tfoot">
                    {g.checkBoxesEnabled && <td className="sgp-check-col"></td>}
                    {g.visibleFields.map((f) => (
                      <td key={f.key} className={f.sum ? 'sgp-num' : ''}>{f.sum ? g.columnTotals?.[f.key] : ''}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="sgp-footer">
            <div className="sgp-footer-info">
              {g.rows.length > 0 &&
                (totalRecords != null
                  ? `Showing ${from} to ${to} of ${Number(totalRecords).toLocaleString()} entries`
                  : `Showing ${from} to ${to} · Page ${pageIdx + 1} of ${g.pageCount || 1}`)}
            </div>
            <Pager page={g.page} pageCount={g.pageCount} onPageChange={g.setPage} />
          </div>
        </div>
      )}
    </div>
  );
}