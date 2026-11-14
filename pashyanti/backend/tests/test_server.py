"""Integration test: the server, wired end to end, with no external services.

No microphone and no Gnani calls: the microphone is a stub and `tts.speak` is
mocked, so this proves the wiring — routes, the websocket protocol, the reply
path, and half-duplex muting — without spending credits or needing audio
hardware. It is the test that fails when someone renames a message type.
"""
import asyncio
import os
import unittest
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

        async def fake_speak(text):
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
