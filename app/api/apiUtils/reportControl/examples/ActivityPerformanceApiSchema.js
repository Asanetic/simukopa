// ActivityPerformanceApiSchema.js — "which activity types perform?"  Rows are activity TYPES, not months.
// expected / collected live on the opportunity, activities point at the same opportunity, so the money is
// joined through it. credit:'split' shares an opportunity's money across its activity types by how many
// activities of each type it had (no double counting); credit:'full' gives every type the whole amount.
export const ActivityPerformanceApiSchema = {
  entity: 'activity_performance',
  roles: { view: 'view_reports' },
  bucket: 'dimension',
  cacheSeconds: 60,

  measures: [
    { key: 'activities', table: 'activities', agg: 'count', group: 'activity_type', by: 'activity_date' },
    { key: 'expected',   table: 'expected_revenue', agg: 'sum', col: 'expected_amount', by: 'revenue_month',
      join: { table: 'activities', from: 'deal_id', to: 'opportunity_id', group: 'activity_type', credit: 'split' } },
    { key: 'collected',  table: 'payment_history', agg: 'sum', col: 'amount', by: 'payment_date',
      where: [{ col: 'status', op: '=', val: 'paid' }],
      join: { table: 'activities', from: 'opportunity_id', to: 'opportunity_id', group: 'activity_type', credit: 'split' } },
  ],
};
