'use client';

// One number, one meaning per card — resist adding a second stat here.
export default function DashboardKpiCard({ label, value, sublabel, icon, accent = 'blue' }) {
  return (
    <div className={`dash-card kpi-${accent}`}>
      <div className="kpi-icon"><i className={icon}></i></div>
      <div className="dash-card-label">{label}</div>
      <div className="dash-card-value">{value}</div>
      {sublabel ? <div className="dash-card-desc">{sublabel}</div> : null}

      <style jsx>{`
        .kpi-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          background: var(--kpi-accent-soft);
          color: var(--kpi-accent);
          margin-bottom: 14px;
        }
        .kpi-blue { --kpi-accent: #2563eb; --kpi-accent-soft: #e8f0fe; }
        .kpi-green { --kpi-accent: #16a34a; --kpi-accent-soft: #e7f7ed; }
        .kpi-orange { --kpi-accent: #ea8a00; --kpi-accent-soft: #fff3e0; }
        .kpi-red { --kpi-accent: #dc2626; --kpi-accent-soft: #fdecec; }
      `}</style>
    </div>
  );
}
