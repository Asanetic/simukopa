"use client";

import AccessDenied from "./MosyAccessDenied";
import { mosyACTRLHasRole } from "../../auth/authAccesControl";
import { novaBillingGate } from "../../novabilling/client";

export function MosyAccessControl(role) {
    if (typeof window === "undefined") {
        return null;
    }

    const roleAllowed = mosyACTRLHasRole(role, false);

    console.info("Access request for:", role , roleAllowed);

    // Role first, then billing; true = let in, false = deny (and records why
    // so MosyUiGuard's NovaBillingGuard can show "Access Denied" or the
    // payment notice accordingly).
    return novaBillingGate(roleAllowed);
}