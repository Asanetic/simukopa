/**
 * Register real behavior here, once per action key. Both grid rowLinks
 * AND profile-level buttons (schema.profileActions) route through this
 * SAME registry — one place to add new behavior, works everywhere.
 *
 * Every registered function receives ONE ctx object instead of a fixed
 * list of positional args — see actionRegistryDocs.md (same folder) for
 * the full ctx field list and worked examples for every action shape
 * used elsewhere in this app (cross-module popups, preset create forms,
 * quick-edit modals, grid-toolbar smart filters, sending messages, etc).
 * Copy the block that matches what you're building from there.
 *
 * NOTE: "delete" and "clone" are intercepted directly by
 * useEntityFormController before they ever reach this registry — don't
 * register functions under those two keys, they will never fire.
 */

import { MosyCommsSmartCall } from "../../UiControl/MosySmartCommsCalls";
import { MosySendSmartMessage } from "../../UiControl/MosySmartComms";

// The shared Smart Call / Smart Messenger UIs read recipient info off
// generic keys (full_name / phone_number / record_id) — a calls row
// carries them as recipient_name / recipient_phone / related_record_id.
// No recipient_email on this table — a call has no email address.
function toRecipient(row) {
  return {
    ...row,
    full_name: row?.recipient_name,
    phone_number: row?.recipient_phone,
    record_id: row?.related_record_id,
  };
}

const CallsActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Re-opens the Smart Call picker for this same recipient — a fresh call
  // attempt, logged as its own new smart_calls row (see
  // MosySmartCommsCalls.jsx's launchCall/initiateCallLog), not an edit of
  // this one.
  call_again: ({ rows }) => {
    const row = rows?.[0];
    if (!row) return;
    MosyCommsSmartCall({ profileDataNode: toRecipient(row) });
  },

  // Opens the shared Smart Messenger composer for this call's recipient.
  send_message: ({ rows }) => {
    const row = rows?.[0];
    if (!row) return;
    MosySendSmartMessage({ profileDataNode: toRecipient(row) });
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default CallsActions
