/**
 * novabilling/config.js — FRONTEND config. Timings only; the asset id,
 * account identifier and on/off switch all live in the backend config
 * (app/api/novabilling/config.js) and the client just follows what the
 * server reports.
 *
 * ── Plug-and-play: copy two folders, make three calls ─────────────
 *  Copy   app/novabilling/       (this folder)
 *  Copy   app/api/novabilling/   (backend), then set the asset id in its config.js
 *
 *  1. SessionMonitor:
 *       import { startBillingMonitor } from '../novabilling/client';
 *       useEffect(() => { ...; return startBillingMonitor(); }, []);
 *
 *  2. Access control (replaces the allow/deny tail of MosyAccessControl):
 *       import { novaBillingGate } from '../../novabilling/client';
 *       return novaBillingGate(roleAllowed);   // true = let in
 *
 *  3. Access-denied guard (what a denied screen renders):
 *       import { NovaBillingGuard } from '../../novabilling/BillingNotice';
 *       return <NovaBillingGuard fallback={<AccessDenied />} />;
 *
 * Assumes the standard app structure: ../auth/featureConfig/saAuthConfigs
 * and ../appConfigs/hiveRoutes exist.
 */

// Local kill switch for this browser build. Leave true; turn billing
// on/off from the backend config.
export const BILLING_CLIENT_ENABLED = true;

export const STATUS_PATH = '/api/novabilling/status';
export const STATUS_CACHE_MS = 60_000;        // how long the hook trusts a cached status
export const MONITOR_INTERVAL_MS = 60_000;    // background refresh while logged in
