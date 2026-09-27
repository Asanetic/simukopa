'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import CustomerSelector from './CustomerSelector';
import DeviceSelector from './DeviceSelector';
import LoanPlanSelector from './LoanPlanSelector';
import LoanReview from './LoanReview';
import LoanSuccess from './LoanSuccess';

import { mosyGetData, mosyPostData } from '../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../AppRoutes/apiRoutesHandler';

const apiRoutes = getApiRoutes();

const STEPS = ['Customer', 'Device', 'Plan', 'Review'];

// One guided transaction: customer -> device -> plan -> review -> create.
// No application/approval stage — the backend creates the ACTIVE loan,
// installment schedule, deposit payment and device allocation atomically
// in one request (see api/simukopa/loanallocation/route.js).
export default function LoanAllocationWizard({ initialDevice = null } = {}) {
  const searchParams = useSearchParams();
  const [customer, setCustomer] = useState(null);
  const [device, setDevice] = useState(initialDevice);
  const [plan, setPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Deep-link from Device Map's "Allocate Device" popup button
  // (?device=<record_id>) — preselects the device so the flow drops
  // straight into "pick a customer" for it, same wizard either way.
  // Skipped when the device is handed in directly (Device Map's own
  // "Allocate Device" now opens this in a MosyCard instead of navigating,
  // so there's no URL to read it from).
  useEffect(() => {
    if (initialDevice) return;
    const deviceId = searchParams.get('device');
    if (!deviceId) return;
    (async () => {
      const res = await mosyGetData({
        endpoint: apiRoutes.phones.base,
        params: { record_id: btoa(deviceId), pageSize: 1 },
      });
      const row = res?.status === 'success' ? res.data?.[0] : null;
      if (row) setDevice(row);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = !customer ? 0 : !device ? 1 : !plan ? 2 : 3;

  async function handleCreate() {
    if (submitting) return; // double-submit guard
    setSubmitting(true);
    setError(null);

    const res = await mosyPostData({
      url: apiRoutes.loanallocation.create,
      data: { customer_id: customer.record_id, device_id: device.record_id, loan_plan_id: plan.record_id, payment_method: 'cash' },
    });

    if (res?.status === 'success') {
      setResult(res);
    } else {
      setError(res?.message || 'The transaction was not completed.');
    }
    setSubmitting(false);
  }

  function reset() {
    setCustomer(null); setDevice(null); setPlan(null); setResult(null); setError(null);
  }

  if (result) {
    return (
      <div className="loanalloc-wrapper">
        <LoanSuccess customer={customer} device={device} plan={plan} result={result} onDone={reset} />
        <WizardStyles />
      </div>
    );
  }

  return (
    <div className="loanalloc-wrapper">
      <div className="mb-4">
        <h4 className="mb-1" style={{ fontWeight: 700 }}>New Financing</h4>
        <p className="text-muted mb-3" style={{ fontSize: 14 }}>Select a customer, a device and a loan plan to create the loan.</p>

        <div className="d-flex" style={{ gap: 8 }}>
          {STEPS.map((label, i) => (
            <div key={label} className={`step-pill ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              {i + 1} {label}
            </div>
          ))}
        </div>
      </div>

      {step === 0 ? <CustomerSelector selected={customer} onSelect={setCustomer} /> : null}
      {step === 1 ? <DeviceSelector selected={device} onSelect={setDevice} onBack={() => setCustomer(null)} /> : null}
      {step === 2 ? <LoanPlanSelector device={device} selected={plan} onSelect={setPlan} onBack={() => setDevice(null)} /> : null}
      {step === 3 ? (
        <LoanReview
          customer={customer} device={device} plan={plan}
          submitting={submitting} error={error}
          onBack={() => setPlan(null)} onCreate={handleCreate}
        />
      ) : null}

      <WizardStyles />
    </div>
  );
}

function WizardStyles() {
  return (
    <style jsx global>{`
      .dash-card {
        background: #fff;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 16px;
        padding: 22px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      }
      .wizard-list-item {
        display: block;
        text-align: left;
        background: #fafafa;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        padding: 12px 14px;
        cursor: pointer;
        transition: box-shadow 0.15s ease, background 0.15s ease;
      }
      .wizard-list-item:hover { background: #f0f5ff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
      .step-pill {
        font-size: 12px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 999px;
        background: #f1f1f1;
        color: #999;
      }
      .step-pill.active { background: #2563eb; color: #fff; }
      .step-pill.done { background: #e7f7ed; color: #16a34a; }
    `}</style>
  );
}
