'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { mosyGetData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';
import { parseDeviceLocation } from '../phones/logicControl/locationUtils';
import { useEntityController } from '../moduleControl/dataControl/useEntityController';
import { PhonesSchema } from '../phones/PhonesSchema';
import PhonesActions from '../phones/logicControl/actionsRegistry';
import { MosyCard } from '../../components/MosyCard';
import PaymentsList from '../payments/uiControl/PaymentsList';
import LoanAllocationWizard from '../loanallocation/LoanAllocationWizard';

const apiRoutes = getApiRoutes();

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';

const STATUS_COLORS = {
  available: '#16a34a',
  allocated: '#2563eb',
  damaged: '#f59e0b',
  returned: '#6b7280',
  retired: '#6b7280',
  sold: '#9333ea',
  locked: '#dc2626',
};
const ALL_STATUSES = Object.keys(STATUS_COLORS);

function statusColor(status) {
  return STATUS_COLORS[String(status || '').toLowerCase()] || '#334155';
}

// A device can match a legend status through any of these fields —
// `status` ('available'/'allocated'/...) and `lock_status` ('locked') are
// separate columns on phones, both meaningful for "where is it and what
// state is it in" at a glance.
function matchesStatus(phone, key) {
  return [phone.status, phone.lock_status, phone.condition_status]
    .some((v) => String(v || '').toLowerCase() === key);
}

// Loaded once per page, from a CDN — no npm dependency to install just for
// this one overview map (every other map view in this app uses Google's
// no-API-key single-pin embed, which can't plot many points at once).
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (window.__leafletLoading) return window.__leafletLoading;

  window.__leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return window.__leafletLoading;
}

// Fleet list API caps pageSize at 100 — page through it to get every
// device, not just the first 100.
async function fetchAllPhones() {
  const rows = [];
  let pageNo = 1;
  for (; pageNo <= 30; pageNo += 1) {
    const res = await mosyGetData({
      endpoint: apiRoutes.phones.base,
      params: { pageSize: 100, pageNo },
    });
    if (res?.status !== 'success') break;
    rows.push(...(res.data || []));
    if (!res.pagination?.has_next) break;
  }
  return rows;
}

// A Font Awesome "fa-mobile" glyph on a colored pin, in place of Leaflet's
// default marker image — this app already loads Font Awesome globally
// (see assets/css/font-awesome.min.css), so no extra icon asset is needed.
function phoneIcon(L, color) {
  return L.divIcon({
    className: 'device-map-pin',
    html: `
      <div style="
        width:28px;height:28px;border-radius:50% 50% 50% 0;
        background:${color};transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,0.4);
      ">
        <i class="fa fa-mobile" style="transform:rotate(45deg);color:#fff;font-size:16px;"></i>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

function smallBtnStyle(color) {
  return `border:1px solid ${color};background:${color};color:#fff;font-size:11px;font-weight:600;` +
    'padding:3px 9px;border-radius:999px;cursor:pointer;line-height:1.4;';
}

// Built with plain DOM APIs (not JSX) because Leaflet popups aren't React
// content — this is the only way to wire real click handlers into them.
// Called fresh every time the popup opens (bindPopup's function form), so
// the buttons always reflect this device's CURRENT allocation state.
function buildPopupEl(phone, { onControl, onPayments, onAllocate }) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'font-size:13px;line-height:1.5;min-width:190px;';
  wrap.innerHTML = `
    <strong>${[phone.brand_name, phone.model_name].filter(Boolean).join(' ') || 'Device'}</strong><br/>
    IMEI: ${phone.imei_1 || 'N/A'}<br/>
    Status: ${phone.status || 'N/A'}<br/>
    ${phone.client_name ? `Client: ${phone.client_name}<br/>` : ''}
    ${phone.loan_ref ? `Loan ref: ${phone.loan_ref}<br/>` : ''}
  `;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;';

  const controlBtn = document.createElement('button');
  controlBtn.type = 'button';
  controlBtn.textContent = 'Control Device';
  controlBtn.style.cssText = smallBtnStyle('#334155');
  controlBtn.onclick = onControl;
  btnRow.appendChild(controlBtn);

  const isAllocated = !!phone.assigned_loan_id;
  const secondaryBtn = document.createElement('button');
  secondaryBtn.type = 'button';
  secondaryBtn.textContent = isAllocated ? 'View Payments' : 'Allocate Device';
  secondaryBtn.style.cssText = smallBtnStyle(isAllocated ? '#2563eb' : '#16a34a');
  secondaryBtn.onclick = isAllocated ? onPayments : onAllocate;
  btnRow.appendChild(secondaryBtn);

  wrap.appendChild(btnRow);
  return wrap;
}

export default function DeviceMap() {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef(new Map()); // record_id -> { marker, phone }

  // Reuses the SAME control_device modal/update wiring the Phones grid
  // uses (actionsRegistry.js) — no separate map-only implementation to
  // keep in sync with it. Kept in a ref since runRowAction is a fresh
  // bound function every render but calls into the same stable engine.
  const controller = useEntityController(PhonesSchema, { moduleActions: PhonesActions });
  const controllerRef = useRef(controller);
  useEffect(() => { controllerRef.current = controller; });

  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [plotted, setPlotted] = useState(0);
  const [activeStatuses, setActiveStatuses] = useState(() => new Set(ALL_STATUSES));
  const [query, setQuery] = useState('');

  // Init map + markers once.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [L, phones] = await Promise.all([loadLeaflet(), fetchAllPhones()]);
      if (cancelled) return;

      leafletRef.current = L;
      setDevices(phones);

      const map = L.map(mapElRef.current).setView([-1.2921, 36.8219], 6); // Nairobi fallback view
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const points = [];
      phones.forEach((phone) => {
        const coords = parseDeviceLocation(phone.location);
        if (!coords) return;
        points.push([coords.lat, coords.lng]);

        const marker = L.marker([coords.lat, coords.lng], { icon: phoneIcon(L, statusColor(phone.status)) }).addTo(map);
        marker.bindPopup(() => buildPopupEl(phone, {
          onControl: () => controllerRef.current.runRowAction('control_device', phone),
          onPayments: () => MosyCard(
            `Payments — ${[phone.brand_name, phone.model_name].filter(Boolean).join(' ')}`,
            <PaymentsList
              fixedQuery={{ loan_id: btoa(phone.assigned_loan_id) }}
              title="Payments"
              description={`Payments for loan ${phone.loan_ref || phone.assigned_loan_id}`}
            />,
            true,
            'modal3',
            'mosycard_wide'
          ),
          onAllocate: () => MosyCard(
            'Allocate Device',
            <LoanAllocationWizard initialDevice={phone} />,
            true,
            'modal3',
            'mosycard_wide'
          ),
        }));

        markersRef.current.set(phone.record_id, { marker, phone });
      });

      if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
      setPlotted(points.length);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // Legend clicks toggle which statuses are shown, and zoom the map to fit
  // whatever's left visible.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const visiblePoints = [];
    markersRef.current.forEach(({ marker, phone }) => {
      const visible = ALL_STATUSES.some((key) => activeStatuses.has(key) && matchesStatus(phone, key))
        || (!ALL_STATUSES.some((key) => matchesStatus(phone, key)) && activeStatuses.size === ALL_STATUSES.length);
      if (visible) {
        if (!map.hasLayer(marker)) marker.addTo(map);
        visiblePoints.push(marker.getLatLng());
      } else if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
    setPlotted(visiblePoints.length);
    if (visiblePoints.length) map.fitBounds(visiblePoints, { padding: [40, 40], maxZoom: 15 });
  }, [activeStatuses]);

  function toggleStatus(key) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next.size ? next : new Set(ALL_STATUSES); // never end up with zero shown
    });
  }

  // Live suggestion list for the search box — matched client-side against
  // the already-fetched fleet, no extra request per keystroke.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return devices
      .filter((p) => parseDeviceLocation(p.location))
      .filter((p) => [p.brand_name, p.model_name, p.imei_1, p.imei_2, p.serial_number, p.phone_number, p.client_name]
        .some((v) => String(v || '').toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, devices]);

  function zoomToDevice(phone) {
    const entry = markersRef.current.get(phone.record_id);
    const map = mapRef.current;
    if (!entry || !map) return;

    // Make sure it's visible regardless of the current status filter.
    if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
    map.setView(entry.marker.getLatLng(), 17, { animate: true });
    entry.marker.openPopup();
    setQuery('');
  }

  return (
    <div className="dash-card" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 22 }}>
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 className="mb-1" style={{ fontWeight: 700 }}>Inventory Map</h4>
          <p className="text-muted mb-0" style={{ fontSize: 14 }}>
            {loading ? 'Loading device locations…' : `${plotted} of ${devices.length} devices shown.`}
          </p>
        </div>

        <div style={{ position: 'relative', minWidth: 260 }}>
          <input
            className="form-control form-control-sm"
            placeholder="Search device (model, IMEI, client...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {suggestions.length ? (
            <div
              className="shadow-sm"
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, marginTop: 4, overflow: 'hidden',
              }}
            >
              {suggestions.map((p) => (
                <button
                  key={p.record_id}
                  type="button"
                  className="w-100 text-start btn btn-sm"
                  style={{ borderRadius: 0, fontSize: 13 }}
                  onClick={() => zoomToDevice(p)}
                >
                  <strong>{[p.brand_name, p.model_name].filter(Boolean).join(' ')}</strong>
                  {' '}<span className="text-muted">{p.imei_1}{p.client_name ? ` · ${p.client_name}` : ''}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="d-flex" style={{ gap: 10, flexWrap: 'wrap' }}>
          {ALL_STATUSES.map((key) => {
            const active = activeStatuses.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleStatus(key)}
                className="badge border-0"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                  background: active ? STATUS_COLORS[key] : `${STATUS_COLORS[key]}1a`,
                  color: active ? '#fff' : STATUS_COLORS[key],
                  borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                }}
                title={active ? `Hide ${key} devices` : `Show only ${key} devices`}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#fff' : STATUS_COLORS[key] }} />
                <span style={{ textTransform: 'capitalize' }}>{key}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div ref={mapElRef} style={{ width: '100%', height: '70vh', borderRadius: 12, overflow: 'hidden' }} />
    </div>
  );
}
