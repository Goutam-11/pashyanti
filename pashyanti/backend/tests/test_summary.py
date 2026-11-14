"""Unit tests for the deterministic end-of-call card.

`build_summary` is pure data in / dict out: every assertion here is exact.
"""
import os
import unittest
from copy import deepcopy

os.environ.setdefault("GNANI_API_KEY", "test-key-not-used")

from server import build_summary  # noqa: E402


def caller(text):
    return {"who": "caller", "text": text}


def me(text):
    return {"who": "me", "text": text}


class BuildSummaryTest(unittest.TestCase):
    def test_empty_call_has_placeholders(self):
        self.assertEqual(
            build_summary([], 100.0, 100.0),
            {"who": "unknown caller", "agreed": "—", "next": "no reply yet",
             "turns": 0, "duration_s": 0},
        )

    def test_one_turn(self):
        card = build_summary([caller("I need a doctor")], 100.0, 109.6)
        self.assertEqual(card["turns"], 1)
        self.assertEqual(card["who"], "I need a doctor")
        self.assertEqual(card["agreed"], "I need a doctor")
        self.assertEqual(card["next"], "no reply yet")
        self.assertEqual(card["duration_s"], 10)         # 9.6 s, rounded

    def test_several_turns_take_first_ask_and_last_reply(self):
        lines = [
            caller("My father fell down"),
            me("I'm calling an ambulance"),
            caller("Please hurry"),
            me("An ambulance is on the way"),
        ]
        card = build_summary(lines, 0.0, 12.4)
        self.assertEqual(card["turns"], 2)               # caller lines only
        self.assertEqual(card["who"], "My father fell down")
        self.assertEqual(card["agreed"], "Please hurry")
        self.assertEqual(card["next"], "An ambulance is on the way")
        self.assertEqual(card["duration_s"], 12)

    def test_first_line_is_cut_at_sixty_characters(self):
        long = "word " * 40                              # 200 characters, 40 words
        card = build_summary([caller(long)], 0.0, 1.0)
        self.assertLessEqual(len(card["who"]), 60)
        self.assertTrue(card["who"].endswith("…"))
        self.assertEqual(len(card["who"]), 60)
        # only `who` is shortened; `agreed` keeps the caller's actual words
        self.assertEqual(len(card["agreed"]), 199)

    def test_shortening_collapses_newlines_and_runs_of_spaces(self):
        card = build_summary([caller("I need\n\na   doctor")], 0.0, 1.0)
        self.assertEqual(card["who"], "I need a doctor")

    def test_does_not_mutate_the_transcript(self):
        lines = [caller("hello"), me("hi")]
        before = deepcopy(lines)
        build_summary(lines, 0.0, 2.0)
        self.assertEqual(lines, before)

    def test_duration_never_goes_negative(self):
        self.assertEqual(build_summary([], 50.0, 10.0)["duration_s"], 0)


if __name__ == "__main__":
    unittest.main()
