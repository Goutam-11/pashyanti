# Pashyanti

> *before the word, the vision*

A phone assistant for people who **can't hear**, **can't speak**, or **both**.

Roughly one in twelve Indians lives with disabling hearing loss, and millions more
cannot speak — after a laryngectomy, a stroke, ALS, cerebral palsy, or from birth.
For them a phone call is a closed door: the doctor, the bank, the school, the
government office all assume a voice at both ends.

Pashyanti opens the door from both sides.

| Mode | For | What happens |
|---|---|---|
| **Suniye** *(listen)* | People who can't hear | The other person's speech appears as large live text on screen. The user taps or types a reply, and it is spoken back down the line. |
| **Boliye** *(speak)* | People who can't speak | The user taps or types; a natural Indian voice speaks for them — optionally in **their own cloned voice**, from 20 seconds of reference audio. |

Every call ends in a **summary card**: who called, what was agreed, what happens next.

## Why the name

Sanskrit grammar describes speech in four stages — *para → pashyanti → madhyama → vaikhari*.
**Pashyanti** is the second: the stage where language is seen, not heard, and word
and meaning are still one. Deaf people have always lived at pashyanti. This project
just gives them a screen.

## Built on

| Layer | Model | Role |
|---|---|---|
| Ears | **Gnani Prisma v3.0** | Speech → text. Nine Indian languages + English, automatic language detection, code-mixed speech, `keyterms` hints |
| Mouth | **Gnani Timbre v3.0** | Text → speech. 13 voices × 10 languages, 13 inline emotion tags |
| Identity | **Gnani voice clone** | 5–30 s of reference audio → the user's own voice |

## Honest engineering notes

- Gnani's API exposes speech models only — **no PSTN/SIP, no phone numbers**. The
  audio path is therefore built in two stages: synthetic 8 kHz telephony first
  (band-limited, µ-law round-tripped, noisy), then a real Twilio Media Streams
  bridge if time allows. This is stated plainly in the demo rather than hidden.
- Realtime STT takes **raw PCM s16le, mono, exactly 1024-byte frames**, at
  real-time cadence. It returns one transcript per closed VAD segment — there are
  no interim words.
- No word-level timestamps and no live diarization. Diarization exists only in the
  Batch API.
- Overlapping speech breaks it. The system asks callers to repeat rather than
  guessing, and the limitation is shown on screen.

## Run it

```bash
cd pashyanti
python -m venv .venv && . .venv/bin/activate
sudo dnf install -y portaudio     # Fedora
pip install -r requirements.txt
export GNANI_API_KEY="..."
```

| File | What it does |
|---|---|
| `probe.py` | Measures what a credit is worth: one 1,000-character TTS call, one 10-second STT call. Run once, read the dashboard before and after. |
| `stream_mic.py` | Live microphone → Prisma v3.0 streaming, prints transcripts with detected language and latency. |
| `api.py` | Minimal client — `tts()` and `stt_file()`. No abstractions. |

```bash
python probe.py
python stream_mic.py            # speak, then pause
python stream_mic.py ta-IN      # force one language
```

## Status

Hackathon build — *The Great Indian AI Internship Challenge*, November 2026.
Voice cloning, the summary card and the Twilio bridge are in progress.

## License

MIT
