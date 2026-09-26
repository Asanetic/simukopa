'use client';

// Never show 0 / KES 0 while loading — that reads as real data.
export default function DashboardSkeleton() {
  return (
    <div>
      <div className="row m-0 mb-3" style={{ rowGap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div className="col-12 col-sm-6 col-xl-3" key={`r1-${i}`}><div className="skel skel-card" /></div>
        ))}
      </div>
      <div className="row m-0 mb-4" style={{ rowGap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div className="col-12 col-sm-6 col-xl-3" key={`r2-${i}`}><div className="skel skel-card" /></div>
        ))}
      </div>
      <div className="skel skel-chart mb-4" />
      <div className="row m-0 mb-4" style={{ rowGap: 16 }}>
        <div className="col-12 col-lg-6"><div className="skel skel-chart" /></div>
        <div className="col-12 col-lg-6"><div className="skel skel-chart" /></div>
      </div>
      <div className="skel skel-table" />

      <style jsx>{`
        .skel {
          background: linear-gradient(90deg, #eee 25%, #f5f5f5 37%, #eee 63%);
          background-size: 400% 100%;
          animation: skel-shine 1.4s ease infinite;
          border-radius: 16px;
        }
        .skel-card { height: 150px; }
        .skel-chart { height: 280px; }
        .skel-table { height: 320px; }
        @keyframes skel-shine {
          0% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }
      `}</style>
    </div>
  );
}
