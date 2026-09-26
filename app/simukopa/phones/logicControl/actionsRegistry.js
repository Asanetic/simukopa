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

import { quickEditFromRow } from "../../moduleControl/UiControl/QuickEditModal";
import { openSmartMapFilter, openSmartTagFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { ClientsSchema } from "../../clients/ClientsSchema";
import { MosyCard } from "../../../components/MosyCard";
import { openUpdateLocationModal } from "../uiControl/UpdateLocationModal";

const PhonesActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Sets status (+ condition_status) via a quick-edit modal. route.js's PUT
  // base64Decode's the dataNode then matches WHERE primkey=<that>, so the
  // token has to be base64(primkey) — hence the explicit getId below (the
  // helper's own default keys off record_id). Fixed option list on status
  // (not the field's own groupedSelect, which only offers values some row
  // already has) so DAMAGED/RETURNED/RETIRED/SOLD are pickable before any
  // device has ever been given that status.
  update_status: (ctx) => {
    quickEditFromRow(ctx, {
      fieldKeys: ['status', 'condition_status'],
      title: 'Update status — {{brand_name}} {{model_name}}',
      fieldOverrides: {
        // status: {
        //   type: 'select',
        //   options: ['available', 'allocated', 'damaged', 'returned', 'retired', 'sold'],
        //   colSpan: 12,
        // },
        condition_status: { colSpan: 12 },
      },
      getId: (row) => btoa(String(row.primkey)),
    });
  },

  // Manual location override — its own popup (uiControl/UpdateLocationModal.jsx),
  // not the generic quickEditFromRow, so it can offer a "Use current
  // location" button backed by the browser's Geolocation API right next
  // to the text field. Fast path from the grid row dropdown or profile,
  // without opening the full form.
  update_location: (ctx) => openUpdateLocationModal(ctx),

  // Lock/unlock the device — same quick-edit-modal shape as update_status,
  // just a different field. lock_status is editable:false on the schema
  // (never hand-typed on the plain profile form), set only through this
  // action — fieldOverrides flips it back to editable so THIS modal's
  // select is actually usable, not rendered disabled.
  control_device: (ctx) => {
    quickEditFromRow(ctx, {
      fieldKeys: ['lock_status'],
      title: 'Control device — {{brand_name}} {{model_name}}',
      fieldOverrides: {
        lock_status: { editable: true, colSpan: 12 },
      },
      getId: (row) => btoa(String(row.primkey)),
    });
  },

  // Grid-toolbar smart filter — devices issued to a given client
  // (assigned_client_id, set by the loan-allocation wizard).
  filter_by_client: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by Client Issued',
    searchSchema: ClientsSchema,
    displayField: 'first_name',
    customDisplay: '{{first_name}} {{last_name}} - {{phone_number}}',
    valueField: 'record_id',
    localColumnKey: 'assigned_client_id',
  }),

  // Distinct values already on phones.status — not a hardcoded list.
  filter_by_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by status',
    columnKey: 'status',
  }),

  // Pops a Google Map MosyCard centered on this device's saved `location`
  // (either a free-text address or the "lat,lng" LocationTools.jsx's
  // detect writes) — Google's no-API-key embed URL accepts either. Reads
  // the last SAVED value (ctx.rows), not whatever's unsaved in an
  // open form — see LocationTools.jsx for why live edits aren't reachable
  // here.
  trace: ({ rows }) => {
    const row = rows?.[0];
    const location = row?.location;
    if (!location) {
      alert('No location has been recorded for this device yet.');
      return;
    }
    const src = `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`;
    MosyCard(
      `Device Location — ${row.brand_name || ''} ${row.model_name || ''}`,
      <iframe
        src={src}
        title="Device location"
        width="100%"
        height="480"
        style={{ border: 0 }}
        loading="lazy"
        allowFullScreen
      />,
      true,
      'modal3',
      'mosycard_wide'
    );
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default PhonesActions
