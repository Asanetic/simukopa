import { Suspense } from 'react';
import Dftemplatev1List from '../uiControl/Dftemplatev1List';
import { Dftemplatev1Schema } from '../Dftemplatev1Schema';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

export async function generateMetadata() {
  return { title: Dftemplatev1Schema.label, description: Dftemplatev1Schema.description, icons: { icon: `${hiveRoutes.hiveBaseRoute}/logo.png` } };
}

export default function Page() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-0 m-0 ">
          <Suspense fallback={<div className="col-md-12 p-5 text-center h3">Loading...</div>}>
            <Dftemplatev1List />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
