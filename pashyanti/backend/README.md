# Pashyanti — backend

Python 3.12+ / asyncio. Serves the built frontend, owns the microphone, relays Gnani.

```fish
cd pashyanti/backend
cp .env.example .env      # paste your GNANI_API_KEY
uv sync
uv run python server.py   # http://localhost:8080
```

| File | Job |
|---|---|
| `server.py` | aiohttp app: static `../web/dist`, `/ws`, orchestration, half-duplex muting |
| `stt.py` | microphone → Prisma v3.0 streaming → callback per sentence |
| `tts.py` | text → Timbre v3.0 SSE → speaker, cached by hash |
| `audio.py` | 1024-byte frame maths, G.711 µ-law (numpy; `audioop` is gone in 3.13+) |
| `gnani.py` | low-level REST client: `stt_file`, `tts`, `clone_embedding`, `tts_cloned` |
| `probe.py` | one 1,000-char TTS + one 10 s STT call, to read the credit rate |
| `stream_mic.py` | standalone mic → transcript terminal test |
| `test_stream_file.py` | replay a wav into the STT socket (no microphone needed) |
| `clone_voice.py` | `build ref.wav` → `embedding.json`, then `say "..."` |

## Two facts that cost an evening

1. **Frame size is exact.** The STT socket takes raw PCM s16le mono in frames of
   *exactly* 1024 bytes — 512 samples, i.e. 32 ms at 16 kHz — at real-time cadence.
2. **Prisma v3.0 is opt-in.** Without `model=prisma-v3.0` you silently get v2.5.
   The `3` in `/stt/v3` is the URL version, not the model version.

Also: TTS intermittently returns `500` on perfectly valid input — `gnani.py` retries it.
