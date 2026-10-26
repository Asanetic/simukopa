// forecast.js — trend forecast for any count/sum series (clients per month, sales per day, votes per hour…).
// No dependencies, no domain knowledge: it only sees numbers in time order.
//
//   import { forecast } from './forecast.js';
//   const f = forecast([10, 11, 12, 12, 13, 11, 12, 13, 12, 14], { next: 7 });
//   f.rows   → [{ value, low, high }, …]   one per coming period (low–high = about 80% range)
//   f.total  → { value, low, high }        sum of the coming periods
//   f.method → 'avg' | 'trend' | 'recent'  what was used (auto picks by a hold-out test)
//   f.note   → "Based on 10 months; average method"      show under the grid
//   f.ok     → false when there is too little history (f.reason says why)
//
// options: next (periods ahead, required) · method 'auto'|'avg'|'trend'|'recent' (default auto) ·
//          dropLast true = the last period is still in progress, leave it out of the fit ·
//          window use only the last N periods · integer round results (counts) · z band width (1.28 = 80%) · unit 'month' (for the note)
const MIN_POINTS = 3;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

function fitAvg(y, window) {
  const used = window ? y.slice(-window) : y;
  const level = mean(used);
  const resid = used.map((v) => v - level);
  const dof = Math.max(1, used.length - 1);
  const s = Math.sqrt(resid.reduce((t, r) => t + r * r, 0) / dof);
  return { n: used.length, s, predict: () => level, se: () => s * Math.sqrt(1 + 1 / used.length) };
}

function fitRecent(y) {
  const used = y.slice(-3);
  const level = mean(used);
  const s = Math.sqrt(y.reduce((t, v) => t + (v - mean(y)) ** 2, 0) / Math.max(1, y.length - 1));
  return { n: y.length, s, predict: () => level, se: () => s * Math.sqrt(1 + 1 / used.length) };
}

function fitTrend(y) {
  const n = y.length;
  const xs = y.map((_, i) => i);
  const xb = mean(xs); const yb = mean(y);
  const sxx = xs.reduce((t, x) => t + (x - xb) ** 2, 0);
  const b = sxx === 0 ? 0 : xs.reduce((t, x, i) => t + (x - xb) * (y[i] - yb), 0) / sxx;
  const a = yb - b * xb;
  const resid = y.map((v, i) => v - (a + b * i));
  const s = Math.sqrt(resid.reduce((t, r) => t + r * r, 0) / Math.max(1, n - 2));
  const at = (i) => a + b * i;
  const tstat = s === 0 ? (b === 0 ? 0 : Infinity) : Math.abs(b) / (s / Math.sqrt(sxx || 1));
  return { n, s, slope: b, tstat, predict: (h) => at(n - 1 + h), se: (h) => s * Math.sqrt(1 + 1 / n + (sxx === 0 ? 0 : ((n - 1 + h - xb) ** 2) / sxx)) };
}

const FITS = { avg: fitAvg, trend: fitTrend, recent: fitRecent };

// which method predicts the last few known periods best? (fit on the earlier ones, compare)
function pickMethod(y, window) {
  if (y.length < 6) return 'avg';
  const hold = Math.min(3, Math.floor(y.length / 3));
  const train = y.slice(0, -hold); const test = y.slice(-hold);
  let best = 'avg'; let bestErr = Infinity;
  const trendReal = fitTrend(y).tstat >= 2; // a slope that could be noise is not worth following
  for (const m of ['avg', 'recent', ...(trendReal ? ['trend'] : [])]) {
    const fit = FITS[m](train, window);
    const err = mean(test.map((v, i) => Math.abs(v - fit.predict(i + 1))));
    if (err < bestErr - 1e-9) { best = m; bestErr = err; } // ties keep the simpler method (avg first)
  }
  return best;
}

export function forecast(values, opts = {}) {
  const { next, method = 'auto', dropLast = false, window, integer = false, z = 1.28, unit = 'period' } = opts;
  if (!Number.isInteger(next) || next < 1) return { ok: false, reason: 'next must be a whole number of 1 or more' };
  let y = (values || []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  if (dropLast) y = y.slice(0, -1);
  if (y.length < MIN_POINTS) return { ok: false, reason: `needs at least ${MIN_POINTS} ${unit}s of history, has ${y.length}` };
  if (method !== 'auto' && !FITS[method]) return { ok: false, reason: `unknown method "${method}" (use auto, avg, trend or recent)` };

  const chosen = method === 'auto' ? pickMethod(y, window) : method;
  const fit = FITS[chosen](y, window);
  const fix = (v) => { const c = Math.max(0, v); return integer ? Math.round(c) : Math.round(c * 100) / 100; };
  const rows = []; let sum = 0; let varSum = 0;
  for (let h = 1; h <= next; h += 1) {
    const v = Math.max(0, fit.predict(h));
    const se = fit.se(h);
    rows.push({ value: fix(v), low: fix(v - z * se), high: fix(v + z * se) });
    sum += v; varSum += se * se;
  }
  const tse = Math.sqrt(varSum); // errors treated as independent: an approximate range
  const total = { value: fix(sum), low: fix(sum - z * tse), high: fix(sum + z * tse) };
  const names = { avg: 'average', trend: 'trend line', recent: 'recent average' };
  return {
    ok: true, method: chosen, used: y.length, rows, total,
    average: Math.round(mean(window ? y.slice(-window) : y) * 100) / 100,
    slope: chosen === 'trend' ? Math.round(fit.slope * 1000) / 1000 : 0,
    note: `Based on ${y.length} ${unit}${y.length === 1 ? '' : 's'} of history; ${names[chosen]} method${y.length < 6 ? ' (too little history to compare methods)' : ''}. Range is about 80%.`,
  };
}
