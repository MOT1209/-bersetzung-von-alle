# Task 02: Translation Engine — Detect, Chunk, Translate, Fallback

## Status

completed — server/translate.js: كشف لغة + تقسيم ≤4500 حرف + ترجمة Google مجانية (3 محاولات مع تراجع) + احتياطي Gemini. عند فشل كل الخدمات يرفع `translate-failed` بدل إرجاع النص الأصلي بصمت (تحسين من task-06).

## Wave

1

## Description

Build the core translation module `server/translate.js`: language detection and
text translation for any target language, using the free Google Translate endpoint as
primary engine and Gemini API as fallback. This module is the heart of the product —
everything (articles, YouTube transcripts, quick text) funnels through it. It must
chunk long text safely, preserve structure, and never translate URLs or timestamps.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-article-extraction.md, task-05-youtube-transcript.md

**Context from dependencies:** Task-01 provides the server skeleton and `server/config.js`
with `GEMINI_API_KEY`. This task only needs `config.js` to exist for the fallback path —
it does not need the server routes yet.

## Files to Create

- `server/translate.js` — exports `detectLanguage(text)`, `translateText(text, targetLang, sourceLang?)`, `chunkText(text, maxChars)`

## Files to Modify

- None

## Technical Details

### detectLanguage(text)
- POST to `https://translate.googleapis.com/translate_a/single?client=gtx` with
  body params `q=<text>`, `sl=auto`, `tl=en`, `dt=t`. The response's 2nd element
  contains the detected language code (e.g. `'ar'`, `'en'`).
- Return the code; map nothing — codes are ISO 639-1, the frontend maps to Arabic names.

### translateText(text, targetLang, sourceLang)
1. If `text` is empty → return `''`.
2. Chunk via `chunkText` (default max 4500 chars, split on sentence boundaries — look
   for `. `, `! `, `? `, `\n` — never split a URL or inside a `<...>` tag).
3. For each chunk, POST to the same gtx endpoint with `q=chunk`, `sl=sourceLang || 'auto'`,
   `tl=targetLang`, `dt=t`. Response is `[[[translated, original, ...], ...], detectedSl]`.
   Join segment[0] of each `[translated,...]` triple → chunk translation.
4. If any chunk throws (rate limit / network), fall back to Gemini:
   `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=GEMINI_API_KEY`
   with `systemInstruction` omitted (some models reject it) and body
   `{ contents: [{ role:'user', parts:[{ text: 'Translate to ' + targetLang + ':\n' + chunk }] }] }`.
   Extract `candidates[0].content.parts[0].text`.
5. Join chunk translations with the original separators (track separator positions in
   chunkText, or join with `\n\n` — acceptable for MVP as long as paragraphs survive).

### chunkText(text, maxChars)
- Return `{ chunks: string[], separators: string[] }` — chunks plus the separators that
  originally joined them, so translation joins back faithfully.
- Simpler alternative: split on `\n\n` first, then on `\n`, then on sentence ends,
  accumulating until `maxChars`. Return chunks array only (join with `\n\n`).

### Never translate
- Lines that are only a URL (`/^https?:\/\/\S+$/`), a timestamp (`/^\d{1,2}:\d{2}/`),
  a YouTube video ID, or `[Music]`/`[Applause]` style tags — pass through unchanged.

## Verification

1. `node --check server/translate.js` passes.
2. A quick node REPL test: `translateText('Hello world, how are you?', 'ar')` returns an Arabic string.
3. `detectLanguage('مرحبا بالعالم')` returns `'ar'`.
4. A 10,000-char English paragraph translates fully (chunking works, no truncation).
5. A mixed text with URLs + timestamps keeps those tokens untranslated.
