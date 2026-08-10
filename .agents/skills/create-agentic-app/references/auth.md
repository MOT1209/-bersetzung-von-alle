# Auth Reference — Adding Social Sign-In

Read this file only when the user explicitly asks to add an OAuth / social provider during scaffold. The default is enough for almost everyone starting out.

## The default

The starter ships with **email + password** authentication via Better Auth, including registration, login, password reset, and email verification. This is enough for an MVP — do not push OAuth on the user. If they have not asked for it, skip this file entirely.

In development, password-reset and email-verification links are logged to the terminal (no email provider is wired up). Leave that as-is during scaffold. Production email setup lives in `references/production-extras.md`.

## The "keep it enabled" rule

When adding any OAuth provider, **keep `emailAndPassword` enabled**. Both blocks coexist in Better Auth's config. Do not remove or comment out the existing `emailAndPassword` block when adding `socialProviders` — that would silently break the existing login UI and any users already in the database.

A correct edit adds a sibling block to `auth.ts`, it does not replace anything:

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { /* keep as-is */ },
  emailVerification: { /* keep as-is */ },
  socialProviders: {
    // new provider block(s) go here
  },
})
```

## Provider docs — use WebFetch, do not rely on memory

Better Auth's provider APIs evolve. Always WebFetch the relevant doc before editing `auth.ts` and follow whatever it currently says.

| Provider  | Doc URL                                                         |
| --------- | --------------------------------------------------------------- |
| Google    | https://www.better-auth.com/docs/authentication/google          |
| GitHub    | https://www.better-auth.com/docs/authentication/github          |
| Apple     | https://www.better-auth.com/docs/authentication/apple           |
| Microsoft | https://www.better-auth.com/docs/authentication/microsoft       |
| Discord   | https://www.better-auth.com/docs/authentication/discord         |

More providers and the email/password baseline reference: https://www.better-auth.com/docs/authentication/email-password

## Checklist — what the agent updates

For any provider, walk through these files:

1. **`src/lib/auth.ts`** — add a `socialProviders` block alongside the existing `emailAndPassword` block. Pull the exact shape from the provider's Better Auth doc.
2. **`src/lib/auth-client.ts`** — usually no change needed; the existing `createAuthClient` covers social sign-in. Verify against the provider doc.
3. **`.env`** — add the provider's `CLIENT_ID` and `CLIENT_SECRET` (real values, from the user).
4. **`env.example`** — add the same keys with empty or placeholder values. **Never** commit real secrets here.
5. **Login / register UI** — add a "Sign in with X" button. The login page lives at `src/app/(auth)/login/page.tsx`; the register page sits next to it. Follow the existing button styles from the design system (see `DESIGN.md`).

## What the USER does (not the agent)

The agent cannot create OAuth credentials. After the code changes are in, tell the user to:

1. Open the provider's OAuth console and create a new OAuth client.
2. Set the **authorized redirect URI** to `{NEXT_PUBLIC_APP_URL}/api/auth/callback/{provider}` — for example `http://localhost:3000/api/auth/callback/google` in local dev. **Verify the exact callback path against the Better Auth doc** for the provider; it has changed across Better Auth versions.
3. Copy the client ID and secret into `.env`.
4. Restart the dev server so the new env vars load.

## Google — quick reference

Google is the most-requested provider. Even with this reference, WebFetch https://www.better-auth.com/docs/authentication/google as the source of truth before editing code.

- Console: https://console.cloud.google.com/apis/credentials
- Credential type: **OAuth client ID** → **Web application**
- Authorized redirect URI (local dev): `http://localhost:3000/api/auth/callback/google`
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- After saving the credentials in Google Cloud, paste the values into `.env` and add the same keys to `env.example` with empty values.

## A note on email delivery

Email verification and password-reset callbacks in `src/lib/auth.ts` currently `console.log` their URLs to the terminal — that is intentional for development and stays that way during scaffold. Production email provider setup (Resend, Postmark, etc.) is covered in `references/production-extras.md`; do not duplicate or pre-empt that work here.

## Then what?

Once the provider(s) are wired and the env vars are in place, return to SKILL.md step 9b (production extras) and continue the main flow.
