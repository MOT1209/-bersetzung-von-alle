# Action Required — Audio Pipeline

Manual steps that need a human or one-time environment setup.

## Before Implementation

- [x] **ffmpeg installed and in PATH** — verified (Gyan.FFmpeg 8.1.2 via winget at
      `C:\Users\aihmo\AppData\Local\Microsoft\WinGet\Packages\...`). If missing:
      `winget install Gyan.FFmpeg` and re-open the terminal.

## During Implementation (first run)

- [ ] **Whisper model download** — the first transcription downloads ~145MB
      (`Xenova/whisper-base`) from Hugging Face. Requires internet; takes minutes on a
      slow connection. It is cached afterwards. To use a bigger/better model later, set
      `WHISPER_MODEL=Xenova/whisper-small` in `.env` (slower on CPU, better Arabic).

## Notes

- No API keys needed for the new features (Whisper is local; gTTS is a free endpoint).
- msedge-tts is installed but unusable in this environment — do not wire it up.
- Translation engine still uses the existing Google/Gemini setup; if those are
  rate-limited (429), audio transcription works but translation returns the
  `translate-failed` Arabic error card until quota resets.
