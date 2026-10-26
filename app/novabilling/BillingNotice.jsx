'use client';
/**
 * novabilling/BillingNotice.jsx — the blocked-account UI.
 *
 * <NovaBillingGuard fallback={<AccessDenied />} /> is what an access-denied
 * screen renders: the payment notice when billing was the reason,
 * otherwise the fallback (the app's own "Access Denied").
 *
 * The notice embeds NovaBloom's own "paused" page, so copy, pricing and
 * the payment flow are controlled from NovaBloom and update every app
 * without a redeploy.
 */
import { useEffect } from 'react';
import { useBillingGuard, getBillingDenyReason } from './client';

// NovaBloom's paused page does window.parent.postMessage(
// { type: 'novabloom:billing:refresh' }, '*') the moment payment completes.
function useRefreshMessage(onRefresh) {
  useEffect(() => {
    function handler(event) {
      if (event.data && event.data.type === 'novabloom:billing:refresh') onRefresh();
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onRefresh]);
}

export function BillingInlineNotice({ status, onRefresh }) {
  useRefreshMessage(onRefresh || (() => window.location.reload()));

  // The server always sends expired_url for a blocked account.
  if (!status.expired_url) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Subscription required. Please contact your administrator.</div>;
  }
  return (
    <div style={{ width: '100%', minHeight: '100vh' }}>
      <iframe
        src={status.expired_url}
        title="Subscription status"
        allow="payment"
        style={{ width: '100%', height: '100vh', border: 'none' }}
      />
    </div>
  );
}

export function BillingBlockScreen() {
  const { loading, status, isBlocked, recheck } = useBillingGuard();

  // The screen behind this decided "blocked" once, on mount, so it can't
  // notice a later payment by itself. When a real answer says the account
  // is fine again, reload and let it re-decide. `state === 'loading'`
  // (no answer yet / request failed) never triggers this, so an offline
  // browser can't get stuck in a reload loop.
  useEffect(() => {
    if (!loading && !isBlocked && status.state !== 'loading') window.location.reload();
  }, [loading, isBlocked, status.state]);

  if (!isBlocked) return null;
  return <BillingInlineNotice status={status} onRefresh={recheck} />;
}

export function NovaBillingGuard({ fallback = null }) {
  if (getBillingDenyReason() === 'billing') return <BillingBlockScreen />;
  return fallback;
}
