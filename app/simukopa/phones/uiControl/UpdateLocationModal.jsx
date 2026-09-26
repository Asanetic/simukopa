// UpdateLocationModal.jsx
// Standalone quick-edit popup for phones.location with a "Use current
// location" button wired to the browser's Geolocation API.
//
// Not built on QuickEditModal.jsx's generic FIELD_COMPONENTS renderer —
// that only renders plain schema-typed inputs, with no room for an inline
// geolocation button next to the text field. Same visual language though
// (reuses formLayoutStyles/qem-* classes) so it doesn't look like a
// different product from update_status/control_device's quick-edit
// modals.

'use client';
import { useState } from 'react';
import { closeMosyCard, MosyCard } from '../../../components/MosyCard';
import { formLayoutStyles } from '../../moduleControl/UiControl/FormLayout';
import { MosySnackWidget } from '../../../MosyUtils/ActionModals';

const MODAL_ID = 'modal3'; // same slot QuickEditModal.jsx uses — only one quick-edit popup is ever open at a time

// ctx: { rows, update, refresh } from actionsRegistry.js's control_device-
// style call — update()/refresh() are the SAME EntityDataEngine bound
// methods the grid/form already use.
export function openUpdateLocationModal(ctx) {
  const { rows, update, refresh } = ctx;
  const row = rows?.[0];
  if (!row) return;

  const token = btoa(String(row.primkey));

  const save = (location) => update(token, { location }).then((result) => {
    if (result?.ok !== false) refresh?.();
    return result;
  });

  MosyCard(
    '',
    <UpdateLocationForm row={row} onSubmit={save} />,
    false,
    MODAL_ID,
    'mosycard_medium'
  );
}

function UpdateLocationForm({ row, onSubmit }) {
  const [location, setLocation] = useState(row?.location || '');
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);

  const close = () => closeMosyCard(MODAL_ID);

  const detect = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setSnack({ type: 'error', content: 'Geolocation is not supported by this browser.' });
      return;
    }
    setDetecting(true);
    setSnack(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation(`${latitude.toFixed(6)},${longitude.toFixed(6)}`);
        setDetecting(false);
      },
      (err) => {
        setDetecting(false);
        setSnack({ type: 'error', content: err?.message || 'Could not detect location.' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await onSubmit(location);
      if (result?.ok === false) {
        setSnack({ type: 'error', content: result.message || 'Update failed' });
      } else {
        setSnack({ type: 'success', content: result?.message || 'Location updated' });
        setTimeout(close, 700);
      }
    } catch (err) {
      setSnack({ type: 'error', content: 'Something went wrong: ' + err });
    } finally {
      setSaving(false);
    }
  };

  const busy = detecting || saving;

  return (
    <div className="dyn-form-scope qem-scope qem-entered">
      <div className="qem-card">
        <button type="button" className="qem-close" aria-label="Close" onClick={close}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="qem-header">
          <h3 className="qem-title">Update location — {row.brand_name || ''} {row.model_name || ''}</h3>
        </div>
        <div className="qem-divider" />

        <div className="qem-body">
          <div className="row dyn-grid justify-content-center">
            <div className="col-md-12 dyn-field">
              <label className="dyn-label text-left">Location</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="dyn-input"
                  placeholder="Address, or lat,lng"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
                <button
                  type="button"
                  className="qem-btn qem-btn-ghost"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={detect}
                  disabled={busy}
                >
                  {detecting ? 'Detecting…' : 'Use current location'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="qem-footer">
          <button type="button" className="qem-btn qem-btn-ghost" onClick={close} disabled={busy}>Cancel</button>
          <button type="button" className="qem-btn qem-btn-primary" onClick={save} disabled={busy}>
            {saving && <span className="dyn-spinner" />}
            <span>{saving ? 'Saving…' : 'Save changes'}</span>
          </button>
        </div>
      </div>

      {snack && (
        <div className="qem-snack-anchor">
          <MosySnackWidget
            curr_position="top"
            bg={snack.type === 'error' ? '#b91c1c' : '#0d7a6c'}
            content={snack.content}
            duration={3000}
            type="custom"
          />
        </div>
      )}

      <style jsx global>{formLayoutStyles}</style>
    </div>
  );
}
