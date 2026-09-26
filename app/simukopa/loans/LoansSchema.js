// This is the ONLY file that changes when you clone this module.
// FRONTEND schema — full UI shape (showInList, profileActions, apiBase,
// rowLinks, customBlocks, sections, moduleRole, etc). The trimmed backend
// counterpart lives alongside this at the api/ path and only carries
// entity/fields/batchMutations/roles.

import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';
import { resolveField } from '../DataControl/simukopaSchema';
// Use default base root (/)
const apiRoutes = getApiRoutes();
const moduleApi = apiRoutes.loans.base;

export const LoansSchema = {
  entity: 'loans',
  label: 'Loans',
  apiBase: moduleApi,

  //api endpint for importing data from csv
  importDataEndpoint: apiRoutes.loans.import,

  // Page-level UI gate — see ClientsSchema.js for the moduleRole vs
  // per-action `role` distinction.
  moduleRole: 'view_loans',

  gridOptions: {
    checkBoxes: false,
    checkFunction: "gridCheckBoxAction"
  },

  multiGridRows: [],

  rowLinks: [],

  profileActions: [
    { key: 'back', label: 'Back to list', icon: 'arrow-left', variant: 'outline-secondary', navigateTo: '/simukopa/loans/list', grid: false, form: true },
    { key: 'save', label: 'Save', icon: 'save', variant: 'primary', grid: false, form: true, rowAction: false },
    { key: 'delete', label: 'Delete', icon: 'trash', variant: 'outline-danger', confirm: 'Are you sure you want to delete this loan?', editOnly: true, grid: false, form: true, rowAction: true, role: 'manage_loans' },
    { key: 'view', label: 'View more', icon: 'edit', rowAction: true },
    // Loans are only ever created by the loan-allocation wizard, same as
    // loan_applications' own 'new' button.
    { key: 'new', label: 'New Loan', icon: 'plus', variant: 'outline-primary', navigateTo: '/simukopa/loanallocation', grid: true, form: false, rowAction: false },
    { key: 'clone', label: 'Clone Record', icon: 'copy', variant: 'outline-secondary', editOnly: true, grid: false, form: true, rowAction: false, role: 'manage_loans' },

    // Grid-toolbar smart filters — handlers in logicControl/actionsRegistry.js.
    { key: 'filter_by_client', label: 'Client', icon: 'user', variant: 'outline-secondary', type: 'action', grid: true, form: false, rowAction: false },
    { key: 'filter_by_status', label: 'Status', icon: 'filter', variant: 'outline-secondary', type: 'action', grid: true, form: false, rowAction: false },

    // Jump to the linked records — same popup pattern loanapplications uses.
    { key: 'view_client', label: 'View Client', icon: 'user', variant: 'outline-secondary', type: 'action', editOnly: true, grid: false, form: true, rowAction: true },
    { key: 'view_device', label: 'View Device', icon: 'smartphone', variant: 'outline-secondary', type: 'action', editOnly: true, grid: false, form: true, rowAction: true },
    { key: 'view_application', label: 'View Application', icon: 'file-text', variant: 'outline-secondary', type: 'action', editOnly: true, grid: false, form: true, rowAction: true },
  ],

  customBlocks: [],

  fieldGroups: [],
  showInList: ['row_count', 'loan_id', 'client_name', 'phone_name', 'product_name', 'total_amount', 'deposit_amount', 'balance_amount', 'status', 'start_date'],

  exportColumns: ['loan_id', 'application_id', 'client_id', 'phone_id', 'model_id', 'product_id', 'contract_number', 'principal_amount', 'interest_amount', 'processing_fee', 'penalty_amount', 'total_amount', 'deposit_amount', 'balance_amount', 'start_date', 'end_date', 'payment_frequency', 'installment_amount'],

  sections: [
    { key: 'basic_information', label: 'Basic Information', columns: 3, fields: ['loan_id', 'client_id', 'phone_id', 'model_id', 'product_name', 'contract_number'] },
    { key: 'financials', label: 'Financials', columns: 3, fields: ['principal_amount', 'interest_amount', 'processing_fee', 'penalty_amount', 'total_amount', 'deposit_amount', 'balance_amount', 'installment_amount'] },
    { key: 'other_details', label: 'Other Details', columns: 3, fields: ['start_date', 'end_date', 'payment_frequency', 'status', 'default_status', 'approved_by', 'notes', 'reg_date'] },
  ],

  fields: [
    { key: 'primkey', label: 'Primkey', type: 'number', system: true, editable: false },
    { key: 'record_id', label: 'Record Id', type: 'text', system: true, editable: false },
    { key: 'loan_id', label: 'Loan Number', type: 'text', editable: false },
    // liveSearch pickers (basic_information section) + their cached
    // display names (client_name/phone_name/model_name, used in
    // showInList) — resolved from globalRelations via resolveField, same
    // convention loanapplications/phones use. Usually set by the
    // loan-allocation wizard, but resolveField's liveSearch input has no
    // readOnly/lock option, so these now double as manual reassignment
    // pickers if ever needed.
    ...resolveField('client_id', { as: 'client_name' }),
    ...resolveField('phone_id', { as: 'phone_name' }, { label: 'Phone / Device' }),
    ...resolveField('model_id', { as: 'model_name' }),
    ...resolveField('application_id', { as: 'application_ref' }, { label: 'Application Ref' }),
    // NOT resolveField('product_id', ...) — globalRelations' product_id
    // entry points at the wrong table (financing_products instead of
    // loan_plans), see the matching comment on productJoin in the backend
    // schema.js. Stays a plain hidden FK + hand-resolved product_name.
    { key: 'product_id', label: 'Product Id', type: 'hidden', editable: false },
    { key: 'product_name', label: 'Product', type: 'text', computed: true, editable: false },
    { key: 'contract_number', label: 'Contract Number', type: 'text' },
    { key: 'principal_amount', label: 'Principal Amount', type: 'money', sum: true },
    { key: 'interest_amount', label: 'Interest Amount', type: 'money', sum: true },
    { key: 'processing_fee', label: 'Processing Fee', type: 'money', sum: true },
    { key: 'penalty_amount', label: 'Penalty Amount', type: 'money', sum: true },
    { key: 'total_amount', label: 'Total Amount', type: 'money', sum: true },
    { key: 'deposit_amount', label: 'Deposit Amount', type: 'money', sum: true },
    { key: 'balance_amount', label: 'Balance Amount', type: 'money', sum: true },
    { key: 'start_date', label: 'Start Date', type: 'datetime' },
    { key: 'end_date', label: 'End Date', type: 'datetime' },
    { key: 'payment_frequency', label: 'Payment Frequency', type: 'select', options: ['daily', 'weekly', 'monthly'] },
    { key: 'installment_amount', label: 'Installment Amount', type: 'money' },
    { key: 'status', label: 'Status', type: 'groupedSelect', endpoint: moduleApi, groupByField: 'status' },
    { key: 'default_status', label: 'Default Status', type: 'groupedSelect', endpoint: moduleApi, groupByField: 'default_status' },
    { key: 'notes', label: 'Notes', type: 'textarea', colSpan: 12 },
    { key: 'approved_by', label: 'Approved By', type: 'text' },
    { key: 'reg_date', label: 'Reg Date', type: 'datetime', editable: false },
    { key: 'row_count', label: '#', type: 'number', computed: true, editable: false },
  ],

  filters: [
    { key: 'all', label: 'All', query: {} },
  ],

  actions: [],

  // Optional: only needed if permission keys don't follow the
  // view_<entity> / manage_<entity> default.
  // roles: { view: 'view_loans', manage: 'manage_loans' },
};
