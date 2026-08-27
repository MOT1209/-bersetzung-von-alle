# AraLink — Security Hardening Plan

## Goal

Close the top findings from the security audit of AraLink:

1. **Open CORS** — `app.use(cors())` at `server/server.js:16` lets any origin consume the free translation quota (cost / DoS).
2. **Missing security headers** — no `helmet`, no `X-Frame-Options` / `X-Content-Type-Options` / HSTS; `req.ip` is wrong behind a reverse proxy (no `trust proxy`), which neuters per-IP rate limiting.
3. **Unbounded translation cache** — `server/cache.js` stores translated content with no expiry, growing without a real cap.

No feature changes. Same-origin behavior for users must remain identical.

## Decisions (confirmed with user)

- Scope: security hardening only (no UI/design changes).
- CORS: allowlist via `CORS_ORIGIN` env var — comma-separated list; empty = same-origin only.
- Headers: `helmet` with `contentSecurityPolicy: false` (the app loads the YouTube iframe API and has an inline theme script in `public/index.html`; strict CSP is a separate future wave) + `trust proxy` in production.
- Deliverable: this file at the repo root.

## Waves

### Wave 1 — CORS allowlist

- `server/config.js`: add `CORS_ORIGIN: process.env.CORS_ORIGIN || ''`.
- `server/server.js:16`: replace `app.use(cors());` with a whitelist via `cors({ origin: fn })`:
  - No `Origin` header (same-origin / non-browser clients) → no CORS headers, request passes.
  - Origin in the `CORS_ORIGIN` list (or `*`) → reflect the origin.
  - Any other origin → no CORS headers (browser blocks reading the response).
- `.env.example`: document `CORS_ORIGIN` (e.g. `https://app.example.com` or comma-separated; empty = same-origin only).
- `render.yaml`: add `CORS_ORIGIN` env var (`sync: false`, optional).

### Wave 2 — Security headers + trust proxy

- `package.json`: add `helmet` dependency (`npm install helmet`).
- `server/server.js`, near the top (before the rate limiters):
  - `app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);`
  - `app.use(helmet({ contentSecurityPolicy: false }));`
- Resulting headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security` (only when production + HTTPS).
- CSP was deliberately disabled *in this wave* — the app loads `https://www.youtube.com/iframe_api` and embeds `www.youtube.com` iframes.
  > **Update (later wave):** CSP is now **enabled** in `server/server.js` with explicit directives (`self` + YouTube + Google Fonts + `cdn.jsdelivr.net` for scripts). The inline theme script was moved to `public/theme-init.js`. See `tests/securityHeaders.test.js`.

### Wave 3 — Translation cache TTL

- `server/cache.js` (reads env directly, same pattern as `CACHE_FILE`):
  - `CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 2592000000` (30 days; `0` disables expiry).
  - `get()`: if the entry is expired, delete it and return `null`.
  - `prune()`: drop expired entries before the count-based trim (covers `persist()` and `loadInitial()`).
- `.env.example`: document `CACHE_TTL_MS`.

### Wave 4 — Tests & docs

New test files, following the existing conventions (`node:test`, `app.listen(0)`, `fetch`):

- `tests/cors.test.js`:
  - Disallowed origin preflight → no `Access-Control-Allow-Origin`.
  - Allowed origin (set `CORS_ORIGIN` before requiring the app) → origin reflected.
  - No-Origin request still succeeds (200).
- `tests/securityHeaders.test.js`:
  - Response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options`.
  - No `Content-Security-Policy` header (deliberately disabled).
- `tests/cacheTtl.test.js` (mirrors `tests/cache.test.js` style, isolated via `CACHE_FILE`):
  - Expired entry → `get()` returns `null` and the entry is pruned.
  - `CACHE_TTL_MS=0` keeps entries forever.

Docs:

- `CHANGELOG.md`: add a security-hardening entry.
- `README.md`: document `CORS_ORIGIN` and `CACHE_TTL_MS` (if an env-vars section exists).

## Verification

- `node --check` on every changed server file.
- `npm test` — full suite must pass (new files run in isolated processes, as with the existing tests).
- Manual browser flow: paste a link → translated output still works (same-origin unaffected).

## Out of scope

- ~~Strict CSP~~ — **done in a later wave** (theme script externalised to `public/theme-init.js`, directives in `server/server.js`).
- Multi-instance rate limiting (the in-memory limiter in `server/server.js` is per-process; fine for a single Render instance).
- UI/design improvements from the audit report.

## Risks / notes

- `trust proxy` is only enabled when `NODE_ENV=production`, so local development keeps `req.ip` real.
- `helmet` with CSP disabled still protects against clickjacking via `X-Frame-Options`.
- An empty `CORS_ORIGIN` keeps the current API working for same-origin and non-browser clients; cross-origin browser calls become blocked (intended).
