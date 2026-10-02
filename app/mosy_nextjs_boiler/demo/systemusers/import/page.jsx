import { Suspense } from 'react';

import ImportCSVComponent from '../../import/uploadData';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

import { getApiRoutes } from '../../AppRoutes/apiRoutesHandler';
import { SystemusersSchema } from '../SystemusersSchema';

const apiRoutes = getApiRoutes()

export async function generateMetadata({ searchParams }) {
  const mosyTitle = 'Import Systemusers data ';

  return {
    title: mosyTitle ,
    description: 'Import csv data',
    
    icons: {
        icon: `${hiveRoutes.hiveBaseRoute}/logo.png`
    },    
  };
}
                      

export default function UploadCsvPage() {

   const colsArray = SystemusersSchema.exportColumns

   return (
     <>
       <div className='main-wrapper'>
          <div className='page-wrapper'>
             <div className='content container-fluid p-0 m-0'>
              <div className='p-3'>
               <Suspense fallback={<div className='col-md-12 p-5 text-center h3'>Loading...</div>}>
               <ImportCSVComponent colsArray={colsArray} title='Import Systemusers data ' endpoint={SystemusersSchema.importDataEndpoint} templateName={`import_Systemusers_data__template.csv`}/>
              </Suspense>
            </div>
             </div>
           </div>
         </div>
       </>
     );
}