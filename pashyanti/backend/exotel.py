"""A real phone call: Exotel AgentStream in, Prisma/Timbre in the middle.

This is the **pilot** leg, behind `EXOTEL_WS_TOKEN`. Without that variable the
route answers 503 and nothing changes, which is why the demo path and the
60-second video are unaffected (D-014 amendment, `docs/EXOTEL-BRIDGE.md`).

Exotel's Voicebot applet opens one websocket per inbound call:

    wss://<public-host>/exotel/ws?token=<EXOTEL_WS_TOKEN>&sample-rate=8000

Events from Exotel: `connected`, `start`, `media`, `mark`, `dtmf`, `stop`.
Audio both ways: base64 raw PCM, 16-bit signed little-endian, mono, 8 kHz.

The call is attached to one page (`bind_page`), because this build has no
accounts: the most recently connected page is the user whose call it is. A
second simultaneous carrier call is refused rather than mixed into the first.

What is verified: the protocol below was tested against a **real Indian trial
call on 14 Nov** by the spike this module comes from (see EXOTEL-SPIKE.md), and
the framing/parsing is covered by tests with a simulated Exotel client. What is
**not** verified: the hangup POST against Exotel's live API, multi-user
routing, and the two WAN latency legs.
"""
from __future__ import annotations

import asyncio
import base64
import hmac
import json
import os
import time

from aiohttp import WSMsgType, web

import tts
from stt import BrowserMic, FrameParser

RATE = 8000                      # Exotel's sample rate for a voice call
FRAME = 1024                     # what Prisma takes at 8 kHz: 64 ms
OUT_CHUNK = 3200                 # 200 ms outbound, the shape the trial used
PREFILL = 6400                   # 400 ms of audio before the first frame
MAX_BUFFERED = RATE            # 1 s of inbound audio; older chunks are dropped
WS_TOKEN = "EXOTEL_WS_TOKEN"

# The page this build shows the call on. One call, one page (no accounts).
_page = None
_live = False


def enabled() -> bool:
    """The bridge is opt-in: no token in the environment, no route."""
    return bool(os.environ.get(WS_TOKEN))


def token_ok(value: str | None) -> bool:
    expected = os.environ.get(WS_TOKEN, "")
    return bool(expected) and hmac.compare_digest(value or "", expected)


def bind_page(call) -> None:
    global _page
    _page = call


def unbind_page(call) -> None:
    global _page
    if _page is call:
        _page = None


def page():
    return _page


def busy() -> bool:
    return _live


def mask_number(value: str | None) -> str:
    """Last four digits only: a real number never reaches the page or a log."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    return f"••••{digits[-4:]}" if len(digits) >= 4 else "••••"


def media_pcm(payload: str | None) -> bytes | None:
    """One Exotel media payload -> PCM bytes, or None if it is not base64."""
    if not payload:
        return None
    try:
        pcm = base64.b64decode(payload, validate=True)
    except (ValueError, TypeError):
        return None
    return pcm or None


def out_chunks(pcm: bytes, size: int = OUT_CHUNK) -> list[bytes]:
    """Pad the tail to one Exotel chunk: the trial's sender expected 3200 B."""
    chunks = [pcm[i:i + size] for i in range(0, len(pcm), size)]
    if chunks and len(chunks[-1]) < size:
        chunks[-1] += b"\x00" * (size - len(chunks[-1]))
    return chunks


def start_fields(event: dict) -> dict:
    start = event.get("start") or {}
    return {
        "sid": (event.get("stream_sid") or event.get("streamSid")
                or start.get("stream_sid") or start.get("streamSid") or ""),
        "from": start.get("from") or "",
        "to": start.get("to") or "",
    }


def hangup_request(sid: str) -> tuple[str, dict] | None:
    """Best-effort Exotel hangup: URL + form body, or None when unconfigured.

    Exotel's documented shape for ending a live call is a POST to the call
    resource with `Status=completed`. It is configurable because it is the one
    part of this module that was not exercised against the live API today.
    """
    account = os.environ.get("EXOTEL_ACCOUNT_SID")
    subdomain = os.environ.get("EXOTEL_SUBDOMAIN")
    path = os.environ.get("EXOTEL_HANGUP_PATH",
                          "/v1/Accounts/{account}/Calls/{sid}")
    if not (sid and account and subdomain):
        return None
    return (f"https://{subdomain}.exotel.com"
            + path.format(account=account, sid=sid)), {"Status": "completed"}


class CarrierCall:
    """One inbound call: carrier media -> Prisma, the page's replies -> carrier."""

    def __init__(self, ws: web.WebSocketResponse):
        self.ws = ws
        self.sid = ""
        self.started_at = time.monotonic()
        self.mic: BrowserMic | None = None
        self.parser = FrameParser()
        self.in_bytes = 0
        self.out_bytes = 0
        self.closed = False
        self.muted = False
        self._out: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._drained = asyncio.Event()
        self._drained.set()
        self._tasks: list[asyncio.Task] = []
        self._speaking = asyncio.Lock()

    # --- Exotel -> us ----------------------------------------------------

    async def run(self):
        global _live
        _live = True
        self._tasks.append(asyncio.create_task(self._pacer()))
        try:
            async for msg in self.ws:
                if msg.type is not WSMsgType.TEXT:
                    continue
                try:
                    event = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue
                kind = event.get("event")
                if kind == "start":
                    await self.on_start(event)
                elif kind == "media":
                    await self.on_media(event)
                elif kind == "stop":
                    break
        finally:
            await self.close()

    async def on_start(self, event: dict):
        fields = start_fields(event)
        self.sid = fields["sid"]
        if self.mic is None:
            self.mic = BrowserMic(self._on_transcript, rate=RATE,
                                  telephony=True)
            await self.mic.start()
        target = page()
        if target is not None:
            await target.attach_carrier(self)
            await target.send({"type": "carrier", "state": "live",
                               "from": mask_number(fields["from"])})

    async def on_media(self, event: dict):
        pcm = media_pcm((event.get("media") or {}).get("payload"))
        if not pcm or self.mic is None:
            return
        self.in_bytes += len(pcm)
        for frame in self.parser.feed(pcm):
            await self.mic.feed(frame)

    async def _on_transcript(self, text, lang, latency_ms, audio_ms):
        target = page()
        if target is not None and not target.ended:
            await target.on_transcript(text, lang, latency_ms, audio_ms)

    # --- us -> Exotel ----------------------------------------------------

    async def _send_media(self, payload_b64: str) -> bool:
        if not self.sid or self.ws.closed:
            return False
        try:
            await self.ws.send_json({"event": "media", "stream_sid": self.sid,
                                     "media": {"payload": payload_b64}})
            return True
        except ConnectionError:
            return False

    async def _pacer(self):
        """One 3200-byte chunk every 200 ms, as the trial call did."""
        while not self.closed:
            chunk = await self._out.get()
            if chunk is None:
                return
            self._drained.clear()
            try:
                await self._send_media(base64.b64encode(chunk).decode("ascii"))
                self.out_bytes += len(chunk)
            finally:
                if self._out.empty():
                    self._drained.set()
            await asyncio.sleep(OUT_CHUNK / (RATE * 2))

    async def speak(self, text: str, lang: str):
        """Speak the page's reply down the line. -> (ttfa_ms, cached).

        The carrier microphone is muted for the duration, so the caller's phone
        echoing Timbre back is never transcribed (D-005, carrier version).
        """
        async with self._speaking:
            emitted: list[int] = []
            t0 = time.monotonic()
            # Clear before enqueuing: an `emit` can fill the whole queue without
            # yielding, so a pre-set event would claim the audio had played.
            self._drained.clear()

            async def emit(chunk: bytes):
                if not emitted:
                    emitted.append(int((time.monotonic() - t0) * 1000))
                for piece in out_chunks(chunk):
                    self._out.put_nowait(piece)

            if self.mic:
                self.mic.muted = True
            try:
                ttfa, cached = await tts.stream_pcm(text, emit, rate=RATE,
                                                    lang=lang)
                # Let the pacer finish what is queued before unmuting.
                try:
                    await asyncio.wait_for(self._drained.wait(), timeout=30)
                except asyncio.TimeoutError:
                    pass
            finally:
                if self.mic:
                    self.mic.muted = False
            return ttfa, cached

    async def hangup(self) -> bool:
        """End the call: best-effort carrier hangup, then close the socket."""
        request = hangup_request(self.sid)
        sent = False
        if request is not None:
            url, form = request
            key = os.environ.get("EXOTEL_API_KEY", "")
            token = os.environ.get("EXOTEL_API_TOKEN", "")
            try:
                import requests
                r = await asyncio.to_thread(
                    requests.post, url, data=form, auth=(key, token), timeout=5)
                sent = r.status_code in (200, 201, 202, 204)
            except Exception:                 # noqa: BLE001  (best effort)
                sent = False
        await self.close()
        return sent

    async def close(self):
        global _live
        if self.closed:
            return
        self.closed = True
        _live = False
        self._drained.set()        # unblock a `speak` waiting on the pacer
        self._out.put_nowait(None)
        for task in self._tasks:
            task.cancel()
        if self.mic is not None:
            await self.mic.stop()
            self.mic = None
        target = page()
        if target is not None:
            await target.detach_carrier(self)
        try:
            await self.ws.close()
        except ConnectionError:
            pass


async def ws_handler(request: web.Request):
    """`/exotel/ws` — Exotel only, and only when the token is configured."""
    if not enabled():
        return web.Response(status=503,
                            text="carrier bridge disabled: set EXOTEL_WS_TOKEN")
    if not token_ok(request.query.get("token")):
        return web.Response(status=403, text="bad carrier token")
    target = page()
    if busy() or target is None or target.ended:
        # No accounts in this build: one call, on a page that is open and still
        # in a call. "New call" is what re-arms the screen for the next one.
        return web.Response(status=409,
                            text="no live page for the call, or a call is live")
    ws = web.WebSocketResponse(heartbeat=30, max_msg_size=8 * 1024 * 1024)
    await ws.prepare(request)
    call = CarrierCall(ws)
    await call.run()
    return ws
