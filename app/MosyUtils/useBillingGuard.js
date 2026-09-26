'use client';
import { useCallback, useEffect, useState } from 'react';
import { mosyGetData, mosyGetLSData, mosySetLSData, mosyDeleteLSData } from './hiveUtils';
import { hiveRoutes } from '../appConfigs/hiveRoutes';
import { NOVABLOOM_ASSET_ID, NOVABLOOM_ACCOUNT_ID } from '../appConfigs/novabloomConfig';

// How long a passive status check is trusted before the next mount goes
// back to NovaBloom. Every SmartGrid/DynamicForm on the page calls this
// hook, so without a cache a single page load (grid + a couple of
// sub-grids) or quick navigation between modules would each fire their
// own round trip. This only governs the PASSIVE path — recheck() below
// (wired to the grid's Refresh button, and to the paused iframe's
// postMessage on payment success) always bypasses it, so a person who
// just paid never has to sit out this window.
const BILLING_STATUS_CACHE_MS = 60_000;

function cacheKey(assetId, accountId) {
  return `novabloom_billing_status_${assetId}_${accountId}`;
}

// SSR has no localStorage — always returns null on the server, and on
// the client's very first (pre-hydration) render too, so the component
// tree React hydrates against is byte-for-byte what the server sent.
// Cache is only ever consulted from inside useEffect, after hydration.
function readCache(assetId, accountId) {
  if (typeof window === 'undefined') return null;
  const cached = mosyGetLSData(cacheKey(assetId, accountId));
  if (!cached || typeof cached.ts !== 'number') return null;
  if (Date.now() - cached.ts > BILLING_STATUS_CACHE_MS) return null;
  return cached.status;
}

function writeCache(assetId, accountId, status) {
  // Only cache a real answer from NovaBloom — never cache the fail-open
  // placeholder (billingGuardCheck's { state: 'unknown' }) or an error
  // shape from mosyGetData, or a transient hiccup would get "stuck"
  // as not-blocked for the full TTL.
  if (!status || typeof status.block !== 'boolean') return;
  mosySetLSData(cacheKey(assetId, accountId), { status, ts: Date.now() });
}

// De-dupes concurrent requests for the same asset/account across every
// SmartGrid/DynamicForm mounted on the same page (e.g. a profile page
// with an embedded sub-grid) so they share one in-flight fetch instead
// of each firing their own.
const pendingRequests = new Map();

function fetchStatus(assetId, accountId, { force = false } = {}) {
  const key = cacheKey(assetId, accountId) + (force ? ':force' : '');
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const promise = mosyGetData({
    endpoint: `${hiveRoutes.hiveBaseRoute}/api/billing/status`,
    params: { asset_id: assetId, account_id: accountId, ...(force ? { force: '1' } : {}) },
    requiresAuth: false,
  }).finally(() => pendingRequests.delete(key));

  pendingRequests.set(key, promise);
  return promise;
}

// Client-side counterpart to billingGuard.js's billingGuardCheck() —
// calls the /api/billing/status proxy (a client component can't import
// 'next/server' directly) and exposes the same shape every module-level
// template (SmartGrid, DynamicForm, ...) needs to gate itself.
//
// Starts "not blocked" (matching what the server always renders, since
// it never sees the client's cache) so hydration never mismatches, and
// so a slow/failed check never flashes a false block.
export function useBillingGuard(assetId = NOVABLOOM_ASSET_ID, accountId = NOVABLOOM_ACCOUNT_ID) {
  const [status, setStatus] = useState({ block: false, state: 'loading', restrictions: {} });
  const [loading, setLoading] = useState(true);

  const runCheck = useCallback(
    (force = false) => {
      if (!force) {
        const cached = readCache(assetId, accountId);
        if (cached) {
          setStatus(cached);
          setLoading(false);
          return Promise.resolve(cached);
        }
      } else {
        mosyDeleteLSData(cacheKey(assetId, accountId));
      }

      return fetchStatus(assetId, accountId, { force })
        .then((data) => {
          if (data) setStatus(data);
          writeCache(assetId, accountId, data);
          return data;
        })
        .catch(() => {
          // fail open — leave status as whatever it already was
        })
        .finally(() => setLoading(false));
    },
    [assetId, accountId]
  );

  // Passive check — runs once after hydration (never during the SSR
  // render itself), respects the cache above.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(runCheck(false)).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, accountId]);

  // If someone pays in a NEW TAB (the "Upgrade Account" button opens
  // pay_url with target="_blank", so postMessage from that tab back to
  // this one isn't available), catch it when they switch back here:
  // re-check for real the moment this tab regains focus while blocked,
  // instead of waiting out the cache TTL.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && status.block) {
        runCheck(true);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [runCheck, status.block]);

  return {
    loading,
    status,
    isBlocked: !!status.block,
    payUrl: status.pay_url || null,
    assetId,
    accountId,
    // Force an immediate, cache-bypassing recheck — wire this to a
    // "Refresh" / "I've paid" button, or to BillingInlineNotice's
    // onRefresh (the paused iframe's postMessage on payment success).
    recheck: () => runCheck(true),
  };
}
