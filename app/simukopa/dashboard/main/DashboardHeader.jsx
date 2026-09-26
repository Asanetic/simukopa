'use client';

export default function DashboardHeader() {
  return (
    <div className="mb-4">
      <h4 className="mb-1" style={{ fontWeight: 700 }}>SIMUKOPA Dashboard</h4>
      <p className="text-muted mb-0" style={{ fontSize: 14 }}>
        Overview of customers, inventory, loans and payments.
      </p>
    </div>
  );
}
