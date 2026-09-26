'use client';

import { useState } from 'react';
import { mosyGetData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';

const apiRoutes = getApiRoutes();

export default function CustomerSelector({ selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search(q) {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const res = await mosyGetData({
      endpoint: apiRoutes.clients.base,
      params: { searchAny: btoa(q), pageSize: 8 },
    });
    setResults(res?.status === 'success' ? res.data || [] : []);
    setLoading(false);
  }

  if (selected) {
    return (
      <div className="dash-card">
        <div className="text-muted small mb-1">CUSTOMER SELECTED</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{[selected.first_name, selected.last_name].filter(Boolean).join(' ')}</div>
        <div className="text-muted">{selected.phone_number}</div>
        {selected.id_number ? <div className="text-muted small">ID: {selected.id_number}</div> : null}
        <button className="btn btn-outline-secondary btn-sm mt-3" onClick={() => onSelect(null)}>Change Customer</button>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Step 1 — Select Customer</div>
      <input
        className="form-control mb-2"
        placeholder="Search by name, phone number or ID number"
        value={query}
        onChange={(e) => search(e.target.value)}
      />
      {loading ? <div className="text-muted small">Searching...</div> : null}
      <div className="d-flex flex-column" style={{ gap: 8 }}>
        {results.map((c) => (
          <button key={c.record_id} className="wizard-list-item" onClick={() => onSelect(c)}>
            <div style={{ fontWeight: 600 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</div>
            <div className="text-muted small">{c.phone_number}{c.id_number ? ` · ID: ${c.id_number}` : ''}</div>
          </button>
        ))}
        {!loading && query && results.length === 0 ? <div className="text-muted small">No customers found.</div> : null}
      </div>
    </div>
  );
}
