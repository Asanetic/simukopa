/**
 * api/novabilling/guard.js — SERVER ONLY. Never import from a "use client" file.
 *
 * The account id always comes from the verified auth token via
 * config.resolveAccountId(), never from the request — a caller can only
 * ever ask about their own account.
 *
 * What runs on a status request (status/route.js):
 *   1. billing off / no asset id  -> { block:false, state:'disabled' }
 *   2. token invalid              -> 401
 *   3. first sighting of the account -> registered on NovaBloom (loadaccount)
 *   4. status fetched from NovaBloom (cached 60s, fails open by default)
 *
 * Because the frontend monitor calls status right after login, that is
 * also what "register the account on login" means — no login-route edit.
 *
 * Optional write gate for any route handler (returns a 402 Response when
 * blocked, or null to continue):
 *
 *   import { billingApiGate } from '../novabilling/guard';
 *   const blocked = await billingApiGate(request);
 *   if (blocked) return blocked;
 */
import { NextResponse } from 'next/server';
import { processAuthToken } from '../auth/authManager';
import {
  NOVABILLING_ASSET_ID,
  BILLING_CHECK_ENABLED,
  BILLING_FAIL_OPEN,
  NOVABLOOM_STATUS_URL,
  NOVABLOOM_LOADACCOUNT_URL,
  NOVABLOOM_PAUSED_URL,
  STATUS_FETCH_TIMEOUT_MS,
  STATUS_SERVER_REVALIDATE_S,
  resolveAccountId,
  buildAccountPayload,
} from './config';

const NOT_BLOCKED = { block: false, state: 'unknown', restrictions: {} };

// Billing is a no-op until it's switched on AND an asset id is set, so a
// half-configured app can never lock its users out.
function billingActive() {
  return BILLING_CHECK_ENABLED && !!NOVABILLING_ASSET_ID;
}

/** Low-level call to NovaBloom. Returns the decoded object, or null on any failure. */
async function billingFetchStatus(accountId, { noCache = false } = {}) {
  const url = `${NOVABLOOM_STATUS_URL}?${new URLSearchParams({ asset_id: NOVABILLING_ASSET_ID, account_id: accountId })}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
  // noCache bypasses Next's data cache — used for the "I've just paid" recheck.
  const cacheOpt = noCache ? { cache: 'no-store' } : { next: { revalidate: STATUS_SERVER_REVALIDATE_S } };

  try {
    const res = await fetch(url, { signal: controller.signal, ...cacheOpt });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// A blocked status must always carry a page to show, so the frontend
// never needs the asset id.
function withPausedUrl(status, accountId) {
  if (status.block && !status.expired_url) {
    return {
      ...status,
      expired_url: `${NOVABLOOM_PAUSED_URL}/${encodeURIComponent(NOVABILLING_ASSET_ID)}/${encodeURIComponent(accountId)}`,
    };
  }
  return status;
}

/** Never throws. Always returns an object with a `block` boolean. */
export async function billingGuardCheck(accountId, options = {}) {
  if (!billingActive() || !accountId) return { ...NOT_BLOCKED };

  const status = await billingFetchStatus(accountId, options);
  if (status === null) {
    return BILLING_FAIL_OPEN
      ? { ...NOT_BLOCKED }
      : withPausedUrl({ block: true, state: 'error', restrictions: {} }, accountId);
  }
  return withPausedUrl({ restrictions: {}, ...status }, accountId);
}

// Accounts already registered by this server process, so a busy tenant
// doesn't POST to NovaBloom repeatedly. Only successes are remembered, so
// a failed attempt is retried on the next status request.
const registeredAccounts = new Set();

/**
 * Register the account with NovaBloom (loadaccount) so a status check
 * always finds an existing account. Never throws; resolves true/false.
 */
export async function registerBillingAccount(user) {
  if (!billingActive()) return false;

  const payload = buildAccountPayload(user);
  if (!payload.accountid) return false;
  if (registeredAccounts.has(payload.accountid)) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NOVABLOOM_LOADACCOUNT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetid: NOVABILLING_ASSET_ID, ...payload }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('[novabilling] loadaccount failed', res.status);
      return false;
    }
    registeredAccounts.add(payload.accountid);
    return true;
  } catch (err) {
    console.warn('[novabilling] loadaccount error', String(err));
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** GET handler body for status/route.js */
export async function handleBillingStatusRequest(request) {
  if (!billingActive()) {
    return NextResponse.json({ block: false, state: 'disabled', restrictions: {} });
  }

  const { valid, data } = processAuthToken(request);
  if (!valid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await registerBillingAccount(data);

  const noCache = new URL(request.url).searchParams.get('force') === '1';
  const status = await billingGuardCheck(resolveAccountId(data), { noCache });

  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Write gate for route handlers. Returns a 402 NextResponse when the
 * caller's account is blocked, otherwise null. An invalid token returns
 * null too — that's the route's own auth check to reject, not billing's.
 */
export async function billingApiGate(request) {
  if (!billingActive()) return null;

  const { valid, data } = processAuthToken(request);
  if (!valid) return null;

  const status = await billingGuardCheck(resolveAccountId(data));
  if (!status.block) return null;

  return NextResponse.json(
    { status: 'error', error: 'subscription_required', message: 'Subscription required' },
    { status: 402 }
  );
}
