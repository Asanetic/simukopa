import { NextResponse } from 'next/server';
import { billingGuardCheck } from '../../../MosyUtils/billingGuard';
import { NOVABLOOM_ASSET_ID, NOVABLOOM_ACCOUNT_ID } from '../../../appConfigs/novabloomConfig';

// Thin proxy so client components (which can't import 'next/server')
// can read NovaBloom billing status via a normal fetch. See
// app/MosyUtils/useBillingGuard.js for the client-side hook that calls this.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('asset_id') || NOVABLOOM_ASSET_ID;
  const accountId = searchParams.get('account_id') || NOVABLOOM_ACCOUNT_ID;
  const noCache = searchParams.get('force') === '1';

  const status = await billingGuardCheck(assetId, accountId, { noCache });
  return NextResponse.json(status, noCache ? { headers: { 'Cache-Control': 'no-store' } } : undefined);
}
