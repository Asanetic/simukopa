import { Suspense } from 'react';
import ClientsClientRepaymentsList from '../uiControl/ClientsClientRepaymentsList';
import { ClientsClientRepaymentsSchema } from '../ClientsClientRepaymentsSchema';
import { hiveRoutes } from '../../../../../appConfigs/hiveRoutes';

export async function generateMetadata() {
  return { title: ClientsClientRepaymentsSchema.label, description: ClientsClientRepaymentsSchema.description, icons: { icon: `${hiveRoutes.hiveBaseRoute}/logo.png` } };
}

export default function Page() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-0 m-0 ">
          <Suspense fallback={<div className="col-md-12 p-5 text-center h3">Loading...</div>}>
            <ClientsClientRepaymentsList />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
