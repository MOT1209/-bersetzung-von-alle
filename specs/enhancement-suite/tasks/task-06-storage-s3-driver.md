# Task 06: Optional S3/R2 storage driver behind the existing key-based storage interface

## Status

pending

## Wave

3

## Description

Adds an optional S3-compatible storage driver (works with AWS S3, Cloudflare R2, Supabase, MinIO) behind the existing key-based storage interface (`server/providers/storage/index.js` + `server/providers/storage/local.js`). Callers already use **keys, never paths** (AGENTS.md, storage item), so adding a driver is purely: a new `s3.js`, a switch branch in `index.js`, and config/env plumbing. Local disk remains the default; S3 only activates when `STORAGE_DRIVER=s3` and all required env vars are set. Driver selection happens per deployment — nothing in the app code changes.

## Dependencies

**Depends on:** None (Wave 3; the interface it implements already exists)
**Blocks:** None

## Files to Create

- `server/providers/storage/s3.js` — S3-compatible driver.

## Files to Modify

- `server/providers/storage/index.js` — add `case 's3':` branch.
- `server/config.js` — add S3 env vars.
- `.env.example` — document S3/R2 config (commented out).

## Technical Details

### Driver contract (from `local.js`)

`createLocalStorage(opts)` returns an object with:
- `id`, `label`, `isAvailable()`
- `put(key, data)` → `{ key, bytes }`
- `get(key)` → `Buffer | null`
- `stat(key)` → `{ key, bytes, modifiedAt } | null`
- `exists(key)` → boolean
- `remove(key)` → true|false (idempotent)
- `removePrefix(prefix)` → true|false
- `list(prefix)` → sorted string[] of full keys
- `_root` (internal)

`index.js` has a `switch (driver)` in `createStorage(opts)`. `createS3Storage(opts)` must match this interface exactly.

### HTTP-only implementation (no new dependency)

The repo has no AWS SDK. To keep the "no native/let's-not-bloat-deps" rule AND stay dependency-light, implement S3 via **fetch against the S3 REST API with AWS Signature V4** — a single self-contained `s3.js` (the S3 ListObjects/GetObject/PutObject/DeleteObject/HeadObject endpoints are well-documented and don't need the SDK). This matches the project's existing "no heavy deps" stance and works for AWS, R2, MinIO, and Supabase (all S3-compatible).

Alternative (only if the team prefers the SDK): `@aws-sdk/client-s3` as an optional dependency. **Decision: implement with fetch + SigV4** — no new package.json dependency; document this choice in the file header.

### Config

In `server/config.js`:

```js
STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local',            // local (default) | s3
S3_ENDPOINT: process.env.S3_ENDPOINT || '',                        // e.g. https://<acct>.r2.cloudflarestorage.com
S3_REGION: process.env.S3_REGION || 'auto',                        // R2/M inIO: 'auto'
S3_BUCKET: process.env.S3_BUCKET || '',
S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || '',
S3_SECRET: process.env.S3_SECRET || '',
S3_PREFIX: process.env.S3_PREFIX || '',                            // optional key prefix for this app
```

### Implementation steps

1. Write `server/providers/storage/s3.js`:
   - `normalizeKey` from `./keys` for all keys (same safety as local).
   - Map the interface to S3 calls with SigV4 signing:
     - `put(key, data)` → `PUT /{bucket}/{key}` with `x-amz-content-sha256` payload hash.
     - `get(key)` → `GET /{bucket}/{key}` → Buffer; 404 → null.
     - `stat(key)` → `HEAD /{bucket}/{key}` → `{ bytes, modifiedAt }` from headers; 404 → null.
     - `exists(key)` → stat !== null.
     - `remove(key)` → `DELETE /{bucket}/{key}` → `returns true` always (S3 delete is idempotent; 404 delete returns success).
     - `removePrefix(prefix)` → `ListObjectsV2?prefix=` then batch DELETE each key (limit ~1000 per call, loop pages). Returns `false` if no keys matched, `true` otherwise.
     - `list(prefix)` → `ListObjectsV2?prefix=` → sorted keys.
   - Handle bucket/key URL-encoding correctly (encoding of the object key in the path per RFC 3986).
   - `isAvailable()` → `Boolean(config.S3_ENDPOINT && config.S3_BUCKET && config.S3_ACCESS_KEY && config.S3_SECRET)`.
   - Timeouts + `AbortSignal.timeout(15000)` per request; surface meaningful errors with codes (`s3-error`).
2. In `server/providers/storage/index.js`:

```js
case 's3':
  return createS3Storage(opts);
```

3. `config.js`: add the five S3 vars above.
4. `.env.example`: commented block explaining R2 (free 10GB, no egress cost) vs local, and that missing S3 vars make `isAvailable()` false → app falls back with a clear boot log.

## Acceptance Criteria

- [ ] `STORAGE_DRIVER=local` (default) behaves identically to today (all existing storage tests pass).
- [ ] `STORAGE_DRIVER=s3` with valid R2/MinIO creds: `put/get/stat/remove/removePrefix/list` round-trip correctly against a live bucket.
- [ ] SigV4 signing works for both AWS SigV4 defaults and Cloudflare R2 (`region: 'auto'`).
- [ ] Missing S3 creds → `isAvailable()` false and the app logs a clear message; storage falls back to local (never throws at boot).
- [ ] No new runtime dependency added (fetch-based implementation).
- [ ] `node --check server/providers/storage/s3.js server/providers/storage/index.js server/config.js` passes; `npm run lint` passes.

## Notes

- SigV4 is the only nontrivial part — implement it carefully with a known-good test vector or verify against a live bucket. The existing `tests/storage.test.js` tests the local driver; add an `s3`-driver test only if a bucket is available in the test env (do NOT require it in CI).
- Do NOT alter any caller. Callers use the `storage()` singleton from `index.js` and never touch paths — the whole point of this abstraction.