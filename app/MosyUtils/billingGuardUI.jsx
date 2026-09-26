'use client';
import { useEffect } from 'react';

// Client-safe pieces of the billingGuard system — plain components, no
// 'next/server' import — so client components (SmartGrid, DynamicForm,
// any "use client" module) can render them directly. Server-only logic
// (the actual status fetch, middleware, API route gating) lives in
// billingGuard.js instead.

// Same contract as the PHP version's paused-page iframes: when payment
// completes, the NovaBloom page inside the iframe does
// window.parent.postMessage({ type: 'novabloom:billing:refresh' }, '*')
// so the embedding app can react instantly instead of waiting on a
// cache TTL. Defaults to a full reload (matches the PHP behavior
// exactly); pass onRefresh to do something cheaper (e.g. just re-run
// the billing check) instead of a full page reload.
function useBillingRefreshMessage(onRefresh) {
  useEffect(() => {
    function handler(event) {
      if (event.data && event.data.type === 'novabloom:billing:refresh') {
        if (onRefresh) onRefresh();
        else window.location.reload();
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onRefresh]);
}

export function billingPausedUrl(status, assetId, accountId) {
  if (status && status.expired_url) return status.expired_url;
  return `https://novabloom.asanetic.com/paused/${encodeURIComponent(assetId)}/${encodeURIComponent(accountId)}`;
}

/**
 * Look up a soft per-action restriction by key (e.g. 'add', 'export')
 * from a billing status object. Returns null if that action isn't
 * restricted right now.
 */
export function billingActionRestriction(status, actionKey) {
  if (status && status.restrictions && status.restrictions[actionKey]) {
    return status.restrictions[actionKey];
  }
  return null;
}

/**
 * Full-page takeover — return this directly from a Server Component
 * page/layout when status.block is true.
 */
export function BillingHardBlock({ status, assetId, accountId }) {
  useBillingRefreshMessage(); // no onRefresh — full page reload is the only option here anyway
  const pausedUrl = billingPausedUrl(status, assetId, accountId);
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, height: '100%', overflow: 'hidden' }}>
        <iframe
          src={pausedUrl}
          title="Subscription status"
          allow="payment"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </body>
    </html>
  );
}

/**
 * Inline version — sized to fill whatever container you put it in.
 * Use this when the page/component has its own shell that should keep
 * rendering around it (sidebar, topbar, grid header, form header, ...).
 */
export function BillingInlineNotice({ status, assetId, accountId, onRefresh }) {
  useBillingRefreshMessage(onRefresh);
  const pausedUrl = billingPausedUrl(status, assetId, accountId);
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <iframe
        src={pausedUrl}
        title="Subscription status"
        allow="payment"
        style={{ width: '100%', height: '100%', minHeight: '100vh', border: 'none', borderRadius: 10 }}
      />
    </div>
  );
}

/**
 * PUBLIC-SITE inline version — public-safe, no billing/payment wording
 * of its own; embeds status.usernoteurl (copy lives entirely on the
 * NovaBloom side so it updates everywhere with nothing to redeploy).
 */
export function BillingPublicInlineNotice({ status }) {
  if (!status || !status.usernoteurl) {
    return <div style={{ width: '100%', minHeight: 300 }} />;
  }
  return (
    <div style={{ width: '100%', minHeight: 300 }}>
      <iframe
        src={status.usernoteurl}
        title="Site notice"
        style={{ width: '100%', height: '100%', minHeight: 300, border: 'none' }}
      />
    </div>
  );
}
