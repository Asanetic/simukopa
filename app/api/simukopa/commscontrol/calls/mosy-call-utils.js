import { magicRandomStr, mosySqlInsert, mosySqlUpdate } from '../../../apiUtils/dataControl/dataUtils';
// NOTE: mosySqlUpdate is assumed to mirror mosySqlInsert's signature.
// If your update path actually goes through the generic CRUD route
// (like the smart_messages draft PUT flow), swap the call in
// completeCallStage/abandonCallStage for that instead.

function nowSqlDateTime() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function nowSqlDate() {
  return new Date().toISOString().slice(0, 10);
}

function cleanValue(v, fallback = '') {
  return v === undefined || v === null ? fallback : String(v);
}

function buildActor(auth = {}) {
  return (
    auth?.full_name ||
    auth?.user_name ||
    auth?.email ||
    auth?.record_id ||
    'system'
  );
}

function decodeCallToken(token = '') {
  try {
    return atob(String(token));
  } catch (e) {
    return '';
  }
}

async function initiateCallStage({ payload = {}, auth = {} }) {
  const nowDateTime = nowSqlDateTime();
  const nowDate = nowSqlDate();
  const recordId = magicRandomStr(7);

  const row = {
    record_id: recordId,
    call_number: cleanValue(payload.call_number, `CALL-${Date.now()}`),
    related_record_id: cleanValue(payload.related_record_id || payload.client_id || ''),
    recipient_name: cleanValue(payload.recipient_name || payload.user_name || payload.full_name || 'Client'),
    recipient_phone: cleanValue(payload.recipient_phone || payload.phone || ''),
    call_channel: cleanValue(payload.call_channel, 'phone'), // 'whatsapp' | 'phone'
    call_status: 'initiated',
    call_outcome: '',
    call_notes: '',
    duration_seconds: 0,
    request_source: cleanValue(payload.request_source, 'smart_call_ui'),
    initiated_by: buildActor(auth),
    initiated_on: nowDateTime,
    completed_on: '',
    created_on: nowDate,
    created_at: nowDateTime,
    updated_at: nowDateTime,
    hive_site_id: cleanValue(auth?.hive_site_id, cleanValue(payload.hive_site_id, '')),
    hive_site_name: cleanValue(auth?.hive_site_name, cleanValue(payload.hive_site_name, ''))
  };

  const insertResult = await mosySqlInsert('smart_calls', row, payload);

  return {
    success: true,
    status: 'success',
    message: 'Call log initiated',
    data: { record_id: recordId, insert: insertResult }
  };
}

async function completeCallStage({ payload = {} }) {
  const recordId = decodeCallToken(payload?.smart_calls_dataNode);

  if (!recordId) {
    return { success: false, status: 'error', message: 'Missing or invalid call reference.' };
  }

  const nowDateTime = nowSqlDateTime();

  const updates = {
    call_status: 'completed',
    call_outcome: cleanValue(payload.call_outcome, 'answered'),
    call_notes: cleanValue(payload.call_notes, ''),
    duration_seconds: parseInt(payload.duration_seconds, 10) || 0,
    completed_on: nowDateTime,
    updated_at: nowDateTime
  };

  const updateResult = await mosySqlUpdate('smart_calls', updates, payload, ` record_id = '${recordId}'`);

  return {
    success: true,
    status: 'success',
    message: 'Call log updated',
    data: { record_id: recordId, update: updateResult }
  };
}

async function abandonCallStage({ payload = {} }) {
  const recordId = decodeCallToken(payload?.smart_calls_dataNode);

  if (!recordId) {
    return { success: false, status: 'error', message: 'Missing or invalid call reference.' };
  }

  const nowDateTime = nowSqlDateTime();

  const updates = {
    call_status: 'abandoned',
    completed_on: nowDateTime,
    updated_at: nowDateTime
  };

  const updateResult = await mosySqlUpdate('smart_calls', updates, payload, `record_id = '${recordId}'`);

  return {
    success: true,
    status: 'success',
    message: 'Call marked as not logged',
    data: { record_id: recordId, update: updateResult }
  };
}

export async function logUtilCall({ auth = {}, payload = {} }) {
  try {
    const stage = cleanValue(payload?.call_stage, 'initiate');

    if (stage === 'complete') return await completeCallStage({ payload });
    if (stage === 'abandon') return await abandonCallStage({ payload });
    return await initiateCallStage({ payload, auth });
  } catch (error) {
    console.error('Error in logUtilCall:', error);
    return {
      success: false,
      status: 'error',
      message: error.message || 'Operation failed'
    };
  }
}