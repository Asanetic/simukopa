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

import { openSmartTagFilter, openSmartDateFilter, openSmartMapFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { ClientsSchema } from "../../clients/ClientsSchema";
import { LoanplansSchema } from "../../loanplans/LoanplansSchema";
import MessagesList from "../../messages/uiControl/MessagesList";
import ClientsList from "../../clients/uiControl/ClientsList";
import PhonesList from "../../phones/uiControl/PhonesList";
import { MosyCard } from "../../../components/MosyCard";

const LoanapplicationsActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Grid-toolbar filters — all `combine: true` so Client + Product + Date
  // + Status stack as AND (setAdvancedQuery's default is EXCLUSIVE/
  // replace; combine opts into merge, see smartFilterActions.jsx).
  filter_by_client: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by Client',
    searchSchema: ClientsSchema,
    displayField: 'first_name',
    customDisplay: '{{first_name}} {{last_name}} - {{phone_number}}',
    valueField: 'record_id',
    localColumnKey: 'client_id',
    combine: true,
  }),

  filter_by_product: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by Product (Loan Plan)',
    searchSchema: LoanplansSchema,
    displayField: 'plan_name',
    valueField: 'record_id',
    localColumnKey: 'product_id',
    combine: true,
  }),

  filter_by_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by application date',
    columnKey: 'application_date',
    inputType: 'date',
    combine: true,
  }),

  // Distinct values already on loan_applications.status (approved/pending/
  // rejected/whatever real data has) — not a hardcoded list.
  filter_by_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by status',
    columnKey: 'status',
    combine: true,
  }),

  // Popup the linked client — ClientsList scoped down to just this one row
  // via fixedQuery.recordId, the built-in "match this table's own
  // record_id" alias every module's route.js supports (no client-specific
  // param name needed). Same modal3 slot/shape as view_messages below.
  view_client: ({ rows }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    MosyCard("", <ClientsList
      customProfilePath="../clients/profile"
      title={`Client — ${row.client_name || ''}`}
      fixedQuery={{ recordId: btoa(row.client_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Same idea for the linked device (phone_id -> phones.record_id).
  view_device: ({ rows }) => {
    const row = rows?.[0];
    if (!row?.phone_id) return;
    MosyCard("", <PhonesList
      customProfilePath="../phones/profile"
      title={`Device — ${row.phone_name || ''}`}
      fixedQuery={{ recordId: btoa(row.phone_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Popup the messages sent to this application's client — messages don't
  // carry an application_id of their own, only a generic related_record_id
  // (used the same way for "linked to a client" across this app), so this
  // scopes by client_id rather than the application's own record_id.
  // modal3, not modal1 — same slot imsv2's revenueplan uses for its own
  // view_call_history/view_message_history popups, keeping modal1 free
  // for delete-confirm/notify (MosyAlertCard/MosyNotify) that might fire
  // from an action taken INSIDE this popped-open list.
  view_messages: ({ rows }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    MosyCard("", <MessagesList
      customProfilePath="../messages/profile"
      title={`Messages — ${row.client_name || ''}`}
      fixedQuery={{ relatedRecordId: btoa(row.client_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default LoanapplicationsActions
