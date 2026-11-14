"""Pashyanti server: one process, one port.

Serves the built React app, owns the microphone, and relays Gnani calls.

    cd pashyanti/backend
    uv run python server.py          # http://localhost:8080

Development (hot reload) runs Vite separately:
    cd pashyanti/web && bun run dev  # http://localhost:5173, proxies /ws here
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

from aiohttp import WSMsgType, web

import tts
from gnani import KEY  # noqa: F401  (import validates the key early)
from stt import MicSession, looks_unusable

WEB = Path(__file__).resolve().parent.parent / "web" / "dist"
CACHE = Path(__file__).resolve().parent / "cache"
PORT = int(os.environ.get("PORT", "8080"))
SUMMARY_CHARS = 60


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
    """One phone call = one websocket + one microphone session."""

    def __init__(self, ws: web.WebSocketResponse):
        self.ws = ws
        self.lines: list[dict] = []
        self.started_at = time.time()
        self.speaking = asyncio.Lock()
        self.mic: MicSession | None = None
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
        """Switch the microphone transform; the upstream socket is restarted.

        `x-sample-rate` cannot change mid-connection, so the page's websocket
        stays up while the Prisma socket is replaced with one for the new mode.
        """
        enabled = bool(enabled)
        if self.telephony == enabled:
            await self.send({"type": "phone_line", "enabled": enabled})
            return
        self.telephony = enabled
        if self.mic:
            await self.mic.stop()
            self.mic = None
        await self.start_mic()
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
                ttfa, cached = await tts.speak(text, mode=self.voice_mode)
                await self.send({"type": "speak", "text": text,
                                 "ttfa_ms": ttfa, "cached": cached})
            except Exception as exc:                     # noqa: BLE001
                await self.send({"type": "error", "message": str(exc)[:200]})
            finally:
                if self.mic:
                    self.mic.muted = False
                await self.send({"type": "status", "state": "listening"})

    async def end_call(self):
        summary = build_summary(self.lines, self.started_at, time.time())
        await self.send({"type": "summary", **summary})
        try:
            write_summary(summary)
        except OSError:
            pass          # the card still reached the page; a full disk is not fatal
        return summary

    async def start_mic(self):
        self.mic = MicSession(self.on_transcript, telephony=self.telephony)
        try:
            await self.mic.start()
        except Exception as exc:                          # noqa: BLE001
            self.mic = None
            await self.send({"type": "error",
                             "message": f"microphone: {str(exc)[:160]}"})

    async def close(self):
        if self.mic:
            await self.mic.stop()


async def ws_handler(request: web.Request):
    ws = web.WebSocketResponse(heartbeat=30, max_msg_size=4 * 1024 * 1024)
    await ws.prepare(request)

    call = Call(ws)
    probe = MicSession(call.on_transcript, telephony=call.telephony)
    await call.send({
        "type": "hello",
        "models": {"stt": "prisma-v3.0", "tts": "timbre-v3.0"},
        "mic": probe.available(),
        "voice": call.voice_mode,
        "cloned_voice": call.voice_mode == tts.MODE_CLONED,
        "phone_line": call.telephony,
    })
    await call.start_mic()

    try:
        async for msg in ws:
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
            elif data.get("type") == "set_voice":
                await call.set_voice(str(data.get("mode") or tts.MODE_DEFAULT))
            elif data.get("type") == "set_cloned_voice":
                await call.set_voice(
                    tts.MODE_CLONED if data.get("enabled") else tts.MODE_DEFAULT)
            elif data.get("type") == "set_phone_line":
                await call.set_phone_line(bool(data.get("enabled")))
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


if __name__ == "__main__":
    mode = ("phone line (8 kHz, µ-law, 10 dB noise)" if PHONE_LINE
            else "clean (16 kHz)")
    print(f"Pashyanti on http://0.0.0.0:{PORT}  (phone: http://<your-lan-ip>:{PORT})")
    print(f"microphone mode: {mode}")
    web.run_app(make_app(), host="0.0.0.0", port=PORT, print=None)
