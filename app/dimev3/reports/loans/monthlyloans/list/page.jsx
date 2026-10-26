import { Suspense } from 'react';
import LoansMonthlyLoansList from '../uiControl/LoansMonthlyLoansList';
import { LoansMonthlyLoansSchema } from '../LoansMonthlyLoansSchema';
import { hiveRoutes } from '../../../../../appConfigs/hiveRoutes';

export async function generateMetadata() {
  return { title: LoansMonthlyLoansSchema.label, description: LoansMonthlyLoansSchema.description, icons: { icon: `${hiveRoutes.hiveBaseRoute}/logo.png` } };
}

export default function Page() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-0 m-0 ">
          <Suspense fallback={<div className="col-md-12 p-5 text-center h3">Loading...</div>}>
            <LoansMonthlyLoansList />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
