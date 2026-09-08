# Action Required: AraLink Enhancement Suite

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

No environment or account setup is required before implementation. EdgeTTS (`msedge-tts`) and the local storage driver are already installed/used by default.

## During Implementation

- [ ] **Decide default sherpa Whisper variant** — the implementer defaults `SHERPA_WHISPER_VARIANT=tiny` for compatibility, but you may change the default to a larger variant. Weigh transcription accuracy (Arabic/Turkish) against download size (~75MB tiny → ~145MB base → ~244MB small for the transformers models; sherpa variants vary).
  - **If you want `small` as the shipped default**, tell the implementer before task-02 so the default in `config.js` and `.env.example` matches.

## After Implementation

- [ ] **Adjust model sizes in `.env`** (optional, not required for the code to work):
  - `WHISPER_MODEL=Xenova/whisper-tiny|whisper-base|whisper-small` — transformers fallback engine.
  - `SHERPA_WHISPER_VARIANT=tiny|base|small` — default sherpa engine model size.
- [ ] **Enable S3/R2 storage** (optional; only if you want object storage beyond the local disk):
  - Set `STORAGE_DRIVER=s3` plus `S3_ENDPOINT` (e.g. your R2 `r2.cloudflarestorage.com` endpoint), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET`.
  - Create the bucket in your provider's console and ensure the credentials have read/write/list/delete on it.
  - If you leave `STORAGE_DRIVER` unset, the existing local disk storage is used (the deployment default).
- [ ] **Verify core flows post-deploy**: paste a YouTube/article/link → translated output; dub a short video and edit a subtitle segment; listen to a translated text.

---

> These tasks are also referenced in context within the relevant task files.
