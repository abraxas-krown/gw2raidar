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
            {"id": 736, "buffData": [{"uptime": 5}], "states": [[0, 0], [200, 3], [500, 0]]},  # a condition
        ],
    }


def make_log():
    return {
        "eliteInsightsVersion": "3.32.0.0",
        "durationMS": 900,
        "buffMap": {"b740": {"name": "Might", "classification": "Boon", "stacking": True},
                    "b1187": {"name": "Quickness", "classification": "Boon"},
                    "b9001": {"name": "Personal Thing", "classification": "Other"},
                    "b717": {"name": "Protection", "classification": "Boon"},
                    "b736": {"name": "Bleeding", "classification": "Condition", "stacking": True, "icon": "bleed.png"},
                    "b19426": {"name": "Torment", "classification": "Condition", "stacking": True,
                               "icon": "torment.png"}},
        "combatReplayMetaData": {"inchToPixel": 7.5, "pollingRate": 300, "sizes": [750, 375],
                                 "maps": [{"url": "https://example.invalid/map.png", "interval": [-5000, 5900]}]},
        "phases": [
            {"name": "Full Fight", "start": 0, "end": 900, "targets": [0, 1], "subPhases": [1]},
            {"name": "Phase 1", "start": 0, "end": 400, "targets": [0]},
            {"name": "Breakbar 1", "start": 100, "end": 200, "breakbarPhase": True},
            # the boss's defiance bar: up from breakbarActive, or else 2 seconds after the phase starts
            {"name": "Test Boss Breakbar 1", "start": 100, "end": 500, "breakbarPhase": True, "targets": [0],
             "breakbarActive": 300},
            {"name": "Test Boss Breakbar 2", "start": -1400, "end": 5000, "breakbarPhase": True, "targets": [0]},
        ],
        "players": [
            # pixel (0, 0) is the top left of the map: the smallest x and the largest y
            _player("Alpha Character", "alpha.1234", 1, "Druid", [[0, 0], [750, 375], [375, 187.5]]),
            _player("Bravo Character", "bravo.5678", 2, "Chronomancer", [[75, 37.5], [75, 37.5], [75, 37.5]]),
            {"name": "Fake", "isFake": True, "account": "", "profession": "Druid"},
        ],
        "targets": [
            {"name": "Test Boss", "id": 12345, "healthPercents": [[0, 100.0], [600, 42.123]],
             "breakbarPercents": [[0, 100], [350, 61.27], [500, 0], [700, 100]],
             # a boon and a condition no player had, and a condition players had too
             "buffs": [{"id": 717, "states": [[0, 1], [300, 0]]},
                       {"id": 19426, "states": [[100, 7], [INT64_MAX, 7]]},
                       {"id": 736, "states": [[0, 0]]}],
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
        self.assertEqual(alpha["conditions"], {"bleeding": [[0, 0], [200, 3], [500, 0]]})

    def test_commander(self):
        log = make_log()
        # EI's open end is clamped
        log["players"][1].update(hasCommanderTag=True, commanderTagStates=[[0, 300], [500, INT64_MAX]])
        result = self.convert(log)
        self.assertEqual(self.actor(result, "Bravo Character")["commander"], [[0, 300], [500, 900]])
        self.assertNotIn("commander", self.actor(result, "Alpha Character"))

    def test_target_buffs_and_conditions(self):
        result = self.convert()
        boss = self.actor(result, "Test Boss")
        self.assertEqual(boss["buffs"], {"protection": [[0, 1], [300, 0]]})
        # never on: left out
        self.assertEqual(boss["conditions"], {"torment": [[100, 7]]})
        add = self.actor(result, "Add")
        self.assertEqual((add["buffs"], add["conditions"]), ({}, {}))

    def test_buff_info_covers_every_code_used(self):
        buffs = self.convert()["buffs"]
        self.assertEqual(sorted(buffs), ["bleeding", "might", "protection", "torment"])
        # torment is only on a target, so the encounter's own buff list does not have it
        self.assertEqual(buffs["torment"], {"name": "Torment", "icon": "torment.png", "category": "conditions"})
        self.assertEqual(buffs["might"]["category"], "boons")

    def test_target_breakbar(self):
        result = self.convert()
        boss = self.actor(result, "Test Boss")
        self.assertEqual(boss["breakbar"], [[0, 100.0], [350, 61.3], [500, 0.0], [700, 100.0]])
        # the second phase has no breakbarActive: up 2 seconds after its start, until the end of the log
        self.assertEqual(boss["breakbar_active"], [[300, 500], [600, 900]])
        # a target without a defiance bar has neither field
        self.assertNotIn("breakbar", self.actor(result, "Add"))
        self.assertNotIn("breakbar_active", self.actor(result, "Add"))

    def test_target_boss_flag(self):
        # the full fight's targets are the bosses; any other target is an add
        result = self.convert()
        self.assertEqual((self.actor(result, "Test Boss")["boss"], self.actor(result, "Add")["boss"]), (True, True))
        log = make_log()
        log["phases"][0]["targets"] = [0]
        result = self.convert(log)
        self.assertEqual((self.actor(result, "Test Boss")["boss"], self.actor(result, "Add")["boss"]), (True, False))

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
