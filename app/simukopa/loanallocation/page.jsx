import { Suspense } from 'react';
import LoanAllocationWizard from './LoanAllocationWizard';

export async function generateMetadata() {
  return { title: 'New Financing', icons: { icon: '/logo.png' } };
}

export default function LoanAllocationPage() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-2 m-0">
          <Suspense fallback={<div>Loading...</div>}>
            <LoanAllocationWizard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
