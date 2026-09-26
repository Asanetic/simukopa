'use client';

import { useState } from 'react';
import { formatKes, mosyGetData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';
import { openEntityCreateModal } from '../moduleControl/UiControl/EntityCreateModal';
import PhonesProfile from '../phones/uiControl/PhonesProfile';
import { PhonesSchema } from '../phones/PhonesSchema';

const apiRoutes = getApiRoutes();

export default function DeviceSelector({ selected, onSelect, onBack }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Only devices with status='available' — never allocated/damaged/
  // returned/retired/sold stock (spec section 2).
  async function search(q) {
    setQuery(q);
    setLoading(true);
    const params = { status: btoa('available'), pageSize: 10 };
    if (q.trim()) params.searchAny = btoa(q);
    const res = await mosyGetData({ endpoint: apiRoutes.phones.base, params });
    const rows = res?.status === 'success' ? res.data || [] : [];
    setResults(rows);
    setLoading(false);
    return rows;
  }

  // Reuses the real device/inventory module (schema + profile form) —
  // same pattern as LoanPlanSelector's "+ New Loan Plan". A freshly
  // created phone defaults to status='available' (PhonesSchema), so it's
  // immediately eligible here; list endpoint's default ORDER BY primkey
  // DESC puts it first once the search is reset.
  function handleNewDevice() {
    openEntityCreateModal({
      ProfileComponent: PhonesProfile,
      schema: PhonesSchema,
      title: 'New Device',
      onSaved: async () => {
        const rows = await search('');
        if (rows[0]) onSelect(rows[0]);
      },
    });
  }

  if (selected) {
    return (
      <div className="dash-card">
        <div className="text-muted small mb-1">DEVICE SELECTED</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{[selected.brand_name, selected.model_name].filter(Boolean).join(' ')}</div>
        {selected.imei_1 ? <div className="text-muted small">IMEI: {selected.imei_1}</div> : null}
        <div className="text-muted small">{formatKes(selected.selling_price)}</div>
        <button className="btn btn-outline-secondary btn-sm mt-3" onClick={() => onSelect(null)}>Change Device</button>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div style={{ fontWeight: 700 }}>Step 2 — Select Device</div>
        <div className="d-flex" style={{ gap: 8 }}>
          {onBack ? <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>Back</button> : null}
          <button className="btn btn-outline-primary btn-sm" onClick={handleNewDevice}>+ New Device</button>
        </div>
      </div>
      <input
        className="form-control mb-2"
        placeholder="Search by model, brand, IMEI or serial number"
        value={query}
        onChange={(e) => search(e.target.value)}
        onFocus={() => { if (!results.length) search(''); }}
      />
      {loading ? <div className="text-muted small">Loading...</div> : null}
      <div className="row m-0" style={{ rowGap: 8 }}>
        {results.map((d) => (
          <div className="col-12 col-md-6" key={d.record_id}>
            <button className="wizard-list-item w-100" onClick={() => onSelect(d)}>
              <div style={{ fontWeight: 600 }}>{[d.brand_name, d.model_name].filter(Boolean).join(' ')}</div>
              {d.imei_1 ? <div className="text-muted small">IMEI: {d.imei_1}</div> : null}
              <div className="text-muted small">{formatKes(d.selling_price)} · AVAILABLE</div>
            </button>
          </div>
        ))}
        {!loading && results.length === 0 ? <div className="text-muted small">No available devices found.</div> : null}
      </div>
    </div>
  );
}
