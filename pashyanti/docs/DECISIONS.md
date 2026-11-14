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

---

## D-009 — Tailwind for layout, CSS variables for theme

**Context.** The original rule was hand-written CSS in one file, no framework.
Adding a theme toggle, a mascot and an onboarding sheet meant duplicating every
colour for light and dark by hand, and every layout tweak was a full edit-build-
look cycle at a 430 px viewport.

**Decision.** Adopt Tailwind 4 (`@tailwindcss/vite`), but keep the *theme* in CSS
variables under `:root` / `.dark`, mapped in with `@theme inline`. Utilities are
for layout, spacing and responsive work; any shape repeated three or more times
gets a semantic class.

**Why.** The slow part of styling this app was never selectors — it was layout at
one fixed viewport and a second colour palette for dark mode. Tailwind fixes both
without importing a component library. This **reverses the "hand-written CSS"
clause** recorded in AGENTS.md; leaving that entry in place would have been the
silent drift D-007-style amendments exist to prevent.

**Consequence.** `web/src/styles.css` is gone; `web/src/index.css` holds the
tokens. Class-soup is the real risk, so the rule is explicit: three repetitions
→ a class. A component library (shadcn, MUI, Radix) is still banned.

---

## D-010 — Paper & Ink, light by default

**Context.** The first build was a dark dashboard with a mint accent — the
default look of every hackathon entry. The actual reader is often older, reads
Devanagari at 23–28 px, and is filmed vertically in daylight on a phone.

**Decision.** Light "Paper & Ink" theme as the default: warm off-white paper,
near-black ink, one deep-teal accent, no gradients. Dark mode exists behind a
toggle in the header.

**Why.** Contrast holds in daylight and on video compression, where dark themes
bloom and lose definition. It also looks like a document rather than a toy,
which matters for a product whose audience is not buying software.

**Consequence.** One theme appears on camera — the video never shows the toggle.
Accessibility floor is now a constraint, not a preference: body ≥ 18 px,
contrast ≥ 7:1, tap targets ≥ 44 px, visible focus, `prefers-reduced-motion`
respected. If a later screen fails those, the screen is wrong, not the rule.

**Amended 2026-11-14 (`feat/web-identity`).** The palette and mascot below were
replaced by D-011 after owner review; the light-default and accessibility rules
stand unchanged. The original decision is kept as the record of why light was
chosen.

---

## D-011 — Myna identity: a bird mark, one accent, state as geometry

**Context.** The identity from D-010 (warm paper, teal, a line-drawn blob
mascot) was reviewed by the owner and rejected as not looking professional. The
blob also failed the 30 px header: its eye and inner ear collapsed into noise.
The product's audience is Deaf and hard-of-hearing users and their families,
not early adopters who forgive a toy aesthetic.

**Decision.** Replace the identity with **Myna**: porcelain paper `#F4F6F9`,
midnight ink `#0E1B2C`, one marigold signal `#E39A2B`; IBM Plex Sans with IBM
Plex Sans Devanagari; a solid myna-head mark (round skull, long beak, amber
cheek) shared by `public/icon.svg` and the mascot via `components/myna.ts`.
State is geometry, not expression: a pulsing amber ring (listening), an open
beak (speaking), a `?` badge (missed), stillness (idle). No body, no decorative
bobbing. The mascot stays 30 px in the header and 96–112 px in the empty state
and tour. The logo is the same head in an ink tile; the header lockup is the
mascot plus the Devanagari wordmark.

**Why.** A myna imitates human speech, which is the product's job in one
animal, and its silhouette survives 30 px where a line drawing does not. A
solid mark and a single warm accent read as an instrument rather than a toy;
reserving the accent for audio moving (ring, beak, active state) makes colour
carry meaning instead of decoration. Devanagari in the wordmark is the Indian
cue; no mandala, lotus or rangoli ornament.

**Consequence.** `public/icon.svg` and `components/myna.ts` must change
together. Every colour still lives in `web/src/index.css`, so the palette moves
by editing one block. Reintroducing a cartoon character re-opens the 30 px
legibility problem, and the accent must stay scarce or the state signal dies.

**Amended 2026-11-14 (`feat/peacock-identity`).** The owner supplied a peacock
reference and asked for the mascot to be exact. D-013 replaces the myna and the
navy/marigold tokens with a traced peacock and cream/pine/clay. The state
principle — geometry, no decorative motion — still stands.

---

## D-012 — UI locales are client-side; English is the default

**Context.** The interface copy was hard-coded Hindi, including the chips, tour,
summary labels and error states. The owner asked for English as the preferred
language, plus other languages. Recognition was never the gap: `stt.py` asks
Prisma v3.0 for `indic-auto` (nine Indic languages + English) and records the
detected language per line, so the caller's language already varies
independently of the UI.

**Decision.** Keep every user-facing string in typed dictionaries under
`web/src/i18n/` (`en`, `hi`, `bn`, `mr`), expose them through a small React
context, and put a 44 px globe picker in the header. English is the default;
`?lang=` overrides the saved choice; the choice persists in `localStorage`.
No dependency, no routing, no SSR. The type is the font-curator's verified
four-family pairing: Fraunces for display, Karla for Latin UI, Mukta for
Devanagari and Noto Sans Bengali. Karla and Mukta x-heights are within 2%, so
an English and a Hindi line at the same px sit level.

**Why.** A Deaf or speech-impaired reader should see the controls in the
language they think in, but the product must still be usable on first open
without a settings detour — hence English default plus a persistent picker.
Four locales cover a large share of the audience and two scripts; Tamil,
Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia and Urdu are one dictionary
file, one registry line, and a font entry if the script is new — not a refactor.

**Consequence.** Every new string must be added to all four dictionaries; a
missing key is a type error. The font stack includes Noto Sans Bengali for the
new script; another script adds its Noto face. The UI language is **not** the
call language: it never changes recognition, and it does not yet change the
voice — TTS remains Hindi; a per-call voice language is a backend follow-up,
not something #5/#6 provide.

---

## D-013 — Peacock identity: trace the reference, cream/pine, serif display

**Context.** The owner rejected the myna as not close enough and supplied a
reference icon: a cream tile with a pine-green peacock head, five-feather crest,
ringed eye, small beak and three sound arcs, soft-embossed. They asked for the
mascot to be "more similar or exact", a similar theme, and better fonts. The
supplied Gemini key authenticates but **image generation is quota-blocked**:
every image model returns HTTP 429 with a per-model free-tier limit of 0, so no
generated PNG exists or is used.

**Decision.** Trace the reference's green silhouette into vector paths — head,
neck, shoulder, crest, pupil, nostril, beak and three arcs — with a 4-unit
margin that survives 30 px. The beak is separate; speaking cuts a transparent
gape through it. The unsure state replaces the arcs with a green ? disc. The
palette is cream `#F2EADB`, pine `#255035`, clay `#7A2F16` for warnings, sage
`#8FC7A3` in dark. Type is Fraunces (display), Karla (Latin UI), Mukta
(Devanagari), Noto Sans Bengali — the font-curator's four-family recommendation,
with Karla/Mukta x-heights within 2%.

**Why.** A trace is the only way to be exact; a generated raster cannot be a
30 px state indicator and cannot be recoloured by tokens. The flat trace loses
the tile's emboss but keeps every contour; the uneasy edge cases (open beak, ?
disc) are designed because the reference has no states. Fraunces gives the
English brand an editorial note; Karla/Mukta keep a Hindi and an English line at
the same optical size; Mukta supplies full conjuncts at 18 px. The cream/pine
palette matches the reference and keeps the measured contrast floor.

**Consequence.** `components/peacock.ts` holds the traced paths and is the source
of truth; `public/icon.svg` is the same mark on a cream tile. The arcs are part
of the mark at rest; their pulse is the listening state, so do not animate them
decoratively. The ? disc is green (state), while the retry notice and the
"missed" status dot use clay (warning). Re-tracing is required if the owner
changes the reference; the brand sheet records the current reference next to the
vector.
