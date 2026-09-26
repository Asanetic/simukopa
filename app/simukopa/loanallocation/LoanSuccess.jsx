'use client';

import Link from 'next/link';
import { formatKes } from '../../MosyUtils/hiveUtils';
import { hiveRoutes } from '../../appConfigs/hiveRoutes';

export default function LoanSuccess({ customer, device, plan, result, onDone }) {
  const base = hiveRoutes.simukopa;

  return (
    <div className="dash-card text-center">
      <div style={{ fontSize: 40, color: '#16a34a' }}><i className="fa fa-check-circle"></i></div>
      <h5 className="mt-2 mb-3">LOAN CREATED SUCCESSFULLY</h5>

      <div className="text-start mx-auto" style={{ maxWidth: 320 }}>
        <div className="d-flex justify-content-between"><span className="text-muted">Customer</span><span>{[customer.first_name, customer.last_name].filter(Boolean).join(' ')}</span></div>
        <div className="d-flex justify-content-between"><span className="text-muted">Device</span><span>{[device.brand_name, device.model_name].filter(Boolean).join(' ')}</span></div>
        <div className="d-flex justify-content-between"><span className="text-muted">Loan Plan</span><span>{plan.plan_name}</span></div>
        <div className="d-flex justify-content-between"><span className="text-muted">Deposit</span><span>{formatKes(result.payment.amount)}</span></div>
        <div className="d-flex justify-content-between"><span className="text-muted">Status</span><span>ACTIVE</span></div>
        <div className="d-flex justify-content-between"><span className="text-muted">Device</span><span>ALLOCATED</span></div>
      </div>

      <div className="d-flex flex-wrap justify-content-center mt-4" style={{ gap: 10 }}>
        <Link href={`/${base}/clients/list`} className="btn btn-outline-secondary btn-sm">View Customer</Link>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => window.print()}>Print / Receipt</button>
        <button className="btn btn-primary btn-sm" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
