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
import PaytriggerlogsProfile from "../../paytriggerlogs/uiControl/PaytriggerlogsProfile";
import RemindershistoryProfile from "../../remindershistory/uiControl/RemindershistoryProfile";
import { openSmartTagFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { openSmartDateFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { DevicesallocationsSchema } from "../../devicesallocations/DevicesallocationsSchema";
import { LoansSchema } from "../../loans/LoansSchema";
import { LoansrepaymentsSchema } from "../../loansrepayments/LoansrepaymentsSchema";
import { PaytriggerlogsSchema } from "../../paytriggerlogs/PaytriggerlogsSchema";
import { RemindershistorySchema } from "../../remindershistory/RemindershistorySchema";
// </auto-relations:imports>


const DeviceslistActions = {
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
  add_deviceslist_devicesallocations: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const fk = DevicesallocationsSchema.fields?.find((f) => f.key === 'device_id');
    openEntityCreateModal({
      ProfileComponent: DevicesallocationsProfile,
      schema: DevicesallocationsSchema,
      title: `New Devices allocation — ${row.model_name || row.device_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'device_id', destKey: 'device_id', destSchema: DevicesallocationsSchema, labelValue: row.model_name },
        ]),
      },
      lockedFields: ['device_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_deviceslist_loans: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const fk = LoansSchema.fields?.find((f) => f.key === 'device_id');
    openEntityCreateModal({
      ProfileComponent: LoansProfile,
      schema: LoansSchema,
      title: `New Loan — ${row.model_name || row.device_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'device_id', destKey: 'device_id', destSchema: LoansSchema, labelValue: row.model_name },
        ]),
      },
      lockedFields: ['device_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_deviceslist_loansrepayments: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const fk = LoansrepaymentsSchema.fields?.find((f) => f.key === 'device_id');
    openEntityCreateModal({
      ProfileComponent: LoansrepaymentsProfile,
      schema: LoansrepaymentsSchema,
      title: `New Loans repayment — ${row.model_name || row.device_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'device_id', destKey: 'device_id', destSchema: LoansrepaymentsSchema, labelValue: row.model_name },
        ]),
      },
      lockedFields: ['device_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_deviceslist_paytriggerlogs: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const fk = PaytriggerlogsSchema.fields?.find((f) => f.key === 'device_id');
    openEntityCreateModal({
      ProfileComponent: PaytriggerlogsProfile,
      schema: PaytriggerlogsSchema,
      title: `New Paytrigger log — ${row.model_name || row.device_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'device_id', destKey: 'device_id', destSchema: PaytriggerlogsSchema, labelValue: row.model_name },
        ]),
      },
      lockedFields: ['device_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  add_deviceslist_remindershistory: ({ rows, refresh }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const fk = RemindershistorySchema.fields?.find((f) => f.key === 'device_id');
    openEntityCreateModal({
      ProfileComponent: RemindershistoryProfile,
      schema: RemindershistorySchema,
      title: `New Reminders history — ${row.model_name || row.device_id}`,
      presetValues: {
        ...buildPresetFromRow(row, [
          { sourceKey: 'device_id', destKey: 'device_id', destSchema: RemindershistorySchema, labelValue: row.model_name },
        ]),
      },
      lockedFields: ['device_id', fk?.labelKey].filter(Boolean), // mapped from the row: not shown, not editable, still saved
      onSaved: refresh,
    });
  },

  filter_deviceslist_lock_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by lock status',
    columnKey: 'lock_status',
    combine: true,
  }),

  filter_deviceslist_purchase_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by purchase date',
    columnKey: 'purchase_date',
    inputType: 'datetime-local',
    combine: true,
  }),

  filter_deviceslist_status: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by status',
    columnKey: 'status',
    combine: true,
  }),

  view_deviceslist_devicesallocations: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const { default: DevicesallocationsList } = await import('../../devicesallocations/uiControl/DevicesallocationsList');
    const fixedQuery = { deviceId: btoa(row.device_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/devicesallocations/list?${new URLSearchParams({ devices_allocations_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(DevicesallocationsList, {
        customProfilePath: '../devicesallocations/profile',
        title: `Devices allocations — ${row.model_name || row.device_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_deviceslist_loans: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const { default: LoansList } = await import('../../loans/uiControl/LoansList');
    const fixedQuery = { deviceId: btoa(row.device_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/loans/list?${new URLSearchParams({ loans_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(LoansList, {
        customProfilePath: '../loans/profile',
        title: `Loans — ${row.model_name || row.device_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_deviceslist_loansrepayments: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const { default: LoansrepaymentsList } = await import('../../loansrepayments/uiControl/LoansrepaymentsList');
    const fixedQuery = { deviceId: btoa(row.device_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/loansrepayments/list?${new URLSearchParams({ loans_repayments_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(LoansrepaymentsList, {
        customProfilePath: '../loansrepayments/profile',
        title: `Loans repayments — ${row.model_name || row.device_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_deviceslist_paytriggerlogs: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const { default: PaytriggerlogsList } = await import('../../paytriggerlogs/uiControl/PaytriggerlogsList');
    const fixedQuery = { deviceId: btoa(row.device_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/paytriggerlogs/list?${new URLSearchParams({ paytrigger_logs_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(PaytriggerlogsList, {
        customProfilePath: '../paytriggerlogs/profile',
        title: `Paytrigger logs — ${row.model_name || row.device_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },

  view_deviceslist_remindershistory: async ({ rows, router }) => {
    const row = rows?.[0];
    if (!row?.device_id) return;
    const { default: RemindershistoryList } = await import('../../remindershistory/uiControl/RemindershistoryList');
    const fixedQuery = { deviceId: btoa(row.device_id) };
    // "View more" link: the list page reads <entity>_mosyfilter through MosySecureFilterEngine
    // (value = base64 of "key=<base64 value>&..."), the same format as multiGridRows links.
    const href = `/dimev3/remindershistory/list?${new URLSearchParams({ reminders_history_mosyfilter: btoa(new URLSearchParams(fixedQuery).toString()) })}`;
    MosyCard('', React.createElement(React.Fragment, null,
      React.createElement(RemindershistoryList, {
        customProfilePath: '../remindershistory/profile',
        title: `Reminders history — ${row.model_name || row.device_id}`,
        fixedQuery,
        hiddenActions: ['new'],
      }),
      React.createElement(ViewAllLink, { href, label: 'View more', onNavigate: router ? (url) => router.push(url) : undefined }),
    ), true, 'modal4', 'mosycard_wide');
  },
  // </auto-relations:actions>
};


export default DeviceslistActions
