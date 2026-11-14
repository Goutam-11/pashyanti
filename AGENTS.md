# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before
changing anything — it records constraints that the code does not explain.

## What this is

**Pashyanti** is a phone assistant for people who cannot hear, cannot speak, or
both. The caller's speech becomes large live text on the user's screen; the
user's typed reply is spoken back down the line in a natural Indian voice,
optionally their own cloned voice.

It is a hackathon build (*The Great Indian AI Internship Challenge*, November
2026) that is judged partly on a 60-second demo video. Working software on the
demo path beats speculative breadth. Ship small, verify, move on.

Two Gnani models do the work: **Prisma v3.0** (speech → text) and **Timbre v3.0**
(text → speech), plus the voice-clone endpoint.

## Read these first

| Document | Why |
|---|---|
| `pashyanti/docs/ARCHITECTURE.md` | Topology, module boundaries, the WebSocket protocol |
| `pashyanti/docs/API-NOTES.md` | Gnani API behaviour that will bite you; measured facts only |
| `pashyanti/docs/DECISIONS.md` | Why the stack is what it is. Do not re-litigate settled choices mid-build |

## Repository map

```
AGENTS.md                  this file
README.md                  public front page: what, why, measured numbers
pashyanti/
  backend/                 Python 3.14, uv
    server.py              aiohttp app: serves web/dist, /ws, orchestration
    stt.py                 microphone → Prisma streaming → callback per sentence
    tts.py                 text → Timbre SSE → speaker, cached by hash
    audio.py               1024-byte frames, G.711 µ-law in numpy
    gnani.py               REST client: stt_file, tts, clone_embedding, tts_cloned
    harness/               phone-line accuracy measurement (degrade, wer, corpus, cli)
    probe.py stream_mic.py test_stream_file.py clone_voice.py   standalone tools
    cache/                 gitignored: TTS audio, transcripts, corpus wavs
  web/                     Vite 8, React 19, TypeScript, Tailwind 4 + CSS tokens
    src/App.tsx            the one screen: transcript, chips, composer
    src/ws.ts              one socket, reconnect
    src/types.ts           the five message shapes
    src/components/        Mascot (Sakhi, a myna), Onboarding, ThemeToggle
    src/components/myna.ts shared mark paths (mascot, icon)
    src/i18n/              typed copy for en, hi, bn, mr + the locale context
    src/index.css          every colour as a CSS variable, light + dark
    public/                PWA manifest and icon
  docs/                    architecture, API notes, decisions
```

## Hard constraints

Violating any of these produces a demo that fails in front of a judge.

1. **Prisma v3.0 is opt-in.** Without `model=prisma-v3.0` (REST form field, WS
   header, batch `config.model`) you silently get v2.5. The `3` in `/stt/v3` is
   the URL version, not the model version.
2. **Streaming frames are exactly 1024 bytes.** Raw PCM s16le mono, one frame
   every 32 ms at 16 kHz or 64 ms at 8 kHz, real-time cadence. Never burst — it
   degrades the VAD. A browser `MediaRecorder` emits WebM/Opus and cannot feed
   this socket.
3. **REST STT caps at 30 seconds.** Longer audio needs the Batch API
   (create → start → poll → files).
4. **There is no PSTN, SIP or number provisioning.** The API cannot receive a
   call. Audio comes from the local microphone, or from Twilio Media Streams if
   someone builds that bridge.
5. **No word-level timestamps, no live diarization, no translation.** Diarization
   exists only in the Batch API. `speaker_names` is a spelling hint, not
   diarization. Do not promise any of the three in UI or copy.
6. **Evon is not on the API.** It is Apache-2.0 weights needing an H100-class
   GPU. Do not plan a feature on it.
7. **The API key never leaves the server.** All Gnani calls happen in the Python
   backend. Never put the key in `web/`, never call Gnani from the browser.
8. **Never print, log or commit the key.** It lives in `pashyanti/backend/.env`
   (gitignored) and is read by `gnani.py`. When debugging, print `len(key)`, not
   the key. If a key is ever exposed, rotate it from `app.gnani.ai/voice`.
9. **The microphone is muted while we speak.** `Call.on_reply` sets
   `mic.muted = True` around TTS, because the microphone hears our own speaker.
   Removing that re-introduces an echo loop that transcribes the app's own voice.
10. **Do not invent numbers.** Every figure in README or docs comes from
    `harness_report.json` or a measurement you can reproduce. If you change the
    harness, re-run it and update both README and `backend/README.md`.

## Commands

```fish
# backend
cd pashyanti/backend
uv sync
uv run python server.py            # http://localhost:8080, binds 0.0.0.0

# web
cd pashyanti/web
bun install
bun run dev                        # http://localhost:5173, proxies /ws to :8080
bun run build                      # type-check + build to dist/ (backend serves it)

# measurement
cd pashyanti/backend
uv run python -m harness.cli                # WER sweep, writes harness_report.md
uv run python test_stream_file.py smoke.wav # streaming protocol without a mic
uv run python probe.py                      # what one credit costs
```

`uv` and `bun` are the package managers. Do not introduce `pip install` or `npm`
instructions. Bump dependencies with `uv add` / `bun add`, never by editing lock
files.

## Environment

- **Python 3.14.** `audioop` was removed in 3.13, which is why `audio.py` carries
  a numpy G.711 table. Do not reintroduce `audioop`.
- **Fedora, fish shell.** Give `source .venv/bin/activate.fish` or better, call
  `.venv/bin/python` directly; `export` is `set -x` in fish.
- PortAudio is usually present; `sounddevice` needs it at runtime only.
- `websockets` renamed `extra_headers` → `additional_headers` in v14; `stt.py`
  tries both. Keep that compatibility shim.
- **`/tmp` is a 3.6 GB tmpfs, and filling it breaks the shell.** Every command
  then fails with `Error: UNKNOWN: unknown error, write` — including `df`, so
  the symptom looks like a broken toolchain rather than a full disk. Check with
  `scripts/check-tmp.sh`. Run anything heavy through
  `scripts/with-cache.sh <command>` so node, bun, uv and gh caches land in
  `.scratch/` instead. Never point `TMPDIR` or a tool cache at `/tmp`.
- **Never call `firefox --headless` by hand.** Firefox puts its cache and profile
  in `$TMPDIR`, and six hand-run screenshots filled `/tmp` and killed the shell.
  Use `scripts/shoot.sh <name> [query] [size]`, which pins `TMPDIR` to
  `.scratch/tmp`, uses a throwaway profile and deletes it. Screenshots are the
  only way to see the UI in this environment — build first, then shoot.

## Code conventions

- **Small modules with explicit interfaces.** `degrade.py` and `wer.py` are pure
  functions over arrays and strings: no network, no globals, cheap to test.
  Keep them that way. Side effects belong in `cli.py` and `server.py`.
- **No premature abstraction.** No service classes, no repository pattern, no DI
  container. If a function is used once, it does not need a module.
- **Cache anything that costs money.** TTS audio is cached by hash in `tts.py`;
  harness transcripts are cached by audio hash in `harness/cli.py`. New code
  paths that call the API must cache too.
- **Retry 429/5xx.** TTS intermittently returns `500` on valid input; `gnani.py`
  retries. Do not remove that.
- **TypeScript strict, no `any`.** The five message shapes live in
  `web/src/types.ts`; extend that union instead of casting.
- **Tailwind for layout, tokens for theme.** `web/src/index.css` holds every
  colour as a CSS variable under `:root` / `.dark`, mapped into Tailwind with
  `@theme inline`. Use utilities for layout, spacing and responsive work; give a
  semantic class to any shape repeated three or more times (bubble, chip, pill).
  Do not let the JSX become the stylesheet.
- **Still banned:** a component library (shadcn, MUI, Radix themes) or SSR. This
  is a two-screen SPA behind one socket. Tailwind earns its place because it is
  utilities plus a build step, not a component set — see D-009.
- **Copy is data, not JSX.** Every user-facing string lives in
  `web/src/i18n/<locale>.ts` behind the `Messages` type; add a string to all
  four locales or TypeScript fails. English is the default. The UI locale never
  changes the call language: recognition is `indic-auto`, and TTS is still
  Hindi until the backend exposes a language choice — see D-012.
- **UI rules that are product rules.** The mascot *is* the state indicator
  (amber ring pulses = listening, beak opens = speaking, `?` = didn't catch it,
  still = idle) — never animate it decoratively. The onboarding tour opens only
  from the `?` button or `?tour=1`; it never opens by itself, because the first
  screen has to teach in place. One theme on camera: Myna, light.
- **Accessibility floor:** body text ≥ 18 px, contrast ≥ 7:1, tap targets
  ≥ 44 px, visible focus ring, and respect `prefers-reduced-motion`.

## Verify before saying "done"

Run the tests, in this order:

```fish
cd pashyanti/backend
uv run python -m unittest discover -s tests -t . -v   # 40 tests, no key needed

cd pashyanti/web
bun run build                                          # type-check + build
```

Then, if you touched the live path:

```fish
cd pashyanti/backend
uv run python server.py                     # page loads, /ws sends `hello`
uv run python test_stream_file.py smoke.wav # streaming protocol
uv run python -m harness.cli                # only if you touched DSP or metrics
```

### Tests are split by what they need

Do not merge these layers — the split is what keeps CI free and fast.

| File | Tier | Needs | Answers |
|---|---|---|---|
| `tests/test_wer.py` | unit | nothing | does normalisation/WER still fold nukta, digits, punctuation? |
| `tests/test_audio.py` | unit | nothing | are frames exactly 1024 bytes; does µ-law round-trip? |
| `tests/test_degrade.py` | unit | nothing | does the phone-line simulation still band-limit and hit its SNR? |
| `tests/test_server.py` | integration | nothing (mic + TTS stubbed) | does the app still boot, speak the protocol, and mute the mic while talking? |
| `tests/test_live_api.py` | live | a real key, `RUN_LIVE=1` | do Timbre and Prisma actually round-trip? **Costs credits — never in CI.** |

Rules:

- A new pure module gets a unit test that runs without a key or a device.
- A change to the websocket protocol, a route, or half-duplex gets an
  integration test in `test_server.py`. If you add a message type, extend
  `web/src/types.ts` and add a case there.
- Live tests are opt-in only (`RUN_LIVE=1`) and must say so in the docstring.
  They are the one place a key is allowed to matter.
- Tests use `unittest` from the standard library. Do not add pytest.

### CI

`.github/workflows/ci.yml` runs both jobs on every push and pull request:

- `backend (unit + integration)` — `uv sync --frozen`, then the suite above
- `web (type-check + build)` — `bun install --frozen-lockfile`, then `bun run build`

Both are required status checks on `main`. A red CI blocks the merge; do not
disable a check to get past it — fix the test or fix the code.


## Delivery workflow

Trunk-based GitHub Flow. `main` is always buildable and protected; work arrives
through a pull request, never a direct push.

1. Branch off `main`: `<type>/<scope>`, where type is `feat/`, `fix/`, `chore/`,
   `docs/`, `test/` or `refactor/` — e.g. `feat/summary-card`.
2. **One logical change per PR.** A milestone is its own PR, not a long-lived
   branch. If you find an unrelated bug mid-change, ship it separately.
3. Commits follow Conventional Commits: imperative subject ≤ 72 characters, body
   explains *why* (the diff already shows what).
4. Open the PR with `.github/pull_request_template.md` — it auto-fills. Keep the
   sections that apply, delete the rest, never pad with "n/a". The body is a
   design record, not a changelog.
5. Wait for both required checks. A red check blocks the merge: fix the test or
   fix the code, never disable the check.
6. **Squash-merge, then delete the branch.** The PR title becomes the squash
   commit, so it has to satisfy rule 3.
7. Link issues in the body (`Closes #N`). That only auto-closes when the PR
   targets `main` — if you stack PRs, retarget the child to `main` after the
   parent merges, and confirm with `git ls-tree origin/main` that the work is
   actually on the trunk.

Never force-push or delete `main`. `enforce_admins` is currently **off** on this
repository, so an admin *can* bypass protection; GitHub prints `Bypassed rule
violations` when it happens. Treat that as break-glass for the demo deadline,
not a habit, and switch it back on afterwards.

### Evidence, not adjectives

The PR body names what was checked and quotes the result — the command, the
count, the millisecond. State plainly what you could **not** verify and why;
*"no microphone in this container, so capture was verified by replaying a wav"*
is a good sentence. CI is authoritative over a claim that it "should work".
A merged PR is not proof the code reached `main` — check the base branch.

`pashyanti/docs/DECISIONS.md` is the decision record. If you reverse one of its
entries, amend that entry in the same PR with the reason. Silent drift is not
acceptable, and neither is loosening a threshold to make a PR pass.

## Do not add

- Auth, user accounts, a database, Docker, Kubernetes. One process, one port.
- A UI framework, SSR, or Next.js. It is a two-screen SPA behind one socket.
- Real phone numbers, Aadhaar, PAN or someone's real recorded call in fixtures
  or demos. Synthetic audio only.
- Any claim of "real-time translation", "speaker diarization" or "call
  recording" in UI copy. None of the three exist.

## Known gaps

- No confidence signal from the API, so "I didn't catch that, please repeat"
  needs a heuristic (empty or suspiciously short transcript).
- No echo cancellation beyond half-duplex muting.
- The Twilio Media Streams bridge is designed but not built.
- Barge-in is impossible while muted: the user cannot interrupt the reply.
