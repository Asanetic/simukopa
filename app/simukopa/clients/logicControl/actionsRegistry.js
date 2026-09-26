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

import DeviceallocationsList from "../../deviceallocations/uiControl/DeviceallocationsList";
import { MosyCard } from "../../../components/MosyCard";

const ClientsActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Popup the devices allocated to this client — deviceallocations grid
  // scoped by fixedQuery.clientId, resolved to client_id by that module's
  // own route.js (deviceallocations.client_id column).
  // modal3, not modal1 — same slot imsv2's revenueplan uses for its own
  // related-record popups, keeping modal1 free for delete-confirm/notify
  // (MosyAlertCard/MosyNotify) that might fire from an action taken
  // INSIDE this popped-open list.
  view_device_allocations: ({ rows }) => {
    const row = rows?.[0];
    if (!row) return;
    const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    MosyCard("", <DeviceallocationsList
      customProfilePath="../deviceallocations/profile"
      title={`Device allocations — ${displayName}`}
      fixedQuery={{ clientId: btoa(row.record_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default ClientsActions
