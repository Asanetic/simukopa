// Simu ya Mkopo (device financing) dashboard: screen layout + queries in one file.
// Guide: "Dashboard Schema Guide". Tenant column (hive_site_id) is applied automatically from the login token.
//
// A card or chart can open its list pre-filtered: href:'/simukopa/loans/list', hrefFilter:{ col:'status', value:'active' }
//   → ?loans_mosyfilter=btoa('status=' + btoa('active'))   (col is camelCased: sale_status → saleStatus)   (table defaults to the query's table; set hrefFilter.table to override)
//
// ASSUMED values (check against your real data, then edit the two constants below):
//   payments.status       reversed / failed / cancelled payments are left out
//   loans.status          'active' = a loan currently being repaid
//   phones.lock_status    'locked' = device remotely locked
//   loan_applications.status  'pending' = waiting for a decision

const PAID = { col: 'status', notIn: ['reversed', 'failed', 'cancelled', 'canceled'], lower: true };   // payments that count
const ACTIVE = { col: 'status', eq: 'active', lower: true };                                        // loans being repaid

export default {
  brand: 'Simu ya Mkopo',
  tz: 'Africa/Nairobi',
  cacheMs: 15000,
  refreshMs: 30000,

  layout: [
    { kind: 'filters', id: 'filters', date: true,
      fields: [
        // filters every card/chart that reads the `loans` table; choices come from the data
        { key: 'payment_frequency', label: 'Frequency', column: 'payment_frequency', optionsQuery: { table: 'loans', value: 'payment_frequency' } },
      ] },

    { kind: 'stats', id: 'kpis', items: [
      { id: 'collected', label: 'Collected', prefix: 'KES ', compare: true, className: 'od-grad-emerald',
        query: { table: 'payments', agg: 'sum', col: 'amount', dateCol: 'payment_date', where: [PAID] } },

      { id: 'disbursed', label: 'Loans issued', prefix: 'KES ', compare: true,
        query: { table: 'loans', agg: 'sum', col: 'principal_amount', dateCol: 'start_date' } },

      { id: 'outstanding', label: 'Outstanding balance', prefix: 'KES ', className: 'od-grad-ocean',
        query: { table: 'loans', agg: 'sum', col: 'balance_amount', where: [ACTIVE] } },

      { id: 'overdue', label: 'Overdue amount', prefix: 'KES ', className: 'od-grad-rose',
        query: { sql: `SELECT COALESCE(SUM(i.balance_amount), 0) AS value
          FROM {db}.loan_installments i
          WHERE (:site IS NULL OR i.hive_site_id = :site)
            AND i.due_date < CURDATE() AND i.balance_amount > 0`,
        },
        alert: { text: '{n} installments late',
          query: { sql: `SELECT COUNT(*) AS value FROM {db}.loan_installments i
            WHERE (:site IS NULL OR i.hive_site_id = :site) AND i.due_date < CURDATE() AND i.balance_amount > 0` } } },

      { id: 'activeLoans', label: 'Active loans',
        query: { table: 'loans', where: [ACTIVE] } },

      { id: 'pendingApps', label: 'Pending applications',
        query: { table: 'loan_applications', where: [{ col: 'status', eq: 'pending', lower: true }] } },

      { id: 'clients', label: 'Clients', compare: true,
        query: { table: 'clients', dateCol: 'reg_date' } },

      { id: 'devices', label: 'Devices',
        query: { table: 'phones' },
        alert: { text: '{n} locked',
          query: { sql: `SELECT COUNT(*) AS value FROM {db}.phones p
            WHERE (:site IS NULL OR p.hive_site_id = :site) AND LOWER(p.lock_status) = 'locked'` } } },
    ] },

    { kind: 'attention', id: 'attention', title: 'Needs your attention', /* href: '/simukopa/...' → "View All" link in the header */ items: [
      { id: 'lateInstallments', text: '{n} installments are overdue', tone: 'danger',
        query: { sql: `SELECT COUNT(*) AS value FROM {db}.loan_installments i
          WHERE (:site IS NULL OR i.hive_site_id = :site) AND i.due_date < CURDATE() AND i.balance_amount > 0` } },
      { id: 'pendingApplications', text: '{n} loan applications waiting for a decision', tone: 'warn',
        href: '/simukopa/loanapplications/list', hrefFilter: { col: 'status', value: 'pending' },   // opens the list already filtered
        query: { table: 'loan_applications', where: [{ col: 'status', eq: 'pending', lower: true }] } },
      { id: 'lockedDevices', text: '{n} devices are locked', tone: 'info',
        query: { sql: `SELECT COUNT(*) AS value FROM {db}.phones p
          WHERE (:site IS NULL OR p.hive_site_id = :site) AND LOWER(p.lock_status) = 'locked'` } },
    ] },

    { kind: 'chart', id: 'collectionsMonthly', type: 'trend', title: 'Collections by Month', prefix: 'KES ',
      query: { table: 'payments', agg: 'sum', col: 'amount', where: [PAID], groupBy: { month: 'payment_date' } } },

    { kind: 'chart', id: 'issuedMonthly', type: 'trend', title: 'Loans Issued by Month', prefix: 'KES ',
      query: { table: 'loans', agg: 'sum', col: 'principal_amount', groupBy: { month: 'start_date' } } },

    { kind: 'chart', id: 'loansByStatus', type: 'donut', title: 'Loans by Status', unit: 'loans', span: 5,
      query: { table: 'loans', dateCol: 'start_date', groupBy: 'status' } },

    { kind: 'chart', id: 'byMethod', type: 'hbar', title: 'Payments by Method', prefix: 'KES ', span: 7,
      query: { table: 'payments', agg: 'sum', col: 'amount', dateCol: 'payment_date', where: [PAID], groupBy: 'payment_method' } },

    { kind: 'chart', id: 'loansByModel', type: 'hbar', title: 'Loans by Phone Model', span: 6,
      query: { table: 'loans', dateCol: 'start_date', limit: 8,
               groupBy: { col: 'model_id', label: { table: 'phone_models', key: 'model_id', col: 'model_name' } } } },

    { kind: 'chart', id: 'applicationsByStatus', type: 'hbar', title: 'Applications by Status', span: 6,
      query: { table: 'loan_applications', dateCol: 'application_date', groupBy: 'status' } },

    { kind: 'chart', id: 'clientsByCounty', type: 'hbar', title: 'Clients by County', span: 12, 
      query: { table: 'clients', groupBy: 'county', limit: 8 } },
  ],
};
