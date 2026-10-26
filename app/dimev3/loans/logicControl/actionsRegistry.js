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
import LoansrepaymentsProfile from "../../loansrepayments/uiControl/LoansrepaymentsProfile";
import RemindershistoryProfile from "../../remindershistory/uiControl/RemindershistoryProfile";
import { openSmartDateFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { openSmartTagFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { openSmartMapFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { ClientsSchema } from "../../clients/ClientsSchema";
import { DeviceslistSchema } from "../../deviceslist/DeviceslistSchema";
import { DevicesallocationsSchema } from "../../devicesallocations/DevicesallocationsSchema";
import { LoansrepaymentsSchema } from "../../loansrepayments/LoansrepaymentsSchema";
import { RemindershistorySchema } from "../../remindershistory/RemindershistorySchema";
// </auto-relations:imports>


const LoansActions = {
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
  add_loans_devicesallocations: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const fk = DevicesallocationsSchema.fields?.find((f) => f.key === 'loan_id');
    // other FKs this row shares with the form: carried over only when the row has a value, else left for the user to pick
    const carried = [
      { column: 'device_id', mirrors: [] },
      { column: 'client_id', mirrors: [] },
    ].filter(({ column }) => row[column] !== undefined && row[column] !== null && row[column] !== '');
    const carriedPreset = {};
    const carriedLocked = [];
    carried.forEach(({ column, mirrors }) => {
      const labelKey = DevicesallocationsSchema.fields?.find((f) => f.key === column)?.labelKey;
      const copies = [labelKey, ...mirrors].filter((k) => k && row[k] !== undefined);
      carriedPreset[column] = row[column];
      copies.forEach((k) => { carriedPreset[k] = row[k]; });
      carriedLocked.push(column, ...new Set([...(labelKey ? [labelKey] : []), ...copies]));
    });
    openEntityCreateModal({
      ProfileComponent: DevicesallocationsProfile,
      schema: DevicesallocationsSchema,
      title: `New Devices allocation — ${row.loan_id || row.loan_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'loan_id', destKey: 'loan_id', destSchema: DevicesallocationsSchema, labelValue: row.loan_id },
        ]),
        ...carriedPreset,
      },
      lockedFields: ['loan_id', fk?.labelKey, ...carriedLocked].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_loans_loansrepayments: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const fk = LoansrepaymentsSchema.fields?.find((f) => f.key === 'loan_id');
    // other FKs this row shares with the form: carried over only when the row has a value, else left for the user to pick
    const carried = [
      { column: 'client_id', mirrors: [] },
      { column: 'device_id', mirrors: [] },
    ].filter(({ column }) => row[column] !== undefined && row[column] !== null && row[column] !== '');
    const carriedPreset = {};
    const carriedLocked = [];
    carried.forEach(({ column, mirrors }) => {
      const labelKey = LoansrepaymentsSchema.fields?.find((f) => f.key === column)?.labelKey;
      const copies = [labelKey, ...mirrors].filter((k) => k && row[k] !== undefined);
      carriedPreset[column] = row[column];
      copies.forEach((k) => { carriedPreset[k] = row[k]; });
      carriedLocked.push(column, ...new Set([...(labelKey ? [labelKey] : []), ...copies]));
    });
    openEntityCreateModal({
      ProfileComponent: LoansrepaymentsProfile,
      schema: LoansrepaymentsSchema,
      title: `New Loans repayment — ${row.loan_id || row.loan_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'loan_id', destKey: 'loan_id', destSchema: LoansrepaymentsSchema, labelValue: row.loan_id },
        ]),
        ...carriedPreset,
      },
      lockedFields: ['loan_id', fk?.labelKey, ...carriedLocked].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_loans_remindershistory: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const fk = RemindershistorySchema.fields?.find((f) => f.key === 'loan_id');
    // other FKs this row shares with the form: carried over only when the row has a value, else left for the user to pick
    const carried = [
      { column: 'client_id', mirrors: [] },
      { column: 'device_id', mirrors: [] },
    ].filter(({ column }) => row[column] !== undefined && row[column] !== null && row[column] !== '');
    const carriedPreset = {};
    const carriedLocked = [];
    carried.forEach(({ column, mirrors }) => {
      const labelKey = RemindershistorySchema.fields?.find((f) => f.key === column)?.labelKey;
      const copies = [labelKey, ...mirrors].filter((k) => k && row[k] !== undefined);
      carriedPreset[column] = row[column];
      copies.forEach((k) => { carriedPreset[k] = row[k]; });
      carriedLocked.push(column, ...new Set([...(labelKey ? [labelKey] : []), ...copies]));
    });
    openEntityCreateModal({
      ProfileComponent: RemindershistoryProfile,
      schema: RemindershistorySchema,
      title: `New Reminders history — ${row.loan_id || row.loan_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'loan_id', destKey: 'loan_id', destSchema: RemindershistorySchema, labelValue: row.loan_id },
        ]),
        ...carriedPreset,
      },
      lockedFields: ['loan_id', fk?.labelKey, ...carriedLocked].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  filter_loans_clients: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by client',
    searchSchema: ClientsSchema,
    displayField: 'name',
    valueField: 'client_id',
    localColumnKey: 'client_id',
    combine: true,
  }),

  filter_loans_date_issued: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by date issued',
    columnKey: 'date_issued',
    inputType: 'datetime-local',
    combine: true,
  }),

  filter_loans_deviceslist: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by devices list',
    searchSchema: DeviceslistSchema,
    displayField: 'model_name',
    valueField: 'device_id',
    localColumnKey: 'device_id',
    combine: true,
  }),

  filter_loans_duration_type: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by duration type',
    columnKey: 'duration_type',
    combine: true,
  }),

  filter_loans_last_payment_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by last payment date',
    columnKey: 'last_payment_date',
    inputType: 'datetime-local',
    combine: true,
  }),

  filter_loans_next_payment_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by next payment date',
    columnKey: 'next_payment_date',
    inputType: 'datetime-local',
    combine: true,
  }),

  view_loans_clients_profile: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.client_id) return;
    const { default: ClientsList } = await import('../../clients/uiControl/ClientsList');
    const fixedQuery = { clientId: btoa(row.client_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/clients/list?${new URLSearchParams({ clients_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(ClientsList, {
        customProfilePath: '../clients/profile',
        title: `Client — ${row.name || ''}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_loans_devicesallocations: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const { default: DevicesallocationsList } = await import('../../devicesallocations/uiControl/DevicesallocationsList');
    const fixedQuery = { loanId: btoa(row.loan_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/devicesallocations/list?${new URLSearchParams({ devices_allocations_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(DevicesallocationsList, {
        customProfilePath: '../devicesallocations/profile',
        title: `Devices allocations — ${row.loan_id || row.loan_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_loans_deviceslist_profile: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const { default: DeviceslistList } = await import('../../deviceslist/uiControl/DeviceslistList');
    const fixedQuery = { deviceId: btoa(row.device_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/deviceslist/list?${new URLSearchParams({ devices_list_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(DeviceslistList, {
        customProfilePath: '../deviceslist/profile',
        title: `Devices list — ${row.model_name || ''}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_loans_loansrepayments: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const { default: LoansrepaymentsList } = await import('../../loansrepayments/uiControl/LoansrepaymentsList');
    const fixedQuery = { loanId: btoa(row.loan_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/loansrepayments/list?${new URLSearchParams({ loans_repayments_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(LoansrepaymentsList, {
        customProfilePath: '../loansrepayments/profile',
        title: `Loans repayments — ${row.loan_id || row.loan_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_loans_remindershistory: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const { default: RemindershistoryList } = await import('../../remindershistory/uiControl/RemindershistoryList');
    const fixedQuery = { loanId: btoa(row.loan_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/remindershistory/list?${new URLSearchParams({ reminders_history_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(RemindershistoryList, {
        customProfilePath: '../remindershistory/profile',
        title: `Reminders history — ${row.loan_id || row.loan_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },
  // </auto-relations:actions>
};


export default LoansActions
