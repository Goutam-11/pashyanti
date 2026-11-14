"""Microphone -> Prisma streaming -> callback, for the life of a websocket.

The frame rules are the whole difficulty: exactly 1024 bytes, s16le mono, real
time cadence. Everything else is bookkeeping.
"""
import asyncio
import json

import websockets

from gnani import KEY

URL = "wss://api.vachana.ai/stt/v3/stream"
BLOCK = 512                  # 512 samples * 2 bytes = 1024 bytes


def headers(lang="indic-auto", rate=16000, telephony=False):
    vad = ({"x-vad-threshold": "0.72", "x-min-silence-ms": "450",
            "x-min-speech-ms": "200", "x-min-segment-ms": "200"} if telephony else
           {"x-vad-threshold": "0.55", "x-min-silence-ms": "350",
            "x-min-speech-ms": "100", "x-min-segment-ms": "120"})
    return {
        "x-api-key-id": KEY,
        "model": "prisma-v3.0",
        "language_code": lang,
        "format": "transcribe",
        "x-sample-rate": str(rate),
        "x-max-speech-s": "15",
        "keyterms": json.dumps(["पश्यन्ती", "Pashyanti"], ensure_ascii=True),
        **vad,
    }


async def _connect(hdr):
    for kw in ({"additional_headers": hdr}, {"extra_headers": hdr}):
        try:
            return await websockets.connect(URL, **kw)
        except TypeError:
            continue
    raise RuntimeError("unsupported websockets version")


class MicSession:
    """One microphone, one socket, one callback per sentence."""

    def __init__(self, on_text, lang="indic-auto", rate=16000, telephony=False):
        self.on_text = on_text
        self.lang = lang
        self.rate = rate
        self.telephony = telephony
        self._task = None
        self._stop = asyncio.Event()
        # While we speak, the microphone hears our own speaker. Send silence
        # instead of audio so the app never transcribes itself.
        self.muted = False

    def available(self):
        """True only if PortAudio initialises *and* has an input device."""
        try:
            import sounddevice as sd

            sd.query_devices(kind="input")
            return True
        except Exception:
            return False

    async def start(self):
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run(self):
        import sounddevice as sd

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[bytes] = asyncio.Queue()

        def on_audio(indata, frames, time_info, status):
            loop.call_soon_threadsafe(queue.put_nowait, bytes(indata))

        ws = await _connect(headers(self.lang, self.rate, self.telephony))
        await ws.recv()          # {"type":"connected", ...}

        with sd.RawInputStream(samplerate=self.rate, channels=1, dtype="int16",
                               blocksize=BLOCK, callback=on_audio):
            silence = b"\x00" * (BLOCK * 2)

            async def pump():
                while not self._stop.is_set():
                    frame = await queue.get()
                    await ws.send(silence if self.muted else frame)
                    await asyncio.sleep(BLOCK / self.rate)

            pump_task = asyncio.create_task(pump())
            try:
                async for msg in ws:
                    if self._stop.is_set():
                        break
                    d = json.loads(msg)
                    if d.get("type") == "transcript" and d.get("text"):
                        await self.on_text(
                            d["text"],
                            d.get("detected_language_code"),
                            int(d.get("latency") or 0),
                        )
            finally:
                pump_task.cancel()
                await ws.close()
