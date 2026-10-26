'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import OriginDashboard from './OriginDashboard';
import { mosyGetData, mosyGetLSData, dayTime } from '../../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../../AppRoutes/apiRoutesHandler';
import saAuthConfigs from '../../../auth/featureConfig/saAuthConfigs';

const apiRoutes = getApiRoutes();

// Calls the dashboard route (app/api/ticksy/dashboard/main). `filters` = { from, to, <any filter key> };
// empty values are dropped. `withLayout` asks for the screen layout too (first load only).
// Resolves to { status, layout?, data, options, … } or { status:'error', message }.
async function fetchDashboard(filters, withLayout) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
  if (withLayout) params.layout = '1';
  try {
    return await mosyGetData({ endpoint: apiRoutes.dashboard.main, params });
  } catch (e) {
    return { status: 'error', message: `Could not reach the dashboard route (${e?.message || 'network error'}).` };
  }
}

export default function OriginDashboardLive() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [userName, setUserName] = useState('there');
  const filters = useRef({}); // current filter values (from, to, + any schema fields); the refresh keeps using them
  const seq = useRef(0); // ignore a slow older response arriving after a newer one
  const screen = useRef(null); // { brand, refreshMs, layout } — sent by the server once, then reused

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const r = await fetchDashboard({ ...filters.current }, !screen.current);
    if (mine !== seq.current) return;
    if (r?.status === 'success') {
      if (r.layout) screen.current = { brand: r.brand, refreshMs: r.refreshMs, layout: r.layout };
      if (!screen.current) return setError('The server sent data but no layout — the route must be called with layout=1 on first load.');
      setPayload(r); setError(null);
    }
    else setError((prev) => prev || r?.message || `The server answered with an unexpected response${r?.status ? ` (status: ${r.status})` : ''}.`);
  }, []);

  const applyFilters = useCallback(({ preset, ...values }) => {
    filters.current = values; // { from, to, county, … } — empty strings mean "not set"
    load();
  }, [load]);

  useEffect(() => {
    const { sessionPrefix, usernameCol } = saAuthConfigs;
    const raw = mosyGetLSData(`${sessionPrefix}_sa_authsess_${usernameCol}_val`);
    if (raw) setUserName(String(raw).split(' ')[0]);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!payload) {
    return error ? (
      <div className="alert alert-danger text-center">
        <p className="mb-3">{error}</p>
        <button className="btn btn-outline-danger btn-sm" onClick={load}>Try Again</button>
      </div>
    ) : <p className="text-muted p-4">Loading dashboard…</p>;
  }

  return (
    <>
      {payload.warnings?.length > 0 && (
        <div className="alert alert-warning small mb-3">
          <strong>Schema warnings (superadmin only):</strong>
          <ul className="mb-0">{payload.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    <OriginDashboard
      schema={screen.current}
      data={payload.data}
      options={payload.options}
      userName={userName}
      greeting={`Good ${dayTime()}`}
      onApplyFilters={applyFilters}
    />
    </>
  );
}
