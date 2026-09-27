"use client";

import AccessDenied from "./MosyAccessDenied";
import { NovaBillingGuard } from "../../novabilling/BillingNotice";

export function MosyUIGuard({ moduleName, reason }) {
    // Payment notice if billing was the reason, otherwise the usual denial.
    return <NovaBillingGuard fallback={<AccessDenied moduleName={moduleName} reason={reason} />} />;
}