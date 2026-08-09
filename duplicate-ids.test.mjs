import assert from 'assert';
import { createDuplicateIdGuard } from './src/utils/duplicateIds.js';

// D-17 + keep-alive plan §4: the bounded duplicate-id cache is the sole
// in-session replay guard after sequence deletion (D-2) AND the id→outcome
// cache that makes a re-sent id deterministic — in-flight ids await the
// original dispatch's promise, done ids re-post the stored result, and a
// re-sent id NEVER re-executes. Eviction is size-based only (time never
// evicts) so a backgrounded op can be resumed after any delay; an
// evicted-then-replayed id is acceptable only because GCM + the fresh per-load
// nonce already bar cross-session forgery.
const ttlMs = 90_000; // legacy arg, now ignored by the guard (kept for callers)

// 1. new id -> get() is undefined; setInFlight records the dispatch promise
{
  const guard = createDuplicateIdGuard({ ttlMs, maxSize: 512 });
  const t0 = 1_000_000;
  assert.strictEqual(guard.get('req-1', t0), undefined, 'new id is not cached');
  let executions = 0;
  const promise = Promise.resolve().then(() => {
    executions += 1;
    return { result: 'ok' };
  });
  guard.setInFlight('req-1', promise, t0);
  const cached = guard.get('req-1', t0 + 10_000);
  assert.strictEqual(cached.state, 'in-flight');
  assert.strictEqual(cached.promise, promise, 're-send awaits the SAME promise');
  const outcome = await cached.promise;
  assert.strictEqual(outcome.result, 'ok');
  assert.strictEqual(executions, 1, 'one dispatch executed exactly once');
}

// 2. setDone upgrades the in-flight entry to done (same id, same age)
{
  const guard = createDuplicateIdGuard({ ttlMs, maxSize: 512 });
  const t0 = 1_000_000;
  const promise = Promise.resolve({ result: 'ok' });
  guard.setInFlight('req-1', promise, t0);
  const response = { encrypted: 'ciphertext-1', isResponse: true };
  guard.setDone('req-1', response, t0 + 5_000);
  const cached = guard.get('req-1', t0 + 10_000);
  assert.strictEqual(cached.state, 'done');
  assert.strictEqual(cached.response, response, 're-send re-posts the stored result');
  assert.strictEqual(cached.promise, undefined);
}

// 3. error outcomes are cached too: a re-send returns the same error, never
//    a re-execution
{
  const guard = createDuplicateIdGuard({ ttlMs, maxSize: 512 });
  const t0 = 1_000_000;
  const errorResponse = {
    encrypted: 'error-ciphertext',
    isResponse: true,
  };
  guard.setDone('req-err', errorResponse, t0);
  const cached = guard.get('req-err', t0 + 1_000);
  assert.strictEqual(cached.state, 'done');
  assert.strictEqual(cached.response, errorResponse);
}

// 4. a racing re-set of an in-flight id is ignored (first dispatch wins)
{
  const guard = createDuplicateIdGuard({ ttlMs, maxSize: 512 });
  const t0 = 1_000_000;
  const first = Promise.resolve('first');
  guard.setInFlight('req-1', first, t0);
  guard.setInFlight('req-1', Promise.resolve('second'), t0 + 1);
  const cached = guard.get('req-1', t0 + 2);
  assert.strictEqual(cached.promise, first, 'first dispatch stays the source of truth');
}

// 5. time NEVER evicts: an id backgrounded for an arbitrarily long delay still
//    returns its recorded outcome, so a keep-alive re-post can never re-execute
//    it (the double-send this cache exists to prevent). Only size evicts.
{
  const guard = createDuplicateIdGuard({ maxSize: 512 });
  const t0 = 1_000_000;
  guard.setDone('req-1', { result: 'ok' }, t0);
  const cached = guard.get('req-1', t0 + 10 * 365 * 24 * 3600_000); // +10 years
  assert.ok(cached, 'time never evicts a retained id');
  assert.strictEqual(cached.state, 'done');
  assert.deepStrictEqual(cached.response, { result: 'ok' });
}

// 6. evicted-oldest replay is acceptable once the cap is exceeded
{
  const guard = createDuplicateIdGuard({ ttlMs, maxSize: 4 });
  const t0 = 1_000_000;
  for (let i = 0; i < 4; i++) guard.setDone(`req-${i}`, { i }, t0 + i);
  assert.strictEqual(guard.size, 4);
  guard.setDone('req-4', { i: 4 }, t0 + 4); // evicts req-0 (oldest)
  assert.strictEqual(guard.size, 4, 'cap must hold');
  assert.strictEqual(
    guard.get('req-0', t0 + 4),
    undefined,
    'evicted id may replay',
  );
  assert.strictEqual(guard.get('req-1', t0 + 4).response.i, 1);
}

// 7. a later setDone does NOT time-evict older entries: both are retained
//    (bounded only by size), so age alone never drops a resumable id.
{
  const guard = createDuplicateIdGuard({ maxSize: 512 });
  const t0 = 1_000_000;
  guard.setDone('old', { result: 1 }, t0);
  guard.setDone('new', { result: 2 }, t0 + 10_000_000);
  assert.ok(
    guard.get('old', t0 + 10_000_000),
    'old entry retained — no time eviction',
  );
  assert.strictEqual(guard.size, 2);
}

// 8. done results are capped (maxResults ~50); in-flight entries are retained
{
  const guard = createDuplicateIdGuard({ ttlMs, maxSize: 512, maxResults: 3 });
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) guard.setDone(`done-${i}`, { i }, t0 + i);
  guard.setInFlight('live-1', Promise.resolve('x'), t0 + 5);
  assert.strictEqual(guard.get('live-1', t0 + 6).state, 'in-flight');
  const doneIds = [];
  for (let i = 0; i < 5; i++) {
    const e = guard.get(`done-${i}`, t0 + 6);
    if (e && e.state === 'done') doneIds.push(i);
  }
  assert.strictEqual(doneIds.length, 3, 'done results capped at maxResults');
  assert.deepStrictEqual(doneIds, [2, 3, 4], 'oldest done results evicted first');
}

console.log(
  'ALL PASS — duplicate-id cache: re-sent id returns cached result / awaits in-flight promise, never re-executes; error outcomes cached; size cap + results cap hold; time never evicts',
);
