'use client';

// Shared shell for the chart/table sections (rows 3-5) — same premium
// card look as the KPI cards, just with a title/description header.
export default function DashboardSectionCard({ title, description, children }) {
  return (
    <div className="dash-card dash-section h-100">
      <div className="mb-3">
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        {description ? <div className="text-muted" style={{ fontSize: 13 }}>{description}</div> : null}
      </div>
      {children}

      <style jsx>{`
        .dash-section { padding: 20px; }
      `}</style>
    </div>
  );
}
