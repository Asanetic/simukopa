'use client';
import { useState } from 'react';
import BillingPaymentModal from './BillingPaymentModal';

// Modern banner for the billingGuard "blocked" state. Two actions:
//  - "Upgrade Account" opens the NovaBloom pay page in an in-app modal
//    (not a new tab) — so payment success posts back to THIS window via
//    postMessage and the modal closes/rechecks automatically instead of
//    leaving the person stranded on another tab.
//  - "I've paid — Refresh" covers the rare case they navigated away from
//    the modal (or paid some other way) — force a recheck on demand
//    instead of waiting on the automatic check.
export default function BillingUpgradeBar({ isBlocked, payUrl, onRecheck, label = 'Upgrade Account' }) {
  const [checking, setChecking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  if (!isBlocked) return null;

  const handleRecheck = async () => {
    if (!onRecheck || checking) return;
    setChecking(true);
    try {
      await onRecheck();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bub-bar">
      <div className="bub-message">
        <span className="bub-dot" aria-hidden="true" />
        <span>Subscription needs attention</span>
      </div>

      <div className="bub-actions">
        {onRecheck && (
          <button type="button" className="bub-btn bub-btn-ghost" onClick={handleRecheck} disabled={checking}>
            <i className={`fa fa-refresh${checking ? ' fa-spin' : ''}`}></i>
            {checking ? 'Checking...' : "I've paid — Refresh"}
          </button>
        )}
        {payUrl && (
          <button type="button" className="bub-btn bub-btn-primary" onClick={() => setModalOpen(true)}>
            <i className="fa fa-star"></i>
            {label}
          </button>
        )}
      </div>

      <BillingPaymentModal open={modalOpen} payUrl={payUrl} onClose={() => setModalOpen(false)} onRefresh={onRecheck} />

      <style jsx>{`
        .bub-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1.1rem;
          margin: 0.5rem 0 1rem;
          border-radius: 14px;
          background: linear-gradient(135deg, #fff7ed 0%, #fef3f2 100%);
          border: 1px solid #fde4cf;
        }

        .bub-message {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.92rem;
          font-weight: 600;
          color: #9a3412;
        }

        .bub-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f97316;
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.18);
          flex-shrink: 0;
        }

        .bub-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .bub-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 600;
          border: 1px solid transparent;
          cursor: pointer;
          text-decoration: none;
          white-space: nowrap;
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }

        .bub-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .bub-btn:disabled {
          cursor: default;
          opacity: 0.7;
          transform: none;
        }

        .bub-btn-primary {
          color: #fff;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
        }

        .bub-btn-primary:hover {
          box-shadow: 0 6px 18px rgba(79, 70, 229, 0.45);
        }

        .bub-btn-ghost {
          color: #4338ca;
          background: #fff;
          border-color: #e0e7ff;
        }

        .bub-btn-ghost:hover:not(:disabled) {
          background: #eef2ff;
          border-color: #c7d2fe;
        }
      `}</style>
    </div>
  );
}
