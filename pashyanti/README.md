# pashyanti/ — the app

Scaffolding only. No abstractions, no frameworks — one file per job.

```bash
python -m venv .venv && . .venv/bin/activate
sudo dnf install -y portaudio
pip install -r requirements.txt
cp .env.example .env          # then paste your key
```

`api.py` reads `GNANI_API_KEY` from `./.env` if it is set there; a real
environment variable always wins. Never commit `.env`.

| File | Job |
|---|---|
| `api.py` | `tts()` and `stt_file()` — REST calls, nothing else |
| `probe.py` | One 1,000-char TTS call + one 10 s STT call, to read the credit rate off the dashboard |
| `stream_mic.py` | Live mic → `wss://api.vachana.ai/stt/v3/stream` |
| `test_stream_file.py` | Replays a 16 kHz wav into the same socket — tests streaming where there is no microphone |
| `clone_voice.py` | `build ref.wav` → `embedding.json`, then `say "..."` → the same words in that voice |

```bash
python probe.py
python stream_mic.py                    # needs a real mic
python test_stream_file.py smoke.wav    # no mic needed
python clone_voice.py build ref.wav     # 5-30 s of clean speech
python clone_voice.py say "नमस्ते, मैं पश्यन्ती हूँ।"
```

## Two facts that will cost you an evening

1. **Frame size is exact.** The WebSocket takes raw PCM s16le mono in frames of
   *exactly* 1024 bytes — 512 samples, i.e. 32 ms at 16 kHz, 64 ms at 8 kHz — sent
   at real-time cadence. A browser `MediaRecorder` (WebM/Opus) cannot feed this.
2. **Prisma v3.0 is opt-in.** Omit `model=prisma-v3.0` and you silently get v2.5.
   The `3` in `/stt/v3` is the URL version, not the model version.

`stream_mic.py` needs PortAudio (`sudo dnf install portaudio` on Fedora) and
`websockets>=12`; the header name changed in v14, so the script tries both.
