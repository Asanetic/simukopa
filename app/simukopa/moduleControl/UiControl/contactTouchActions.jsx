// contactTouchActions.jsx
//
// One place to answer "call/message the contact behind this row" for ANY
// module that carries a contact FK (contact_id on opportunities/ledger/
// notes/activities, client_id on expected_revenue, etc) — instead of every
// module's actionsRegistry.js hand-rolling its own lookup-by-contact_id +
// field-mapping copy (opportunities and activities both used to).
//
// A row from most modules only carries the linked contact's CACHED NAME
// (via resolveField's `as` cache column) — not phone/email, which the
// shared Smart Call / Smart Messenger UIs need. resolveContactRecipient()
// fetches the real contact record and merges phone_number/email onto a
// COPY of the row. If the row already looks like a contact (has its own
// phone_number or email — e.g. you're calling this straight from the
// Contacts module itself), it skips the lookup entirely.
//
// Built for actionsRegistry.js call sites: drop callContactAction /
// messageContactAction straight in as the `call` / `send_message` keys.
// Pass { contactIdKey: 'client_id' } (or whatever this table's FK column
// is actually called) for modules that don't use the 'contact_id' default.

import { getApiRoutes } from '../../AppRoutes/apiRoutesHandler';
import { mosyGetData } from '../../../MosyUtils/hiveUtils';
import { MosyCommsSmartCall } from '../../UiControl/MosySmartCommsCalls';
import { MosySendSmartMessage } from '../../UiControl/MosySmartComms';

const apiRoutes = getApiRoutes();

export async function resolveContactRecipient(row, { contactIdKey = 'contact_id', nameKey = 'contact_name' } = {}) {
  if (!row) return row;

  // Row already carries its own phone/email — it IS the contact (or
  // already resolved), nothing to look up.
  if (row.phone_number || row.email) {
    return {
      ...row,
      record_id: row.record_id || row[contactIdKey] || row.contact_id,
      full_name: row.full_name || row[nameKey] || row.contact_name,
    };
  }

  const contactId = row[contactIdKey];
  if (!contactId) return row;

  try {
    const res = await mosyGetData({ endpoint: apiRoutes.contacts.base, params: { contactId: btoa(contactId) } });
    const contact = Array.isArray(res?.data) ? res.data[0] : null;
    if (!contact) return row;

    return {
      ...row,
      record_id: contactId,
      full_name: contact.contact_name || row[nameKey] || row.title,
      phone_number: contact.phone_number,
      email: contact.email,
    };
  } catch (err) {
    console.error('resolveContactRecipient failed:', err);
    return row;
  }
}

// Resolve + open the shared Smart Call picker (tel: / WhatsApp).
export async function callContactFromRow(row, opts) {
  const recipient = await resolveContactRecipient(row, opts);
  if (!recipient) return;
  MosyCommsSmartCall({ profileDataNode: recipient });
}

// Resolve + open the shared Smart Messenger composer.
export async function messageContactFromRow(row, opts) {
  const recipient = await resolveContactRecipient(row, opts);
  if (!recipient) return;
  MosySendSmartMessage({ profileDataNode: recipient });
}

// Drop-in actionsRegistry.js entries — ctx is whatever runRegisteredAction
// hands the registered function ({ rows, schema, router, refresh, ... }).
//
//   import { callContactAction, messageContactAction } from '.../contactTouchActions';
//   call: (ctx) => callContactAction(ctx),
//   send_message: (ctx) => messageContactAction(ctx),
//   // FK column isn't 'contact_id' on this table:
//   call: (ctx) => callContactAction(ctx, { contactIdKey: 'client_id' }),
export const callContactAction = ({ rows } = {}, opts) => callContactFromRow(rows?.[0], opts);
export const messageContactAction = ({ rows } = {}, opts) => messageContactFromRow(rows?.[0], opts);

// Reminder subject line: prefer a real title; a title-less record (some
// deals/activities are logged with only a description) falls back to the
// description itself, trimmed down to a headline length.
export function deriveReminderHeadline(title, description, maxLen = 60) {
  const t = (title || '').trim();
  if (t) return t;
  const d = (description || '').trim();
  return d.length > maxLen ? `${d.slice(0, maxLen).trim()}…` : d;
}

// "Action needed" reminder body — same shape for any module with a linked
// contact (deals, activities): headline, who's involved and why, their
// phone/email, what they asked about, and a suggested next step. Any
// missing piece is just skipped rather than leaving a blank line.
//
//   ⚠️ Action needed — TruFinds Kargo
//
//   Peter Mwangi — Negotiation deal awaiting follow-up
//   📞 0723 456 789 | ✉️ peter.m@gmail.com
//   Asked about: Mombasa–Nairobi container shipping
//   Suggested: "Rate holds till Monday, shall I lock your slot?"
export function buildActionNeededReminder({ headline, contactName, note, phone, email, askedAbout, suggested }) {
  const lines = [`Action needed — ${headline || 'Follow up'}`, ''];

  const nameLine = [contactName, note].filter(Boolean).join(' — ');
  if (nameLine) lines.push(nameLine);

  const contactLine = [phone && `Tel:  ${phone}`, email && `\nemail: ${email}`].filter(Boolean).join(' | ');
  if (contactLine) lines.push(contactLine);

  if (askedAbout) lines.push(`Agenda: ${askedAbout}`);
  if (suggested) lines.push(`Suggested: "${suggested}"`);

  return lines.join('\n');
}
