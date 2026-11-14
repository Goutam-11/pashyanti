"""Integration test: the server, wired end to end, with no external services.

No microphone and no Gnani calls: the microphone is a stub and `tts.speak` is
mocked, so this proves the wiring — routes, the websocket protocol, the reply
path, and half-duplex muting — without spending credits or needing audio
hardware. It is the test that fails when someone renames a message type.
"""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

os.environ.setdefault("GNANI_API_KEY", "test-key-not-used")

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402

import server  # noqa: E402
import tts  # noqa: E402


class FakeMic:
    """Stands in for stt.MicSession: records what the server does to it."""

    instances: list["FakeMic"] = []

    def __init__(self, on_text, **kwargs):
        self.on_text = on_text
        self.muted = False
        self.started = False
        self.stopped = False
        FakeMic.instances.append(self)

    def available(self) -> bool:
        return True

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True


class ServerIntegrationTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        FakeMic.instances = []
        self.speaks: list[str] = []
        self.muted_during_speak: list[bool] = []
        outer = self

        async def fake_speak(text, **kwargs):
            outer.speaks.append(text)
            outer.muted_during_speak.append(FakeMic.instances[-1].muted)
            return 123, False

        self._patches = [
            patch.object(server, "MicSession", FakeMic),
            patch.object(tts, "speak", fake_speak),
        ]
        for p in self._patches:
            p.start()
        self.client = TestClient(TestServer(server.make_app()))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        for p in reversed(self._patches):
            p.stop()

    # --- routing ---------------------------------------------------------

    async def test_index_is_served(self):
        resp = await self.client.get("/")
        self.assertEqual(resp.status, 200)
        self.assertIn("Pashyanti", await resp.text())

    # --- websocket protocol ----------------------------------------------

    async def test_hello_announces_models_and_mic(self):
        ws = await self.client.ws_connect("/ws")
        hello = await ws.receive_json()
        self.assertEqual(hello["type"], "hello")
        self.assertEqual(hello["models"],
                         {"stt": "prisma-v3.0", "tts": "timbre-v3.0"})
        self.assertTrue(hello["mic"])
        self.assertEqual(hello["voice"], "default")
        self.assertFalse(hello["cloned_voice"])
        await ws.close()

    async def test_reply_walks_the_status_cycle(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()                      # hello

        await ws.send_json({"type": "reply", "text": "हाँ, बोलिए।"})
        self.assertEqual(await ws.receive_json(),
                         {"type": "status", "state": "speaking"})

        spoken = await ws.receive_json()
        self.assertEqual(spoken["type"], "speak")
        self.assertEqual(spoken["text"], "हाँ, बोलिए।")
        self.assertEqual(spoken["ttfa_ms"], 123)

        self.assertEqual(await ws.receive_json(),
                         {"type": "status", "state": "listening"})
        self.assertEqual(self.speaks, ["हाँ, बोलिए।"])
        await ws.close()

    async def test_microphone_is_muted_while_speaking(self):
        """Half-duplex is a product rule: the mic hears our own speaker."""
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()
        await ws.send_json({"type": "reply", "text": "ठीक है।"})
        for _ in range(3):                           # speaking, speak, listening
            await ws.receive_json()
        await ws.close()

        self.assertEqual(self.muted_during_speak, [True])
        self.assertFalse(FakeMic.instances[-1].muted, "mic must be unmuted after")

    async def test_empty_reply_is_ignored(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()
        await ws.send_json({"type": "reply", "text": "   "})
        await asyncio.sleep(0.05)
        self.assertEqual(self.speaks, [])
        await ws.close()

    async def test_unknown_message_type_does_not_kill_the_socket(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()
        await ws.send_json({"type": "something-from-the-future"})
        await ws.send_json({"type": "reply", "text": "ठीक है।"})
        self.assertEqual((await ws.receive_json())["state"], "speaking")
        await ws.close()

    async def test_mic_is_stopped_when_the_page_disconnects(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()
        await ws.close()
        for _ in range(20):
            if FakeMic.instances and FakeMic.instances[-1].stopped:
                break
            await asyncio.sleep(0.01)
        self.assertTrue(FakeMic.instances[-1].stopped)

    # --- voice ------------------------------------------------------------

    async def test_set_voice_switches_this_calls_mode(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()                      # hello

        with patch.object(tts, "EMBEDDING", {"embedding": "stub"}):
            await ws.send_json({"type": "set_voice", "mode": "cloned"})
            self.assertEqual(await ws.receive_json(),
                             {"type": "voice", "mode": "cloned"})
            self.assertEqual(await ws.receive_json(),
                             {"type": "cloned_voice", "enabled": True})

            await ws.send_json({"type": "set_voice", "mode": "default"})
            self.assertEqual(await ws.receive_json(),
                             {"type": "voice", "mode": "default"})
            self.assertEqual(await ws.receive_json(),
                             {"type": "cloned_voice", "enabled": False})
        await ws.close()

    async def test_set_voice_without_an_embedding_is_refused(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()

        with patch.object(tts, "EMBEDDING", None):
            await ws.send_json({"type": "set_voice", "mode": "cloned"})
            error = await ws.receive_json()
            self.assertEqual(error["type"], "error")
            self.assertIn("cloned", error["message"])

            # the call stays in the default voice
            await ws.send_json({"type": "set_voice", "mode": "default"})
            self.assertEqual(await ws.receive_json(),
                             {"type": "voice", "mode": "default"})
        await ws.close()

    async def test_the_demo_toggle_alias_switches_the_voice(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()

        with patch.object(tts, "EMBEDDING", {"embedding": "stub"}):
            await ws.send_json({"type": "set_cloned_voice", "enabled": True})
            self.assertEqual(await ws.receive_json(),
                             {"type": "voice", "mode": "cloned"})
            self.assertEqual(await ws.receive_json(),
                             {"type": "cloned_voice", "enabled": True})
        await ws.close()

    # --- end of call ------------------------------------------------------

    async def test_end_call_sends_summary_and_caches_it(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()                      # hello
        for _ in range(200):                         # probe + live session
            if len(FakeMic.instances) >= 2:
                break
            await asyncio.sleep(0.01)
        mic = FakeMic.instances[-1]

        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(server, "CACHE", Path(tmp) / "cache"):
            await mic.on_text("I need an ambulance", "hi", 40, 800)
            await ws.receive_json()                  # transcript

            await ws.send_json({"type": "reply", "text": "Sending one now"})
            for _ in range(3):                       # speaking, speak, listening
                await ws.receive_json()

            await ws.send_json({"type": "end_call"})
            summary = await ws.receive_json()

            self.assertEqual(summary["type"], "summary")
            self.assertEqual(summary["turns"], 1)
            self.assertEqual(summary["who"], "I need an ambulance")
            self.assertEqual(summary["agreed"], "I need an ambulance")
            self.assertEqual(summary["next"], "Sending one now")
            self.assertIsInstance(summary["duration_s"], int)

            written = json.loads(
                (Path(tmp) / "cache" / "summary.json").read_text(encoding="utf-8")
            )
            self.assertEqual(written["turns"], 1)
            self.assertEqual(written["who"], "I need an ambulance")
            self.assertEqual(written["next"], "Sending one now")
        await ws.close()

    async def test_hallucinated_transcript_asks_to_repeat(self):
        ws = await self.client.ws_connect("/ws")
        await ws.receive_json()                      # hello
        for _ in range(200):
            if len(FakeMic.instances) >= 2:
                break
            await asyncio.sleep(0.01)
        mic = FakeMic.instances[-1]

        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(server, "CACHE", Path(tmp) / "cache"):
            # Four words out of 200 ms of noise: Prisma guessed, so ask again.
            await mic.on_text("Sir, क्या जमा करें?", "hi", 30, 200)
            self.assertEqual(await ws.receive_json(), {"type": "retry"})

            await ws.send_json({"type": "end_call"})
            frames = []
            while True:
                frame = await ws.receive_json()
                frames.append(frame)
                if frame.get("type") == "summary":
                    break

            self.assertNotIn("transcript", [f["type"] for f in frames])
            self.assertEqual(frames[-1]["turns"], 0)
            self.assertEqual(frames[-1]["who"], "unknown caller")
        await ws.close()


class MissingMicTest(unittest.IsolatedAsyncioTestCase):
    """With no audio device the app must still boot and say so."""

    async def test_hello_reports_no_mic(self):
        with patch.object(server, "MicSession", FakeMic), \
             patch.object(FakeMic, "available", return_value=False):
            client = TestClient(TestServer(server.make_app()))
            await client.start_server()
            try:
                ws = await client.ws_connect("/ws")
                hello = await ws.receive_json()
                self.assertFalse(hello["mic"])
                await ws.close()
            finally:
                await client.close()


if __name__ == "__main__":
    unittest.main()
