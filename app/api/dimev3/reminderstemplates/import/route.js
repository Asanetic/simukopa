
import { magicRandomStr, mosySqlInsert, processImport } from "../../../apiUtils/dataControl/dataUtils";
import { processAuthToken } from "../../../auth/authManager";
import { mutateInputArray } from "../../beMonitor";
import { ReminderstemplatesSchema as schema } from '../list/ReminderstemplatesSchema';

//role access control 

// system record-id column = 2nd schema field (record_id by default)
const recordIdCol = schema.fields[1]?.key || 'record_id';

export async function POST(req) {
  try {
    const { csvData, colsArray } = await req.json();

    // --- Validate Token ---
    const { valid: isTokenValid, data: authData, reason: tokenError } = processAuthToken(req);
    if (!isTokenValid) {
      return new Response(
        JSON.stringify({ success: false, message: tokenError }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- Prepare insertable records ---
    const processedInsertObj = processImport(csvData, colsArray, authData, "exp");
    let insertResults = [];

    // --- Process each record ---
    // --- Reject duplicate record_ids within the CSV ---
    const seen = new Set();
    const dupes = new Set();
    for (const node of processedInsertObj) {
      const id = String(node[recordIdCol] ?? "").trim();
      if (!id) continue;
      if (seen.has(id)) dupes.add(id);
      seen.add(id);
    }
    if (dupes.size) {
      return new Response(
        JSON.stringify({ status: "error", success: false, message: `Duplicate ${recordIdCol} in CSV: ${[...dupes].join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    for (const node of processedInsertObj) {
      // use the CSV's record_id if present and non-empty, otherwise generate one
      const csvRecordId = String(node[recordIdCol] ?? "").trim();
      const newRecordId = csvRecordId || magicRandomStr(10);
      node[recordIdCol] = newRecordId;

      const mutatedObj = mutateInputArray(`${schema.entity}`, node, req, newRecordId, authData);

      const insertResult = await mosySqlInsert(`${schema.entity}`, mutatedObj, req);
      insertResults.push(insertResult);
    }

    return new Response(
      JSON.stringify({status: "success", success: true, data: insertResults }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("CSV Import Error:", err);
    return new Response(
      JSON.stringify({ status: "error", success: false, message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}