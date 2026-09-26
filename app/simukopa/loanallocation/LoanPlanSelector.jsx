'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatKes, mosyGetData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';
import { openEntityCreateModal } from '../moduleControl/UiControl/EntityCreateModal';
import LoanplansProfile from '../loanplans/uiControl/LoanplansProfile';
import { LoanplansSchema } from '../loanplans/LoanplansSchema';

const apiRoutes = getApiRoutes();

// Rough estimate only, for display before the plan is picked — the
// backend generates the real calendar-based schedule and is the source
// of truth for the actual total (spec section 5/22).
function estimateInstallmentCount(frequency, durationMonths) {
  const f = String(frequency || '').toUpperCase();
  const months = Number(durationMonths) || 0;
  if (f === 'WEEKLY') return Math.round(months * 4.345);
  if (f === 'MONTHLY') return months;
  return Math.round(months * 30);
}

export default function LoanPlanSelector({ device, selected, onSelect, onBack }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // List endpoint defaults to ORDER BY primkey DESC (route.js's
  // defaultOrderColumn), so plans[0] is always the most recently created
  // one — used below to auto-select a plan right after it's created.
  const loadPlans = useCallback(async () => {
    setLoading(true);
    const res = await mosyGetData({ endpoint: apiRoutes.loanplans.base, params: { isActive: 1, pageSize: 50 } });
    const rows = res?.status === 'success' ? res.data || [] : [];
    setPlans(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // Reuses the same loan plan module (schema + profile form) every other
  // page uses to create one — no separate "quick add plan" form to keep
  // in sync with it.
  function handleNewPlan() {
    openEntityCreateModal({
      ProfileComponent: LoanplansProfile,
      schema: LoanplansSchema,
      title: 'New Loan Plan',
      onSaved: async () => {
        const rows = await loadPlans();
        if (rows[0]) onSelect(rows[0]);
      },
    });
  }

  if (selected) {
    return (
      <div className="dash-card">
        <div className="text-muted small mb-1">LOAN PLAN SELECTED</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.plan_name}</div>
        <div className="text-muted small">{formatKes(selected.deposit_amount)} deposit · {formatKes(selected.installment_amount)} per {String(selected.repayment_frequency || 'installment').toLowerCase()}</div>
        <button className="btn btn-outline-secondary btn-sm mt-3" onClick={() => onSelect(null)}>Change Plan</button>
      </div>
    );
  }

  // Plans matching the device's model group surface first — not enforced
  // as a hard rule (spec: don't block a combination existing rules allow).
  const sorted = [...plans].sort((a, b) => {
    const aMatch = device && a.device_model_group === device.model_group;
    const bMatch = device && b.device_model_group === device.model_group;
    return (bMatch ? 1 : 0) - (aMatch ? 1 : 0);
  });

  return (
    <div className="dash-card">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div style={{ fontWeight: 700 }}>Step 3 — Select Loan Plan</div>
        <div className="d-flex" style={{ gap: 8 }}>
          {onBack ? <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>Back</button> : null}
          <button className="btn btn-outline-primary btn-sm" onClick={handleNewPlan}>+ New Loan Plan</button>
        </div>
      </div>
      {loading ? <div className="text-muted small">Loading plans...</div> : null}
      <div className="row m-0" style={{ rowGap: 8 }}>
        {sorted.map((p) => {
          const count = estimateInstallmentCount(p.repayment_frequency, p.duration_count);
          const totalCost = Number(p.deposit_amount || 0) + count * Number(p.installment_amount || 0);
          return (
            <div className="col-12 col-md-6" key={p.record_id}>
              <button className="wizard-list-item w-100" onClick={() => onSelect(p)}>
                <div style={{ fontWeight: 700 }}>{p.plan_name.toUpperCase()}</div>
                <div className="text-muted small">Deposit: {formatKes(p.deposit_amount)}</div>
                <div className="text-muted small">{String(p.repayment_frequency).toLowerCase()} payment: {formatKes(p.installment_amount)}</div>
                <div className="text-muted small">Duration: {p.duration_count} months</div>
                <div className="text-muted small">Est. total cost: {formatKes(totalCost)}</div>
              </button>
            </div>
          );
        })}
        {!loading && sorted.length === 0 ? <div className="text-muted small">No active loan plans available.</div> : null}
      </div>
    </div>
  );
}
