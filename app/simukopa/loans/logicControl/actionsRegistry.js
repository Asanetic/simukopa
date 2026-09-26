/**
 * Register real behavior here, once per action key. Both grid rowLinks
 * AND profile-level buttons (schema.profileActions) route through this
 * SAME registry — one place to add new behavior, works everywhere.
 *
 * Every registered function receives ONE ctx object instead of a fixed
 * list of positional args — see actionRegistryDocs.md (same folder) for
 * the full ctx field list and worked examples for every action shape
 * used elsewhere in this app.
 *
 * NOTE: "delete" and "clone" are intercepted directly by
 * useEntityFormController before they ever reach this registry — don't
 * register functions under those two keys, they will never fire.
 */

import { openSmartTagFilter, openSmartMapFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { ClientsSchema } from "../../clients/ClientsSchema";
import ClientsList from "../../clients/uiControl/ClientsList";
import PhonesList from "../../phones/uiControl/PhonesList";
import LoanapplicationsList from "../../loanapplications/uiControl/LoanapplicationsList";
import { MosyCard } from "../../../components/MosyCard";

const LoansActions = {
  // Bound by gridOptions.checkFunction in schema.js.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.loan_id || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  filter_by_client: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by Client',
    searchSchema: ClientsSchema,
    displayField: 'first_name',
    customDisplay: '{{first_name}} {{last_name}} - {{phone_number}}',
    valueField: 'record_id',
    localColumnKey: 'client_id',
  }),

  // Distinct values already on loans.status — not a hardcoded list.
  filter_by_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by status',
    columnKey: 'status',
  }),

  // Popup the linked client/device/application — same "scoped list via
  // fixedQuery.recordId" pattern loanapplications' view_client/view_device
  // use, modal3 slot (see loanapplications/logicControl/actionsRegistry.js
  // for why not modal1).
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

  // record_id -> loan_applications.record_id (the application this
  // loan was created from).
  view_application: ({ rows }) => {
    const row = rows?.[0];
    console.log(`view_application`, row)

    if (!row?.record_id) return;
    MosyCard("", <LoanapplicationsList
      customProfilePath="../loanapplications/profile"
      title={`Application — ${row.application_ref || ''}`}
      fixedQuery={{ recordId: btoa(row.record_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
};


export default LoansActions
