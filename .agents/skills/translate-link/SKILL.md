---
name: translate-link
description: >
  Project-specific skill for AraLink, the Arabic RTL translation tool that translates
  anything from a URL (YouTube videos, articles, websites) into any language.
  ALWAYS load this skill before creating, modifying, or debugging any translation-related
  code — frontend (index.html/style.css/script.js) or backend (server/*.js).
  Covers URL parsing, content extraction, YouTube transcript handling, translation
  engine integration, language detection, and the RTL Arabic UI.
---

# AraLink — Translation Feature Work

This project translates anything from a URL. The user pastes a link, picks a target
language, and gets translated content back. UI is Arabic RTL; code is English.

## URL Type Detection (Step 1)

Classify the incoming URL first:

- **YouTube:** `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, embedded `youtube.com/embed/ID`
- **Article / webpage:** anything else (http/https). Some pages are PDFs — handle `.pdf` links by fetching and extracting text.

Extract the YouTube video ID with a regex like `(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})`.

## Content Extraction (Step 2)

### YouTube
- Use the `youtube-transcript` npm package (`YoutubeTranscript.fetchTranscript(videoId)`).
- Try languages in order: user-selected → `en` → `en.auto` → first available.
- Output shape: array of `{ text, start (seconds), duration }`.
- If no transcript exists: return a clear error → frontend shows "هذا الفيديو لا يحتوي على ترجمة نصية".

### Articles / Websites
- Fetch server-side (Node fetch or axios). Set `User-Agent` header to a real browser string.
- Strip scripts/styles/nav/footer/ads with cheerio. Keep `h1-h3`, `p`, `li`, `blockquote`, `img alt` text.
- Preserve heading structure and paragraph breaks — translation must keep them.

## Translation (Step 3)

- **Detection:** use the `translate` npm package's `isSupported` + detection, or Gemini's language detection. Show the detected language to the user.
- **Engine:** `server/translate.js` exports `translateText(text, targetLang, sourceLang?)` and `detectLanguage(text)`.
  - Primary: free Google Translate endpoint (POST `https://translate.googleapis.com/translate_a/single?client=gtx`).
  - Fallback: Gemini API (`GEMINI_API_KEY` in `.env`) when primary fails.
  - Secondary fallback: `@vitalets/google-translate-api` package.
- **Chunking:** split long text into chunks ≤ 4500 chars on sentence boundaries; translate sequentially; join with original separators.
- **Never translate:** URLs, code blocks, timestamps, YouTube video IDs, `[Music]` tags.
- Keep all `\n` structure: translate paragraph by paragraph.

## Frontend (Step 4)

- `script.js` calls backend endpoints:
  - `POST /api/translate` — body `{ url, targetLang }` → `{ type: 'youtube'|'article', sourceLang, translated, original, meta }`
  - `POST /api/translate-text` — plain text translation (no URL) — used for the quick text box.
- Render result per `type`:
  - `article` → translated paragraphs in the "الترجمة" tab, original in "النص الأصلي" tab.
  - `youtube` → embedded player (`https://www.youtube.com/embed/{id}`) + timestamped translated captions, with a "تحميل SRT" button (format: `00:00:01,000 --> 00:00:04,000` lines).
- Show progress steps in Arabic: "جاري جلب المحتوى…" → "جاري الترجمة…" → "تمت الترجمة ✓".
- Follow DESIGN.md tokens exactly (`--primary`, `--bg-card`, Cairo font, RTL).

## Testing Checklist (always finish with these)

1. `node --check server/*.js`
2. Start server, open `http://localhost:3000` (server serves `index.html`).
3. Test with a real YouTube URL (with captions) and a real article URL.
4. Verify RTL rendering, no English text visible in UI, no broken layout at 375px width.
5. Verify error path: paste a broken/invalid URL → Arabic error card appears.
