"""Minimal Gnani client. One file, no abstractions, nothing clever.

Set your key first:
    export GNANI_API_KEY="..."
"""
import os
import requests

BASE = "https://api.vachana.ai"


def _load_env(path=None):
    """Read KEY=VALUE lines from a .env sitting next to this file.

    Real env vars always win, so `export GNANI_API_KEY=...` still works.
    """
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()

KEY = os.environ["GNANI_API_KEY"]
HDR = {"X-API-Key-ID": KEY}


def stt_file(path, lang="indic-auto", fmt="transcribe", model="prisma-v3.0"):
    """Transcribe a clip up to 30 s. Returns the parsed JSON."""
    with open(path, "rb") as f:
        r = requests.post(
            f"{BASE}/stt/v3",
            headers=HDR,
            files={"audio_file": (os.path.basename(path), f, "audio/wav")},
            data={"model": model, "language_code": lang, "format": fmt},
            timeout=120,
        )
    if r.status_code != 200:
        raise RuntimeError(f"STT {r.status_code}: {r.text[:400]}")
    return r.json()


def tts(text, voice="Shivani", lang="hi-IN", out="out.wav",
        model="timbre-v3.0", rate=16000, container="wav"):
    """Synthesize and write to `out`. Returns the path.

    Timbre v3.0 voices: Shivani Lakshmi Kalpana Chetana Vasudha Riyaa Tarika
                        Avinash Shubham Prakash Devansh Yashraj Harshad
    Use container="mulaw", rate=8000 only for telephony.
    """
    payload = {
        "text": text,
        "voice": voice,
        "model": model,
        "language": lang,
        "speed": 1.0,
        "audio_config": {
            "sample_rate": rate,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": container,
        },
    }
    r = requests.post(f"{BASE}/api/v1/tts/inference", headers=HDR,
                      json=payload, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"TTS {r.status_code}: {r.text[:400]}")
    with open(out, "wb") as f:
        f.write(r.content)
    if container == "wav":
        _fix_wav_sizes(out)
    return out


def _fix_wav_sizes(path):
    """Gnani returns WAVs whose RIFF and data size fields are left at
    0xFFFFFFFF (as if streamed, never backpatched). Players cope; python's
    `wave` module does not — getnframes() reports garbage. Patch the two
    fields to the real byte counts.
    """
    with open(path, "r+b") as fh:
        buf = fh.read()
        if len(buf) < 44 or buf[8:12] != b"WAVE":
            return
        pos, data_pos = 12, None
        while pos + 8 <= len(buf):
            cid = buf[pos:pos + 4]
            size = int.from_bytes(buf[pos + 4:pos + 8], "little")
            if cid == b"data":
                data_pos = pos
                break
            pos += 8 + size + (size & 1)
            if size == 0xFFFFFFFF:
                break
        if data_pos is None:
            return
        real_data = len(buf) - (data_pos + 8)
        fh.seek(4)
        fh.write((len(buf) - 8).to_bytes(4, "little"))
        fh.seek(data_pos + 4)
        fh.write(real_data.to_bytes(4, "little"))
