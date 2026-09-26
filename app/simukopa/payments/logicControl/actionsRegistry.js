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
import ClientsList from "../../clients/uiControl/ClientsList";
import LoansList from "../../loans/uiControl/LoansList";
import PaymentsList from "../uiControl/PaymentsList";
import { MosyCard } from "../../../components/MosyCard";

const PaymentsActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Grid-toolbar filters — all `combine: true` so Client + Date + Status
  // stack as AND (setAdvancedQuery's default is EXCLUSIVE/replace).
  filter_by_client: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by Client',
    searchSchema: ClientsSchema,
    displayField: 'first_name',
    customDisplay: '{{first_name}} {{last_name}} - {{phone_number}}',
    valueField: 'record_id',
    localColumnKey: 'client_id',
    combine: true,
  }),

  filter_by_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by payment date',
    columnKey: 'payment_date',
    inputType: 'date',
    combine: true,
  }),

  // Distinct values already on payments.status — not a hardcoded list.
  filter_by_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by status',
    columnKey: 'status',
    combine: true,
  }),

  // Popup this payment's OWN module (PaymentsList), scoped to every
  // payment against the same loan — a real payment history, not just
  // this one row. Same "scoped list via fixedQuery" pattern loanapplications'/
  // loans' popups use, modal3 slot (see loanapplications/logicControl/
  // actionsRegistry.js for why not modal1).
  view_payment_history: ({ rows }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    MosyCard("", <PaymentsList
      customProfilePath="../payments/profile"
      title={`Payment History — ${row.loan_ref || ''}`}
      fixedQuery={{ loanId: btoa(row.loan_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Popup the linked client/loan — same "scoped list via
  // fixedQuery.recordId" pattern loanapplications'/loans'/deviceallocations'
  // view_client/view_loan use.
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

  view_loan: ({ rows }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    MosyCard("", <LoansList
      customProfilePath="../loans/profile"
      title={`Loan — ${row.loan_ref || ''}`}
      fixedQuery={{ recordId: btoa(row.loan_id) }}
      hiddenActions={['new']}
    />, true, "modal3", "mosycard_wide");
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default PaymentsActions
