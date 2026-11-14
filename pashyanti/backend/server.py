"""Pashyanti server: one process, one port.

Serves the built React app, owns the microphone (or relays the page's), and
relays Gnani calls.

    cd pashyanti/backend
    uv run python server.py          # http://localhost:8080
    uv run python server.py --tls cert.pem key.pem   # https:// (talk mode off-LAN)

Talk mode (`?mode=talk`) reverses D-004: the page captures 16 kHz PCM in an
AudioWorklet, sends 1024-byte frames over /ws, and plays Timbre's reply itself.
That path needs a secure context (HTTPS or localhost) for `getUserMedia`.

Development (hot reload) runs Vite separately:
    cd pashyanti/web && bun run dev  # http://localhost:5173, proxies /ws here
"""
import asyncio
import base64
import json
import os
import ssl
import sys
import time
from pathlib import Path

from aiohttp import WSMsgType, web

import tts
from gnani import KEY  # noqa: F401  (import validates the key early)
from stt import BrowserMic, MicSession, looks_unusable

WEB = Path(__file__).resolve().parent.parent / "web" / "dist"
CACHE = Path(__file__).resolve().parent / "cache"
PORT = int(os.environ.get("PORT", "8080"))
SUMMARY_CHARS = 60
MODE_SERVER = "server"
MODE_TALK = "talk"


def _phone_line_enabled(argv=None, env=None):
    """--phone-line on the command line, or PHONE_LINE=1 in the environment."""
    argv = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    return "--phone-line" in argv or env.get("PHONE_LINE") == "1"


PHONE_LINE = _phone_line_enabled()

NO_BUILD = """<!doctype html><meta charset=utf-8><body style="font:16px system-ui;
padding:40px;background:#0f1115;color:#eef1f6">
<h2>Pashyanti</h2><p>Frontend not built yet.</p>
<pre>cd pashyanti/web &amp;&amp; bun run build</pre>
<p>Or run the dev server: <code>bun run dev</code> → http://localhost:5173</p>
"""


def _shorten(text: str, limit: int = SUMMARY_CHARS) -> str:
    """One flat line, at most `limit` characters, ellipsis included."""
    flat = " ".join(text.split())
    if len(flat) <= limit:
        return flat
    return flat[: limit - 1].rstrip() + "…"


def build_summary(lines: list[dict], started_at: float, ended_at: float) -> dict:
    """The end-of-call card, computed from the transcript alone.

    No model call on purpose: the same call always yields the same card, which
    is what makes it safe to write to disk and re-read after a page reload.
    """
    caller = [str(ln.get("text") or "").strip()
              for ln in lines if ln.get("who") == "caller"]
    mine = [str(ln.get("text") or "").strip()
            for ln in lines if ln.get("who") == "me"]
    return {
        "who": _shorten(caller[0]) if caller and caller[0] else "unknown caller",
        "agreed": caller[-1] if caller and caller[-1] else "—",
        "next": mine[-1] if mine and mine[-1] else "no reply yet",
        "turns": len(caller),
        "duration_s": max(0, int(round(ended_at - started_at))),
    }


def write_summary(summary: dict) -> Path:
    """Persist the card so a reload still has one to show."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "summary.json"
    tmp = path.with_name("summary.json.tmp")
    tmp.write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)
    return path


class Call:
    """One call = one websocket + one Prisma session.

    `mode` is "server" (the demo path: this machine's microphone and speaker)
    or "talk" (the page's microphone and speaker, an in-person conversation).
    """

    def __init__(self, ws: web.WebSocketResponse, mode=MODE_SERVER):
        self.ws = ws
        self.mode = mode
        self.lines: list[dict] = []
        self.started_at = time.time()
        self.speaking = asyncio.Lock()
        self.mic: MicSession | BrowserMic | None = None
        self.voice_mode = tts.MODE_DEFAULT
        self.telephony = PHONE_LINE

    async def send(self, payload: dict):
        if not self.ws.closed:
            await self.ws.send_json(payload)

    async def set_voice(self, mode: str):
        """Switch this call's voice. Refuses the clone when none was loaded."""
        mode = tts.MODE_CLONED if mode == tts.MODE_CLONED else tts.MODE_DEFAULT
        if mode == tts.MODE_CLONED and not tts.has_clone():
            await self.send({"type": "error",
                             "message": "no cloned voice on this server"})
            return
        self.voice_mode = mode
        await self.send({"type": "voice", "mode": mode})
        # The demo toggle (#21) speaks the older shape; keep it in sync.
        await self.send({"type": "cloned_voice",
                         "enabled": mode == tts.MODE_CLONED})

    async def set_phone_line(self, enabled: bool):
        """Switch the call's microphone transform without touching the page socket.

        The Prisma socket has to be rebuilt because its rate and VAD headers are
        fixed per connection; the websocket to the phone stays open. Audio is
        briefly interrupted, which is the price of a demo switch.
        """
        enabled = bool(enabled)
        if enabled == self.telephony:
            await self.send({"type": "phone_line", "enabled": enabled})
            return
        if self.mic is not None:
            async with self.speaking:     # do not swap the mic mid-utterance
                was_muted = self.mic.muted
                await self.mic.stop()
                self.mic = None
                self.telephony = enabled
                await self.start_mic()
                if self.mic is not None:
                    self.mic.muted = was_muted
        else:
            self.telephony = enabled
        await self.send({"type": "phone_line", "enabled": enabled})

    async def on_transcript(self, text, lang, latency_ms, audio_ms):
        if looks_unusable(text, audio_ms):
            await self.send({"type": "retry"})
            return
        self.lines.append({"who": "caller", "text": text})
        await self.send({"type": "transcript", "text": text,
                         "lang": lang, "latency_ms": latency_ms})

    async def on_reply(self, text: str):
        async with self.speaking:
            self.lines.append({"who": "me", "text": text})
            await self.send({"type": "status", "state": "speaking"})
            if self.mic:
                self.mic.muted = True
            try:
                if self.mode == MODE_TALK:
                    ttfa, cached = await self.speak_to_page(text)
                else:
                    ttfa, cached = await tts.speak(text, mode=self.voice_mode)
                await self.send({"type": "speak", "text": text,
                                 "ttfa_ms": ttfa, "cached": cached})
            except Exception as exc:                     # noqa: BLE001
                await self.send({"type": "error", "message": str(exc)[:200]})
            finally:
                if self.mic:
                    self.mic.muted = False
                await self.send({"type": "status", "state": "listening"})

    async def speak_to_page(self, text):
        """Stream the reply to the phone instead of this machine's speaker.

        The page schedules the chunks through Web Audio and mutes its own
        capture until they have played, so the phone never transcribes itself.
        The mic is muted here for the stream window; the page owns the
        playback tail (D-005, both halves).
        """
        async def emit(chunk):
            await self.send({"type": "audio",
                             "data": base64.b64encode(chunk).decode("ascii"),
                             "rate": tts.RATE})

        ttfa, cached = await tts.stream_pcm(text, emit, mode=self.voice_mode)
        await self.send({"type": "audio", "data": "", "rate": tts.RATE,
                         "final": True})
        return ttfa, cached

    async def on_audio(self, data: bytes):
        """A binary websocket frame is capture audio, in talk mode only."""
        if self.mode == MODE_TALK and self.mic is not None:
            await self.mic.feed(data)

    async def start_capture(self):
        """The page pressed "Start listening": open Prisma, then say ready.

        The page sends frames as soon as its own capture starts; they queue
        here while Prisma completes its handshake, so no speech is dropped.
        """
        if self.mode != MODE_TALK:
            await self.send({"type": "capture", "state": "ready"})
            return
        if self.mic is None:
            await self.start_mic()
        await self.send({"type": "capture",
                         "state": "ready" if self.mic else "error"})

    async def end_call(self):
        summary = build_summary(self.lines, self.started_at, time.time())
        await self.send({"type": "summary", **summary})
        try:
            write_summary(summary)
        except OSError:
            pass          # the card still reached the page; a full disk is not fatal
        return summary

    async def start_mic(self):
        cls = BrowserMic if self.mode == MODE_TALK else MicSession
        self.mic = cls(self.on_transcript, telephony=self.telephony)
        try:
            await self.mic.start()
        except Exception as exc:                          # noqa: BLE001
            self.mic = None
            await self.send({"type": "error",
                             "message": f"microphone: {str(exc)[:160]}"})

    async def close(self):
        if self.mic:
            await self.mic.stop()
            frames_in = getattr(self.mic, "frames_in", 0)
            if isinstance(self.mic, BrowserMic) and frames_in:
                print(f"talk mode: {frames_in} frames in, "
                      f"{self.mic.frames_out} to Prisma, {self.mic.gaps} gaps")


async def ws_handler(request: web.Request):
    ws = web.WebSocketResponse(heartbeat=30, max_msg_size=4 * 1024 * 1024)
    await ws.prepare(request)

    mode = MODE_TALK if request.query.get("mode") == MODE_TALK else MODE_SERVER
    call = Call(ws, mode)
    probe = MicSession(call.on_transcript, telephony=PHONE_LINE)
    await call.send({
        "type": "hello",
        "models": {"stt": "prisma-v3.0", "tts": "timbre-v3.0"},
        # In talk mode the page owns the device, so the server's input probe is
        # not the answer to "can this call hear?".
        "mic": True if mode == MODE_TALK else probe.available(),
        "mode": mode,
        "voice": call.voice_mode,
        "cloned_voice": call.voice_mode == tts.MODE_CLONED,
        "phone_line": call.telephony,
    })
    # Server-mic mode starts listening immediately; talk mode waits for the
    # page's "Start listening" gesture, because getUserMedia needs one.
    if mode == MODE_SERVER:
        await call.start_mic()

    try:
        async for msg in ws:
            if msg.type is WSMsgType.BINARY:
                await call.on_audio(msg.data)
                continue
            if msg.type is not WSMsgType.TEXT:
                continue
            try:
                data = json.loads(msg.data)
            except json.JSONDecodeError:
                continue
            if data.get("type") == "reply" and data.get("text", "").strip():
                asyncio.create_task(call.on_reply(data["text"].strip()))
            elif data.get("type") == "end_call":
                await call.end_call()
            elif data.get("type") == "start_capture":
                await call.start_capture()
            elif data.get("type") == "set_voice":
                await call.set_voice(str(data.get("mode") or tts.MODE_DEFAULT))
            elif data.get("type") == "set_phone_line":
                await call.set_phone_line(bool(data.get("enabled")))
            elif data.get("type") == "set_cloned_voice":
                await call.set_voice(
                    tts.MODE_CLONED if data.get("enabled") else tts.MODE_DEFAULT)
    finally:
        await call.close()
    return ws


async def index(_request: web.Request):
    page = WEB / "index.html"
    if page.exists():
        return web.FileResponse(page)
    return web.Response(text=NO_BUILD, content_type="text/html")


def make_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/", index)
    if WEB.exists():
        app.router.add_static("/assets", WEB / "assets", show_index=False)
        app.router.add_static("/", WEB, show_index=False, follow_symlinks=False)
    return app


def tls_context(argv=None):
    """--tls cert.pem key.pem -> an SSLContext, or None for plain HTTP.

    Talk mode needs a secure context for `getUserMedia`. A tunnel (ngrok) is the
    usual answer on a LAN; this is the offline one, for a phone that already
    trusts a local certificate.
    """
    argv = sys.argv[1:] if argv is None else argv
    if "--tls" not in argv:
        return None
    i = argv.index("--tls")
    try:
        cert, key = argv[i + 1], argv[i + 2]
    except IndexError:
        raise SystemExit("--tls needs a certificate and a key: "
                         "--tls cert.pem key.pem")
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_cert_chain(cert, key)
    return ctx


if __name__ == "__main__":
    mode = ("phone line (8 kHz, µ-law, 10 dB noise)" if PHONE_LINE
            else "clean (16 kHz)")
    ctx = tls_context()
    scheme = "https" if ctx else "http"
    print(f"Pashyanti on {scheme}://0.0.0.0:{PORT}  "
          f"(phone: {scheme}://<your-lan-ip>:{PORT})")
    print(f"microphone mode: {mode}")
    print(f"talk mode: {scheme}://<host>:{PORT}/?mode=talk "
          "(needs a secure context on the phone)")
    web.run_app(make_app(), host="0.0.0.0", port=PORT, print=None,
                ssl_context=ctx)
