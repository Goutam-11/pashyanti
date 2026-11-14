"""Reference clips for the WER harness.

Sentences are chosen to look like a real relay call: a name, an amount, a time,
a UPI reference, and two code-mixed turns. TTS gives ground truth for free —
the text *is* the reference, so no hand labelling.
"""
import hashlib
import os

from gnani import tts

# Short on purpose: a phone turn is one or two clauses.
REFERENCE_TEXTS = [
    "मेरा नाम गौतम कुमार शर्मा है।",
    "कल सुबह दस बजे अपॉइंटमेंट चाहिए।",
    "दो हज़ार पाँच सौ रुपये जमा हो गए हैं।",
    "मेरे खाते में पैसे नहीं आए हैं।",
    "कृपया थोड़ा धीरे बोलिए।",
    "डॉक्टर साहब आज नहीं आए हैं।",
    "मेरा अपॉइंटमेंट कल सुबह दस बजे है।",
    "बिल में एक हज़ार दो सौ रुपये हैं।",
    "मैं हिंदी में बात करना चाहता हूँ।",
    "कल तक पैसे भेज दीजिए।",
]


def _path(text: str, voice: str, rate: int, out_dir: str) -> str:
    h = hashlib.sha1(f"{text}|{voice}|{rate}".encode()).hexdigest()[:12]
    return os.path.join(out_dir, f"ref_{h}.wav")


def ensure(texts, out_dir="cache/corpus", voice="Shivani", rate=16000):
    """Synthesise any missing reference clip. Returns [(path, text), ...].

    Cached by hash, so a second run makes no API calls.
    """
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for text in texts:
        path = _path(text, voice, rate, out_dir)
        if not os.path.exists(path):
            tts(text, voice=voice, out=path, rate=rate)
        out.append((path, text))
    return out
