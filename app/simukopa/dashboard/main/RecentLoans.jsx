'use client';

const BADGE = {
  active: { bg: '#e8f0fe', color: '#2563eb', label: 'ACTIVE' },
  paid: { bg: '#e7f7ed', color: '#16a34a', label: 'PAID' },
  completed: { bg: '#e7f7ed', color: '#16a34a', label: 'PAID' },
  overdue: { bg: '#fdecec', color: '#dc2626', label: 'OVERDUE' },
  pending: { bg: '#fff3e0', color: '#ea8a00', label: 'PENDING' },
};

function StatusBadge({ status }) {
  const key = String(status || 'pending').toLowerCase();
  const b = BADGE[key] || BADGE.pending;
  return (
    <span style={{
      background: b.bg, color: b.color, fontSize: 11, fontWeight: 700,
      padding: '4px 10px', borderRadius: 999, letterSpacing: '0.03em',
    }}>
      {b.label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RecentLoans({ items = [] }) {
  if (!items.length) return <p className="text-muted small mb-0">No loans have been created yet.</p>;

  return (
    <div className="table-responsive">
      <table className="table mb-0" style={{ fontSize: 13.5 }}>
        <thead>
          <tr className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th>Customer</th>
            <th>Device</th>
            <th>Loan Plan</th>
            <th>Amount</th>
            <th>Deposit</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row, idx) => (
            <tr key={idx}>
              <td>{row.customer}</td>
              <td>{row.device}</td>
              <td>{row.plan}</td>
              <td>KES {row.amount}</td>
              <td>KES {row.deposit}</td>
              <td><StatusBadge status={row.status} /></td>
              <td>{fmtDate(row.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
