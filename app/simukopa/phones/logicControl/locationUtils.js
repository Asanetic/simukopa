// Shared location-string parser for the `phones.location` field. Canonical
// stored order is "lng,lat" (see uiControl/LocationTools.jsx and the
// field's label) — device trackers write "lng|lat". Both actionsRegistry.js
// (single-device trace) and devicemap (all-devices overview) need the same
// parsing so a fix to the order/ambiguity logic never drifts between them.
//
// Returns { lat, lng } or null (free-text address / empty / unparseable).
export function parseDeviceLocation(rawLocation) {
  if (!rawLocation) return null;
  const parts = String(rawLocation).split(/[,|]/).map((s) => s.trim());
  if (parts.length !== 2 || parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null;

  const [a, b] = parts.map(Number);
  // A latitude can never exceed +-90, so if only the second value does,
  // the pair must already be lat,lng — otherwise assume the canonical
  // lng,lat order (magnitude alone can't tell the two apart when both
  // values happen to be under 90, e.g. Nairobi's ~36.8 longitude).
  const alreadyLatLng = Math.abs(a) <= 90 && Math.abs(b) > 90;
  const [lng, lat] = alreadyLatLng ? [b, a] : [a, b];
  return { lat, lng };
}
