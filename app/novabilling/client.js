'use client';
/**
 * novabilling/client.js — browser side of the NovaBloom billing layer.
 *
 *   startBillingMonitor()      — call once from SessionMonitor; keeps status fresh
 *   novaBillingGate(roleOk)    — SYNCHRONOUS allow/deny for access control
 *   useBillingGuard()          — hook for anything needing live status
 *   billingActionRestriction() — soft per-action restrictions (e.g. 'add')
 *
 * The browser never names an account: the server derives it from the auth
 * token. The cache is tied to that same token, so logging in as someone
 * else can never reuse the previous account's status.
 */
import { useCallback, useEffect, useState } from 'react';
import saAuthConfigs from '../auth/featureConfig/saAuthConfigs';
import { hiveRoutes } from '../appConfigs/hiveRoutes';
import { BILLING_CLIENT_ENABLED, STATUS_PATH, STATUS_CACHE_MS, MONITOR_INTERVAL_MS } from './config';

const SESSION_PREFIX = saAuthConfigs.sessionPrefix;
const STATUS_ENDPOINT = `${hiveRoutes.hiveBaseRoute}${STATUS_PATH}`;
const STATUS_EVENT = 'novabilling:status';
const CACHE_KEY = `novabilling_status_${SESSION_PREFIX}`;

// Set when the server reports billing is off/unconfigured; stops all
// further requests for this page load.
let serverDisabled = false;

function billingActive() {
  return BILLING_CLIENT_ENABLED && !serverDisabled && typeof window !== 'undefined';
}

// ── localStorage, defensive (SSR, private mode, corrupt JSON) ───────
function readLS(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getAuthToken() {
  const token = readLS(`${SESSION_PREFIX}_authToken`);
  return typeof token === 'string' && token ? token : null;
}

// Last chars of the token = its signature; changes on every login.
function tokenSig(token) {
  return token ? token.slice(-24) : null;
}

function readCache({ ignoreTtl = false } = {}) {
  const sig = tokenSig(getAuthToken());
  if (!sig) return null;
  const cached = readLS(CACHE_KEY);
  if (!cached || cached.sig !== sig || typeof cached.ts !== 'number') return null;
  if (!ignoreTtl && Date.now() - cached.ts > STATUS_CACHE_MS) return null;
  return cached.status;
}

function writeCache(status, token) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ status, ts: Date.now(), sig: tokenSig(token) }));
  } catch {}
}

function clearCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {}
}

// ── Fetching ─────────────────────────────────────────────────────
// Concurrent callers share one in-flight request.
const pending = new Map();

async function requestStatus(token, force) {
  try {
    const res = await fetch(`${STATUS_ENDPOINT}${force ? '?force=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' && typeof data.block === 'boolean' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Ask the server for the current status and update the cache. Resolves to
 * the status, or null if the request itself failed (cache left as it was).
 */
export function refreshBillingStatus(force = false) {
  if (!billingActive()) return Promise.resolve(null);

  const token = getAuthToken();
  if (!token) return Promise.resolve(null);

  const key = force ? 'force' : 'normal';
  if (pending.has(key)) return pending.get(key);

  const promise = requestStatus(token, force)
    .then((status) => {
      if (!status) return null;

      if (status.state === 'disabled') {
        serverDisabled = true;
        clearCache();
      } else if (status.state === 'unknown') {
        // Server couldn't reach NovaBloom and failed open. Drop any stale
        // "blocked" entry so an outage never keeps someone locked out.
        clearCache();
      } else {
        writeCache(status, token);
      }
      window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: status }));
      return status;
    })
    .finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
}

/**
 * Call once from SessionMonitor. Refreshes now, then on an interval and
 * whenever the tab regains focus. Returns a cleanup function.
 */
export function startBillingMonitor() {
  if (!billingActive()) return () => {};

  refreshBillingStatus(false);
  const timer = setInterval(() => refreshBillingStatus(false), MONITOR_INTERVAL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') refreshBillingStatus(false);
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// ── Synchronous gate ─────────────────────────────────────────────
// Why the last gate call said no ('role' | 'billing' | null). Read by
// NovaBillingGuard so a role failure keeps saying "Access Denied" and
// only a billing failure shows the payment notice.
let lastDenyReason = null;
export function getBillingDenyReason() {
  return lastDenyReason;
}

/**
 * Drop-in tail for an access-control check. Pass whether the role check
 * passed; returns true (let in) or false (deny) and records why.
 * Role is judged first, so users without the role never see billing.
 *
 * Uses the last known status and deliberately ignores the cache TTL: the
 * monitor keeps it fresh, and a gate that "forgets" after 60s would let a
 * blocked account straight back in.
 */
export function novaBillingGate(roleAllowed = true) {
  if (!roleAllowed) {
    lastDenyReason = 'role';
    return false;
  }
  if (billingActive()) {
    const status = readCache({ ignoreTtl: true });
    if (status && status.block === true) {
      lastDenyReason = 'billing';
      return false;
    }
  }
  lastDenyReason = null;
  return true;
}

/** Soft per-action restriction (e.g. 'add', 'export'), or null. */
export function billingActionRestriction(status, actionKey) {
  return (status && status.restrictions && status.restrictions[actionKey]) || null;
}

// ── Hook ──────────────────────────────────────────────────────
export function useBillingGuard() {
  // Starts "not blocked" so server and first client render match.
  const [status, setStatus] = useState({ block: false, state: 'loading', restrictions: {} });
  const [loading, setLoading] = useState(true);

  const recheck = useCallback(() => {
    return refreshBillingStatus(true).then((s) => {
      if (s) setStatus(s);
      setLoading(false);
      return s;
    });
  }, []);

  useEffect(() => {
    if (!billingActive()) {
      setLoading(false);
      return undefined;
    }

    const cached = readCache();
    if (cached) {
      setStatus(cached);
      setLoading(false);
    } else {
      refreshBillingStatus(false).then((s) => {
        if (s) setStatus(s);
        setLoading(false);
      });
    }

    // Stay in sync with the background monitor and other components.
    const onStatus = (e) => e.detail && setStatus(e.detail);
    window.addEventListener(STATUS_EVENT, onStatus);
    return () => window.removeEventListener(STATUS_EVENT, onStatus);
  }, []);

  // Paid in another tab? Recheck for real the moment this one is focused.
  useEffect(() => {
    if (!status.block) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status.block, recheck]);

  return {
    loading,
    status,
    isBlocked: !!status.block,
    payUrl: status.pay_url || null,
    restrictions: status.restrictions || {},
    recheck,
  };
}
