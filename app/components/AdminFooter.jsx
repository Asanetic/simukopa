'use client';

import { useEffect } from "react";
import DynamicModalProvider from "./DynamicModalProvider";

import {FloatingUpgradeButton} from '../mosybilling/PremuimBtn';
import BuilderMutations, { BuilderButton } from "../builderUtils/builder";
import mosyThemeConfigs from "../appConfigs/mosyTheme";
import { mosyGetLSData } from '../MosyUtils/hiveUtils';
import saAuthConfigs from '../auth/featureConfig/saAuthConfigs';

const BASE_MAIRA_SRC = `https://portals.asanetic.com/ma/maira.js?coraasset=${mosyThemeConfigs.mosyAppName}`;

export default function AdminFooter() {
  useEffect(() => {
    let finalSrc = BASE_MAIRA_SRC;
    try {
      const { sessionPrefix, usernameCol } = saAuthConfigs;
      const cookieKey = `${sessionPrefix}_sa_authsess_${usernameCol}_val`;
      const tagValue = mosyGetLSData(cookieKey);
      if (tagValue) {
        finalSrc = `${BASE_MAIRA_SRC}&tag=${encodeURIComponent(tagValue)}`;
      }
    } catch (err) {
      console.error('[maira] tag lookup threw:', err);
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = finalSrc;
    document.body.appendChild(script);

    return () => {
      // clean up on unmount so a later remount doesn't leave stale tags behind
      document.body.removeChild(script);
    };
  }, []);

  return (
    <>
      <div id="snack_box"></div>
      <div id="ajax_snack_id"></div>
      <div id="dialog_box"></div>
      <div id="ajax_snack"></div>
      <div id="alert_box"></div>
      <div id="magic_alert"></div>
      <DynamicModalProvider />

      {/* <FloatingUpgradeButton/> */}
      {/* <script type="text/javascript" src="https://cora.asanetic.com/cora.js?coraasset=Symphony gps"></script>
      <BuilderButton/> */}
    </>
  );
}