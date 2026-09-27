import { Suspense } from 'react';
import DeviceMap from './DeviceMap';

export async function generateMetadata() {
  return { title: 'Device Map', icons: { icon: '/logo.png' } };
}

export default function DeviceMapPage() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-2 m-0">
          <Suspense fallback={<div>Loading...</div>}>
            <DeviceMap />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
