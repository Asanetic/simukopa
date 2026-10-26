// Dimev3 — Device Financing Dashboard
//
// Uses only verified tables and columns from the supplied schema.
// Tenant filtering is handled by the dashboard backend using the login token.
//
// No assumed loan status values.
// No invented columns.
// No invented tables.

export default {
  brand: 'Dimev3',
  tz: 'Africa/Nairobi',
  cacheMs: 15000,
  refreshMs: 30000,

  layout: [
    // --------------------------------------------------
    // FILTERS
    // --------------------------------------------------

    {
      kind: 'filters',
      id: 'filters',
      date: true,
      fields: [
        {
          key: 'payment_frequency',
          label: 'Payment Frequency',
          column: 'payment_frequency',
          optionsQuery: {
            table: 'loans',
            value: 'payment_frequency',
          },
        },
      ],
    },

    // --------------------------------------------------
    // KPI CARDS
    // --------------------------------------------------

    {
      kind: 'stats',
      id: 'kpis',
      items: [
        {
          id: 'clients',
          label: 'Total Clients',
          compare: true,
          className: 'od-grad-ocean',
          query: {
            table: 'clients',
          },
        },

        {
          id: 'devices',
          label: 'Total Devices',
          className: 'od-grad-ocean',
          query: {
            table: 'devices_list',
          },
        },

        {
          id: 'loansCount',
          label: 'Loans Issued',
          compare: true,
          query: {
            table: 'loans',
            dateCol: 'date_issued',
          },
        },

        {
          id: 'disbursed',
          label: 'Total Loaned Out',
          prefix: 'KES ',
          compare: true,
          className: 'od-grad-ocean',
          query: {
            table: 'loans',
            agg: 'sum',
            col: 'principal',
            dateCol: 'date_issued',
          },
        },

        {
          id: 'collected',
          label: 'Total Repayments',
          prefix: 'KES ',
          compare: true,
          className: 'od-grad-emerald',
          query: {
            table: 'loans_repayments',
            agg: 'sum',
            col: 'paid_amount',
            dateCol: 'payment_date',
          },
        },

        {
          id: 'outstanding',
          label: 'Outstanding Balance',
          prefix: 'KES ',
          className: 'od-grad-rose',
          query: {
            table: 'loans',
            agg: 'sum',
            col: 'balance',
          },
        },

        {
          id: 'deposits',
          label: 'Total Deposits',
          prefix: 'KES ',
          className: 'od-grad-emerald',
          query: {
            table: 'loans',
            agg: 'sum',
            col: 'deposit',
            dateCol: 'date_issued',
          },
        },

        {
          id: 'allocations',
          label: 'Device Allocations',
          query: {
            table: 'devices_allocations',
            dateCol: 'allocation_date',
          },
        },
      ],
    },

    // --------------------------------------------------
    // NEEDS YOUR ATTENTION
    // --------------------------------------------------

    {
      kind: 'attention',
      id: 'attention',
      title: 'Needs Your Attention',
      items: [
        {
          id: 'lockedDevices',
          text: '{n} devices are locked',
          tone: 'danger',
          query: {
            table: 'devices_list',
            where: [
              {
                col: 'lock_status',
                eq: 'locked',
                lower: true,
              },
            ],
          },
        },

        {
          id: 'outstandingLoans',
          text: '{n} loans have an outstanding balance',
          tone: 'warn',
          query: {
            table: 'loans',
            where: [
              {
                col: 'balance',
                gt: 0,
              },
            ],
          },
        },
      ],
    },

    // --------------------------------------------------
    // CHART 1: MONTHLY REPAYMENTS
    // --------------------------------------------------

    {
      kind: 'chart',
      id: 'collectionsMonthly',
      type: 'trend',
      title: 'Monthly Repayments Received',
      prefix: 'KES ',
      query: {
        table: 'loans_repayments',
        agg: 'sum',
        col: 'paid_amount',
        groupBy: {
          month: 'payment_date',
        },
      },
    },

    // --------------------------------------------------
    // CHART 2: MONTHLY LOAN DISBURSEMENTS
    // --------------------------------------------------

    {
      kind: 'chart',
      id: 'issuedMonthly',
      type: 'trend',
      title: 'Monthly Loans Issued',
      prefix: 'KES ',
      query: {
        table: 'loans',
        agg: 'sum',
        col: 'principal',
        groupBy: {
          month: 'date_issued',
        },
      },
    },

    // --------------------------------------------------
    // CHART 3: NUMBER OF LOANS ISSUED MONTHLY
    // --------------------------------------------------

    {
      kind: 'chart',
      id: 'loanCountMonthly',
      type: 'trend',
      title: 'Number of Loans Issued per Month',
      query: {
        table: 'loans',
        groupBy: {
          month: 'date_issued',
        },
      },
    },

    // --------------------------------------------------
    // CHART 4: DEVICES BY MODEL
    // --------------------------------------------------

    {
      kind: 'chart',
      id: 'devicesByModel',
      type: 'hbar',
      title: 'Devices by Model',
      span: 6,
      query: {
        table: 'devices_list',
        groupBy: 'model_name',
        limit: 10,
      },
    },

    // --------------------------------------------------
    // CHART 5: REPAYMENTS BY PAYMENT MODE
    // --------------------------------------------------

    {
      kind: 'chart',
      id: 'byMethod',
      type: 'hbar',
      title: 'Repayments by Payment Mode',
      prefix: 'KES ',
      span: 6,
      query: {
        table: 'loans_repayments',
        agg: 'sum',
        col: 'paid_amount',
        groupBy: 'payment_mode',
      },
    },

    // --------------------------------------------------
    // CHART 6: LOANS BY PAYMENT FREQUENCY
    // --------------------------------------------------

    {
      kind: 'chart',
      id: 'loansByFrequency',
      type: 'hbar',
      title: 'Loan Value by Payment Frequency',
      prefix: 'KES ',
      span: 12,
      query: {
        table: 'loans',
        agg: 'sum',
        col: 'principal',
        groupBy: 'payment_frequency',
      },
    },
  ],
};