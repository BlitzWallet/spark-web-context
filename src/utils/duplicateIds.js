// Bounded in-session duplicate-id guard / id→outcome cache: the source of
// truth for a re-sent request id while the page is alive. An id, once seen,
// resolves to its recorded in-flight/done outcome and is NEVER re-executed.
//
// Eviction is SIZE-based only (never time-based): an entry stays until newer
// operations push it out — evict the oldest beyond maxSize, and cap done
// results at maxResults so the cache never grows without bound. This is
// deliberate: a backgrounded op may be resumed after an arbitrarily long
// delay, and while the page is backgrounded NO new ids are inserted, so the
// entry survives exactly as long as a resume might need it. A wall-clock TTL
// cannot promise that — any fixed window is exceeded by a long-enough
// background, which would let a re-post re-execute the op (double send).
// Cross-session replay is already barred by the per-load session key, so an
// evicted-then-replayed id is acceptable.
export function createDuplicateIdGuard({ maxSize, maxResults = 50 }) {
  // Map preserves insertion order, which is also age order.
  const entries = new Map(); // id -> { state, at, promise | response }

  function prune() {
    while (entries.size > maxSize) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
    if (maxResults > 0) {
      let doneCount = 0;
      for (const entry of entries.values()) {
        if (entry.state === 'done') doneCount += 1;
      }
      while (doneCount > maxResults) {
        let evicted = false;
        for (const [id, entry] of entries) {
          if (entry.state === 'done') {
            entries.delete(id);
            doneCount -= 1;
            evicted = true;
            break;
          }
        }
        if (!evicted) break;
      }
    }
  }

  return {
    // Returns the cached entry for a re-sent id — {state:'in-flight', promise}
    // or {state:'done', response} — or undefined when the id is new/evicted.
    // Time never evicts; only size pressure does.
    get(id) {
      return entries.get(id);
    },
    // Records a dispatch. A re-set for an id that is already tracked (a racing
    // re-send between lookup and set) is ignored: the FIRST dispatch's outcome
    // stays the source of truth so the op is never executed twice.
    setInFlight(id, promise, now = Date.now()) {
      if (entries.has(id)) return;
      entries.set(id, { state: 'in-flight', promise, at: now });
      prune();
    },
    // Records the completed outcome (success or error response) so a re-query
    // of the same id returns it instead of re-executing.
    setDone(id, response, now = Date.now()) {
      const existing = entries.get(id);
      if (existing) {
        if (existing.state === 'in-flight') {
          existing.state = 'done';
          existing.response = response;
          existing.promise = undefined;
        } else {
          existing.response = response;
        }
      } else {
        entries.set(id, { state: 'done', response, at: now });
      }
      prune();
    },
    get size() {
      return entries.size;
    },
  };
}
