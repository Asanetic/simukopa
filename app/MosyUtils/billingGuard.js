/**
 * billingGuard.js — Next.js (App Router) port of billing-guard.php
 * ─────────────────────────────────────────────────────────────
 * One file, drop it into any Next.js app, import what you need.
 * SERVER-SIDE ONLY (Server Components, Route Handlers, Middleware) —
 * never import this from a "use client" file.
 *
 * Three call sites map to the three PHP entry points:
 *
 * 1) Server Component page/layout — returning early from the
 *    component IS the exit(), same idea as billing_guard_enforce():
 *
 *      import { billingGuardCheck, BillingHardBlock, billingActionRestriction }
 *        from '@/app/MosyUtils/billingGuard';
 *
 *      export default async function Page() {
 *        const status = await billingGuardCheck('IA8MWMH', 'jerrylevav2');
 *        if (status.block) {
 *          return <BillingHardBlock status={status} assetId="IA8MWMH" accountId="jerrylevav2" />;
 *        }
 *        const addRestriction = billingActionRestriction(status, 'add');
 *        return <RealPage billingStatus={status} addRestriction={addRestriction} />;
 *      }
 *
 *    To keep your own shell (sidebar/topbar) visible and only swap the
 *    content area, use BillingInlineNotice instead of BillingHardBlock.
 *
 * 2) Middleware — blocks before any route code runs at all, the
 *    closest match to "require_once at the very top of every page":
 *
 *      // middleware.js
 *      import { billingGuardMiddleware } from '@/app/MosyUtils/billingGuard';
 *      export async function middleware(request) {
 *        return await billingGuardMiddleware('IA8MWMH', 'jerrylevav2');
 *      }
 *
 * 3) Route Handler / API route:
 *
 *      import { billingGuardApiGate } from '@/app/MosyUtils/billingGuard';
 *      export async function POST(req) {
 *        const blocked = await billingGuardApiGate('IA8MWMH', 'jerrylevav2');
 *        if (blocked) return blocked;
 *        // ... normal handler logic ...
 *      }
 *
 * Public-site variants (no billing/payment language, for pages a
 * visitor/customer might hit) mirror the PHP public_* functions:
 * BillingPublicInlineNotice, billingGuardPublicRedirect.
 *
 * Fails OPEN by default (network/API error does not lock people out) —
 * flip BILLING_FAIL_OPEN below if you'd rather fail closed.
 */

import { NextResponse } from 'next/server';
import { billingPausedUrl, billingActionRestriction, BillingHardBlock, BillingInlineNotice, BillingPublicInlineNotice } from './billingGuardUI';

// Re-exported so existing imports from this file keep working — the
// actual JSX lives in billingGuardUI.jsx (no 'next/server' import there)
// so client components can import those pieces directly without pulling
// this server-only module in.
export { billingPausedUrl, billingActionRestriction, BillingHardBlock, BillingInlineNotice, BillingPublicInlineNotice };

const BILLING_STATUS_URL = 'https://novabloom.asanetic.com/api/novabloomv3/status';
const BILLING_FAIL_OPEN = true; // true = allow access if the check itself fails
const BILLING_FETCH_TIMEOUT_MS = 5000;
// Next's server-side data cache for this fetch — every request for the
// same asset/account within this window is served from cache instead of
// hitting NovaBloom again, on top of the client-side TTL cache in
// useBillingGuard.js (that one dedupes per-browser; this one dedupes
// across every user/tab/server instance hitting this Next.js server).
const BILLING_STATUS_REVALIDATE_SECONDS = 60;

// ── DEBUG MODE ──────────────────────────────────────────────
// true  = every decision point is logged server-side via console.log
// false = normal silent operation (leave this off in production)
const BILLING_GUARD_DEBUG = false;

function billingDebug(msg, data) {
  if (!BILLING_GUARD_DEBUG) return;
  if (arguments.length > 1) console.log('[billing-guard] ' + msg, data);
  else console.log('[billing-guard] ' + msg);
}

/**
 * Low-level call to the status endpoint. Returns decoded object, or null on failure.
 */
export async function billingFetchStatus(assetId, accountId, { noCache = false } = {}) {
  const url = `${BILLING_STATUS_URL}?${new URLSearchParams({ asset_id: assetId, account_id: accountId })}`;
  billingDebug('requesting status', url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BILLING_FETCH_TIMEOUT_MS);

  // noCache: true bypasses Next's data cache entirely — used for the
  // manual "recheck now" path (e.g. right after the person pays) so
  // they don't have to wait out BILLING_STATUS_REVALIDATE_SECONDS.
  const cacheOpt = noCache ? { cache: 'no-store' } : { next: { revalidate: BILLING_STATUS_REVALIDATE_SECONDS } };

  let res;
  try {
    res = await fetch(url, { signal: controller.signal, ...cacheOpt });
  } catch (err) {
    clearTimeout(timer);
    billingDebug('fetch failed', String(err));
    return null;
  }
  clearTimeout(timer);

  if (!res.ok) {
    billingDebug('non-200 response', res.status);
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    billingDebug('JSON decode failed', String(err));
    return null;
  }

  if (!data || typeof data !== 'object') {
    billingDebug('decoded JSON was not an object', typeof data);
    return null;
  }

  billingDebug('decoded status payload', data);
  return data;
}

/**
 * Core check — never throws, never redirects. Use this everywhere;
 * the call-site-specific helpers below just decide what to DO with
 * the result (render, redirect, or return a Response).
 *
 * @returns {Promise<object>} status payload, always has a `block` boolean
 */
export async function billingGuardCheck(assetId, accountId, options = {}) {
  billingDebug('billingGuardCheck() called', { assetId, accountId });

  const status = await billingFetchStatus(assetId, accountId, options);

  if (status === null) {
    if (BILLING_FAIL_OPEN) {
      billingDebug('fetch failed, BILLING_FAIL_OPEN=true -> allowing access');
      return { block: false, state: 'unknown', restrictions: {} };
    }
    billingDebug('fetch failed, BILLING_FAIL_OPEN=false -> treating as blocked');
    return { block: true, state: 'error', restrictions: {} };
  }

  return { restrictions: {}, ...status };
}

// ── Middleware / Route Handler helpers ───────────────────────────

function billingHardBlockHtml(pausedUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Subscription Required</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}iframe{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border:none}</style>
</head>
<body>
<iframe src="${pausedUrl}" title="Subscription status" allow="payment"></iframe>
</body>
</html>`;
}

/**
 * Use in middleware.js. Returns a NextResponse to short-circuit the
 * request when blocked, or null to let the request continue.
 */
export async function billingGuardMiddleware(assetId, accountId) {
  const status = await billingGuardCheck(assetId, accountId);
  if (!status.block) return null;

  const pausedUrl = billingPausedUrl(status, assetId, accountId);
  billingDebug('HARD BLOCK (middleware)', pausedUrl);
  return new NextResponse(billingHardBlockHtml(pausedUrl), {
    status: 402, // Payment Required
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Use inside a Route Handler (app/api/.../route.js). Returns a
 * NextResponse to `return` immediately when blocked, or null to
 * proceed with normal handler logic.
 */
export async function billingGuardApiGate(assetId, accountId) {
  const status = await billingGuardCheck(assetId, accountId);
  if (!status.block) return null;

  billingDebug('HARD BLOCK (api)', status);
  return NextResponse.json(
    { error: 'subscription_required', pausedUrl: billingPausedUrl(status, assetId, accountId) },
    { status: 402 }
  );
}

/**
 * PUBLIC-SITE full-page redirect — generic "unavailable" note, no
 * billing/payment language. Use in middleware/route handlers for
 * pages a customer/visitor might hit.
 */
export async function billingGuardPublicRedirect(assetId, accountId) {
  const status = await billingGuardCheck(assetId, accountId);
  if (!status.block) return null;

  const target = status.usernoteurl || billingPausedUrl(status, assetId, accountId);
  billingDebug('PUBLIC BLOCK redirect', target);
  return NextResponse.redirect(target, { status: 307, headers: { 'Retry-After': '3600' } });
}
