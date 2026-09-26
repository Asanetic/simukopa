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

import { MosySendSmartReminder } from "../../UiControl/MosySmartReminder";
import { MosyNotify } from "../../../MosyUtils/ActionModals";

const MosyremindersActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Grid-toolbar "New Reminder" — opens the Smart Reminder composer
  // instead of navigating to the plain profile form.
  new: ({ refresh }) => {
    MosySendSmartReminder({
      uiOptions: { modalTitle: 'New Reminder' },
      onSaved: refresh,
    });
  },

  // Row "Edit" — same composer, pre-filled from this row and saved via PUT.
  edit_reminder: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row) return;
    MosySendSmartReminder({
      reminderData: row,
      onSaved: refresh,
    });
  },

  // Flips status Active <-> Inactive directly, no modal. `update` here is
  // the SAME EntityDataEngine instance the grid itself uses (ctx.update),
  // so its own auto-reload-on-success applies too; `refresh()` after is a
  // no-op safety net, not the only reload path.
  // `${entity}_dataNode` is base64-decoded server-side straight to the
  // primkey column (see route.js's PUT handler) — btoa(row.primkey) is the
  // one id shape that works for ANY module's update endpoint, unlike
  // row.record_id which points at a different column depending on schema.
  toggle_status: async ({ rows, update, refresh }) => {
    const row = rows?.[0];
    if (!row) return;

    const isActive = String(row.status || '').toLowerCase() === 'active';
    const nextStatus = isActive ? 'Inactive' : 'Active';

    const result = await update(btoa(String(row.primkey)), { status: nextStatus });

    if (result?.ok) {
      MosyNotify({
        message: `Reminder ${nextStatus === 'Active' ? 'activated' : 'deactivated'}.`,
        icon: 'check-circle',
        iconColor: 'text-success',
      });
    } else {
      MosyNotify({
        message: result?.message || 'Failed to update reminder status',
        icon: 'times-circle',
        iconColor: 'text-danger',
      });
    }
    refresh?.();
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default MosyremindersActions
