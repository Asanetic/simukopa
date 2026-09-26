import { Suspense } from 'react';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';
import SmartpaymentsProfile from '../uiControl/SmartpaymentsProfile';


export async function generateMetadata({ searchParams }) {
  const mosyTitle = "Smartpayments profile"//searchParams?.mosyTitle || "Tasks";

  return {
    title: mosyTitle ? decodeURIComponent(mosyTitle) : `Smartpayments Profile`,
    description: 'Smartpayments profile / item details',
    
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
                 <SmartpaymentsProfile />
               </Suspense>
            </div>
          </div>
        </div>
    </>
)
}

