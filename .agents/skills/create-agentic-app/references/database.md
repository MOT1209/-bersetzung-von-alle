# Database setup

This file is loaded by SKILL.md step 6 after the user has picked one of the four database paths below. Read only the section that matches the chosen path.

Your goal for every path is the same:

1. Get a working `POSTGRES_URL` value into `.env` (this is the var `drizzle.config.ts` reads).
2. Validate the connection works.
3. Return to SKILL.md step 7 and run `<pm> db:migrate` to create the Better Auth tables.

**Never run `drizzle push` / `db:push` / `db:dev` / `db:reset`.** Per `AGENTS.md`, schema changes are always applied via generated migrations. If a migration fails, diagnose the underlying problem — do not shortcut to `db:push`.

In every command below, `<pm>` is the package manager chosen in SKILL.md step 3 (`pnpm`, `npm run`, or `yarn`).

---

## Path A: Local Docker (recommended for local dev)

### When to pick this

The user is on a dev machine, wants zero external accounts, and has Docker installed. This is the default and matches the `POSTGRES_URL` already shipped in `env.example`.

### Prerequisites

- Docker Desktop installed and the daemon running. On Windows, the Docker Desktop app must be open — `docker info` will fail otherwise.
- Port `5432` free on the host. If another Postgres (or anything else) is bound to `5432`, the container will fail to start.

### Exact steps

1. Confirm Docker is reachable. The agent runs:

   ```bash
   docker info
   ```

   If this errors with `Cannot connect to the Docker daemon` or `error during connect`, stop and tell the user to start Docker Desktop, then retry.

2. From the project root, start the database in the background:

   ```bash
   docker compose up -d
   ```

   This pulls `pgvector/pgvector:pg18` on first run (can take a minute) and starts a container with database `postgres_dev`, user `dev_user`, password `dev_password`, exposed on host port `5432`.

3. Verify the default `POSTGRES_URL` in `.env` matches. It should already read:

   ```
   POSTGRES_URL=postgresql://dev_user:dev_password@localhost:5432/postgres_dev
   ```

   If the user edited it, restore it to the line above. Nothing else needs to change for this path.

### Connection string shape

```
postgresql://dev_user:dev_password@localhost:5432/postgres_dev
```

### Validation

Before running migrations, confirm the container is up and accepting connections:

```bash
docker ps --filter "ancestor=pgvector/pgvector:pg18"
```

The container should show status `Up` (a few seconds is enough — `pg18` boots fast). If the user has `psql` installed, a quick smoke test:

```bash
psql "postgresql://dev_user:dev_password@localhost:5432/postgres_dev" -c "select 1;"
```

`psql` is optional — if it is not installed, skip straight to `<pm> db:migrate` and treat a successful migration as the validation.

### Common failure modes

- **`port is already allocated` / `bind: address already in use`** — something else is on `5432`. Either stop the other process, or edit `docker-compose.yml` to map a different host port (e.g. `"55432:5432"`) and update the port in `POSTGRES_URL` to match.
- **`Cannot connect to the Docker daemon`** — Docker Desktop is not running. Start it and retry `docker compose up -d`.
- **Container starts then exits** — run `docker compose logs postgres` to see the Postgres startup error (usually a stale volume from an older Postgres major version). If the user has no data to keep, `docker compose down -v` clears the volume and lets the new image initialize cleanly.

---

## Path B: Neon

### When to pick this

The user wants a hosted Postgres with a generous free tier, branching, and zero local infrastructure. Good for solo devs and demos.

### Prerequisites

- A browser. No CLI required.
- A Neon account (free tier is fine).

### Exact steps

1. Direct the user to https://neon.tech and have them sign in or sign up.
2. In the Neon console, create a new project. Accept the defaults for region and Postgres version unless the user has a preference.
3. In the project dashboard, open **Connection Details**. Set the dropdown to **Pooled connection** and copy the connection string. The pooled string is the right default for Next.js app runtime; the direct (non-pooled) string also works for one-off migrations if the pooled endpoint ever rejects long-running transactions.
4. Open `.env` and set:

   ```
   POSTGRES_URL=<the pooled connection string you copied>
   ```

   Make sure the value is on one line and the quotes (if any) match what is already in the file.

### Connection string shape

```
postgresql://<user>:<password>@ep-<id>-pooler.<region>.aws.neon.tech/<db>?sslmode=require
```

The `-pooler` segment and `sslmode=require` are the giveaways that this is the pooled string. If neither is present, the user probably copied the direct string — that still works, but flag it.

### Validation

Neon does not need a local container. Either run `<pm> db:migrate` and read the output, or — if `psql` is available — sanity check first:

```bash
psql "<the connection string>" -c "select 1;"
```

### Common failure modes

- **`password authentication failed`** — the user pasted a string from a different project, or the password was rotated. Have them reveal/copy the password again from the Neon console.
- **`SSL connection required`** — the string is missing `?sslmode=require`. Append it.
- **`endpoint is disabled` / `compute is suspended`** — Neon auto-suspends idle free-tier computes. The first connection wakes it; just retry the migration.

---

## Path C: Vercel Postgres

### When to pick this

The user is already deploying to Vercel and wants the database in the same project, with env vars wired up automatically on deploy.

### Prerequisites

- A Vercel account.
- For the CLI sub-path: Node available (already confirmed in pre-flight) and the `vercel` CLI installable via `npm i -g vercel`.

### Exact steps

Pick one of the two sub-paths. The dashboard sub-path is simpler; the CLI sub-path is better if the user already has a linked Vercel project.

**Sub-path C1: Dashboard**

1. Open https://vercel.com/dashboard and go to the project (create one if needed).
2. Open **Storage** → **Create** → **Postgres**. Choose a region close to the user.
3. After the store is created, open the **`.env.local`** tab. Copy the `POSTGRES_URL` value (Vercel may also expose `DATABASE_URL` and `POSTGRES_PRISMA_URL` — use `POSTGRES_URL`).
4. Paste it into `.env`:

   ```
   POSTGRES_URL=<the value from Vercel>
   ```

**Sub-path C2: CLI**

1. Install and authenticate the Vercel CLI:

   ```bash
   npm i -g vercel
   vercel login
   ```

2. From the project root, link the project (creates a new Vercel project if needed):

   ```bash
   vercel link
   ```

3. Create the Postgres store via the dashboard (the CLI does not yet create stores end-to-end), then pull env vars locally:

   ```bash
   vercel env pull .env.local
   ```

4. Open `.env.local`, find `POSTGRES_URL`, and copy that value into `.env` (the project reads `.env`, not `.env.local`, for migrations).

### Connection string shape

```
postgres://<user>:<password>@<region>.postgres.vercel-storage.com/<db>?sslmode=require
```

### Validation

Run `<pm> db:migrate` and read the output. If the user prefers a pre-check and has `psql`:

```bash
psql "<POSTGRES_URL>" -c "select 1;"
```

### Common failure modes

- **`POSTGRES_URL` is empty after `vercel env pull`** — the store is not attached to the linked project. In the Vercel dashboard, open the store, then **Projects** → connect it to the linked project, then re-run `vercel env pull .env.local`.
- **Migrations time out** — Vercel Postgres enforces tight idle timeouts on the pooled URL. If migrations fail mid-way, switch `POSTGRES_URL` to the non-pooled `POSTGRES_URL_NON_POOLING` value (also in `.env.local`) just for the migration, then switch back.
- **Used the wrong env var name** — the project reads `POSTGRES_URL` only. Other Vercel-supplied names (`DATABASE_URL`, `POSTGRES_PRISMA_URL`) will not be picked up.

---

## Path D: BYO connection string

### When to pick this

The user already has a Postgres instance somewhere — Supabase, AWS RDS, Railway, Render, Fly, self-hosted, etc. — and just wants to point the app at it.

### Prerequisites

- A reachable Postgres 14+ instance (the schema works on any modern Postgres; `pgvector` is only required if the user enables vector search).
- The full connection string with credentials.

### Exact steps

1. Ask the user to paste the connection string. Validate it looks like a Postgres URI (`postgresql://` or `postgres://`) — if not, ask again.
2. Provider-specific pointers:
   - **Supabase**: Project Settings → **Database** → **Connection string** → **URI**. Use the **Session pooler** string for app runtime; the direct connection works for migrations.
   - **Railway / Render / Fly**: copy the `DATABASE_URL` from the service's variables tab.
   - **RDS / self-hosted**: ensure the user's IP is in the security group / firewall allowlist before pasting.
3. Set it in `.env`:

   ```
   POSTGRES_URL=<pasted connection string>
   ```

### Connection string shape

```
postgresql://<user>:<password>@<host>:<port>/<database>[?sslmode=require]
```

`sslmode=require` is typical for managed providers and usually optional for self-hosted Postgres on a private network.

### Validation

If the user has `psql`:

```bash
psql "<POSTGRES_URL>" -c "select 1;"
```

Otherwise jump straight to `<pm> db:migrate` and read any error.

### Common failure modes

- **`connection refused` / timeout** — host or port wrong, or the user's IP is not allowlisted. Have them check the provider's firewall / IP allowlist.
- **`SSL/TLS required`** — add `?sslmode=require` to the string.
- **`role does not exist` / `database does not exist`** — the connection string points at the right server but the wrong user or database name. Re-copy it from the provider dashboard.

---

## Then what?

Once `POSTGRES_URL` is set and validated, return to SKILL.md step 7 and run:

```bash
<pm> db:migrate
```

This applies the migrations checked in under `drizzle/` and creates the Better Auth tables.

If the command fails with a connection error, the string is wrong — recheck it against the path above and retry. If the command fails partway through (some migrations applied, one errored), **do not** fall back to `db:push`, `db:dev`, or `db:reset`. Read the actual error, fix the underlying issue (often a stale row, a permission issue, or a pre-existing table from a previous half-run), and re-run `db:migrate`.
