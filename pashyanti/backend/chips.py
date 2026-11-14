"""Reply chips in the language the other person is speaking.

The first chip is a direct answer from the model (`llm.direct_reply`). The other
two are **not** left to the model: "please repeat" and "a little slower" are
safety options that must exist on every transcript, in the caller's language,
even when the model call times out or returns something creative. That table
lives here so it can be tested without a network and reviewed by a speaker.

Prisma v3.0 recognises Indian languages + English; this table covers the set the
app can meet in practice, and an unknown code falls back to English rather than
sending something in the wrong script.
"""
# ISO 639-1 prefix -> (please repeat, a little slower)
FIXED = {
    "en": ("Please repeat that.", "A little slower, please."),
    "hi": ("कृपया दोहराइए।", "थोड़ा धीरे बोलिए।"),
    "bn": ("অনুগ্রহ করে আবার বলুন।", "একটু ধীরে বলুন।"),
    "mr": ("कृपया पुन्हा सांगा.", "थोडे हळू बोला."),
    "gu": ("કૃપા કરીને ફરીથી કહો.", "થોડું ધીમે બોલો."),
    "pa": ("ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕਹੋ।", "ਥੋੜ੍ਹਾ ਹੌਲੀ ਬੋਲੋ।"),
    "or": ("ଦୟାକରି ପୁଣି କୁହନ୍ତୁ।", "ଟିକେ ଧୀରେ କୁହନ୍ତୁ।"),
    "ta": ("தயவுசெய்து மீண்டும் சொல்லுங்கள்.", "கொஞ்சம் மெதுவாக சொல்லுங்கள்."),
    "te": ("దయచేసి మళ్లీ చెప్పండి.", "కొంచెం నెమ్మదిగా చెప్పండి."),
    "kn": ("ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.", "ಸ್ವಲ್ಪ ನಿಧಾನವಾಗಿ ಹೇಳಿ."),
    "ml": ("ദയവായി വീണ്ടും പറയൂ.", "അൽപ്പം പതുക്കെ പറയൂ."),
}
FALLBACK = "en"
CHIP_MAX = 48          # a chip is one line on a 430 px screen


def code(lang: str | None) -> str:
    """`hi-IN` -> `hi`; anything unusable -> the fallback language."""
    prefix = (lang or "").split("-")[0].split("_")[0].strip().lower()
    return prefix if prefix in FIXED else FALLBACK


def fixed(lang: str | None) -> list[str]:
    repeat, slower = FIXED[code(lang)]
    return [repeat, slower]


def one_line(text: str, limit: int = CHIP_MAX) -> str:
    """The model's answer, flattened and capped, or "" if it is unusable."""
    flat = " ".join(str(text or "").split()).strip().strip("\"'`")
    if not flat:
        return ""
    if len(flat) <= limit:
        return flat
    return flat[: limit - 1].rstrip() + "…"


def for_transcript(lang: str | None, answer: str | None) -> list[str]:
    """[direct answer, please repeat, a little slower], caller's language.

    No model answer means no chips at all: the page keeps its static locale
    chips, so a failed or slow call changes nothing on screen.
    """
    direct = one_line(answer) if answer else ""
    chips = ([direct] if direct else []) + fixed(lang)
    seen = set()
    out = []
    for chip in chips:
        if chip not in seen:
            seen.add(chip)
            out.append(chip)
    return out[:3] if direct else []
