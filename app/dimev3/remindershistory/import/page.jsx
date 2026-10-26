import { Suspense } from 'react';

import ImportCSVComponent from '../../import/uploadData';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

import { getApiRoutes } from '../../AppRoutes/apiRoutesHandler';
import { RemindershistorySchema } from '../RemindershistorySchema';

const apiRoutes = getApiRoutes()

export async function generateMetadata({ searchParams }) {
  const mosyTitle = 'Import Remindershistory data ';

  return {
    title: mosyTitle ,
    description: 'Import csv data',
    
    icons: {
        icon: `${hiveRoutes.hiveBaseRoute}/logo.png`
    },    
  };
}
                      

export default function UploadCsvPage() {

   const colsArray = RemindershistorySchema.exportColumns
 
   const idKey = RemindershistorySchema.fields[1]?.key || 'record_id';
   const idAlias = RemindershistorySchema.excel_import_record_id_alias;

   return (
     <>
       <div className='main-wrapper'>
          <div className='page-wrapper'>
             <div className='content container-fluid p-0 m-0'>
              <div className='p-3'>
               <Suspense fallback={<div className='col-md-12 p-5 text-center h3'>Loading...</div>}>
               {/* <ImportCSVComponent
                colsArray={colsArray}
                 title='Import Remindershistory data ' 
                 endpoint={RemindershistorySchema.importDataEndpoint} 
                 templateName={`import_Remindershistory_data__template.csv`}/>
    */}
                <ImportCSVComponent
                  colsArray={colsArray}
                  idKey={idKey}
                  idAlias={idAlias}
                  title='Import Remindershistory data ' 
                  endpoint={RemindershistorySchema.importDataEndpoint}
                  templateName={`import_Remindershistory_data__template.csv`}
                />



              </Suspense>
            </div>
             </div>
           </div>
         </div>
       </>
     );
}