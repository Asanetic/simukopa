import { Suspense } from 'react';

import ImportCSVComponent from '../../import/uploadData';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

import { getApiRoutes } from '../../AppRoutes/apiRoutesHandler';
import { LoansSchema } from '../LoansSchema';

const apiRoutes = getApiRoutes()

export async function generateMetadata({ searchParams }) {
  const mosyTitle = 'Import Loans data ';

  return {
    title: mosyTitle ,
    description: 'Import csv data',

    icons: {
        icon: `${hiveRoutes.hiveBaseRoute}/logo.png`
    },
  };
}


export default function UploadCsvPage() {

   const colsArray = LoansSchema.exportColumns

   return (
     <>
       <div className='main-wrapper'>
          <div className='page-wrapper'>
             <div className='content container-fluid p-0 m-0'>
              <div className='p-3'>
               <Suspense fallback={<div className='col-md-12 p-5 text-center h3'>Loading...</div>}>
               <ImportCSVComponent colsArray={colsArray} title='Import Loans data ' endpoint={LoansSchema.importDataEndpoint} templateName={`import_Loans_data__template.csv`}/>
              </Suspense>
            </div>
             </div>
           </div>
         </div>
       </>
     );
}
