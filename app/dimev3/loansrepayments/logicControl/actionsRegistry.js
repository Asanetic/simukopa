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
import { openSmartDateFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { openSmartTagFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { openSmartMapFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { ClientsSchema } from "../../clients/ClientsSchema";
import { DeviceslistSchema } from "../../deviceslist/DeviceslistSchema";
import { LoansSchema } from "../../loans/LoansSchema";
// </auto-relations:imports>


const LoansrepaymentsActions = {
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
  filter_loansrepayments_clients: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by client',
    searchSchema: ClientsSchema,
    displayField: 'name',
    valueField: 'client_id',
    localColumnKey: 'client_id',
    combine: true,
  }),

  filter_loansrepayments_deviceslist: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by devices list',
    searchSchema: DeviceslistSchema,
    displayField: 'model_name',
    valueField: 'device_id',
    localColumnKey: 'device_id',
    combine: true,
  }),

  filter_loansrepayments_loans: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by loan',
    searchSchema: LoansSchema,
    displayField: 'loan_id',
    valueField: 'loan_id',
    localColumnKey: 'loan_id',
    combine: true,
  }),

  filter_loansrepayments_payment_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by payment date',
    columnKey: 'payment_date',
    inputType: 'datetime-local',
    combine: true,
  }),

  filter_loansrepayments_payment_mode: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by payment mode',
    columnKey: 'payment_mode',
    combine: true,
  }),

  view_loansrepayments_clients_profile: async ({ rows, router }) => {
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

  view_loansrepayments_deviceslist_profile: async ({ rows, router }) => {
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

  view_loansrepayments_loans_profile: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.loan_id) return;
    const { default: LoansList } = await import('../../loans/uiControl/LoansList');
    const fixedQuery = { loanId: btoa(row.loan_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/loans/list?${new URLSearchParams({ loans_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(LoansList, {
        customProfilePath: '../loans/profile',
        title: `Loan — ${row.loan_id_2 || ''}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },
  // </auto-relations:actions>
};


export default LoansrepaymentsActions
