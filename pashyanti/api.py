"""Minimal Gnani client. One file, no abstractions, nothing clever.

Set your key first:
    export GNANI_API_KEY="..."
"""
import os
import requests

BASE = "https://api.vachana.ai"
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
    return out
