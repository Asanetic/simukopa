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

// <auto-relations:imports>
import React from 'react';
import { MosyCard } from "../../../components/MosyCard";
import ViewAllLink from "../../../components/ViewAllLink";
import { openEntityCreateModal, buildPresetFromRow } from "../../moduleControl/UiControl/EntityCreateModal";
import DevicesallocationsProfile from "../../devicesallocations/uiControl/DevicesallocationsProfile";
import LoansProfile from "../../loans/uiControl/LoansProfile";
import LoansrepaymentsProfile from "../../loansrepayments/uiControl/LoansrepaymentsProfile";
import RemindershistoryProfile from "../../remindershistory/uiControl/RemindershistoryProfile";
import { openSmartTagFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { openSmartDateFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { DevicesallocationsSchema } from "../../devicesallocations/DevicesallocationsSchema";
import { LoansSchema } from "../../loans/LoansSchema";
import { LoansrepaymentsSchema } from "../../loansrepayments/LoansrepaymentsSchema";
import { RemindershistorySchema } from "../../remindershistory/RemindershistorySchema";
// </auto-relations:imports>


const ClientsActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.

  // <auto-relations:actions>
  add_clients_devicesallocations: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const fk = DevicesallocationsSchema.fields?.find((f) => f.key === 'client_id');
    openEntityCreateModal({
      ProfileComponent: DevicesallocationsProfile,
      schema: DevicesallocationsSchema,
      title: `New Devices allocation — ${row.name || row.client_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'client_id', destKey: 'client_id', destSchema: DevicesallocationsSchema, labelValue: row.name },
        ]),
      },
      lockedFields: ['client_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_clients_loans: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const fk = LoansSchema.fields?.find((f) => f.key === 'client_id');
    openEntityCreateModal({
      ProfileComponent: LoansProfile,
      schema: LoansSchema,
      title: `New Loan — ${row.name || row.client_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'client_id', destKey: 'client_id', destSchema: LoansSchema, labelValue: row.name },
        ]),
      },
      lockedFields: ['client_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_clients_loansrepayments: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const fk = LoansrepaymentsSchema.fields?.find((f) => f.key === 'client_id');
    openEntityCreateModal({
      ProfileComponent: LoansrepaymentsProfile,
      schema: LoansrepaymentsSchema,
      title: `New Loans repayment — ${row.name || row.client_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'client_id', destKey: 'client_id', destSchema: LoansrepaymentsSchema, labelValue: row.name },
        ]),
      },
      lockedFields: ['client_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_clients_remindershistory: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const fk = RemindershistorySchema.fields?.find((f) => f.key === 'client_id');
    openEntityCreateModal({
      ProfileComponent: RemindershistoryProfile,
      schema: RemindershistorySchema,
      title: `New Reminders history — ${row.name || row.client_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'client_id', destKey: 'client_id', destSchema: RemindershistorySchema, labelValue: row.name },
        ]),
      },
      lockedFields: ['client_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  filter_clients_country: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by country',
    columnKey: 'country',
    combine: true,
  }),

  filter_clients_date_registered: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by date registered',
    columnKey: 'date_registered',
    inputType: 'datetime-local',
    combine: true,
  }),

  filter_clients_national_id_type: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by national id type',
    columnKey: 'national_id_type',
    combine: true,
  }),

  filter_clients_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by status',
    columnKey: 'status',
    combine: true,
  }),

  filter_clients_town: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by town',
    columnKey: 'town',
    combine: true,
  }),

  view_clients_devicesallocations: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const { default: DevicesallocationsList } = await import('../../devicesallocations/uiControl/DevicesallocationsList');
    const fixedQuery = { clientId: btoa(row.client_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/devicesallocations/list?${new URLSearchParams({ devices_allocations_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(DevicesallocationsList, {
        customProfilePath: '../devicesallocations/profile',
        title: `Devices allocations — ${row.name || row.client_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_clients_loans: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const { default: LoansList } = await import('../../loans/uiControl/LoansList');
    const fixedQuery = { clientId: btoa(row.client_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/loans/list?${new URLSearchParams({ loans_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(LoansList, {
        customProfilePath: '../loans/profile',
        title: `Loans — ${row.name || row.client_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_clients_loansrepayments: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const { default: LoansrepaymentsList } = await import('../../loansrepayments/uiControl/LoansrepaymentsList');
    const fixedQuery = { clientId: btoa(row.client_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/loansrepayments/list?${new URLSearchParams({ loans_repayments_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(LoansrepaymentsList, {
        customProfilePath: '../loansrepayments/profile',
        title: `Loans repayments — ${row.name || row.client_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_clients_remindershistory: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const { default: RemindershistoryList } = await import('../../remindershistory/uiControl/RemindershistoryList');
    const fixedQuery = { clientId: btoa(row.client_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/remindershistory/list?${new URLSearchParams({ reminders_history_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(RemindershistoryList, {
        customProfilePath: '../remindershistory/profile',
        title: `Reminders history — ${row.name || row.client_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },
  // </auto-relations:actions>
};


export default ClientsActions
