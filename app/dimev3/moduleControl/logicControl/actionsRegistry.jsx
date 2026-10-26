export async function runRegisteredAction(moduleActions, key, ctx) {
    const fn = moduleActions[key];
    if (!fn) {
      console.warn(`No action registered for "${key}"`);
      return;
    }
    return fn(ctx);
  }
  
  // ---- Normalize whatever a registered action returns into one shape, so
  // runAction/runRowAction never hand back a mystery `undefined`.
  //
  // Default is reload:false, not reload:true. Almost every real action in
  // this app opens a modal/composer synchronously and returns undefined —
  // the actual mutation (if any) happens later, async, after the user
  // submits that modal, and already triggers its own refresh at that point
  // (openEntityCreateModal's onSaved, quickEditFromRow's onSubmit, an
  // explicit ctx.refresh() call, etc). Defaulting undefined to reload:true
  // meant every action — including ones that just open a picker or filter
  // and mutate nothing — fired an extra, pointless grid reload on click,
  // before the user had done anything. An action that DOES mutate data
  // itself synchronously (rare) must opt in explicitly: `return { reload:
  // true }` (or any object with `ok !== false` — see the branch above,
  // which still defaults reload to true for object returns unless
  // `reload` is set).
  export function normalizeActionResult(raw) {
    if (raw === false) return { ok: true, reload: false };
    if (raw && typeof raw === 'object') {
      return {
        ok: raw.ok !== false,
        message: raw.message,
        reload: raw.reload !== undefined ? !!raw.reload : raw.ok !== false,
        data: raw.data,
        navigateTo: raw.navigateTo,
      };
    }
    return { ok: true, reload: false };
  }