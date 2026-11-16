"""Tests of eiparser.replay against a small, made-up EI log. Run with: python -m unittest discover eiparser/tests"""
import copy
import json
import os
import tempfile
import unittest

from eiparser import adapter, replay

INT64_MIN, INT64_MAX = -9223372036854775808, 9223372036854775807

# A 100 x 50 inch arena with a 400 x 200 image, which EI draws 750 x 375 pixels large (7.5 pixels per inch)
WORLD = [1000, -500, 1100, -450]
MAPS = {"Test Boss": {"image": "test-boss.png", "world": WORLD, "size": [400, 200]}}


def _player(name, account, group, profession, pixels):
    return {
        "name": name, "account": account, "group": group, "profession": profession,
        "toughness": 0, "healing": 0, "condition": 0, "concentration": 0,
        "combatReplayData": {
            "start": 0, "end": 900, "positions": pixels, "orientations": [10.4, -89.6, 179.5],
            "down": [[300, 450]], "dead": [[800, INT64_MAX]], "dc": [[INT64_MIN, 0]],
        },
        "damage1S": [[0, 100, 250], [0, 100]],
        "targetDamage1S": [[[0, 60, 150], [0, 60]], [[0, 30, 80], [0, 30]]],
        "dpsAll": [{}], "dpsTargets": [[{}], [{}]],
        "healthPercents": [[0, 100], [200, 64.44], [200, 63.96], [500, 63.96], [800, 0]],
        "barrierPercents": [[0, 0], [100, 12.5]],
        "buffUptimes": [
            {"id": 740, "buffData": [{"uptime": 10}], "states": [[0, 0], [0, 5], [400, 25], [INT64_MAX, 25]]},
            {"id": 1187, "buffData": [{"uptime": 0}], "states": [[0, 0]]},  # never on: left out
            {"id": 9001, "buffData": [{"uptime": 50}], "states": [[0, 1], [300, 0]]},  # a personal buff: left out
        ],
    }


def make_log():
    return {
        "eliteInsightsVersion": "3.32.0.0",
        "durationMS": 900,
        "buffMap": {"b740": {"name": "Might", "classification": "Boon", "stacking": True},
                    "b1187": {"name": "Quickness", "classification": "Boon"},
                    "b9001": {"name": "Personal Thing", "classification": "Other"}},
        "combatReplayMetaData": {"inchToPixel": 7.5, "pollingRate": 300, "sizes": [750, 375],
                                 "maps": [{"url": "https://example.invalid/map.png", "interval": [-5000, 5900]}]},
        "phases": [
            {"name": "Full Fight", "start": 0, "end": 900, "targets": [0, 1], "subPhases": [1]},
            {"name": "Phase 1", "start": 0, "end": 400, "targets": [0]},
            {"name": "Breakbar 1", "start": 100, "end": 200, "breakbarPhase": True},
        ],
        "players": [
            # pixel (0, 0) is the top left of the map: the smallest x and the largest y
            _player("Alpha Character", "alpha.1234", 1, "Druid", [[0, 0], [750, 375], [375, 187.5]]),
            _player("Bravo Character", "bravo.5678", 2, "Chronomancer", [[75, 37.5], [75, 37.5], [75, 37.5]]),
            {"name": "Fake", "isFake": True, "account": "", "profession": "Druid"},
        ],
        "targets": [
            {"name": "Test Boss", "id": 12345, "healthPercents": [[0, 100.0], [600, 42.123]],
             "combatReplayData": {"start": 0, "end": 900, "positions": [[375, 187.5]] * 3, "orientations": [0, 0, 0],
                                  "dead": [[850, INT64_MAX]]}},
            {"name": "Add", "id": 54321, "combatReplayData": {"start": 250, "end": 600,
                                                              "positions": [[10, 10], [12, 12]]}},
            {"name": "Invisible", "id": 1, "isFake": True, "combatReplayData": {"positions": [[0, 0]]}},
        ],
        "mechanics": [
            {"name": "Dead", "mechanicsData": [{"time": 800, "actor": "Alpha Character"}]},
            {"name": "Slam", "mechanicsData": [{"time": 500, "actor": "Bravo Character"},
                                               {"time": 200, "actor": "Alpha Character"},
                                               {"time": 300, "actor": "Add"}]},
            {"name": "Slam", "mechanicsData": [{"time": 700, "actor": "Alpha Character"}]},
        ],
    }


class ReplayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.maps_path = os.path.join(cls.tmp.name, "maps.json")
        with open(cls.maps_path, "w") as file:
            json.dump(MAPS, file)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def convert(self, log=None, boss="Test Boss"):
        return replay.convert(log or make_log(), boss, maps_path=self.maps_path)

    def actor(self, result, name):
        return next(actor for actor in result["actors"] if actor["name"] == name)

    def test_format(self):
        result = self.convert()
        self.assertEqual(result["format"], "raidar.replay")
        self.assertEqual(result["version"], replay.FORMAT_VERSION)
        self.assertEqual(result["boss"], "Test Boss")
        self.assertEqual(result["duration"], 900)
        self.assertEqual(result["sample_interval"], 300)
        self.assertEqual(result["source"], {"parser": "EI 3.32.0.0"})
        json.dumps(result)  # serialisable as it is

    def test_actors(self):
        result = self.convert()
        self.assertEqual([(actor["kind"], actor["name"]) for actor in result["actors"]], [
            ("player", "Alpha Character"), ("player", "Bravo Character"), ("target", "Test Boss"), ("target", "Add")])
        alpha = self.actor(result, "Alpha Character")
        self.assertEqual((alpha["party"], alpha["profession"], alpha["elite"]),
                         (1,) + tuple(int(code) for code in adapter.SPECIALISATION_BY_NAME["Druid"]))
        self.assertNotIn("account", alpha)
        self.assertEqual(self.actor(result, "Add")["species"], 54321)

    def test_positions_are_world_inches(self):
        alpha = self.actor(self.convert(), "Alpha Character")
        # top left, bottom right and centre of the map
        self.assertEqual(list(zip(alpha["x"], alpha["y"])), [(1000, -450), (1100, -500), (1050, -475)])
        # EI's angles are for its y-down map; the replay's are world angles, counter-clockwise from +x
        self.assertEqual(alpha["facing"], [-10, 90, 180])

    def test_sample_start_is_on_the_polling_grid(self):
        add = self.actor(self.convert(), "Add")
        self.assertEqual((add["start"], add["end"], add["sample_start"]), (250, 600, 300))

    def test_open_intervals_are_clamped(self):
        alpha = self.actor(self.convert(), "Alpha Character")
        self.assertEqual(alpha["down"], [[300, 450]])
        self.assertEqual(alpha["dead"], [[800, 900]])
        self.assertEqual(alpha["dc"], [])  # [INT64_MIN, 0] is empty once clamped

    def test_damage_running_totals(self):
        alpha = self.actor(self.convert(), "Alpha Character")
        self.assertEqual(alpha["damage"], [0, 100, 250])
        # the full fight's targets are 0 and 1
        self.assertEqual(alpha["boss_damage"], [0, 90, 230])
        for series in (alpha["damage"], alpha["boss_damage"]):
            self.assertEqual(series, sorted(series))

    def test_player_health_barrier_and_buffs(self):
        alpha = self.actor(self.convert(), "Alpha Character")
        # of two values at one time the last holds, and repeated values are dropped
        self.assertEqual(alpha["health"], [[0, 100.0], [200, 64.0], [800, 0.0]])
        self.assertEqual(alpha["barrier"], [[0, 0.0], [100, 12.5]])
        # only buffs of the kept tabs that were ever on; EI's open end is clamped
        self.assertEqual(alpha["buffs"], {"might": [[0, 5], [400, 25]]})

    def test_target_health(self):
        boss = self.actor(self.convert(), "Test Boss")
        self.assertEqual(boss["health"], [[0, 100.0], [600, 42.12]])
        self.assertEqual(boss["dead"], [[850, 900]])

    def test_phases_match_the_adapter(self):
        log = make_log()
        result = self.convert(log)
        self.assertEqual(result["phases"], [{"name": "All", "start": 0, "end": 900, "parent": None},
                                            {"name": "Phase 1", "start": 0, "end": 400, "parent": None}])
        self.assertEqual([phase["name"] for phase in result["phases"]],
                         [name for _, name, _ in adapter._select_phases(log)])

    def test_mechanics_match_the_adapter(self):
        log = make_log()
        result = self.convert(log)
        # "Dead" is left out like in the adapter, the hit on the add is not a player's, the second "Slam" is renamed
        self.assertEqual(result["mechanics"], [
            {"time": 200, "actor": "Alpha Character", "name": "Slam"},
            {"time": 500, "actor": "Bravo Character", "name": "Slam"},
            {"time": 700, "actor": "Alpha Character", "name": "Slam (2)"},
        ])
        info, _ = adapter._mechanics(log, {"Alpha Character", "Bravo Character"}, adapter._select_phases(log))
        self.assertEqual(set(hit["name"] for hit in result["mechanics"]), set(entry["name"] for entry in info))

    def test_unknown_boss(self):
        with self.assertRaisesRegex(replay.ReplayException, "No replay map"):
            self.convert(boss="Other Boss")

    def test_map_frame_mismatch(self):
        log = make_log()
        log["combatReplayMetaData"]["sizes"] = [750, 400]  # another image
        with self.assertRaisesRegex(replay.ReplayException, "does not match"):
            self.convert(log)
        log = make_log()
        log["combatReplayMetaData"]["inchToPixel"] = 7.4  # another world rectangle
        with self.assertRaisesRegex(replay.ReplayException, "does not match"):
            self.convert(log)

    def test_axes_are_scaled_separately(self):
        """EI fits each axis to the pixel size, so the two scales can differ slightly; inchToPixel is rounded."""
        maps_path = os.path.join(self.tmp.name, "maps_uneven.json")
        with open(maps_path, "w") as file:
            # 100 x 52 inches, but an image of 400 x 200: EI's y scale is 375 / 52 pixels per inch
            json.dump({"Test Boss": {"image": None, "world": [1000, -502, 1100, -450], "size": [400, 200]}}, file)
        log = make_log()
        result = replay.convert(log, "Test Boss", maps_path=maps_path)
        alpha = self.actor(result, "Alpha Character")
        self.assertEqual(list(zip(alpha["x"], alpha["y"])), [(1000, -450), (1100, -502), (1050, -476)])

    def test_missing_positions(self):
        log = make_log()
        del log["players"][0]["combatReplayData"]["positions"]
        with self.assertRaisesRegex(replay.ReplayException, "no combat replay positions"):
            self.convert(log)

    def test_missing_replay_data(self):
        log = make_log()
        del log["combatReplayMetaData"]
        with self.assertRaisesRegex(replay.ReplayException, "no combat replay data"):
            self.convert(log)

    def test_unexpected_output_is_a_replay_exception(self):
        log = make_log()
        del log["players"][1]["damage1S"]
        with self.assertRaises(replay.ReplayException):
            self.convert(log)

    def test_input_is_not_modified(self):
        log = make_log()
        original = copy.deepcopy(log)
        self.convert(log)
        self.assertEqual(log, original)


class MapsTest(unittest.TestCase):
    def test_site_maps(self):
        """Every map entry is complete and its image exists."""
        with open(replay.MAPS_PATH, encoding="utf-8") as file:
            maps = json.load(file)
        self.assertIn("Dhuum", maps)
        folder = replay.IMAGES_DIR
        for boss, entry in maps.items():
            min_x, min_y, max_x, max_y = entry["world"]
            self.assertTrue(min_x < max_x and min_y < max_y, boss)
            self.assertEqual(len(entry["size"]), 2, boss)
            if entry["image"] is not None:
                self.assertTrue(os.path.isfile(os.path.join(folder, entry["image"])), boss)


if __name__ == "__main__":
    unittest.main()
