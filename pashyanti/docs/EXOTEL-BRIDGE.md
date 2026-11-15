# Real calls — the Exotel carrier bridge (pilot)

**Status: merged, opt-in, and not in the 60-second video.** Without
`EXOTEL_WS_TOKEN` the route answers `503` and nothing about the demo changes.
The trial line it is built for is **not judge-dialable** (limited inbound, a PIN
for unknown callers, seven-day expiry), so it cannot be the video's claim. What
it proves is the carrier leg itself: a real Indian mobile call reaches this
process, Prisma transcribes it, and Timbre's reply is heard on the handset.

This is the product version of the 14 Nov spike (`EXOTEL-SPIKE.md`); the
throwaway bridge in `.scratch/` stays the record of that first call.

## How a call arrives

```
mobile ──PSTN──► Exotel ──WebSocket──► /exotel/ws ──► Prisma v3.0
                   ▲                        │
                   └──── base64 PCM ◄─── Timbre v3.0 (reply)
```

Exotel's **Voicebot applet** opens one websocket per inbound call:

```
wss://<public-host>/exotel/ws?token=<EXOTEL_WS_TOKEN>&sample-rate=8000
```

- Inbound: `connected`, `start`, `media`, `mark`, `dtmf`, `stop`; audio is
  base64 raw PCM, 16-bit signed little-endian, mono, **8 kHz**.
- Outbound: `{"event":"media","stream_sid":…,"media":{"payload":<b64>}}` in
  3200-byte chunks (200 ms), which is what the trial call used.
- The bridge re-frames inbound audio to Prisma's **exactly 1024 bytes** — one
  frame every 64 ms at 8 kHz — with the telephony VAD preset, via the same
  `stt.BrowserMic` the talk mode uses (`rate=8000, telephony=True`).
- The reply goes back down the line, not to a speaker and not to the phone:
  `tts.stream_pcm(..., rate=8000)` → 3200-byte chunks → `media`. The carrier
  microphone is muted while it speaks (D-005, carrier version).

## Wiring it to a user

There are no accounts in this build (AGENTS.md, "Do not add"), so the bridge
attaches the call to **one page**: the most recently connected page is the user
whose call it is. While the call is live:

- the page shows **"On a phone call"** in the status pill and the masked last
  four digits are all that crosses the wire (`••••5678`; the full number is
  never sent to the page, logged, or written to disk);
- the room microphone is stopped, so the laptop does not also listen;
- `end_call` hangs up the carrier (see below), and the card is sent as usual;
- if the caller hangs up (`stop`), the page gets `carrier: ended`, the card is
  not automatic — the room microphone comes back and the session waits for the
  user's End call;
- if the page closes, the call is hung up: nothing is left listening with
  nobody to show it to.

A second simultaneous call is **refused** (`409`) rather than mixed into the
first. A call is also refused while the page is showing a finished call; the
page's "New call" re-arms it.

## Ending the real line

`Call.end_call` calls `CarrierCall.hangup()` **before** the card. That attempts
Exotel's documented hangup — a POST to the call resource with
`Status=completed` — using:

| Variable | For |
|---|---|
| `EXOTEL_WS_TOKEN` | the bridge itself; **the route is off without it** |
| `EXOTEL_ACCOUNT_SID` | the account in the hangup URL |
| `EXOTEL_SUBDOMAIN` | `https://<subdomain>.exotel.com` |
| `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN` | HTTP basic auth for that POST |
| `EXOTEL_HANGUP_PATH` | optional override, default `/v1/Accounts/{account}/Calls/{sid}` |

With those unset the bridge still ends the **media leg** by closing the
websocket, but it cannot guarantee the carrier drops the call — the app's End
call then ends the session, not the PSTN call. This is the one part that was
**not** exercised against Exotel's live API today; the request shape is tested,
the HTTP call is best-effort, and the result is advisory.

If the trial number has expired, rotating the token and re-pointing the applet
is a five-minute console change; nothing in the repo stores the number or the
URL.

## Run it

```fish
# 1. the app (the page a call will attach to)
cd pashyanti/backend
set -x EXOTEL_WS_TOKEN (openssl rand -hex 16)
uv run python server.py

# 2. a public WSS URL for Exotel
ngrok http 8080
#    wss://<id>.ngrok-free.dev/exotel/ws?token=<token>&sample-rate=8000

# 3. Exotel console: App Bazaar → Voicebot applet → that URL, on the ExoPhone
# 4. open http://<lan-ip>:8080 on the phone, then call the ExoPhone
```

The page's phone-line toggle still works on a carrier call: it is what the WER
measurement simulates, and the carrier leg is already 8 kHz.

## Measured locally, 15 Nov (simulated carrier)

A client that speaks Exotel's events (start + 8 kHz media from a wav) against
this server, with the real Prisma and Timbre, and a page socket bound to it:

| Check | Result |
|---|---|
| Page before the call | `carrier: live`, caller shown as `••••5678` |
| Inbound | 11 media chunks (2.2 s) → **transcript `नमस्ते, मैं पश्यन्ती हूँ।`, `hi-IN`** |
| Reply | `हाँ, बोलिए।` back down the line as **13 × 3200-byte chunks = 2.60 s at 8 kHz**, `ttfa_ms 1754`, `lang hi-IN` |
| End call | `carrier: ended` → `summary` (`turns 1`, 11 s), carrier socket closed |

The Exotel side is simulated; the models are not. The 14 Nov trial call is the
evidence that this protocol works over a real handset.

## What is verified, and what is not

**Verified:** the protocol and framing by `tests/test_exotel.py` with a
simulated Exotel client (23 tests: token gate, media → 1024-byte frames, the
caller's line reaching the page, the page's reply going back down the line as
3200-byte chunks, hangup on `end_call`, hangup when the page closes, the room
microphone restored when the caller hangs up). The 14 Nov trial call proved the
same protocol against a real Indian mobile number — on the spike's code, of
which this module is a port.

**Not verified:** this exact module against a live call; Exotel's hangup POST
(the URL and form are tests, the HTTP call is best-effort); two calls at once
(refused by design); multi-user routing beyond "the latest page"; the two WAN
latency legs; a production number or KYC.

**Never claim** in the video or the post that there is a production number, that
a judge can call it, or that the demo's call is real. The demo's line is still
the simulated one (`DEMO.md`).

## Related

- [`EXOTEL-SPIKE.md`](EXOTEL-SPIKE.md) — the 14 Nov trial call that proved the
  path, and why it was not merged then.
- [`DECISIONS.md`](DECISIONS.md) D-014 — no PSTN in Gnani's API; why the demo
  does not show a real call; the amendment that records this pilot.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the carrier path, the `carrier`
  message, and what is shared between pages.
