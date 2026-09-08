# Requirements: AraLink Enhancement Suite

## Summary

AraLink translates anything from a URL (YouTube, articles, websites, files) into any language, with an Arabic RTL dark-theme UI. This enhancement suite delivers seven upgrades that raise audio quality, add production durability, and improve the dubbing studio experience.

**Audio**: the in-app "listen" button (`/api/tts`) still uses the robotic Google gTTS voice while the dubbing path already defaults to natural EdgeTTS voices. We wire EdgeTTS into the listen endpoint and enlarge both STT (speech-to-text) models — the sherpa-onnx default and the transformers fallback — which materially improves Arabic and Turkish transcription.

**Production durability**: object storage (S3/R2) becomes an optional driver behind the existing key-based storage interface, and the job queue's driver boundary is made explicit so BullMQ can be added later without touching routes. Given the deployment target (Docker / self-hosted, persistent disk, single instance), neither is made mandatory.

**Studio UX**: the in-studio subtitle timeline becomes editable (fix machine-translation errors and re-generate only that segment's TTS), the parallel multi-language preview shows per-language progress and players, and the admin dashboard gains cost/quota counters (TTS segments, translation characters, ffmpeg seconds).

## Goals

- Use natural EdgeTTS voices (with gender/voice + speed) for the `/api/tts` listen endpoint, falling back to gTTS for long text or on failure.
- Upgradable Whisper models for both STT engines (sherpa and transformers) so Arabic/Turkish transcription is accurate while remaining configurable via `.env`.
- A durable, per-project cost/quota ledger exposed through the existing admin (ADMIN_TOKEN) dashboard.
- An in-studio subtitle editor that edits a segment's translation and regenerates only that segment's audio.
- A parallel multi-language preview grid in the YouTube studio showing per-language progress and per-result players.
- An optional S3/R2 storage driver behind the existing storage interface, keeping local disk as the default.
- A formally documented job-queue driver boundary so BullMQ/Redis can be layered in later without route changes.

## Non-Goals

- Making Redis/BullMQ mandatory. The project rule (AGENTS.md) keeps memory mode for single-instance; we document the boundary, we do not force Redis.
- Making S3/R2 mandatory. Local persistent disk remains the default (deployment target).
- Migrating the existing in-memory job store or the file-based stats/cache stores.
- Rewriting the dubbing pipeline end-to-end; we edit existing functions, not redesign them.
- Adding new translation providers or changing the provider fallback chain in `server/translate.js`.

## Acceptance Criteria

- [ ] Listening to a translated text uses EdgeTTS when a voice is available/short text; falls back to gTTS for >1500 chars or on Edge failure.
- [ ] `WHISPER_MODEL` (transformers) and a new sherpa model variant can both be set via `.env` and are honored at transcription time.
- [ ] `GET /api/stats/cost` returns accumulated TTS segment count, translation characters, and ffmpeg seconds, gated by ADMIN_TOKEN.
- [ ] Editing a segment via the PATCH endpoint updates `translation-{lang}.json` and regenerates only that segment's audio (other segments untouched).
- [ ] The studio timeline renders editable segments that save via PATCH and show a confirmation.
- [ ] The studio renders a grid of per-language progress bars and players for multi-language dubs.
- [ ] The admin dashboard shows the three cost/quota cards alongside existing stats.
- [ ] Storage driver selection via `STORAGE_DRIVER` supports `local` (default) and `s3` (optional) without breaking existing local-only deployments.
- [ ] `server.js` mounts any new endpoint and `tests/smoke.test.js` still passes.

## Assumptions

- The deployment is a single Node instance on a persistent disk (Docker/self-hosted), so Redis and S3 are optional.
- `msedge-tts` remains installable/functional in the target environment (it is currently a production dependency and defaults for dubbing).
- sherpa-onnx Whisper model variants (`base`/`small`) are available from the same Hugging Face repo family as the current `tiny` download.

## Technical Constraints

- Follow the existing provider/driver abstraction patterns: `server/providers/storage/` (by key, never path), `server/providers/tts/`, `server/providers/stt/`.
- All SQL stays in `server/db/`; no new ORM/database.
- Arabic-first RTL UI, `DESIGN.md` system, English code comments.
- Every new route mounted in `server/server.js` and covered by a smoke test.
