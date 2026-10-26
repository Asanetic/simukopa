// ActivityRevenueApiSchema.js — BACKEND schema (data shape only) for the "activity vs revenue" report.
// The frontend twin is examples/ActivityRevenueReport.js (labels, remarks, headline). Same keys on both sides.
// This file is the only thing you write per report; the route is a clone and never edited.
export const ActivityRevenueApiSchema = {
  entity: 'activity_vs_revenue',
  roles: { view: 'view_reports' },
  // tenantColumn: 'hive_site_id',      // default. Every query is scoped to the caller's site. null = global report.

  bucket: 'month',                      // day | month | year
  bucketOptions: ['month', 'day'],      // what the UI's Group-by may ask for (optional)
  cacheSeconds: 60,                     // same answer is shared by everyone in the tenant for a minute
  maxRangeDays: 1200,

  measures: [
    { key: 'activities', table: 'activities',       agg: 'count',                      by: 'activity_date' },
    { key: 'expected',   table: 'expected_revenue', agg: 'sum', col: 'expected_amount', by: 'revenue_month' },
    { key: 'collected',  table: 'payment_history',  agg: 'sum', col: 'amount',          by: 'payment_date',
      where: [{ col: 'status', op: '=', val: 'paid' }] },
  ],

  // optional URL filters; every measure must be mapped (or null = this measure ignores the filter)
  filters: [
    { param: 'owner', cols: { activities: 'user_id', expected: null, collected: null } },
  ],
};
