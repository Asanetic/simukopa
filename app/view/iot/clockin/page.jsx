import { Suspense } from 'react';
import AttendanceKiosk from '../uiControl/AttendanceKiosk';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';

export async function generateMetadata() {
  return {
    title: 'Clock In',
    description: 'Student attendance clock in',
    icons: {
      icon: `${hiveRoutes.hiveBaseRoute}/logo.png`,
    },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<div className="col-md-12 p-5 text-center h3">Loading...</div>}>
      <AttendanceKiosk />
    </Suspense>
  );
}
