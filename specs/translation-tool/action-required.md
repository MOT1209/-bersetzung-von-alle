# Action Required — AraLink

Manual steps that need a human. Complete these before or during the relevant wave.

## Before Wave 1

- [ ] **Node.js 18+ installed** — check with `node -v`. Install from https://nodejs.org if missing.
- [ ] (Optional) **Gemini API key** — needed only for the fallback translation engine.
      Get one free at https://aistudio.google.com/apikey and put it in `.env` as
      `GEMINI_API_KEY=...`. Without it, the free Google endpoint still works for the primary path.

## During Wave 3 (final verification)

- [ ] **Browser check** — open `http://localhost:3000` and manually test:
      - one YouTube URL with captions (e.g. any TED talk)
      - one article URL (e.g. a Wikipedia page)
      - one broken URL (expect the Arabic error card)
      - one quick-text translation
- [ ] Confirm the SRT file downloads correctly from a YouTube result.

## Notes

- No database, auth, or paid services required for the MVP.
- If Google's free endpoint rate-limits you, wait a moment — the retry/fallback logic in
  task-06 handles it.
