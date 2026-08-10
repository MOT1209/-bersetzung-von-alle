---
name: create-agentic-app
description: >
  Scaffold and fully configure a new Agentic Coding Starter Kit project —
  a Next.js 16 + TypeScript + Better Auth + Drizzle + PostgreSQL + AI SDK
  boilerplate. Use this skill whenever the user asks to set up, scaffold,
  create, initialize, or bootstrap an "agentic coding starter kit",
  "agentic app", "agentic boilerplate", a "Next.js app with auth and db",
  or mentions `create-agentic-app` / `npx create-agentic-app`. Walks the
  user through folder strategy, package-manager choice, Postgres setup
  (Docker / Neon / Vercel / BYO), OpenRouter AI configuration, migrations,
  a build check, and dev-server verification — ending with a working
  http://localhost:3000.
---

# Create Agentic App

Walk the user from "I want to build something" to a verified, running Agentic Coding Starter Kit project at `http://localhost:3000`. Every step has a clear purpose — explain it briefly to the user as you go, so they understand the choices being made on their behalf.

All shell commands below are written in POSIX form. On Windows, run them through the Bash tool (Git Bash / WSL), which is available on every supported platform. Do not translate to PowerShell unless a command actually fails.

This skill is linear with two real branch points: folder strategy (Step 2) and database choice (Step 6). Everything else is a yes/no or a default. Move through the steps in order — skipping ahead breaks assumptions downstream (e.g. migrations require a configured `POSTGRES_URL`).

**`<pm>` substitution:** Throughout this file and the references, `<pm>` is a placeholder for the chosen package manager — substitute as follows:

- `pnpm` → `pnpm db:migrate`, `pnpm build:ci`, `pnpm dev`
- `npm` → `npm run db:migrate`, `npm run build:ci`, `npm run dev` (the `run` is required for npm script invocation)
- `yarn` → `yarn db:migrate`, `yarn build:ci`, `yarn dev`

## 1. Pre-flight Checks

Detect what the user already has installed before asking them to pick anything. Probing first means later questions only offer real options — nothing is worse than asking "pnpm or npm?" and then discovering pnpm isn't installed.

Run all six probes in parallel via a single batch of Bash calls:

```bash
node --version
pnpm --version
npm --version
yarn --version
docker --version
git --version
```

Interpret the results:

- **Node.js** must be `>= 18`. If `node --version` fails or returns < 18, stop and tell the user to install Node 18+ from https://nodejs.org. Do not continue — every step from here on requires Node.
- **Git** must be present (the scaffolder uses it). If missing, stop and direct the user to https://git-scm.com/downloads.
- **Package managers**: remember which of `pnpm`, `npm`, `yarn` succeeded. Discard the ones that failed — you will never offer them as options in Step 3.
- **Docker** is optional here; it only matters if the user picks the local-DB path in Step 6. Note whether `docker --version` succeeded.

Report findings as one short sentence to the user — for example: "Found Node 20.11, pnpm 9.1, npm 10.5, Docker 27.0, Git 2.43. Yarn not detected." Do not dump raw command output.

## 2. Folder Strategy

The scaffolder (`create-agentic-app`) refuses to write into a non-empty target. The agent has to pick the right invocation based on what is in the current working directory.

Run `ls -A` (includes dotfiles) in the cwd to see what is there.

### 2a. Empty or git-only cwd

If the directory is empty or only contains `.git`, scaffold directly in place. Skip to Step 3 — you will run `npx create-agentic-app@latest .` later.

### 2b. Non-empty cwd

Ask the user via `AskUserQuestion`:

> "This folder isn't empty. Where do you want the starter scaffolded?"
> - **Subfolder** — pick a name (default: `my-app`); the starter lives at `./<name>/`.
> - **This folder** — I will scaffold into a temp directory and move the files back into the current folder. Use this if you want the starter to *replace* the current folder's contents (or merge with them).
> - **Cancel** — stop and let me sort the directory out first.

If they pick **subfolder**: ask for the folder name, default to `my-app`. The scaffold target in Step 4 becomes `./<name>`. Skip the temp-dir dance.

If they pick **this folder**: the agent does the following carefully, because hidden files and name collisions both bite:

1. Pick a temp dir name that does not already exist: `../$(basename "$PWD")-scaffold-tmp`. If that path is already taken, append a short random suffix.
2. Run the scaffolder in the temp dir (Step 4 with `<target>` = the temp dir). **Always pass `--skip-git` for the temp-dir variant** — otherwise the CLI creates an initial commit inside the temp dir, and the `.git/` directory will overwrite the user's existing `.git/` when you move files back, destroying their history.
3. After scaffolding completes and the rest of the steps that *can* be done inside the temp dir are done (env file, migrations, etc. — they all work from inside the temp dir), move everything back. Use a command that includes hidden files. POSIX:
   ```bash
   shopt -s dotglob
   mv ../<temp-dir>/* ./
   shopt -u dotglob
   ```
   This catches `.env`, `.gitignore`, `.agents/`, `.claude/`, and any other dotfiles the starter ships.
4. **Before each overwrite**: if a file in the temp dir collides with an existing file in the cwd (e.g. the user already has a `README.md`, a `.gitignore`, or a `.git/` directory), stop and ask the user via `AskUserQuestion` which one to keep. Do not silently clobber their work.
5. After the move, remove the now-empty temp dir: `rmdir ../<temp-dir>`.

Document this plan to the user *before* running it so they know what is about to happen to their cwd.

## 3. Package-Manager Choice

Ask via `AskUserQuestion`, but only show options that succeeded in Step 1's probe:

> "Which package manager should the starter use?"
> - **pnpm** *(only show if detected)* — recommended by the starter.
> - **npm** *(only show if detected)*
> - **yarn** *(only show if detected)*
> - **You pick for me** — defer to the agent.

If the user picks "you pick", prefer in order: `pnpm` → `npm` → `yarn` based on what is installed. Never suggest pnpm if `pnpm --version` failed in Step 1 — installing it just to satisfy a preference frustrates users.

Remember the chosen `<pm>` for every subsequent step.

## 4. Run the Scaffold

```bash
npx create-agentic-app@latest <target> --package-manager <pm> --yes
```

For the **temp-dir variant** (Step 2b "this folder"), add `--skip-git` to the command above — see Step 2b for why.

Where `<target>` is the path from Step 2 (`.`, `./my-app`, or `../<temp-dir>`) and `<pm>` is `pnpm`, `npm`, or `yarn` (the name only — no `--use-` prefix). The `--yes` flag auto-confirms the CLI's "directory is not empty" prompt; without it, the CLI prompts interactively and will hang under the Bash tool. Note that the CLI only prompts for confirmation when `<target>` is a named non-empty directory — when `<target>` is `.`, the CLI happily writes into the current folder regardless of contents, which is why Step 2's folder strategy matters.

Stream the scaffolder's output to the user so they can see what is happening. If the CLI errors (registry timeout, permissions, etc.), surface the exact error message and stop. Do not try to recover by guessing — most scaffolder failures need user-level fixes (network, npm config, permissions).

The CLI also runs `<pm> install` and `git init` (unless `--skip-git`) for you automatically. **Critically: the CLI captures the install output with `stdio: 'pipe'`, so a failed install only prints a warning and the CLI still exits 0.** Before continuing, verify dependencies actually installed:

```bash
test -d <target>/node_modules && ls <target>/node_modules | head -n 5
```

If `node_modules/` is missing or near-empty, run `<pm> install` from inside `<target>` before moving on. Otherwise `db:migrate` will fail later with a confusing `Cannot find module 'drizzle-kit'` error and you will have wasted the user's time.

After the scaffold completes, `cd` into the scaffolded directory for the rest of the flow. Subsequent commands assume you are inside it. For the temp-dir variant, `cd ../<temp-dir>` for now — you will move the files back into the original folder after Step 7 (post-migration) and then `cd` back. Running migrations from inside the temp dir is fine; the `.env` is right there.

## 5. Configure `.env`

The starter ships an `env.example` with sensible defaults but missing secrets. Set up `.env`:

1. Copy the template if `.env` does not already exist:
   ```bash
   cp env.example .env
   ```
2. Generate a strong `BETTER_AUTH_SECRET` (the value shipped in `env.example` is a placeholder — replacing it is non-negotiable for any environment beyond throwaway local dev):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Take the output and write it into `.env` as `BETTER_AUTH_SECRET=<value>`.
3. Confirm `NEXT_PUBLIC_APP_URL=http://localhost:3000` is set (it already is in the template).
4. Leave the following blank for now — later steps populate them based on user opt-in:
   - `OPENROUTER_API_KEY` (Step 8)
   - `BLOB_READ_WRITE_TOKEN` (Step 9b)
   - `POLAR_WEBHOOK_SECRET` / `POLAR_ACCESS_TOKEN` (Step 9b)

Tell the user: "I have set up `.env` with a fresh auth secret. Database URL and optional integrations come next."

## 6. Database Setup

Ask via `AskUserQuestion`:

> "Which PostgreSQL setup do you want?"
> - **Local Docker** *(only show if `docker --version` succeeded in Step 1)* — recommended for local development; uses the included `docker-compose.yml`.
> - **Neon** — free serverless Postgres in the cloud (good for solo dev and small projects).
> - **Vercel Postgres** — best if you plan to deploy to Vercel anyway.
> - **Bring your own** — you have a `POSTGRES_URL` already.

Once the user picks, **now read `references/database.md`** and follow the section for the chosen branch. That file has the exact commands, the connection-string format to expect, and the validation steps for each path. Do not paste those details here — they go stale and crowd this workflow.

After the chosen branch completes, you will have a valid `POSTGRES_URL` in `.env`. Move on to migrations.

## 7. Run Migrations

```bash
<pm> db:migrate
```

This applies the starter's pre-generated migrations and creates the Better Auth tables. The boilerplate already ships generated migrations, so you do not need `<pm> db:generate` here — that command is only relevant later when the user changes the schema.

**Never run `<pm> db:push`** as a shortcut if migrations fail. Per the project's `AGENTS.md` rule: drizzle push bypasses the migration history and creates drift that is painful to recover from. If `db:migrate` fails, surface the exact error to the user — it is almost always a wrong `POSTGRES_URL`, an unreachable database, or stale auth credentials — and offer to retry once they fix the underlying cause.

## 8. AI Capabilities — Opt-in

Ask the user:

> "Do you want AI features enabled? The starter wires up the Vercel AI SDK via OpenRouter, which lets you swap models without code changes. You can skip this and add it later."

If **yes**:

1. Walk the user to https://openrouter.ai/settings/keys to create an API key.
2. Ask them to paste it; set `OPENROUTER_API_KEY=<key>` in `.env`.
3. Confirm the default `OPENROUTER_MODEL="openai/gpt-5-mini"` is fine, or let them swap it for any model listed at https://openrouter.ai/models.

If **no**: leave `OPENROUTER_API_KEY` blank. The chat route at `/api/chat` will return an error if invoked, but the rest of the app runs fine. Note this to the user so they are not surprised later.

## 9. Authentication — Inform, Don't Configure

Tell the user, in roughly these words:

> The starter ships with email + password authentication enabled by default — that is enough for an MVP. If you want social sign-in (Google, GitHub, etc.), I can add it via Better Auth — but I recommend starting with email/password and adding OAuth later when you actually need it.

If the user wants OAuth **now**, **read `references/auth.md`**. That file links the Better Auth provider docs, tells the agent to fetch the relevant page with WebFetch, and reminds you to keep email/password enabled alongside any new providers. Otherwise, skip it — adding OAuth is cheap to do later and adds friction up front.

## 9b. Production Extras — Opt-in (Single Multi-Select)

Ask once via `AskUserQuestion` (multi-select):

> "Which production integrations do you want set up now? Pick any that apply, or leave them all unchecked to skip and keep the setup lean — you can add them later."
> - **File uploads with Vercel Blob**
> - **Payments with Polar**
> - **Transactional email (Resend / Postmark / etc.)**

If the user picks nothing, skip this step entirely — do not load the reference file. Loading docs the user does not need wastes their context budget.

For each item the user *does* pick, **read the corresponding section of `references/production-extras.md`** and walk them through it. That file has independent sections for Blob, Polar+ngrok, and email — only consult the ones that apply.

## 10. Verify the Build

```bash
<pm> build:ci
```

Use `build:ci` (not `<pm> build`) because the default `build` script also runs migrations — and we already migrated in Step 7. Running them twice is harmless but slower and noisier.

If the build fails: surface the exact error to the user. Common causes are missing env vars (re-check `.env`) or stale Node modules (`<pm> install` again if needed). Do not paper over a build failure by "fixing forward" — most build errors at this stage indicate a misconfiguration that will haunt the dev server later.

## 11. Start the Dev Server and Verify

Start the dev server in the background:

```bash
<pm> dev
```

Run this via the Bash tool's `run_in_background: true` option so the rest of the verification can run alongside it. The Bash tool returns immediately — **Next.js needs a few seconds to compile and bind to port 3000**, so do not curl right away or you will get a connection-refused error and falsely conclude the app is broken.

Wait for readiness one of two ways:

- **Preferred**: use the `Monitor` tool to tail the background process and wait for a line containing `Ready in` or `Local:        http://localhost:3000`. That is Next's own signal that the port is bound.
- **Fallback**: retry the HTTP check 5 times with a 2-second pause between attempts. Treat connection-refused as "not ready yet, retry"; treat any HTTP response (even 500) as "the server is up, now check the body".

Then verify three things:

1. **The process is still alive.** A dev server that crashed during boot will not respond — check the background process output before concluding.
2. **HTTP 200 from `http://localhost:3000`.** Use the Bash tool:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
   ```
   On Windows without curl, fall back to PowerShell via the PowerShell tool: `(Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing).StatusCode`.
3. **No fatal errors** in the dev server's stdout/stderr — scan the background output for stack traces, DB connection refusals, or missing-env-var warnings.

If any of these fail, common causes to call out:

- **Port 3000 already in use** — another process is bound to it. Tell the user, and either kill the other process or run `PORT=3001 <pm> dev`.
- **Database connection refused** — Docker container stopped, wrong `POSTGRES_URL`, or the hosted DB is paused. Re-check Step 6.
- **`BETTER_AUTH_SECRET` missing or weak** — re-check Step 5 and regenerate.

Fix the failure before claiming success — a half-running app is worse than an honest error.

## 12. Report Success

Tell the user, in this order:

1. **The app is live** at http://localhost:3000.
2. **Where `.env` is** (absolute path) and a one-line summary of which integrations are set versus blank — for example: "auth secret set, Postgres set (Docker), OpenRouter set, Blob/Polar/email blank".
3. **A starter prompt** they can paste into the agent to begin building their actual app. Use this template (matches the README):

```text
I am using the Agentic Coding Starter Kit. Treat the existing app as boilerplate that should be replaced by the product I describe.

Use the project instructions in AGENTS.md or CLAUDE.md. During planning, ask clarifying questions before making assumptions. During implementation, split the work into small chunks, use sub-agents where useful, follow DESIGN.md for UI, preserve the existing tech stack unless there is a good reason to change it, and run lint, typecheck, and build before finishing.

What I want to build:
[Describe your app here]
```

4. **A pointer** to the three files that will drive future agent behavior in this project: `AGENTS.md`, `CLAUDE.md`, and `DESIGN.md`.

Keep this final message short — the user wants to start building, not read a wall of text.

## Publishing Note

If the user asks how other people can install this skill, the answer is:

```bash
npx skills add <owner>/<repo>@create-agentic-app --agent claude-code
```

The `--agent claude-code` flag is required — without it, the installer drops the skill into 37+ IDE adapter folders at the project root, which is rarely what anyone wants.
