/**
 * Cron entry point — hit on a schedule (e.g. every minute) by an external
 * cron service: GET/POST https://appname.com/api/imsv2/runmosyreminders
 *
 * Finds every mosy_reminders row that's Active, scheduled for today's
 * weekday, and due at the current HH:MM, sends it out over SMS/email using
 * the same utils commscontrol/messages/send-util-message.js uses, then
 * stamps last_sent_date so it doesn't fire again until tomorrow.
 */

import {
  mosyQuickSel,
  mosySqlUpdate,
  mosySqlInsert,
  magicRandomStr,
} from '../../apiUtils/dataControl/dataUtils';
import { mosySendSMS } from '../../apiUtils/dataControl/send-sms';
import { mosySendEmail } from '../../apiUtils/dataControl/send-gmail';

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowParts() {
  const now = new Date();
  return {
    dayAbbrev: WEEKDAY_ABBR[now.getDay()],
    hhmm: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    isoDate: now.toISOString().slice(0, 10),
    isoDateTime: now.toISOString().slice(0, 19).replace('T', ' '),
  };
}

function splitRecipients(raw = '') {
  return String(raw || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// Same {placeholder} convention as MosySmartComms/MosySmartReminder on the
// frontend — {first_name}/{tel}/{email}/{amount}/etc, left untouched if the
// reminder's variable_source doesn't define that key.
function renderMessage(template = '', vars = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = vars?.[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function parseVariableSource(raw = '') {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function logReminderSend({ reminder, channel, recipient, message, status, errorMessage = '' }) {
  try {
    await mosySqlInsert('mosy_reminder_log', {
      log_id: magicRandomStr(7),
      reminder_id: reminder.reminder_id || '',
      tenant_id: reminder.tenant_id || '',
      channel,
      recipient,
      rendered_message: message,
      status,
      error_message: errorMessage,
      // No authData in a cron context (nothing to auto-capture these from,
      // unlike mutateInputArray on a normal user request) — carry the
      // tenancy scope over from the reminder row itself instead, set when
      // it was originally created while someone WAS authenticated.
      hive_site_id: reminder.hive_site_id || '',
      hive_site_name: reminder.hive_site_name || '',
    }, {});
  } catch (err) {
    console.error('runmosyreminders: failed to write reminder log', err.message);
  }
}

async function processReminder(reminder) {
  const vars = parseVariableSource(reminder.variable_source);
  const renderedMessage = renderMessage(reminder.message, vars);
  const renderedSubject = renderMessage(reminder.subject || '', vars);

  const phones = splitRecipients(reminder.recipients_phone);
  const emails = splitRecipients(reminder.recipients_email);

  let sentCount = 0;
  let failedCount = 0;

  for (const phone of phones) {
    const result = await mosySendSMS(phone, renderedMessage);
    const ok = result?.status === 'success';
    ok ? sentCount++ : failedCount++;
    await logReminderSend({
      reminder,
      channel: 'sms',
      recipient: phone,
      message: renderedMessage,
      status: ok ? 'sent' : 'failed',
      errorMessage: ok ? '' : (result?.message || 'SMS send failed'),
    });
  }

  for (const email of emails) {
    const result = await mosySendEmail(email, renderedSubject, renderedMessage);
    const ok = result?.status === 'success';
    ok ? sentCount++ : failedCount++;
    await logReminderSend({
      reminder,
      channel: 'email',
      recipient: email,
      message: renderedMessage,
      status: ok ? 'sent' : 'failed',
      errorMessage: ok ? '' : (result?.message || 'Email send failed'),
    });
  }

  return { sentCount, failedCount, recipientsTried: phones.length + emails.length };
}

async function runDueReminders() {
  const { dayAbbrev, hhmm, isoDate, isoDateTime } = nowParts();

  // "Due", not "exact minute" — TIME_FORMAT(...) = hhmm only matches if a
  // cron tick lands on that literal minute. A missed/late/cold-start tick
  // then skips the reminder for the whole day with no way to catch up.
  // <= plus the last_sent_date guard fires it on the first run at or after
  // the scheduled time, once per day, however the cron actually lands.
  const whereStr = `
    WHERE LOWER(status) = 'active'
      AND FIND_IN_SET('${dayAbbrev}', days_of_week)
      AND TIME_FORMAT(time_of_day, '%H:%i') <= '${hhmm}'
      AND (last_sent_date IS NULL OR last_sent_date <> '${isoDate}')
  `;

  const dueReminders = await mosyQuickSel('mosy_reminders', whereStr);

  const summary = {
    checked_at: isoDateTime,
    day: dayAbbrev,
    time: hhmm,
    matched: dueReminders.length,
    processed: [],
  };

  for (const reminder of dueReminders) {
    try {
      const result = await processReminder(reminder);

      // "once" reminders fire a single time then switch themselves off —
      // otherwise they'd be picked up again on their next matching weekday.
      const isOneTime = String(reminder.repeat_type || 'repeat').toLowerCase() === 'once';
      const updateFields = { last_sent_date: isoDate };
      if (isOneTime) updateFields.status = 'Inactive';

      await mosySqlUpdate(
        'mosy_reminders',
        updateFields,
        {},
        `primkey = ${Number(reminder.primkey)}`
      );

      summary.processed.push({
        reminder_id: reminder.reminder_id,
        app_name: reminder.app_name,
        deactivated: isOneTime,
        ...result,
      });
    } catch (err) {
      console.error(`runmosyreminders: failed to process reminder ${reminder.reminder_id}`, err);
      summary.processed.push({
        reminder_id: reminder.reminder_id,
        error: err.message,
      });
    }
  }

  return summary;
}

function isAuthorizedCronRequest(request) {
  const cronSecret = process.env.MOSY_CRON_SECRET;
  if (!cronSecret) return true; // no secret configured -> open endpoint, cron-only by convention

  const { searchParams } = new URL(request.url);
  const suppliedSecret = request.headers.get('x-cron-secret') || searchParams.get('secret');
  return suppliedSecret === cronSecret;
}

async function handleCronRequest(request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ status: 'unauthorized', message: 'Invalid or missing cron secret' }, { status: 403 });
  }

  try {
    const summary = await runDueReminders();
    return Response.json({ status: 'success', message: 'Reminders run completed', data: summary });
  } catch (err) {
    console.error('runmosyreminders failed:', err);
    return Response.json({ status: 'error', message: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  return handleCronRequest(request);
}

export async function POST(request) {
  return handleCronRequest(request);
}
