# Task 03: Formalize the job-queue driver boundary (BullMQ-ready contract, memory default)

## Status

complete

## Wave

1

## Description

AraLink's job engine (`server/jobs/queue.js`) is an in-process queue with bounded concurrency, cooperative cancellation, progress, and a `STATUS` enum (`queued|running|completed|failed|cancelled`). The project rule (AGENTS.md) is **Redis optional, never required** — BullMQ forces Redis and has no memory mode, so it has not been adopted. This task does **not** introduce BullMQ. It documents the existing `EventDriver`-style boundary inside `queue.js` so that a Redis/BullMQ driver can be layered in later for horizontal scaling **without changing the queue's public API or any route that uses it**. It also adds a `QUEUE_DRIVER` env key (default `memory`) and a minimal registration seam, without wiring Redis.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None.

## Files to Create

- None.

## Files to Modify

- `server/jobs/queue.js` — add a documented driver seam (mostly comments + a `setDriver`/`getDriver` hook), keeping the memory implementation as the default.
- `server/jobs/index.js` — read `config.QUEUE_DRIVER` and pass it to `createQueue`; fall back to `memory` silently.
- `server/config.js` — add `QUEUE_DRIVER`.
- `.env.example` — document `QUEUE_DRIVER=memory`.

## Technical Details

### Current behavior

`queue.js` exposes `{ registerHandler, enqueue, run, get, cancel, stats, subscribe, close, events, STATUS }` backed by in-process `Map`s. `server/jobs/index.js` creates the shared queue from `config.JOB_CONCURRENCY / JOB_MAX_QUEUED / JOB_TTL_MS` and registers handlers. Routes call `queue.run(...)` / `enqueue` / `subscribe` and only ever touch the returned public shape.

### Implementation Steps

The goal is **contract-documentation + a configurable driver name**, not a Redis implementation. Implement at minimum:

1. In `server/jobs/queue.js`:
   - Add a header comment block that documents the **driver boundary**: the exact public API surface (`registerHandler`, `enqueue`, `run`, `get`, `cancel`, `stats`, `subscribe`, `close`, `events`, `STATUS`), the semantics each function must satisfy, and that a future `RedisQueueDriver` must implement the same surface. Reference BullMQ's Relay/Driver concept and note the constraint recorded in `CURRENT_STATE.md`/AGENTS.md (Redis optional).
   - Add a `driver` option to `createQueue(opts)` (default `'memory'`), stored but initially only used for logging — memory implementation remains the only active engine. Optionally `console.log('[jobs] queue driver: memory')`.
   - Do not change the exported API. Keep everything else byte-for-byte behavior-identical.
2. In `server/config.js`:
   - Add `QUEUE_DRIVER: process.env.QUEUE_DRIVER || 'memory'`.
3. In `server/jobs/index.js`:
   - Read `config.QUEUE_DRIVER` when creating the queue and pass it through (`createQueue({ concurrency, maxQueued, ttlMs, driver })`). If it is `'redis'` or unknown **but redis is not configured/available**, log a warning and continue with memory — never crash at boot.
4. `.env.example`: add `# QUEUE_DRIVER=memory # memory (default) | redis (future — requires REDIS_URL and redis optionalDependency)`.

## Code Snippets

```js
// server/jobs/queue.js — driver boundary comment (top of file, English, concise)
/*
 * Queue driver boundary (AGENTS.md: Redis optional).
 *
 * This module is the ONLY place that knows how a job is dispatched. Routes and
 * jobs/index.js use the public shape below and nothing else:
 *
 *   registerHandler(type, fn)  fn(payload, ctx) → Promise<result>
 *   enqueue(type, payload)     → public job record (queued)
 *   run(type, payload)         → Promise<result> (bounded by concurrency)
 *   get(id) / cancel(id)       → public job record
 *   stats()                    → { concurrency, running, queued, tracked, maxQueued }
 *   subscribe(id, listener)    → unsubscribe fn (SSE)
 *   close()                    → graceful shutdown
 *   events / STATUS            → EventEmitter / status enum
 *
 * A future Redis/BullMQ driver must satisfy the same surface; it is layered
 * behind createQueue(opts.driver) and selected via QUEUE_DRIVER — no route
 * changes. Memory remains the default: single instance, no Redis required.
 */
```

## Acceptance Criteria

- [ ] `QUEUE_DRIVER=memory` (default) boots and behaves exactly as before; all job tests pass (`tests/jobsQueue.test.js`, `tests/jobsApi.test.js`, `tests/youtube-dub.test.js`).
- [ ] Setting `QUEUE_DRIVER=redis` without redis configured logs a warning and still runs on memory (no crash).
- [ ] The public API of `queue.js` is unchanged.
- [ ] `node --check server/jobs/queue.js server/jobs/index.js server/config.js` passes; `npm run lint` passes.

## Notes

- Do NOT add a real driver; do NOT add redis as a dependency. This is contractual/documentation work deliberately kept minimal.
- `server/jobs/job-manager.js` (dub project persistence) is out of scope for this task.