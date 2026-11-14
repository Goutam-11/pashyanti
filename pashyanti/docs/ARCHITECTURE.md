# Architecture

Two processes in development, one in production. The split is not stylistic: a
browser cannot capture call audio, and the API key must not leave the server.

## Topology

```
        caller (a person in the room, or a recorded clip)
                    │ voice
                    ▼
  ┌──────────────────────────────────────────┐
  │ LAPTOP / SERVER                          │
  │                                          │
  │  sounddevice mic ──► stt.MicSession      │
  │                          │ 1024-byte PCM │
  │                          ▼               │
  │                  Prisma v3.0 (wss)       │
  │                          │ transcript    │
  │  server.Call ◄───────────┘               │
  │      │  ▲                                │
  │      │  └── reply text ◄─────────────┐   │
  │      ▼                               │   │
  │  tts.speak ──► Timbre v3.0 (SSE) ──► speaker │
  └──────────────────┬───────────────────┼───┘
                     │ JSON over WebSocket│
                     ▼                    │
  ┌──────────────────────────────────────┴───┐
  │ PHONE / BROWSER: React app                │
  │  big text · reply chips · composer · pills │
  └───────────────────────────────────────────┘
```

The phone renders and sends replies. It captures no audio, so it needs no HTTPS,
no microphone permission and no tunnel — plain `http://<lan-ip>:8080` works.

## Request path, in order

1. `sounddevice.RawInputStream` delivers 512-sample blocks from the audio thread.
2. `stt.MicSession` pushes them to the asyncio loop and sends them at real-time
   cadence (32 ms at 16 kHz) to `wss://api.vachana.ai/stt/v3/stream`.
3. Prisma closes a VAD segment when it hears ~350 ms of silence and returns one
   final transcript. There are no interim results.
4. `server.Call.on_transcript` appends the line and pushes it to the page.
5. The user taps a chip or types; the page sends `{"type":"reply","text":…}`.
6. `tts.speak` streams Timbre SSE into a `RawOutputStream`, so audio starts
   before synthesis finishes. Cached clips replay from disk in ~0 ms.
7. `Call.on_reply` reports `speak` with the measured time-to-first-audio.

## Module ownership

| Module | Owns | Must not |
|---|---|---|
| `server.py` | HTTP + `/ws`, call state, half-duplex muting | do audio DSP |
| `stt.py` | microphone, frame cadence, Prisma socket | know about TTS |
| `tts.py` | Timbre SSE, speaker playback, cache | know about the microphone |
| `audio.py` | frame maths, G.711 codecs | own state |
| `gnani.py` | HTTP calls, retries, key loading | touch audio devices |
| `harness/degrade.py` | simulating a phone line | call the network |
| `harness/wer.py` | normalisation, WER/CER | call the network |

`gnani.py` is the only module that talks to the API over HTTP. `stt.py` is the
only module that opens the streaming socket. Keep both true.

## WebSocket protocol

One socket at `/ws`, JSON both ways. `web/src/types.ts` is the source of truth.

| Direction | Message | Meaning |
|---|---|---|
| server | `hello` | model names, microphone availability, voice mode and whether the stream is phone-line degraded |
| server | `transcript` | one final caller sentence, with language and latency |
| server | `retry` | a segment was too short or too noisy to trust; the caller is asked to repeat |
| server | `status` | `idle │ listening │ thinking │ speaking` |
| server | `speak` | a reply finished, with `ttfa_ms` and `cached` |
| server | `voice` | this call switched to `default` or `cloned` |
| server | `summary` | end-of-call artefact: who called, what was agreed, what happens next; also written to `cache/summary.json` |
| server | `error` | human-readable failure, shown in a pill |
| client | `reply` | speak this text down the line |
| client | `set_voice` | switch this call between `default` and `cloned`; the server answers with `voice` |
| client | `set_cloned_voice` | the demo toggle's older shape (#21); equivalent to `set_voice` |
| client | `end_call` | end the call; the server answers with `summary` |
| client | `new_call` | reserved |

Every server message is additive: the UI ignores unknown `type` values, so
adding one does not require a coordinated deploy.

## Half-duplex

The microphone hears the speaker. Without a guard, the app transcribes its own
reply and shows it as the caller talking — an echo loop that is obvious on
camera. `Call.on_reply` therefore sets `mic.muted = True` for the duration of
playback, and `stt.MicSession.pump` sends digital silence instead of captured
audio while muted.

Consequence, accepted: the user cannot barge in. Real echo cancellation is out
of scope for this build.

## Phone-line simulation

`server.py --phone-line` (or `PHONE_LINE=1`) passes `telephony=True` to
`stt.MicSession`. Capture stays at 16 kHz; the socket header asks for 8 kHz; and
every captured frame goes through `harness/phone_line.py`, which bands to
300–3400 Hz, decimates to 8 kHz, adds noise at 10 dB SNR and round-trips G.711
µ-law.

The 1024-byte rule is unchanged — only what a frame *represents* changes: two
16 kHz frames (2 × 32 ms) make one 8 kHz frame (64 ms), so the class buffers and
emits one frame per two received. The mode is fixed for the life of the socket;
switching it mid-call would require a different `x-sample-rate` and thus a new
connection.

## Latency budget (measured)

| Stage | Typical |
|---|---|
| caller stops → transcript on screen | 450–600 ms (350 ms VAD silence + ~100 ms model) |
| user taps → first audio, uncached | ~760 ms |
| user taps → first audio, cached | ~0 ms |
| streaming frame cadence | 32 ms per 1024-byte frame |

These are the only numbers that belong in a demo. Anything else is an adjective.

## Failure modes and what the app does

| Failure | Behaviour |
|---|---|
| no API key | `gnani.py` exits at import with instructions |
| no microphone | `hello` carries `mic: false`, UI shows a red pill |
| TTS 500 (happens on valid input) | `gnani._request` retries 3× with backoff |
| 429 rate limit | same retry path, then surfaces an `error` message |
| credits exhausted (402) | surfaces `error`; nothing else can be done locally |
| socket drops | `web/src/ws.ts` reconnects with backoff; mic session restarts |
