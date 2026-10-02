'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function LoanPerformanceChart({ data = [] }) {
  const hasData = data.some((d) => d.loans || d.active || d.paid || d.overdue);
  if (!hasData) return <p className="text-muted small mb-0">No loans available yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="loans" name="Total Loans" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="active" name="Active" stroke="#0891b2" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="paid" name="Paid" stroke="#16a34a" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="overdue" name="Overdue" stroke="#dc2626" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
