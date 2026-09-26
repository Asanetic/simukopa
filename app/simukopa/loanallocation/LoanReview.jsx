'use client';

import { formatKes } from '../../MosyUtils/hiveUtils';

function firstPaymentDate(frequency) {
  const d = new Date();
  const f = String(frequency || '').toUpperCase();
  if (f === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (f === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function LoanReview({ customer, device, plan, submitting, error, onBack, onCreate }) {
  return (
    <div className="dash-card">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Step 4 — Review Financing</div>

      <div className="mb-3">
        <div className="text-muted small">CUSTOMER</div>
        <div style={{ fontWeight: 600 }}>{[customer.first_name, customer.last_name].filter(Boolean).join(' ')}</div>
        <div className="text-muted small">{customer.phone_number}</div>
      </div>

      <div className="mb-3">
        <div className="text-muted small">DEVICE</div>
        <div style={{ fontWeight: 600 }}>{[device.brand_name, device.model_name].filter(Boolean).join(' ')}</div>
        {device.imei_1 ? <div className="text-muted small">IMEI: {device.imei_1}</div> : null}
      </div>

      <div className="mb-3">
        <div className="text-muted small">LOAN PLAN</div>
        <div style={{ fontWeight: 600 }}>{plan.plan_name}</div>
        <div className="text-muted small">Deposit: {formatKes(plan.deposit_amount)}</div>
        <div className="text-muted small">{String(plan.repayment_frequency).toLowerCase()} payment: {formatKes(plan.installment_amount)}</div>
        <div className="text-muted small">Duration: {plan.duration_count} months</div>
      </div>

      <div className="mb-3">
        <div className="text-muted small">FIRST PAYMENT</div>
        <div style={{ fontWeight: 600 }}>{firstPaymentDate(plan.repayment_frequency)}</div>
      </div>

      {error ? <div className="alert alert-danger py-2 small mb-3">{error}</div> : null}

      <div className="d-flex" style={{ gap: 10 }}>
        <button className="btn btn-outline-secondary" disabled={submitting} onClick={onBack}>Back</button>
        <button className="btn btn-primary flex-grow-1" disabled={submitting} onClick={onCreate}>
          {submitting ? 'Creating Loan...' : 'Create Loan & Allocate Device'}
        </button>
      </div>
    </div>
  );
}
