'use client';
import { PhonesSchema } from '../PhonesSchema';
import PhonesActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';

const fmt = (n) => Number(n || 0).toLocaleString();

// Receives the same `g` the grid uses, so the cards follow search,
// filters and paging automatically.
function phonesStats(g) {
  const rows = g.rows || [];
  const count = (fn) => rows.filter(fn).length;
  const isStatus = (s) => (r) => String(r.status || '').toLowerCase() === s;

  return [
    {
      key: 'total',
      label: 'Total Phones',
      value: fmt(g.totalCount ?? rows.length),
      sub: `${rows.length} on this page`,
      icon: 'mobile',
      tone: 'blue',
    },
    {
      key: 'active',
      label: 'Active',
      value: fmt(count(isStatus('active'))),
      sub: 'on this page',
      icon: 'check-circle',
      tone: 'green',
    },
    {
      key: 'inactive',
      label: 'Inactive',
      value: fmt(count(isStatus('inactive'))),
      sub: 'on this page',
      icon: 'ban',
      tone: 'red',
    },
    {
      key: 'value',
      label: 'Stock Value',
      // uses the sum:true total if `price` has sum:true in the schema,
      // otherwise sums the current page
      value: `KES ${fmt(g.columnTotals?.price ?? rows.reduce((s, r) => s + Number(r.price || 0), 0))}`,
      sub: `${new Set(rows.map((r) => r.brand).filter(Boolean)).size} brands`,
      icon: 'money',
      tone: 'amber',
    },
  ];
}

export default function PhonesList({
  fixedQuery = {},
  dataOut = {},
  title = PhonesSchema.label,
  description = `${PhonesSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PhonesActions,
  schema = PhonesSchema,
  hiddenActions = [],
  stats = [], // pass [] to hide cards when embedded elsewhere
}) {
  return (
    <SmartGridPro
      moduleActions={moduleActions}
      schema={schema}
      title={title}
      description={description}
      customProfilePath={customProfilePath}
      fixedQuery={fixedQuery}
      dataOut={dataOut}
      hiddenActions={hiddenActions}
      stats={stats}
    />
  );
}