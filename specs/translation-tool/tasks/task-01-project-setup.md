# Task 01: Project Setup — Server Skeleton & Static Serving

## Status

completed — server/server.js + server/config.js موجودة وتعمل، يُخدم `/` من جذر المشروع، `/api/health` يستجيب، `npm run check` يمر على كل الملفات.

## Wave

1

## Description

Create the Node.js/Express backend skeleton and wire it to serve the frontend
(`index.html`, `style.css`, `script.js`) from the project root. This task establishes
the project layout every other task builds on: a working `http://localhost:3000` that
serves the app shell and a healthy `/api/health` endpoint.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-article-extraction.md, task-05-youtube-transcript.md

**Context from dependencies:** This is the foundation — no other task can run against a
server that does not exist yet. Tasks 4 and 5 will add their route handlers inside the
`server/` folder created here.

## Files to Create

- `package.json` — Node project manifest with `express`, `cors`, `dotenv` dependencies and a `dev` script (`node server/server.js`)
- `server/server.js` — Express app: static serving, JSON middleware, `/api/health`, mounts feature routers
- `server/config.js` — loads `.env` (dotenv), exports `PORT` (default 3000), `GEMINI_API_KEY`
- `.env` — from `.env.example` content; `PORT=3000`, `GEMINI_API_KEY=` (empty)
- `.env.example` — committed template with `PORT` and `GEMINI_API_KEY` placeholders
- `index.html` — minimal RTL Arabic shell (`<html lang="ar" dir="rtl">`, Cairo font link, links to style.css/script.js, empty main containers)
- `style.css` — DESIGN.md dark tokens as CSS variables + base reset (component styles come in task-03)
- `script.js` — placeholder: on DOMContentLoaded, call `/api/health` and log result
- `.gitignore` — ignores `node_modules/`, `.env`, `public/uploads/`

## Files to Modify

- None

## Technical Details

- Express 4 (stable) or 5 — either is acceptable; prefer what `npm install express` gives.
- Serve static files with `express.static(projectRoot)` where projectRoot is the repo root (so `/index.html`, `/style.css`, `/script.js` resolve).
- `server/server.js` must export the app and also `listen(PORT)` when run directly, so it can be tested with `node server/server.js`.
- Health endpoint: `GET /api/health` → `{ ok: true, service: 'aralink', time: <ISO> }`.
- Add `cors` middleware (dev convenience) and `express.json()`.
- CSS: define exactly these variables — `--bg #0b1220`, `--bg-card #111a2e`, `--bg-input #0d1526`, `--border #1f2b45`, `--text #e6edf7`, `--text-muted #8b9bb8`, `--primary #6366f1`, `--primary-hover #4f46e5`, `--accent #22d3ee`, `--success #34d399`, `--warning #fbbf24`, `--danger #f87171`, `--gradient linear-gradient(135deg,#6366f1,#8b5cf6)` (from DESIGN.md).
- Font: Cairo from Google Fonts (`<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap">`), `font-family: 'Cairo', sans-serif` on body.

## Verification

1. `node --check server/server.js` and `node --check server/config.js` pass.
2. `npm install` succeeds.
3. `node server/server.js` starts and `http://localhost:3000` returns the shell page.
4. `curl http://localhost:3000/api/health` returns `{ ok: true, service: 'aralink' }`.
5. `index.html` renders RTL with Cairo font and dark background.
