'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatKesShort } from '../../../MosyUtils/hiveUtils';

// Horizontal bars — loan plan names can be long (spec preference).
export default function PaymentsPerPlanChart({ data = [] }) {
  if (!data.length) return <p className="text-muted small mb-0">No payment data available yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
        <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={formatKesShort} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={130} />
        <Tooltip formatter={(v) => formatKesShort(v)} />
        <Bar dataKey="value" name="Payments" fill="#2563eb" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
