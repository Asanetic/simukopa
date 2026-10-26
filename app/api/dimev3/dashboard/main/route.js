import { processAuthToken } from '../../../auth/authManager';   // app/api/auth/authManager.js
import { processDashboard } from './processor';
import schema from './simukopa.schema';

// GET /api/<app>/dashboard/main?from=YYYY-MM-DD[ HH:mm]&to=…&<filterKey>=…[&hive_site_id=…][&debug=1]
//   hive_site_id and debug=1 work for superadmin only (debug returns each widget's SQL + timing)
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { valid, reason, data: auth } = processAuthToken(request);
  if (!valid) return Response.json({ status: 'unauthorized', message: reason }, { status: 403 });

  const out = await processDashboard({ schema, auth, searchParams: new URL(request.url).searchParams });
  
  return Response.json(out, { status: out.status === 'success' ? 200 : 500 });
}
