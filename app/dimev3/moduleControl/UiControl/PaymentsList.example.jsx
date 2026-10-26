'use client';
// Example wrapper — same thin-list pattern as PhonesList, now on SmartGridInsight.
// Swap field keys (amount, channel, branch, status) for your schema's.
import { PaymentsSchema } from '../PaymentsSchema';
import PaymentsActions from '../logicControl/actionsRegistry';
import SmartGridInsight from '../../moduleControl/UiControl/SmartGridInsight';

const kes = (n) => `KES ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const kesShort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

// Group current rows by a field and sum amounts. Page-scoped — if your
// API returns a `summary`, read g.summary here instead for all-records totals.
const groupSum = (rows, key) => {
  const map = {};
  rows.forEach((r) => { map[r[key] || 'Other'] = (map[r[key] || 'Other'] || 0) + Number(r.amount || 0); });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, display: kes(value) }));
};

const paymentStats = (g) => {
  const rows = g.rows || [];
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const branches = new Set(rows.map((r) => r.branch).filter(Boolean));
  const channels = [...new Set(rows.map((r) => r.channel).filter(Boolean))];
  return [
    { key: 'amount', label: 'Total Amount', value: kes(total), change: '+12.5%', sub: 'vs previous period', icon: 'database', tone: 'green' },
    { key: 'count', label: 'Total Transactions', value: Number(g.totalCount ?? rows.length).toLocaleString(), change: '+8.3%', sub: 'vs previous period', icon: 'exchange', tone: 'blue' },
    { key: 'branches', label: 'Active Branches', value: branches.size, sub: 'on this page', icon: 'building-o', tone: 'purple' },
    { key: 'channels', label: 'Payment Channels', value: channels.length, sub: channels.join(', '), icon: 'credit-card', tone: 'amber' },
  ];
};

const paymentBreakdowns = (g) => {
  const rows = g.rows || [];
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return [
    { key: 'channel', title: 'Amount by Payment Channel', type: 'donut', centerLabel: 'KES', centerValue: kesShort(total), items: groupSum(rows, 'channel') },
    { key: 'branch', title: 'Amount by Branch', type: 'bars', items: groupSum(rows, 'branch') },
  ];
};

export default function PaymentsList(props) {
  return (
    <SmartGridInsight
      moduleActions={PaymentsActions}
      schema={PaymentsSchema}
      title="All Money"
      description="All incoming payments received across all channels and branches."
      tableTitle="Transactions"
      stats={paymentStats}
      breakdowns={paymentBreakdowns}
      {...props}
    />
  );
}

// Schema field hints for the look in the mockup:
//   { key: 'invoice', label: 'Invoice', accent: true }
//   { key: 'channel', label: 'Channel', type: 'tag', tagIcons: { 'm-pesa': 'mobile', bank: 'university', card: 'credit-card', cash: 'money', 'airtel money': 'signal' } }
//   { key: 'amount',  label: 'Amount (KES)', align: 'right' }
//   { key: 'status',  label: 'Status', type: 'status' }
