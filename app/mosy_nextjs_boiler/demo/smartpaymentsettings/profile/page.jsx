import { Suspense } from 'react';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';
import SmartpaymentsettingsProfile from '../uiControl/SmartpaymentsettingsProfile';


export async function generateMetadata({ searchParams }) {
  const mosyTitle = "Smartpaymentsettings profile"//searchParams?.mosyTitle || "Tasks";

  return {
    title: mosyTitle ? decodeURIComponent(mosyTitle) : `Smartpaymentsettings Profile`,
    description: 'Smartpaymentsettings profile / item details',
    
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
                 <SmartpaymentsettingsProfile />
               </Suspense>
            </div>
          </div>
        </div>
    </>
)
}

