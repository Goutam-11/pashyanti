"""Text -> speech, streamed to the speaker, cached on disk.

Cost is per character, so every clip is cached by (text, voice, model, rate).
A repeat costs nothing and returns instantly — which is what makes rehearsal
and a live demo affordable.
"""
import asyncio
import base64
import hashlib
import json
import os
import time

import numpy as np
import requests

from gnani import BASE, HDR

# sounddevice initialises PortAudio the moment it is imported, and raises if the
# machine has no audio server. Import it lazily so the server can boot headless
# and report mic: false instead of dying at import time.

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "tts")
VOICE = "Shivani"
MODEL = "timbre-v3.0"
RATE = 16000


def _key(text, voice, model, rate):
    h = hashlib.sha1(f"{text}|{voice}|{model}|{rate}".encode()).hexdigest()[:16]
    return os.path.join(CACHE_DIR, f"{h}.pcm")


def _sse_stream(text, voice, model, rate):
    """Yield raw s16le chunks as the server produces them."""
    payload = {
        "text": text,
        "voice": voice,
        "model": model,
        "language": "hi-IN",
        "speed": 1.0,
        "audio_config": {
            "sample_rate": rate,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "raw",
        },
    }
    with requests.post(f"{BASE}/api/v1/tts/sse", headers=HDR, json=payload,
                       stream=True, timeout=120) as r:
        if r.status_code != 200:
            raise RuntimeError(f"TTS {r.status_code}: {r.text[:200]}")
        for raw in r.iter_lines():
            if not raw or not raw.startswith(b"data:"):
                continue
            body = raw[5:].strip()
            if not body:
                continue
            try:
                d = json.loads(body)
            except json.JSONDecodeError:
                continue
            chunk = d.get("audio")
            if chunk:
                yield base64.b64decode(chunk)
            if d.get("is_final"):
                break


def _play_and_cache(text, voice, model, rate):
    """Blocking: stream to the speaker and accumulate to the cache. -> ms to first audio."""
    import sounddevice as sd

    os.makedirs(CACHE_DIR, exist_ok=True)
    path = _key(text, voice, model, rate)
    t0 = time.time()
    first = None
    pcm = bytearray()

    with sd.RawOutputStream(samplerate=rate, channels=1, dtype="int16") as out:
        for chunk in _sse_stream(text, voice, model, rate):
            if first is None:
                first = (time.time() - t0) * 1000
            pcm.extend(chunk)
            out.write(chunk)
        out.write(b"\x00" * 32)          # drain

    with open(path, "wb") as f:
        f.write(bytes(pcm))
    return int(first or 0), path


def _play_cached(path, rate):
    import sounddevice as sd

    pcm = np.fromfile(path, dtype=np.int16)
    sd.play(pcm, rate)
    sd.wait()


async def speak(text, voice=VOICE, model=MODEL, rate=RATE):
    """Say `text` out loud. Returns (ttfa_ms, cached)."""
    path = _key(text, voice, model, rate)
    if os.path.exists(path):
        await asyncio.to_thread(_play_cached, path, rate)
        return 0, True
    ttfa, _ = await asyncio.to_thread(_play_and_cache, text, voice, model, rate)
    return ttfa, False


def cache_stats():
    if not os.path.isdir(CACHE_DIR):
        return 0, 0
    files = os.listdir(CACHE_DIR)
    total = sum(os.path.getsize(os.path.join(CACHE_DIR, f)) for f in files)
    return len(files), total
