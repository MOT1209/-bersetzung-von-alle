# CRITICAL RULES - MUST FOLLOW

## PROJECT OVERVIEW

This is **"AraLink"** — a translation tool that translates anything from a URL:
- YouTube videos (extract transcript → translate → show subtitles)
- Articles and blog posts (fetch page → extract main text → translate)
- Any website (fetch → clean → translate → display side-by-side)
- Supports ALL languages (source auto-detected, target chosen by user)

UI language: **Arabic (RTL)**. Code comments and agent communication: English.

## RESPONSES

- Keep responses concise and to the point - unless the user asks otherwise
- The user communicates in Arabic — respond in Arabic to the user
- Always explain technical decisions in simple terms

## PLANNING MODE

- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user

## CHANGE / EDIT MODE

- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- Use the best model for the task - premium models for complex tasks (like coding) and mid-tier models for simpler tasks, like documentation
- After completing features (large or small), always run commands like lint, type check and build to check code quality

## ARCHITECTURE (follow unless user says otherwise)

- **Frontend:** `public/index.html` + `public/style.css` + `public/script.js` — Arabic RTL, dark theme (see DESIGN.md). Only `public/` is served over HTTP; never move frontend assets to the project root.
- **Backend:** Node.js + Express in `server/` — handles fetching (CORS), transcript extraction, translation
- **YouTube:** `server/youtube.js` — uses `youtube-transcript` npm package
- **Article/website fetching:** `server/fetchContent.js` — server-side fetch + cheerio/readability to extract main text
- **Translation:** `server/translate.js` — Google Translate (free) with Gemini API fallback; `translate` npm package for detection
- **Config:** `.env` for API keys (NEVER commit real keys)
- **Files/OCR/PDF/TTS:** `server/files.js` + `server/routes-file.js` (11→8 formats), `server/ocr.js` (Tesseract.js), `server/pdf.js` (PDF parsing), `server/tts.js` (MS Edge TTS) + `server/cache.js`/`usage.js`/`logger.js`
- **Extension:** `extension/` (Chrome Manifest V3: popup.js/background.js) — ترجمة فورية داخل المتصفح

## CONTENT EXTRACTION RULES

- Never fetch content from the browser — CORS will block it. Always go through the backend proxy.
- For YouTube links: extract video ID, then fetch transcript (prefer `en` or auto-generated captions), fall back gracefully if no transcript exists.
- For article links: fetch HTML server-side, remove nav/ads/scripts/styles, keep main article text + headings.
- Respect the source site — keep HTTP requests light, set a reasonable User-Agent.

## TRANSLATION RULES

- Auto-detect source language before translating (show detected language to user).
- Preserve line breaks and paragraph structure so the result remains readable.
- Never translate code blocks, URLs, or timestamps.
- For long texts, chunk the content (max ~4500 chars per request) and translate sequentially.
- Show progress to the user during long translations.

## DATABASE

- No database needed for MVP — this is a stateless tool. Do not add Postgres/ORM unless the user explicitly asks for history/saving features.

## TESTING

- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- Minimum check: `node --check` on server files + manual browser test of the flow (paste link → translated output)
- If the project does not have any testing tools available, ask the user whether testing should be skipped.

## UI DESIGN

- Always follow the UI design system when creating or reviewing components or pages.
- Design System: @DESIGN.md
- The UI MUST be RTL Arabic-first: `dir="rtl"` on the root, Arabic labels, Cairo/Tajawal font.
- Dark theme with accent color; progress states; error messages in Arabic.

## PROJECT STRUCTURE

```text
/                      ← project root (this is a translation tool, not a Next.js app)
├── public/            ← the ONLY directory served over HTTP
│   ├── index.html     ← main UI (RTL Arabic)
│   ├── style.css      ← design system styles
│   └── script.js      ← frontend logic (API calls, result rendering)
├── server/
│   ├── server.js      ← Express app (routes, proxy, static serving of public/)
│   ├── fetchContent.js← article/website extraction
│   ├── youtube.js     ← YouTube transcript extraction
│   ├── translate.js   ← translation + language detection
│   ├── files.js       ← file import/export (11 formats) + ocr.js/pdf.js/tts.js/cache.js/usage.js
│   ├── routes-*.js    ← file/ocr/tts/translate/video/settings routes
│   └── config.js      ← env/config loading
├── .env               ← API keys (never commit)
├── specs/             ← feature specifications (wave-based)
├── .agents/skills/    ← agent skills (workflows)
└── .claude/skills/    ← same skills for Claude Code
```

## SKILLS

- `.agents/skills/` and `.claude/skills/` contain skills that extend agent capabilities.
- Check the skills folder before starting a task — relevant skills MUST be loaded and followed.
- `create-spec`: use when asked to plan/break a feature into tasks
- `implement-feature`: use when asked to implement a spec wave-by-wave
- `translate-link`: project-specific skill for translation feature work — ALWAYS load before touching translation code
