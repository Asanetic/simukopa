import { handleBillingStatusRequest } from '../guard';

// Billing status for the logged-in account. All logic lives in ../guard.js.
export async function GET(request) {
  return handleBillingStatusRequest(request);
}
