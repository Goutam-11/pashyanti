"""Unit tests for the two voices: dispatch and cache separation, no network.

`sounddevice` is never touched because the blocking helpers are patched, and
`gnani` is never called because the cloned helper is patched too.
"""
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault("GNANI_API_KEY", "test-key-not-used")

import tts  # noqa: E402


class SpeakModeTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="pashyanti-tts-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        old_cache, old_embedding = tts.CACHE_DIR, tts.EMBEDDING
        tts.CACHE_DIR = self.tmp
        self.addCleanup(setattr, tts, "CACHE_DIR", old_cache)
        self.addCleanup(setattr, tts, "EMBEDDING", old_embedding)

    async def test_default_mode_uses_the_streaming_voice(self):
        tts.EMBEDDING = None
        calls = []

        def fake_stream(text, voice, model, rate):
            calls.append((text, voice, model, rate))
            return 10, os.path.join(tts.CACHE_DIR, "x.pcm")

        with patch.object(tts, "_play_and_cache", fake_stream):
            ttfa, cached = await tts.speak("hello", mode=tts.MODE_DEFAULT)

        self.assertEqual((ttfa, cached), (10, False))
        self.assertEqual(calls, [("hello", tts.VOICE, tts.MODEL, tts.RATE)])

    async def test_cloned_mode_calls_the_clone_endpoint(self):
        tts.EMBEDDING = {"embedding": "stub", "shape": [1, 768]}
        calls = []

        def fake_cloned(text):
            calls.append(text)
            return 12

        with patch.object(tts, "_play_and_cache_cloned", fake_cloned), \
             patch.object(tts, "_play_and_cache") as streamed:
            ttfa, cached = await tts.speak("hello", mode=tts.MODE_CLONED)

        self.assertEqual((ttfa, cached), (12, False))
        self.assertEqual(calls, ["hello"])
        streamed.assert_not_called()

    async def test_cloned_without_an_embedding_falls_back_to_default(self):
        tts.EMBEDDING = None
        with patch.object(tts, "_play_and_cache", return_value=(7, "p")) as streamed, \
             patch.object(tts, "_play_and_cache_cloned") as cloned:
            ttfa, cached = await tts.speak("hello", mode=tts.MODE_CLONED)

        self.assertEqual((ttfa, cached), (7, False))
        cloned.assert_not_called()
        streamed.assert_called_once()

    async def test_cached_clone_is_played_without_synthesising(self):
        tts.EMBEDDING = {"embedding": "stub"}
        path = tts._key("hello", tts.MODE_CLONED, tts.MODEL_CLONE, tts.RATE,
                        tts.MODE_CLONED)
        os.makedirs(tts.CACHE_DIR, exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"\x00\x00")
        with patch.object(tts, "_play_and_cache_cloned") as cloned, \
             patch.object(tts, "_play_cached") as played:
            ttfa, cached = await tts.speak("hello", mode=tts.MODE_CLONED)

        self.assertEqual((ttfa, cached), (0, True))
        cloned.assert_not_called()
        played.assert_called_once_with(path, tts.RATE)


class CacheKeyTest(unittest.TestCase):
    def test_the_two_modes_never_share_a_cache_file(self):
        default = tts._key("same", tts.VOICE, tts.MODEL, tts.RATE,
                           tts.MODE_DEFAULT)
        cloned = tts._key("same", tts.VOICE, tts.MODEL, tts.RATE,
                          tts.MODE_CLONED)
        self.assertNotEqual(default, cloned)

    def test_has_clone_tracks_the_embedding(self):
        with patch.object(tts, "EMBEDDING", None):
            self.assertFalse(tts.has_clone())
        with patch.object(tts, "EMBEDDING", {"embedding": "stub"}):
            self.assertTrue(tts.has_clone())


if __name__ == "__main__":
    unittest.main()
