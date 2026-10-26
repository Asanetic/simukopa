// reportCache.js — two small tools that make "4,000 people opened the report" cost ~one query set per tenant.
//
//   createReportCache({ max })      in-memory TTL cache + SINGLE-FLIGHT:
//                                   40 people from one tenant ask in the same second -> ONE computation, 40 answers.
//   createRateLimiter({max,windowMs})  per-key request budget so a reload loop can't hammer the database.
//
// In-memory = per server process. Running several instances? Swap `get/set/once` for Redis later; the engine only uses these three.

export function createReportCache({ max = 500 } = {}) {
  const store = new Map();     // key -> { value, at, ttl }
  const inflight = new Map();  // key -> Promise
  const trim = () => { while (store.size > max) store.delete(store.keys().next().value); };
  return {
    get(key, now = Date.now()) {
      const e = store.get(key);
      if (!e) return null;
      if (now - e.at > e.ttl) { store.delete(key); return null; }
      return e;
    },
    set(key, value, ttlMs, now = Date.now()) { if (ttlMs > 0) { store.delete(key); store.set(key, { value, at: now, ttl: ttlMs }); trim(); } },
    // run `fn` once per key at a time; everyone asking while it runs shares the answer (errors are shared too, then forgotten)
    once(key, fn) {
      if (inflight.has(key)) return inflight.get(key);
      const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
    size: () => store.size,
    clear() { store.clear(); inflight.clear(); },
  };
}

export function createRateLimiter({ max = 30, windowMs = 10000 } = {}) {
  const hits = new Map(); // key -> { n, reset }
  let last = 0;
  return {
    // true = allowed, false = slow down
    hit(key, now = Date.now()) {
      if (now - last > windowMs) { last = now; for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }
      const e = hits.get(key);
      if (!e || e.reset <= now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
      e.n += 1;
      return e.n <= max;
    },
  };
}
