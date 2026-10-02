'use client';

import { useEffect, useState } from 'react';

import DashboardHeader from './DashboardHeader';
import DashboardKpiCard from './DashboardKpiCard';
import DashboardSectionCard from './DashboardSectionCard';
import LoanPerformanceChart from './LoanPerformanceChart';
import PaymentsPerMonthChart from './PaymentsPerMonthChart';
import PaymentsPerPlanChart from './PaymentsPerPlanChart';
import RecentLoans from './RecentLoans';
import DashboardSkeleton from './DashboardSkeleton';

import { mosyGetData } from '../../../MosyUtils/hiveUtils';
import { getApiRoutes } from '../../AppRoutes/apiRoutesHandler';

const apiRoutes = getApiRoutes();

const EMPTY_DATA = {
  summary: { customers: 0, inventory: 0, allocated: 0, unallocated: 0, loans: 0, paid: 0, active: 0, overdue: 0 },
  loanPerformance: [],
  paymentsPerMonth: [],
  paymentsPerPlan: [],
  recentLoans: [],
};

export default function DashboardHolder() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchData() {
    setLoading(true);
    setError(null);

    const response = await mosyGetData({ endpoint: apiRoutes.dashboard.main });

    if (response?.status === 'success') {
      setData({
        summary: response.summary || EMPTY_DATA.summary,
        loanPerformance: response.loanPerformance || [],
        paymentsPerMonth: response.paymentsPerMonth || [],
        paymentsPerPlan: response.paymentsPerPlan || [],
        recentLoans: response.recentLoans || [],
      });
    } else {
      setError(response?.message || 'Unable to load dashboard data.');
    }

    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="dash-wrapper col-md-12 p-0 m-0">
        <DashboardHeader />
        <DashboardSkeleton />
        <DashGlobalStyles />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-wrapper col-md-12 p-0 m-0">
        <DashboardHeader />
        <div className="alert alert-danger text-center">
          <p className="mb-3">{error}</p>
          <button className="btn btn-outline-danger btn-sm" onClick={fetchData}>Try Again</button>
        </div>
        <DashGlobalStyles />
      </div>
    );
  }

  const { summary, loanPerformance, paymentsPerMonth, paymentsPerPlan, recentLoans } = data;
  const n = (v) => Number(v || 0).toLocaleString('en-US');

  return (
    <div className="dash-wrapper col-md-12 p-0 m-0">
      <DashboardHeader />

      {/* Row 1 — customers / inventory */}
      <div className="row m-0 mb-3" style={{ rowGap: 16 }}>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Customers" value={n(summary.customers)} sublabel="Total customers" icon="fa fa-users" accent="blue" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Inventory" value={n(summary.inventory)} sublabel="Total devices" icon="fa fa-mobile" accent="blue" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Allocated" value={n(summary.allocated)} sublabel="Devices allocated" icon="fa fa-check-circle" accent="green" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Unallocated" value={n(summary.unallocated)} sublabel="Ready for allocation" icon="fa fa-mobile" accent="blue" />
        </div>
      </div>

      {/* Row 2 — loans */}
      <div className="row m-0 mb-4" style={{ rowGap: 16 }}>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Loans" value={n(summary.loans)} sublabel="Total loans" icon="fa fa-file-text" accent="blue" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Paid" value={n(summary.paid)} sublabel="Completed loans" icon="fa fa-check" accent="green" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Active" value={n(summary.active)} sublabel="Active loans" icon="fa fa-clock-o" accent="blue" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <DashboardKpiCard label="Overdue" value={n(summary.overdue)} sublabel="Needs attention" icon="fa fa-warning" accent={summary.overdue > 0 ? 'red' : 'green'} />
        </div>
      </div>

      {/* Row 3 — loan performance */}
      <div className="row m-0 mb-4">
        <div className="col-12">
          <DashboardSectionCard title="Loan Performance" description="Monthly loan activity.">
            <LoanPerformanceChart data={loanPerformance} />
          </DashboardSectionCard>
        </div>
      </div>

      {/* Row 4 — payments */}
      <div className="row m-0 mb-4" style={{ rowGap: 16 }}>
        <div className="col-12 col-lg-6">
          <DashboardSectionCard title="Payments Per Month">
            <PaymentsPerMonthChart data={paymentsPerMonth} />
          </DashboardSectionCard>
        </div>
        <div className="col-12 col-lg-6">
          <DashboardSectionCard title="Payments Per Plan">
            <PaymentsPerPlanChart data={paymentsPerPlan} />
          </DashboardSectionCard>
        </div>
      </div>

      {/* Row 5 — recent loans */}
      <div className="row m-0">
        <div className="col-12">
          <DashboardSectionCard title="Most Recent Loans">
            <RecentLoans items={recentLoans} />
          </DashboardSectionCard>
        </div>
      </div>

      <DashGlobalStyles />
    </div>
  );
}

// Shared premium card shell (KPI cards + chart/table sections) — one
// definition, so every dashboard card looks and behaves identically.
function DashGlobalStyles() {
  return (
    <style jsx global>{`
      .dash-card {
        background: #fff;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 16px;
        padding: 22px;
        min-height: 150px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .dash-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      }
      .dash-card-label {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #888;
      }
      .dash-card-value {
        font-size: 30px;
        font-weight: 700;
        line-height: 1.15;
        margin-top: 4px;
      }
      .dash-card-desc {
        font-size: 13px;
        color: #888;
        margin-top: 2px;
      }
      .dash-wrapper .row > div {
        padding-left: 8px;
        padding-right: 8px;
      }
      .dash-wrapper .row {
        margin-left: -8px;
        margin-right: -8px;
      }
    `}</style>
  );
}
