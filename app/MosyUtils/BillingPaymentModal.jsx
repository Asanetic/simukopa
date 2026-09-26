'use client';
import { useEffect } from 'react';

// Payment happens IN this modal's iframe instead of a new tab, so the
// NovaBloom pay page's postMessage({ type: 'novabloom:billing:refresh' })
// on success reaches this window directly — no new-tab confusion, no
// waiting on the visibilitychange fallback in useBillingGuard.
export default function BillingPaymentModal({ open, payUrl, onClose, onRefresh }) {
  useEffect(() => {
    if (!open) return;

    function handleMessage(event) {
      if (event.data && event.data.type === 'novabloom:billing:refresh') {
        if (onRefresh) onRefresh();
        onClose();
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('message', handleMessage);
    document.addEventListener('keydown', handleEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, onRefresh]);

  if (!open || !payUrl) return null;

  return (
    <div className="bpm-overlay" onClick={onClose} role="presentation">
      <div className="bpm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Upgrade account">
        <button type="button" className="bpm-close" onClick={onClose} aria-label="Close">
          <i className="fa fa-times"></i>
        </button>
        <iframe src={payUrl} title="Upgrade account" allow="payment" className="bpm-iframe" />
      </div>

      <style jsx>{`
        .bpm-overlay {
          position: fixed;
          inset: 0;
          z-index: 1050;
          background: rgba(15, 15, 20, 0.55);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          animation: bpm-fade-in 0.15s ease;
        }

        .bpm-card {
          position: relative;
          width: 100%;
          max-width: 560px;
          height: min(680px, 90vh);
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          animation: bpm-pop-in 0.18s ease;
        }

        .bpm-close {
          position: absolute;
          top: 0.6rem;
          right: 0.6rem;
          z-index: 1;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: none;
          background: rgba(0, 0, 0, 0.06);
          color: #374151;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .bpm-close:hover {
          background: rgba(0, 0, 0, 0.12);
        }

        .bpm-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        @keyframes bpm-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes bpm-pop-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
