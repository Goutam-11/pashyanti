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
from pathlib import Path

from aiohttp import WSMsgType, web

import tts
from gnani import KEY  # noqa: F401  (import validates the key early)
from stt import MicSession

WEB = Path(__file__).resolve().parent.parent / "web" / "dist"
PORT = int(os.environ.get("PORT", "8080"))

NO_BUILD = """<!doctype html><meta charset=utf-8><body style="font:16px system-ui;
padding:40px;background:#0f1115;color:#eef1f6">
<h2>Pashyanti</h2><p>Frontend not built yet.</p>
<pre>cd pashyanti/web &amp;&amp; bun run build</pre>
<p>Or run the dev server: <code>bun run dev</code> → http://localhost:5173</p>
"""


class Call:
    """One phone call = one websocket + one microphone session."""

    def __init__(self, ws: web.WebSocketResponse):
        self.ws = ws
        self.lines: list[dict] = []
        self.speaking = asyncio.Lock()
        self.mic: MicSession | None = None

    async def send(self, payload: dict):
        if not self.ws.closed:
            await self.ws.send_json(payload)

    async def on_transcript(self, text, lang, latency_ms):
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
                ttfa, cached = await tts.speak(text)
                await self.send({"type": "speak", "text": text,
                                 "ttfa_ms": ttfa, "cached": cached})
            except Exception as exc:                     # noqa: BLE001
                await self.send({"type": "error", "message": str(exc)[:200]})
            finally:
                if self.mic:
                    self.mic.muted = False
                await self.send({"type": "status", "state": "listening"})

    async def start_mic(self):
        self.mic = MicSession(self.on_transcript)
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
    probe = MicSession(call.on_transcript)
    await call.send({
        "type": "hello",
        "models": {"stt": "prisma-v3.0", "tts": "timbre-v3.0"},
        "mic": probe.available(),
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
    print(f"Pashyanti on http://0.0.0.0:{PORT}  (phone: http://<your-lan-ip>:{PORT})")
    web.run_app(make_app(), host="0.0.0.0", port=PORT, print=None)
