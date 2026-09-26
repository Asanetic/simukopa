// BACKEND schema (trimmed) — data-shape-only counterpart to the frontend
// schema.js at the matching app/ path. See PhonesSchema.js/ClientsSchema.js
// (same folder depth) for the full convention this follows.

import { resolveJoin } from '../../simukopaSchema';

export const LoansSchema = {
  entity: 'loans',

  moduleRole: 'view_loans',

  fields: [
    { key: 'primkey', type: 'number', system: true, editable: false },
    { key: 'record_id', type: 'text', system: true, editable: false },
    { key: 'client_id', type: 'text', searchable: true },
    { key: 'phone_id', type: 'text', searchable: true },
    { key: 'model_id', type: 'text', searchable: true },
    { key: 'product_id', type: 'text', searchable: true },
    { key: 'contract_number', type: 'text', searchable: true },
    { key: 'principal_amount', type: 'money' },
    { key: 'interest_amount', type: 'money' },
    { key: 'processing_fee', type: 'money' },
    { key: 'penalty_amount', type: 'money' },
    { key: 'total_amount', type: 'money' },
    { key: 'deposit_amount', type: 'money' },
    { key: 'balance_amount', type: 'money' },
    { key: 'start_date', type: 'datetime' },
    { key: 'end_date', type: 'datetime' },
    { key: 'payment_frequency', type: 'text', searchable: true },
    { key: 'installment_amount', type: 'money' },
    { key: 'status', type: 'groupedSelect', endpoint: '/api/simukopa/loans/list', groupByField: 'status', searchable: true },
    { key: 'default_status', type: 'groupedSelect', endpoint: '/api/simukopa/loans/list', groupByField: 'default_status', searchable: true },
    { key: 'notes', type: 'textarea', colSpan: 3, searchable: true },
    { key: 'approved_by', type: 'text', searchable: true },
    { key: 'reg_date', type: 'datetime' },
    { key: 'hive_site_id', type: 'text', searchable: true },
    { key: 'hive_site_name', type: 'text', title: true, searchable: true },
    { key: 'row_count', type: 'number', computed: true, editable: false },
  ],

  // client/phone/model/application FK lookups go through resolveJoin
  // (globalRelations, ../../simukopaSchema.js) — same convention this app's
  // loanapplications/phones schemas use.
  batchMutations: {
    ...resolveJoin('client_id', { as: 'client_name' }),
    ...resolveJoin('phone_id', { as: 'phone_name' }),
    ...resolveJoin('model_id', { as: 'model_name' }),
    ...resolveJoin('application_id', { as: 'application_ref' }),
    // NOT resolveJoin('product_id', ...): globalRelations' product_id
    // entry points at `financing_products`, but the loan-allocation wizard
    // (app/api/simukopa/loanallocation/route.js) actually writes
    // loan_plans.record_id into this column — confirmed against the live
    // DB. Same discrepancy noted on loanapplications' productJoin.
    productJoin: {
      type: 'join', table: 'loan_plans', link: 'product_id:record_id',
      select: { product_name: 'plan_name' },
    },
  },

  roles: { view: 'view_loans', manage: 'manage_loans' },
};
