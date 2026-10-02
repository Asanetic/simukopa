// app/components/SessionMonitor.js
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { mosyGetLSData } from '../MosyUtils/hiveUtils';
import { startBillingMonitor } from '../novabilling/client';

import { hiveRoutes } from '../appConfigs/hiveRoutes';

// A component to monitor user session and redirect if not logged ins

export default function SessionMonitor({ sessionPrefix = 'sauth'}) {
  const router = useRouter();

  useEffect(() => {
    const isLogged = mosyGetLSData(`session_${sessionPrefix}_logged`);

    const loginPath=`${hiveRoutes.auth}/login`    

    console.log("SessionMonitor checking login:", isLogged, loginPath);

    if (!isLogged) {
      const currentUrl = window.location.href;
      const redirectURL = `${loginPath}?ref_url_go_to=${btoa(currentUrl)}`;
      window.location.href=redirectURL
    }

    // Keeps this tenant's NovaBloom subscription status fresh in the
    // background for the life of the session (see MosyAccessControl.jsx /
    // MosyUiGuard.jsx for where that status actually gates the UI).
    return startBillingMonitor();
  }, []);

  return null; // This component just checks, doesn't render anything
}
