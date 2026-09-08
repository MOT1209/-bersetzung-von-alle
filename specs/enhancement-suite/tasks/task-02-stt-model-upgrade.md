# Task 02: Upgradable STT models (sherpa + transformers) for better Arabic/Turkish

## Status

complete

## Wave

1

## Description

AraLink transcribes YouTube/local audio through an STT provider chain (`server/audio.js` → `server/providers/stt/`). The default engine is **sherpa-onnx** (`providers/stt/sherpa.js`), which currently hard-codes the multilingual **whisper-tiny int8** model (~75MB). The fallback engine is **@xenova/transformers** (`providers/stt/transformers.js`), which uses `config.WHISPER_MODEL` (default `Xenova/whisper-tiny`, 39MB). Whisper-tiny is weak on Arabic and Turkish. This task makes the sherpa model size configurable (`SHERPA_WHISPER_VARIANT`) and raises the transformers default to `Xenova/whisper-small`, while keeping `.env` overrides and graceful behavior when a larger model can't be downloaded.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None.

## Files to Create

- None.

## Files to Modify

- `server/providers/stt/sherpa.js` — make model files/base URL variant-driven by `config.SHERPA_WHISPER_VARIANT`.
- `server/config.js` — add `SHERPA_WHISPER_VARIANT`; change `WHISPER_MODEL` default to `Xenova/whisper-small` (comment notes memory cost).
- `.env.example` — document both new/updated variables with guidance.
- `server/providers/stt/transformers.js` — no code change required (already reads `config.WHISPER_MODEL` at load); verify it honors the new default.

## Technical Details

### Current behavior

`sherpa.js` hard-codes the model files and base URL:

```js
const SHERPA_FILES = {
  encoder: 'tiny-encoder.int8.onnx',
  decoder: 'tiny-decoder.int8.onnx',
  tokens: 'tiny-tokens.txt',
};
const SHERPA_BASE = 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/';
```

`config.js` currently:

```js
WHISPER_MODEL: process.env.WHISPER_MODEL || 'Xenova/whisper-tiny',
```

### Implementation Steps

1. In `server/config.js`:
   - Add `SHERPA_WHISPER_VARIANT: process.env.SHERPA_WHISPER_VARIANT || 'tiny'` (validated to one of `tiny|base|small` at use site).
   - Change `WHISPER_MODEL` default to `'Xenova/whisper-small'` (transformers fallback). Keep the existing comment warning about memory/disk and Arabic/Turkish accuracy.
2. In `server/providers/stt/sherpa.js`:
   - Define a variant map keyed by variant name. Each entry holds `files` (`encoder`/`decoder`/`tokens`) and `base` (Hugging Face repo URL). Example:

```js
const SHERPA_VARIANTS = {
  tiny: {
    base: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/',
    files: { encoder: 'tiny-encoder.int8.onnx', decoder: 'tiny-decoder.int8.onnx', tokens: 'tiny-tokens.txt' },
  },
  base: {
    base: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/main/',
    files: { encoder: 'base-encoder.int8.onnx', decoder: 'base-decoder.int8.onnx', tokens: 'base-tokens.txt' },
  },
  small: {
    base: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/',
    files: { encoder: 'small-encoder.int8.onnx', decoder: 'small-decoder.int8.onnx', tokens: 'small-tokens.txt' },
  },
};
```

   - **Verify the exact file names** from the Hugging Face repos before hard-coding — the upstream repos occasionally rename files (`-encoder.onnx`, `.int8.onnx`, etc.). If a repo does not provide an int8 build for a variant, document the actual names and use them; the downloader in `ensureSherpaModel()` must fetch exactly the files that exist.
   - Resolve the active variant: `const variant = Object.keys(SHERPA_VARIANTS).includes(config.SHERPA_WHISPER_VARIANT) ? config.SHERPA_WHISPER_VARIANT : 'tiny';` (fallback to tiny so an invalid `.env` value never breaks the server).
   - Use `SHERPA_VARIANTS[variant].base` + `SHERPA_VARIANTS[variant].files` in `ensureSherpaModel()` and in the recognizer paths (both places currently reference `config.SHERPA_ENCODER || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.encoder)` — update the file-name fallback to the variant map).
   - Because each variant needs its own files, make the **model directory per-variant**: `config.SHERPA_MODEL_DIR` should default to a folder that includes the variant name (e.g. `models/sherpa-whisper-{variant}`) so switching variants doesn't collide with cached files. Implementers may keep `SHERPA_MODEL_DIR` as an explicit override; when unset, derive from the variant.
   - Update the log line in `ensureSherpaModel()` to name the variant.
3. In `server/providers/stt/transformers.js`: no change needed (it already reads `config.WHISPER_MODEL` when `getPipeline()` first loads). Just confirm the new default flows through.
4. Update `.env.example`:
   - Change the `WHISPER_MODEL` guidance to note `whisper-small` is now the default and explain the tiny→small tradeoff (memory/CPU vs Arabic/Turkish accuracy).
   - Add `SHERPA_WHISPER_VARIANT=tiny|base|small` with guidance (default `tiny`), noting the first use downloads the model to `MODEL_DIR`.

### Environment Variables

- `WHISPER_MODEL` — transformers fallback model. Default becomes `Xenova/whisper-small`. Example values: `Xenova/whisper-tiny`, `Xenova/whisper-base`, `Xenova/whisper-small`.
- `SHERPA_WHISPER_VARIANT` — sherpa default-engine model size. Default `tiny`. Values: `tiny|base|small`.
- `MODEL_DIR` — existing; folder for downloaded sherpa models (per-variant subfolder).

## Acceptance Criteria

- [ ] Setting `SHERPA_WHISPER_VARIANT=small` makes `ensureSherpaModel()` download the small variant files into `models/sherpa-whisper-small/` and the recognizer loads them.
- [ ] An invalid `SHERPA_WHISPER_VARIANT` value falls back to `tiny` without throwing.
- [ ] `config.WHISPER_MODEL` defaults to `Xenova/whisper-small` (and can still be overridden via `.env`).
- [ ] `transcribeMediaFile()` on a short local audio sample still returns `{ chunks }` using sherpa, and still falls back to transformers when sherpa fails at runtime (existing chain in `server/audio.js:resolveSttChain`).
- [ ] `.env.example` documents both variables.
- [ ] `node --check server/providers/stt/sherpa.js server/config.js` passes; `npm run lint` and the `tests/*transcribe*`/`tests/*audio*` tests pass.

## Notes

- Model downloads happen once and are cached on disk (`ensureSherpaModel`); larger variants take longer and use more RAM/CPU — that is expected.
- Do not change the `TranscriptionProvider` interface (`transcribe(audio, lang) → { text, segments }`). `server/audio.js` and its tests depend on it.
- The `SUPPORTED_STT_LANGS` gate (`ar/de/tr/en`) in `providers/stt/lang.js` is unchanged and stays.