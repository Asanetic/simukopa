// ReportDataEngine — the "kitchen" for reports. Zero React. Zero DOM. Zero UI knowledge.
// Mirror of EntityDataEngine: any UI creates one instance and .subscribe()s to it.
//
// It fetches RAW measure rows for one report; the maths (derived columns, totals,
// remarks) lives in logicControl/reportLogic.js and runs on top of these rows.
//
// REQUEST   GET schema.apiBase ?bucket=<b64>&date_start=<b64>&date_end=<b64>&<filters b64>   (schema.transport:'plain' -> ?report=&groupBy= raw)
//           date range uses the same suffix convention as the grids: date_start / date_end
// RESPONSE  { status:'success', data:[ { _group:'2026-05', events:14, sold:3200, … }, … ] }
//           (optional _label overrides the formatted group label)
//
// SAMPLE MODE — no apiBase on the schema (or options.sample === true) and
// schema.sampleRows present: rows come from sampleRows instead of the network.
// That is the "show me example data" mode for training and for building a page
// before its API route exists.

import { mosyGetData } from '../../../MosyUtils/hiveUtils';

export class ReportDataEngine {
  constructor(schema, options = {}) {
    this.schema = schema;
    this.fixedQuery = options.fixedQuery || {};
    this.forceSample = !!options.sample;

    this.state = {
      rawRows: [],
      loading: true,
      error: null,
      sample: false,
      groupBy: schema.groupBy,
      advancedQuery: {}, // date range + filter values
    };

    this.listeners = new Set();
    this._requestId = 0; // newest load() wins — same stale-response guard as EntityDataEngine
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _setState(partial) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn(this.state));
  }

  getState() {
    return this.state;
  }

  // Same four-shape normaliser as EntityDataEngine._resolveMosyResult.
  async _resolveMosyResult(result) {
    if (typeof Response !== 'undefined' && result instanceof Response) {
      let body = null;
      try { body = await result.json(); } catch { /* no JSON body */ }
      return {
        ok: false,
        message: body?.message || `Request failed (${result.status} ${result.statusText || ''})`.trim(),
        data: body?.data ?? [],
      };
    }
    const ok = result?.status === 'success';
    return {
      ok,
      message: result?.message || (ok ? '' : 'Something went wrong. Please try again.'),
      data: result?.data ?? (Array.isArray(result) ? result : []),
    };
  }

  _usesSample() {
    return (this.forceSample || !this.schema.apiBase) && Array.isArray(this.schema.sampleRows);
  }

  // Sample rows honour the date range on the group value (ISO strings compare by prefix).
  _sampleRows() {
    const { date_start: start, date_end: end } = this.state.advancedQuery;
    return this.schema.sampleRows.filter((r) => {
      const g = String(r._group ?? '');
      if (start && g < String(start).slice(0, g.length)) return false;
      if (end && g > String(end).slice(0, g.length)) return false;
      return true;
    });
  }

  async load() {
    const requestId = ++this._requestId;
    this._setState({ loading: true, error: null });

    if (this._usesSample()) {
      await Promise.resolve(); // keep load() async like the network path
      if (requestId !== this._requestId) return;
      this._setState({ rawRows: this._sampleRows(), loading: false, sample: true });
      return;
    }

    if (!this.schema.apiBase) {
      this._setState({ rawRows: [], loading: false, sample: false, error: `Report "${this.schema.entity}" has no apiBase and no sampleRows.` });
      return;
    }

    // transport 'secure' (default) = what the report route (apiControl/) expects, same convention as the grids:
    //   every value base64'd (UTF-8 safe), the bucket sent as ?bucket=, date range as date_start / date_end.
    //   fixedQuery is passed through untouched — callers btoa() it themselves, exactly like a module's fixedQuery.
    // transport 'plain' = the old shape (?report=…&groupBy=…, raw values) for a hand-written endpoint.
    const b64 = (v) => btoa(unescape(encodeURIComponent(String(v))));
    const params = this.schema.transport === 'plain'
      ? { report: this.schema.entity, groupBy: this.state.groupBy, ...this.state.advancedQuery, ...this.fixedQuery }
      : {
          bucket: b64(this.state.groupBy),
          ...Object.fromEntries(Object.entries(this.state.advancedQuery).map(([k, v]) => [k, b64(v)])),
          ...this.fixedQuery,
        };

    const raw = await mosyGetData({ endpoint: this.schema.apiBase, params });
    if (requestId !== this._requestId) return; // a newer load() has since fired

    const { ok, message, data } = await this._resolveMosyResult(raw);
    this._setState({
      rawRows: Array.isArray(data) ? data : [],
      loading: false,
      sample: false,
      error: ok ? null : message,
    });
  }

  // ---- filters ----
  setFilterValue(key, value) {
    const advancedQuery = { ...this.state.advancedQuery };
    if (value === '' || value === null || value === undefined) delete advancedQuery[key];
    else advancedQuery[key] = value;
    this._setState({ advancedQuery });
    this.load();
  }

  clearFilterValue(key) {
    this.setFilterValue(key, null);
  }

  // setDateRange('date', '2026-05', '2026-09') -> date_start / date_end (same suffix convention as the grids)
  setDateRange(key, start, end) {
    const advancedQuery = { ...this.state.advancedQuery };
    if (start) advancedQuery[`${key}_start`] = start; else delete advancedQuery[`${key}_start`];
    if (end) advancedQuery[`${key}_end`] = end; else delete advancedQuery[`${key}_end`];
    this._setState({ advancedQuery });
    this.load();
  }

  clearAllAdvancedFilters() {
    this._setState({ advancedQuery: {} });
    this.load();
  }

  setGroupBy(groupBy) {
    if (!groupBy || groupBy === this.state.groupBy) return;
    this._setState({ groupBy });
    this.load();
  }

  refresh(fixedQueryOverride, { clearAdvanced = false } = {}) {
    if (fixedQueryOverride !== undefined) this.fixedQuery = fixedQueryOverride || {};
    if (clearAdvanced) this._setState({ advancedQuery: {}, groupBy: this.schema.groupBy });
    this.load();
  }

  destroy() {
    this._requestId += 1; // invalidates any response still in flight
    this.listeners.clear();
  }
}
