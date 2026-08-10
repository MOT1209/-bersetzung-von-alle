# Production extras

All three sections below are OPTIONAL — the scaffolded app runs fine without any of them. Read only the section(s) the user opted into in SKILL.md step 9b; skip the rest.

---

## Section A: File uploads with Vercel Blob

### The default (no setup needed)

In development, the storage abstraction in `src/lib/storage.ts` writes uploads to `public/uploads/` on the local filesystem. This is automatic — the abstraction branches on whether `BLOB_READ_WRITE_TOKEN` is set:

- Token absent → local filesystem (dev default).
- Token present → Vercel Blob (production).

### When to read this section

Only when the user wants file uploads to work in a deployed/production environment. Local dev needs nothing.

### Steps

1. Sign in to the Vercel dashboard at https://vercel.com.
2. Open **Storage → Create Database → Blob**.
3. Open the new store and copy the `BLOB_READ_WRITE_TOKEN` from the `.env.local` snippet (or the **Connect** tab).
4. Paste it into the project's `.env`:

   ```env
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxx
   ```

5. For production deploys, set the same variable in the Vercel project's **Settings → Environment Variables** under the **Production** scope (and **Preview** if previews need uploads).

### Validate

With the token set locally, upload a file via the app's upload UI and confirm the returned URL points at `https://<store>.public.blob.vercel-storage.com/...` instead of `/uploads/...`. If the URL is still `/uploads/...`, the token is not being read — restart the dev server after editing `.env`.

### Docs

- Vercel Blob: https://vercel.com/docs/vercel-blob

---

## Section B: Payments with Polar (sandbox + ngrok)

### What Polar is

Polar (https://polar.sh) is an open-source payments-for-software platform. The boilerplate ships with placeholders for `POLAR_WEBHOOK_SECRET` and `POLAR_ACCESS_TOKEN` in `env.example`, but the actual integration code (checkout routes, webhook handlers, product mapping) is not pre-built — this section gets the env wired and webhooks reaching localhost. Building the integration itself is a separate task.

### Steps

1. Sign up at **https://sandbox.polar.sh** — always start in sandbox, never production.
2. Create an organization.
3. Go to **Settings → Developers → Personal Access Tokens**. Create a token, copy it, and paste it into `.env`:

   ```env
   POLAR_ACCESS_TOKEN=polar_pat_xxxxxxxxxxxx
   ```

4. Go to **Settings → Webhooks** and prepare to create a webhook endpoint — you will need a publicly reachable URL, which is what ngrok provides next.

5. Install ngrok from https://ngrok.com/download, then expose the local dev server:

   ```bash
   ngrok http 3000
   ```

   Copy the `https://<random>.ngrok-free.app` URL ngrok prints in the **Forwarding** line.

6. Back in Polar's webhook config, set the endpoint URL to:

   ```
   https://<your-ngrok-url>.ngrok-free.app/api/webhooks/polar
   ```

   Adjust the path to match the app's actual webhook route. If no route exists yet, this is a follow-up the agent will help the user build — Polar will reject deliveries until the route is implemented.

7. On save, Polar generates a webhook secret. Copy it and paste into `.env`:

   ```env
   POLAR_WEBHOOK_SECRET=polar_whs_xxxxxxxxxxxx
   ```

8. Restart the dev server so the new env vars are picked up.

### Production

When moving off sandbox:

- Sign up separately at **https://polar.sh** (production is a distinct account from sandbox).
- Regenerate the access token and webhook secret in production.
- Replace the ngrok URL with the deployed production URL (e.g., `https://yourapp.com/api/webhooks/polar`).
- Set `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` in the production deploy's env vars.

### Docs

- Polar docs: https://docs.polar.sh
- ngrok quickstart: https://ngrok.com/docs/getting-started/

---

## Section C: Transactional email (Resend / Postmark / etc.)

### The current state

Better Auth's email-verification and password-reset callbacks in `src/lib/auth.ts` currently `console.log` the link to the terminal. That is fine for local dev — the user can copy the link out of the terminal — but it is wrong for any deployed environment because real users cannot see the server logs.

### When to read this section

When the user is preparing for production, OR when they want real email delivery during local dev (e.g., to test the full signup flow end-to-end).

### Steps

1. Ask the user which provider to use. Resend is the popular default for Better Auth setups; Postmark, SendGrid, and AWS SES also work. Pick one and stick with it.

2. Install the provider SDK. Use whichever package manager was chosen in SKILL.md step 3 — for Resend:

   ```bash
   pnpm add resend         # pnpm
   npm install resend      # npm (note: `install`, not `add`)
   yarn add resend         # yarn
   ```

   For other providers, substitute the package name (`postmark`, `@sendgrid/mail`, `@aws-sdk/client-ses`, etc.).

3. Add the provider's API key env var to both `.env` and `env.example` (so the placeholder is checked in). For Resend:

   ```env
   RESEND_API_KEY=
   ```

4. In `src/lib/auth.ts`, replace the `console.log` calls inside `sendResetPassword` and `sendVerificationEmail` with the provider's `send()` call. Keep both callbacks — Better Auth invokes them at different lifecycle points.

5. Verify the sender domain in the provider's dashboard. Resend (and most providers) require DNS records for custom domains. For quick testing without DNS, use the provider's sandbox/onboarding domain (e.g., Resend's `onboarding@resend.dev`).

### Docs

- Better Auth email + password setup: https://www.better-auth.com/docs/authentication/email-password
- Resend Node SDK: https://resend.com/docs/send-with-nodejs
- Postmark API: https://postmarkapp.com/developer/api/email-api

### Note

Provider APIs change. Before writing the `send()` call, WebFetch the relevant provider docs above to confirm the current SDK signature rather than relying on memory.

---

After completing any opt-in section, return to SKILL.md step 10 (build verify) and continue.
