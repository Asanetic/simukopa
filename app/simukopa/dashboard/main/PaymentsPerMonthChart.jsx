'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatKesShort } from '../../../MosyUtils/hiveUtils';

export default function PaymentsPerMonthChart({ data = [] }) {
  const hasData = data.some((d) => d.value > 0);
  if (!hasData) return <p className="text-muted small mb-0">No payment data available yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={formatKesShort} width={70} />
        <Tooltip formatter={(v) => formatKesShort(v)} />
        <Bar dataKey="value" name="Payments" fill="#16a34a" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
