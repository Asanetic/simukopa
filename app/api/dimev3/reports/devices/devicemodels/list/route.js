// report route — cloned from _mosy_df_template_v1 by gen-report.js. Never edited: only the schema import line differs.
// Same guard order as your CRUD GET: token -> role -> work. Adjust the import depth like your other routes.

import { processAuthToken } from '../../../../../auth/authManager';
import { validateRoleAccess } from '../../../../validateRoleAccess';
import { connectDB, activeDB } from '../../../../../apiUtils/dataControl/conn';
import { mosySecureReport, ReportError } from '../../../../../apiUtils/reportControl/reportEngine';
import { mysqlAdapter } from '../../../../../apiUtils/reportControl/reportAdapters';
import { createRateLimiter } from '../../../../../apiUtils/reportControl/reportCache';
import { DevicesDeviceModelsSchema as schema } from './DevicesDeviceModelsSchema'; // <- the ONLY line that differs per report

// Use a READ-ONLY connection factory here if you have one: a report can then never write, whatever a schema says.
const db = mysqlAdapter({ connect: connectDB, database: () => activeDB });
const limiter = createRateLimiter({ max: 30, windowMs: 10000 });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const { valid, reason, data: authData } = processAuthToken(request);
    if (!valid) return Response.json({ status: 'unauthorized', message: reason }, { status: 403 });

    const canSelect = validateRoleAccess({
      table: schema.entity,
      source: schema.entity,
      action: 'select',
      role: schema.roles?.view || `view_${schema.entity}`,
      authData,
    });
    if (!canSelect.valid) return Response.json({ status: 'error', message: canSelect.message, data: [] });

    const { data, meta } = await mosySecureReport({ schema, searchParams, authData, db, limiter });
    return Response.json({ status: 'success', message: `${schema.entity} report`, data, meta });
  } catch (err) {
    if (err instanceof ReportError && err.expose) {
      return Response.json({ status: 'error', message: err.message, data: [] }, { status: err.status });
    }
    console.error(`GET report ${schema.entity} failed:`, err); // detail stays in the log, never in the response
    return Response.json({ status: 'error', message: 'Report could not be produced.', data: [] }, { status: 500 });
  }
}
