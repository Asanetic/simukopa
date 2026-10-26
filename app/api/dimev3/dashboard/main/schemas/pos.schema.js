// THE dashboard schema for this app (POS): screen layout + queries in one place.
// `layout` renders top to bottom in this order. The browser receives it WITHOUT the queries/columns
// (route adds it when called with ?layout=1). Options are documented at the top of processor.js.
//
//   filters  { date?, fields:[{key,label,column,optionsQuery|options,tables?,type?}] }
//            A field filters EVERY card/chart whose query table matches its `tables` (default: the table its optionsQuery reads).
//            Nothing to wire on the cards. To exempt one card: query.filters:false. Remove the field → the filter is gone, cards unaffected.
//   attention { id, title?, items:[{ id, text:'{n} items low on stock', query (one number), href?, hrefFilter?, tone?:'danger'|'warn'|'info' }] }
//            "Needs your attention" list: rows whose count is 0 are hidden; none left → "all clear".
//   stats    { items:[{ id,label,href?,prefix?, col?, className?, query, compare?, alert? }] }
//            hrefFilter = { col, value, table? } opens the link pre-filtered: adds ?<table>_mosyfilter=btoa('<camelCol>=' + btoa(value)); col is camelCased (sale_status → saleStatus).
//                         table defaults to the card's query table. Works on charts too.
//            col       = Bootstrap column classes, default 'col-12 col-sm-6 col-lg-3' (4 per row on desktop).
//                        e.g. 'col-12 col-md-6' = 2 per row · 'col-6 col-lg-2' = 6 per row · 'col-12' = full row
//            className = ONE class that sets the card's background AND text colour. None → default look.
//                        presets: od-grad-ocean|sunset|emerald|violet|rose|midnight|gold|slate  (gradients, in origin-dashboard.css)
//                        or any of your own / Bootstrap ('bg-dark text-white'); write your own as `.od-stat.my-class {…}`.
//   chart    { id,type:'bar'|'hbar'|'trend'|'donut',title,href?,prefix?,unit?,span?, query }      span = columns of 12
//   grid     { id, ref, title?, props?, bare?, span? }       ref = name in the front end's gridRegistry.js
//   heading  { id, text, sub? }
// Tenant column (hive_site_id) is applied automatically from the login token.

// orders that count as sales (voided / cancelled ones are left out) — adjust to your real sale_status values
const COUNTED = { col: 'sale_status', notIn: ['cancelled', 'canceled', 'voided', 'void'], lower: true };

export default {
  brand: 'Ticksy POS',
  tz: 'Africa/Nairobi',   // "today" / month buckets are decided in this timezone
  cacheMs: 15000,         // computed at most once per this window per (site, range, filters)
  refreshMs: 30000,       // browser auto-refresh

  layout: [
    { kind: 'filters', id: 'filters', date: true,
      fields: [
        // filters sales_orders.sale_type for every card/chart on `sales_orders` (tables:[…] to change); choices come from the data
        //{ key: 'sale_type', label: 'Sale type', column: 'sale_type', optionsQuery: { table: 'sales_orders', value: 'sale_type' } },
      ] },

    { kind: 'stats', id: 'kpis', items: [
      { id: 'orders', label: 'Orders', href: '/ticksy/salesorders/list', hrefFilter: { col: 'sale_status', value: 'completed' }, compare: true,
        query: { table: 'sales_orders', dateCol: 'order_date', where: [COUNTED] } },

      { id: 'sales', label: 'Sales', prefix: 'KES ', className: 'od-grad-ocean', col: 'col-12 col-md-6', href: '/ticksy/salesorders/list', compare: true,
        query: { table: 'sales_orders', agg: 'sum', col: 'grand_total', dateCol: 'order_date', where: [COUNTED] } },

      { id: 'collected', label: 'Collected', prefix: 'KES ', href: '/ticksy/salesorderpayments/list', compare: true,
        query: { table: 'sales_order_payments', agg: 'sum', col: 'amount', dateCol: 'payment_date' } },

      { id: 'outstanding', label: 'Outstanding', prefix: 'KES ', href: '/ticksy/salesorders/list',
        query: { ranged: true, sql: `SELECT COALESCE(SUM(o.grand_total - o.total_paid), 0) AS value
          FROM {db}.sales_orders o
          WHERE (:site IS NULL OR o.hive_site_id = :site)
            AND (:fromTs IS NULL OR o.order_date >= :fromTs)
            AND (:toExclusive IS NULL OR o.order_date < :toExclusive)
            AND LOWER(o.sale_status) NOT IN ('cancelled', 'canceled', 'voided', 'void')` } },

      { id: 'matumizi', label: 'Expenses', prefix: 'KES ', href: '/ticksy/expenses/list', compare: true,
        query: { table: 'expenses', agg: 'sum', col: 'amount', dateCol: 'expense_date' } },

      { id: 'clients', label: 'Clients', href: '/ticksy/clients/list',
        query: { table: 'clients' } },

      { id: 'stockItems', label: 'Stock items', href: '/ticksy/inventory/list',
        query: { table: 'inventory' },
        alert: { text: '{n} low on stock',
          query: { sql: 'SELECT COUNT(*) AS value FROM {db}.inventory i WHERE (:site IS NULL OR i.hive_site_id = :site) AND i.available_quantity <= i.stock_alert' } } },
    ] },
    // rows with a count of 0 are hidden; the whole block says "all clear" when none remain
    { kind: 'attention', id: 'attention', title: 'Needs your attention', items: [
      // { id: 'lowStock', text: '{n} items low on stock', tone: 'danger', href: '/ticksy/inventory/list',
      //   query: { sql: 'SELECT COUNT(*) AS value FROM {db}.inventory i WHERE (:site IS NULL OR i.hive_site_id = :site) AND i.available_quantity <= i.stock_alert' } },
      { id: 'unpaidOrders', text: '{n} orders not fully paid', tone: 'warn', href: '/ticksy/salesorders/list',
        query: { sql: `SELECT COUNT(*) AS value FROM {db}.sales_orders o
          WHERE (:site IS NULL OR o.hive_site_id = :site) AND o.total_paid < o.grand_total
            AND LOWER(o.sale_status) NOT IN ('cancelled', 'canceled', 'voided', 'void')` } },
    ] },
    { kind: 'chart', id: 'byMethod', type: 'donut', title: 'Payment Methods', unit: 'KES', span: 5,
      query: { table: 'sales_order_payments', agg: 'sum', col: 'amount', dateCol: 'payment_date', groupBy: 'payment_method' } },

    { kind: 'chart', id: 'topProducts', type: 'hbar', title: 'Top Products', prefix: 'KES ', span: 7,
      query: { table: 'sales_order_items', agg: 'sum', col: 'total_price', dateCol: 'created_at', groupBy: 'product_name', limit: 8 } },



    { kind: 'chart', id: 'salesMonthly', type: 'trend', title: 'Sales by Month', prefix: 'KES ', href: '/ticksy/salesorders/list',
      query: { table: 'sales_orders', agg: 'sum', col: 'grand_total', where: [COUNTED], groupBy: { month: 'order_date' } } },

    { kind: 'chart', id: 'ordersMonthly', type: 'trend', title: 'Orders by Month', unit: 'orders', href: '/ticksy/salesorders/list',
      query: { table: 'sales_orders', where: [COUNTED], groupBy: { month: 'order_date' } } },

    { kind: 'chart', id: 'expensesByType', type: 'hbar', title: 'Expenses by Type', prefix: 'KES ', span: 6, href: '/ticksy/expenses/list',
      query: { table: 'expenses', agg: 'sum', col: 'amount', dateCol: 'expense_date', groupBy: 'expense_type' } },

    { kind: 'chart', id: 'clientsByCounty', type: 'hbar', title: 'Clients by County', span: 6, href: '/ticksy/clients/list',
      query: { table: 'clients', groupBy: 'county', limit: 8 } },

    { kind: 'grid', id: 'orders-list', ref: 'salesorders', bare: true, props: { title: 'Latest Sales Orders' } },
    { kind: 'grid', id: 'clients-list', ref: 'clients', bare: true },
  ],
};
