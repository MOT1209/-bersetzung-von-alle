# Requirements: AraLink — URL Translation Tool

## Summary

AraLink is an Arabic-first (RTL) web tool that translates anything from a URL into any
language. The user pastes a link (YouTube video, article, or website), picks a target
language, and receives translated content in a clean, readable interface.

The tool solves a real problem: reading or watching content in a foreign language is
friction. AraLink collapses that friction into one action — paste a link, choose a
language, read the result. It must work for three content types out of the box:
YouTube videos (transcript translation), articles (main-text extraction + translation),
and arbitrary websites (cleaned content translation).

The expected outcome is a working single-page app served by a small Node.js/Express
backend, fully functional locally on `http://localhost:3000`.

## Goals

- Translate YouTube video transcripts into any language with timestamps preserved.
- Translate articles and websites (main content only) into any language.
- Auto-detect the source language and show it to the user.
- Support all major languages (~100+) via a free translation engine with a Gemini fallback.
- Provide a polished Arabic RTL UI following DESIGN.md.
- Work entirely locally — no database, no external sign-up for the MVP.

## Non-Goals

- No user accounts, history, or saved translations (no database).
- No audio dubbing / text-to-speech (planned for a later phase).
- No browser extension or mobile app — web app only.
- No PDF export for the MVP (SRT download for YouTube only).
- No image/OCR translation.

## Acceptance Criteria

- [ ] Pasting a YouTube URL with captions shows an embedded player + translated captions
      with timestamps, and allows SRT download.
- [ ] Pasting an article URL shows translated main text (headings + paragraphs preserved),
      with a toggle to view the original.
- [ ] Source language is detected and displayed; any target language in the dropdown works.
- [ ] Pasting an invalid/broken URL shows a clear Arabic error message, not a crash.
- [ ] UI is fully RTL Arabic, dark theme, follows DESIGN.md tokens, works at 375px width.
- [ ] All server files pass `node --check`; the full flow works on `http://localhost:3000`.

## Assumptions

- Free Google Translate endpoint remains reachable from the server; if not, Gemini
  fallback with `GEMINI_API_KEY` in `.env` covers the gap.
- The `youtube-transcript` npm package can fetch captions for most public videos;
  videos without captions show a clear Arabic notice.
- Target sites generally allow server-side fetching; robots.txt-blocked sites may fail
  and that failure is surfaced gracefully.
- Node.js 18+ and npm are available on the development machine.

## Technical Constraints

- Frontend: `index.html` + `style.css` + `script.js`, no framework, Arabic RTL.
- Backend: Node.js + Express in `server/`, serves the frontend statically.
- No database, no ORM, no auth for the MVP.
- All external fetches happen server-side (CORS-safe); the browser never fetches
  third-party sites directly.
- API keys only in `.env` (never committed). Free Google endpoint needs no key.
- Follow AGENTS.md and DESIGN.md; load the `translate-link` skill before implementation.
