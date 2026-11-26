import unittest

from eiparser.adapter import boss_health


def _log(targets, full_fight_targets):
    return {"phases": [{"name": "Full Fight", "start": 0, "end": 1000, "targets": full_fight_targets}],
            "targets": targets}


class BossHealthTest(unittest.TestCase):
    def test_from_health_burned(self):
        self.assertEqual(boss_health(_log([{"healthPercentBurned": 63.5}], [0])), 36.5)

    def test_main_target_only(self):
        # the full fight's first target is the main boss; other targets are left out
        targets = [{"healthPercentBurned": 0}, {"healthPercentBurned": 100}, {"healthPercentBurned": 50}]
        self.assertEqual(boss_health(_log(targets, [2, 1])), 50.0)

    def test_main_target_by_priority(self):
        # with targetPriorities, the first main target, not a blocking one listed before it
        targets = [{"healthPercentBurned": 0}, {"healthPercentBurned": 100}, {"healthPercentBurned": 50}]
        log = _log(targets, [1, 2])
        log["phases"][0]["targetPriorities"] = {"1": "BLOCKING", "2": "MAIN", "0": "NONBLOCKING"}
        self.assertEqual(boss_health(log), 50.0)

    def test_no_main_target(self):
        log = _log([{"healthPercentBurned": 50}], [0])
        log["phases"][0]["targetPriorities"] = {"0": "NONBLOCKING"}
        self.assertIsNone(boss_health(log))

    def test_falls_back_to_the_last_health_sample(self):
        self.assertEqual(boss_health(_log([{"healthPercents": [[0, 100], [500, 42.123]]}], [0])), 42.12)

    def test_unknown(self):
        self.assertIsNone(boss_health(_log([{}], [0])))
        self.assertIsNone(boss_health(_log([], [0])))
        self.assertIsNone(boss_health({}))


if __name__ == "__main__":
    unittest.main()
