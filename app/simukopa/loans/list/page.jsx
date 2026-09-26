import { Suspense } from 'react';
import LoansList from '../uiControl/LoansList';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';


export async function generateMetadata({ searchParams }) {
  const mosyTitle = "Loans"

  return {
    title: mosyTitle ? decodeURIComponent(mosyTitle) : `Loans`,
    description: 'simukopa Loans',

    icons: {
      icon: `${hiveRoutes.hiveBaseRoute}/logo.png`
    },
  };
}

export default function Page() {

return (
     <>
        <div className="main-wrapper">
          <div className="page-wrapper">
            <div className="content container-fluid p-0 m-0 ">
               <Suspense fallback={<div className="col-md-12 p-5 text-center h3">Loading...</div>}>
                 <LoansList />
               </Suspense>
            </div>
          </div>
        </div>
    </>
)
}
