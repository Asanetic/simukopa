/**
 * api/novabilling/config.js — BACKEND config. The only file in this folder
 * you edit when copying it into another app.
 *
 * Copying to a new app = copy app/api/novabilling/ (this folder) and
 * app/novabilling/ (the frontend), set NOVABILLING_ASSET_ID below, then
 * follow the 3 calls listed in app/novabilling/config.js.
 *
 * Assumes the standard app structure: ../auth/authManager
 * (processAuthToken) exists in app/api/auth/.
 */

// Asset id registered on NovaBloom for this app. While empty, billing is
// treated as "not configured" and never blocks anyone.
export const NOVABILLING_ASSET_ID = '6P2HT4Y';

// Master switch. false = the whole billing layer is a no-op (server AND
// client — the client just follows what the server reports).
export const BILLING_CHECK_ENABLED = true;

// true  = if NovaBloom is unreachable, let people in.
// false = an unreachable NovaBloom counts as blocked.
export const BILLING_FAIL_OPEN = true;

// ── Account identifier — the ONE place to change how a customer is
// identified on NovaBloom ───────────────────────────────────────────
// Field on the auth token payload that identifies the billed account.
// (The login row becomes the token payload, so it must be in
// saAuthConfigs.sessionColumns.) The browser never sends or knows this.
// simukopa's tenant is the microlender business (system_users.payment_account,
// a separately generated id set at account creation — see createaccount/route.js),
// not the hive_site_id, so one business could later hold more than one site
// under a single billed account.
export const ACCOUNT_ID_FIELD = 'payment_account';

// Change this function if the account id ever needs to be computed (e.g.
// combining fields, or a lookup) instead of read straight off the token.
export function resolveAccountId(authData) {
  const id = authData?.[ACCOUNT_ID_FIELD];
  return id === undefined || id === null || id === '' ? null : String(id);
}

// What we tell NovaBloom about the account the first time it's seen, so it
// exists there before any status check. `user` is the token payload (the
// login row). The account is the tenant; the contact details are those of
// whoever triggered the registration. Change this if a different contact
// (e.g. the business owner) should be registered instead.
export function buildAccountPayload(user) {
  return {
    accountid: resolveAccountId(user),
    name: user?.hive_site_name || user?.name || '',
    email: user?.email || '',
    tel: user?.tel || '',
  };
}

// ── NovaBloom endpoints ─────────────────────────────────────────
export const NOVABLOOM_STATUS_URL = 'https://novabloom.asanetic.com/api/novabloomv3/status';
export const NOVABLOOM_LOADACCOUNT_URL = 'https://novabloom.asanetic.com/api/novabloomv3/loadaccount';
export const NOVABLOOM_PAUSED_URL = 'https://novabloom.asanetic.com/paused';

// ── Timing ──────────────────────────────────────────────────────
export const STATUS_FETCH_TIMEOUT_MS = 5000;   // server -> NovaBloom
export const STATUS_SERVER_REVALIDATE_S = 60;  // Next data cache, shared by all users
