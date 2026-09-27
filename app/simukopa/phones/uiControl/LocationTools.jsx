'use client';
import { useEffect, useRef, useState } from 'react';

// LocationTools — schema.customBlocks companion to the plain `location`
// text field (see PhonesSchema.js's "other_details" section). Wired as a
// customBlock rather than a profileActions entry because it needs the
// LIVE, unsaved form's setValue — profileActions/actionsRegistry.js only
// ever gets the last SAVED record (ctx.rows), never the in-progress
// values a user is still editing.
//
// Two behaviors:
//  1. On mount, if `location` is still blank, silently try to detect the
//     browser's current position and fill it in (no error shown — this is
//     a convenience prefill, not a user-initiated action).
//  2. "Detect current location" button — same lookup, user-triggered,
//     always overwrites whatever is currently in the field and shows
//     success/error feedback.
//
// Stores "lng,lat" (no reverse-geocoding/API key needed) — same order as
// the `location` field's label and as device trackers write it. Phones'
// `trace` profileAction action (logicControl/actionsRegistry.js) reorders
// whichever pair it's handed (lng,lat here, or lat,lng/lat|lng from other
// sources) into "lat,lng" before feeding Google Maps' no-key embed URL's
// `q` param, which accepts either an address string or raw coordinates.
export default function LocationTools({ values, setValue }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const autoTriedRef = useRef(false);

  const detect = (auto = false) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      if (!auto) setStatus('Geolocation is not supported by this browser.');
      return;
    }
    setBusy(true);
    setStatus(auto ? '' : 'Detecting…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setValue('location', `${longitude.toFixed(6)},${latitude.toFixed(6)}`);
        setBusy(false);
        setStatus(auto ? '' : 'Location detected.');
      },
      (err) => {
        setBusy(false);
        if (!auto) setStatus(err?.message || 'Could not detect location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Auto-fill once per mount, only when the field is still empty — never
  // overwrites a location that's already set (typed, imported, or set by
  // a previous detect).
  useEffect(() => {
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    if (!values.location) detect(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dyn-field">
      <label className="dyn-label text-left">&nbsp;</label>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm dyn-input"
        onClick={() => detect(false)}
        disabled={busy}
      >
        {busy ? 'Detecting…' : 'Detect current location'}
      </button>
      {status && <div className="dyn-help text-left" style={{ marginTop: 6, fontSize: 12 }}>{status}</div>}
    </div>
  );
}
