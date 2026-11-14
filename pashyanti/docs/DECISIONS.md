# Decisions

Short records of choices that shape the code. Each one is reversible, but not
casually — read the consequence before reopening it mid-build.

---

## D-001 — Python backend, not Rust or Node

**Context.** Rust is a stronger language for real-time audio, and this desktop
already runs a Rust voice agent. TypeScript would collapse the repo to one
language.

**Decision.** Python for everything server-side.

**Why.** The latency budget is dominated by the remote models, not the runtime:
~760 ms to first audio, ~100 ms of tokenisation overhead would not move it. The
streaming protocol, voice clone and SSE path were already proven in Python
before the frontend existed. A rewrite would have cost 4–8 hours of a 26-hour
window and re-opened solved problems.

**Consequence.** Keep the hot path boring: no per-frame allocations beyond what
`stt.py` already does, and `asyncio.to_thread` around blocking calls so the event
loop never stalls during synthesis.

---

## D-002 — Web app with a PWA manifest, not a native app

**Context.** The product is for a phone. "App" was the original framing.

**Decision.** A browser app, installable via `manifest.webmanifest`.

**Why.** A native app buys no telephony access: Android reserves in-call audio
capture (`CAPTURE_AUDIO_OUTPUT`) for system apps, and iOS exposes nothing.
Flutter or React Native would cost days, throw away the React work, and still
need this Python backend. A PWA installs fullscreen with an icon, and a link is
clickable in a post where an APK is not.

**Consequence.** If a store presence is ever needed, wrap the same bundle with
Capacitor. Do not rewrite the UI.

---

## D-003 — One process, aiohttp, one port

**Context.** Options were stdlib `http.server` + a separate `websockets` server,
FastAPI/uvicorn, or aiohttp.

**Decision.** One aiohttp app serving `/ws` and the built frontend.

**Why.** Two servers means two lifecycles, CORS, and a class of "works in dev,
not in prod" bugs. FastAPI adds routing sugar we do not need for two routes.
aiohttp gives static files and websockets in one asyncio process.

**Consequence.** `web/` is built separately and served from `dist/`. In dev, Vite
proxies `/ws` to 8080 (see `vite.config.ts`); in production there is no proxy and
no CORS.

---

## D-004 — The microphone lives on the server

**Context.** The browser could capture audio with an AudioWorklet.

**Decision.** Capture on the server with `sounddevice`; the phone only renders.

**Why.** Browser capture requires HTTPS or localhost (`getUserMedia`), which
forces a tunnel for the phone demo. Server-side capture already worked at
57–211 ms. The phone then needs no permissions at all.

**Consequence.** The phone must be able to reach the server over the LAN. For a
true remote product, swap in the AudioWorklet and a tunnel — the WebSocket
protocol does not change.

---

## D-005 — Half-duplex, not echo cancellation

**Context.** The microphone hears the speaker, so the app transcribes its own
reply.

**Decision.** Mute the microphone for the duration of playback.

**Why.** AEC is a research problem; muting is eight lines and is correct for a
relay where turns alternate.

**Consequence.** No barge-in. If that becomes a requirement, the fix is AEC or
headphones, not a UI change.

---

## D-006 — `verbatim` output for measurement, `transcribe` for the app

**Context.** With `format=transcribe`, "दो हज़ार पाँच सौ" comes back as "2,500",
so a perfect transcript scored 44% WER.

**Decision.** The harness asks for `verbatim`; the app asks for `transcribe`.

**Why.** The harness measures listening, so it must compare like with like. The
app serves a human reading an amount, so digits are better on screen.

**Consequence.** Never compare harness numbers with app output. The split is
deliberate and documented in `harness/cli.py`.

---

## D-007 — Fold orthography out of WER

**Context.** `हजार`/`हज़ार`, `पाँच`/`पांच`, `यूपीआई`/`यू पी आई` are the same sounds.

**Decision.** `wer.normalize` strips nukta, unifies candrabindu to anusvara,
maps Devanagari digits, and drops punctuation.

**Why.** Counting spelling variants as recognition errors measures the writer,
not the recogniser. Clean WER moved from 17.5% to 0.0% purely from this and
D-006.

**Consequence.** The number is now comparable across formats, but it is not the
same metric a strict ASR paper reports. Say "after folding orthography" when
quoting it.

---

## D-008 — uv and bun

**Context.** pip/venv and npm both work.

**Decision.** `uv` for Python, `bun` for the web.

**Why.** Both are single-binary, fast, and lock deterministically. Python 3.14 is
managed by uv without touching the system interpreter, which matters on Fedora.

**Consequence.** Commit `uv.lock` and `bun.lock`. Never hand-edit lock files; use
`uv add` / `bun add`.
