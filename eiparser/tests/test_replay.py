"""Tests of eiparser.replay against a small, made-up EI log. Run with: python -m unittest discover eiparser/tests"""
import copy
import json
import math
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

    def priorities(self, result):
        return (self.actor(result, "Test Boss").get("priority"), self.actor(result, "Add").get("priority"))

    def test_target_priorities(self):
        """The full fight's targetPriorities; a target without one is an add."""
        log = make_log()
        log["phases"][0]["targetPriorities"] = {"0": "MAIN", "1": "BLOCKING"}
        self.assertEqual(self.priorities(self.convert(log)), ("main", "blocking"))
        log["phases"][0]["targetPriorities"] = {"0": "MAIN", "1": "NONBLOCKING"}
        self.assertEqual(self.priorities(self.convert(log)), ("main", "nonblocking"))
        log["phases"][0]["targetPriorities"] = {"0": "MAIN"}
        result = self.convert(log)
        self.assertEqual(self.priorities(result), ("main", None))
        self.assertNotIn("boss", self.actor(result, "Test Boss"))

    def test_target_priorities_of_older_ei_builds(self):
        """Without targetPriorities: "targets" are main, "secondaryTargets" non-blocking."""
        self.assertEqual(self.priorities(self.convert()), ("main", "main"))
        log = make_log()
        log["phases"][0]["targets"] = [0]
        log["phases"][0]["secondaryTargets"] = [1]
        self.assertEqual(self.priorities(self.convert(log)), ("main", "nonblocking"))

    def test_boss_damage_is_to_main_and_blocking_targets(self):
        log = make_log()
        log["phases"][0]["targetPriorities"] = {"0": "MAIN", "1": "BLOCKING"}
        both = self.actor(self.convert(log), "Alpha Character")["boss_damage"]
        log["phases"][0]["targetPriorities"] = {"0": "MAIN", "1": "NONBLOCKING"}
        main = self.actor(self.convert(log), "Alpha Character")["boss_damage"]
        self.assertNotEqual(both, main)
        player = log["players"][0]
        self.assertEqual(main, replay._boss_damage(player, [0]))

    def test_arena_is_eis_maps_over_time(self):
        log = make_log()
        log["combatReplayMetaData"]["maps"] = [
            {"url": "https://example.invalid/split.png", "interval": [400, 700]},
            {"url": "https://example.invalid/main.png", "interval": [-5000, 400]},
            {"url": "", "interval": [700, 9223372036854775807]},
            {"url": "https://example.invalid/never.png", "interval": [2000, 3000]},
        ]
        self.assertEqual(self.convert(log)["arena"], [
            {"start": 0, "end": 400, "image": "https://example.invalid/main.png"},
            {"start": 400, "end": 700, "image": "https://example.invalid/split.png"},
            {"start": 700, "end": 900, "image": ""},
        ])
        del log["combatReplayMetaData"]["maps"]
        self.assertNotIn("arena", self.convert(log))

    def test_arena_images(self):
        """EI's images the site has an image of are shown as it; others as EI's; blank ones as nothing."""
        entry = {"image": "boss.svg", "ei_images": {"https://example.invalid/main.png": "boss.svg"}}
        arena = [{"start": 0, "end": 400, "image": "https://example.invalid/main.png"},
                 {"start": 400, "end": 700, "image": "https://example.invalid/split.png"},
                 {"start": 700, "end": 900, "image": ""}]
        self.assertEqual(replay.arena_images(entry, arena), [
            {"start": 0, "end": 400, "file": "boss.svg"},
            {"start": 400, "end": 700, "url": "https://example.invalid/split.png"},
            {"start": 700, "end": 900},
        ])
        self.assertEqual(replay.arena_images({"image": None}, None), [])

    def test_every_boss_maps_an_ei_image_to_its_own(self):
        """replay_maps.json: each boss with an image lists the EI image it is a copy of."""
        with open(replay.MAPS_PATH, encoding="utf-8") as file:
            maps = json.load(file)
        for boss, entry in maps.items():
            if entry["image"]:
                self.assertIn(entry["image"], (entry.get("ei_images") or {}).values(), boss)

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


ALPHA_ID, BRAVO_ID, BOSS_ID, ADD_ID, ORB_ID, UNUSED_ID = 10, 11, 20, 21, 30, 31


def log_with_decorations(decorations, metadata=None, anchors=None):
    """make_log() with EI's actor unique IDs and the given combat replay decorations."""
    log = make_log()
    for actor, unique_id in zip(log["players"][:2] + log["targets"][:2], (ALPHA_ID, BRAVO_ID, BOSS_ID, ADD_ID)):
        actor["uniqueID"] = unique_id
    meta = log["combatReplayMetaData"]
    meta["decorations"] = decorations
    meta["decorationMetadata"] = metadata if metadata is not None else [
        {"type": 2, "signature": "red", "color": "rgba(255, 0, 0, 0.2)", "radius": 120, "minRadius": 20},
        {"type": 8, "signature": "tether", "color": "rgba(0, 0, 255, 0.5)", "thickness": 2},
        {"type": 15, "signature": "unused", "color": "black", "width": 10, "height": 20},
        {"type": 11, "signature": "cone", "color": "orange", "radius": 600, "openingAngle": 60},
    ]
    meta["actors"] = anchors if anchors is not None else [
        {"uniqueID": ORB_ID, "id": 777, "name": "Orb",
         "combatReplayData": {"start": 300, "end": 600, "positions": [[750, 0], [0, 375]]}},
        {"uniqueID": UNUSED_ID, "id": 778, "name": "Nobody",
         "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
    ]
    return log


class DecorationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.maps_path = os.path.join(cls.tmp.name, "maps.json")
        with open(cls.maps_path, "w") as file:
            json.dump(MAPS, file)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def convert(self, log):
        return replay.convert(log, "Test Boss", maps_path=self.maps_path)

    def index(self, result, name):
        return next(i for i, actor in enumerate(result["actors"]) if actor["name"] == name)

    def test_circle_on_an_actor(self):
        result = self.convert(log_with_decorations([
            {"type": 2, "metadataSignature": "red", "start": 100, "end": 500, "fill": True, "growingEnd": 400,
             "connectedTo": {"masterID": BOSS_ID}},
        ]))
        self.assertEqual(result["decorations"], [
            {"shape": "circle", "style": 0, "start": 100, "end": 500, "fill": True, "grow_end": 400,
             "at": {"actor": self.index(result, "Test Boss")}},
        ])
        self.assertEqual(result["decoration_styles"],
                         [{"colour": "rgba(255, 0, 0, 0.2)", "radius": 120, "min_radius": 20}])

    def test_positions_offsets_and_angles_are_in_world_terms(self):
        """EI's are map pixels, with y and angles for its y-down map."""
        result = self.convert(log_with_decorations([
            {"type": 11, "metadataSignature": "cone", "start": 0, "end": 900,
             "connectedTo": {"position": [375, 187.5], "offset": [10, 30], "offsetAfterRotation": True},
             "rotationConnectedTo": {"angle": 90, "spinAngle": -45}},
        ]))
        decoration = result["decorations"][0]
        self.assertEqual(decoration["at"], {"pos": [1050, -475], "offset": [10, -30], "offset_turns": True})
        self.assertEqual(decoration["rotation"], {"angle": -90, "spin": 45})
        self.assertEqual(result["decoration_styles"], [{"colour": "orange", "radius": 600, "opening": 60}])

    def test_tether_to_an_anchor(self):
        result = self.convert(log_with_decorations([
            {"type": 8, "metadataSignature": "tether", "start": 300, "end": 600,
             "connectedTo": {"masterID": ORB_ID}, "connectedFrom": {"masterID": ALPHA_ID}},
        ]))
        orb = self.index(result, "Orb")
        self.assertEqual(result["decorations"][0]["at"], {"actor": orb})
        self.assertEqual(result["decorations"][0]["from"], {"actor": self.index(result, "Alpha Character")})
        anchor = result["actors"][orb]
        self.assertEqual((anchor["kind"], anchor["species"], anchor["start"], anchor["end"]), ("anchor", 777, 300, 600))
        self.assertEqual(list(zip(anchor["x"], anchor["y"])), [(1100, -450), (1000, -500)])
        # anchors no decoration uses are left out
        self.assertNotIn("Nobody", [actor["name"] for actor in result["actors"]])

    def test_platform_on_an_actor(self):
        """A background icon: an image on an actor; its opacity fades into each new value over the 1500ms before."""
        metadata = [{"type": 1, "signature": "platform", "image": "https://example.com/p.png", "worldSize": 2247}]
        result = self.convert(log_with_decorations([
            {"type": 1, "metadataSignature": "platform", "start": -500, "end": 2147483647,
             "connectedTo": {"masterID": ORB_ID},
             "rotationConnectedTo": {"masterID": ORB_ID, "rotationOffset": 180, "rotationOffsetMode": 0},
             "opacities": [1, -500, 0.1, 400, 1, 3000], "heights": [-50, -500, -50, 100, -60, 200]},
        ], metadata=metadata))
        platform = result["decorations"][0]
        orb = self.index(result, "Orb")
        self.assertEqual(platform["shape"], "platform")
        self.assertEqual((platform["start"], platform["end"]), (0, 900))
        self.assertEqual(platform["at"], {"actor": orb})
        self.assertEqual(platform["rotation"], {"actor": orb, "offset": -180.0, "mode": "add"})
        # fading to 0.1 by 400 (from the previous value's time, -500, as it is less than 1500ms before); the fade back
        # to 1 starts at 1500, after the log
        self.assertEqual(platform["opacity"], [[0, 0.5], [400, 0.1], [900, 0.1]])
        self.assertEqual(platform["height"], [[0, -50.0], [200, -60.0]])
        self.assertEqual(result["decoration_styles"][platform["style"]],
                         {"image": "https://example.com/p.png", "world_size": 2247})
        # platforms are not mechanics, markers or minions
        self.assertNotIn("marker", platform)

    def test_moving_platform_changes_at_once(self):
        """Two keyframes at the same time are an instant change: the value before holds until then."""
        metadata = [{"type": 10, "signature": "mp", "image": "https://example.com/p.png", "width": 2247, "height": 2247}]
        positions = [[0, 0, 0, 0, 1, time] for time in (0, 200, 300)] + [[0, 0, 0, 0, 0.1, 600], [0, 0, 0, 0, 0.1, 700]]
        positions.insert(3, [0, 0, 0, 0, 1, 600])
        result = self.convert(log_with_decorations([
            {"type": 10, "metadataSignature": "mp", "start": 0, "end": 900, "positions": positions},
        ], metadata=metadata))
        self.assertEqual(result["decorations"][0]["opacity"], [[0, 1.0], [600, 1.0], [600, 0.1], [900, 0.1]])

    def test_platform_opacities_out_of_order(self):
        """EI goes through a background icon's opacities in its order: a time before the previous one counts as that
        one (Sabir's platforms are shown from the start)."""
        metadata = [{"type": 1, "signature": "platform", "image": "https://example.com/p.png", "worldSize": 1660}]
        result = self.convert(log_with_decorations([
            {"type": 1, "metadataSignature": "platform", "start": -545, "end": 900, "connectedTo": {"masterID": ORB_ID},
             "opacities": [0, -545, 1, -8470, 0, 3000], "heights": [0, -545]},
        ], metadata=metadata))
        # shown from the start; the fade out starts at 1500, after the log
        self.assertEqual(result["decorations"][0]["opacity"], [[0, 1.0], [900, 1.0]])

    def test_moving_platform(self):
        """A moving platform follows its own keyframes, in map pixels and radians, and is not there before them."""
        metadata = [{"type": 10, "signature": "mp", "image": "https://example.com/p.png", "width": 2247, "height": 2247}]
        result = self.convert(log_with_decorations([
            {"type": 10, "metadataSignature": "mp", "start": -2147483648, "end": 2147483647,
             "positions": [[750, 0, -10, 3 * math.pi, 1, 500], [0, 375, -20, math.pi / 2, 0.5, 100]]},
        ], metadata=metadata))
        platform = result["decorations"][0]
        self.assertEqual((platform["start"], platform["end"]), (100, 900))
        self.assertEqual(platform["at"], {"path": [[100, 1000, -500], [500, 1100, -450]]})
        # world angles; more than half a turn between keyframes is kept
        self.assertEqual(platform["rotation"], {"path": [[100, -90.0], [500, -540.0]], "unwrapped": True})
        self.assertEqual(platform["opacity"], [[0, 0.5], [100, 0.5], [500, 1.0], [900, 1.0]])
        self.assertEqual(platform["height"], [[100, -20.0], [500, -10.0]])

    def test_decorations_on_arena_actors_are_arena(self):
        """Adina's platforms are drawn as hexagons on her platform actors: the arena, not mechanics."""
        anchors = [
            {"uniqueID": ORB_ID, "id": -104, "name": "Platform",
             "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
        ]
        metadata = [{"type": 21, "signature": "hex", "color": "brown", "radius": 500, "nbPolygon": 6}]
        result = self.convert(log_with_decorations([
            {"type": 21, "metadataSignature": "hex", "start": 0, "end": 900, "fill": True,
             "connectedTo": {"masterID": ORB_ID}},
            {"type": 21, "metadataSignature": "hex", "start": 0, "end": 900, "fill": True,
             "connectedTo": {"position": [0, 0]}},
        ], metadata=metadata, anchors=anchors))
        self.assertEqual([decoration.get("arena") for decoration in result["decorations"]], [True, None])

    def test_player_skills(self):
        """Skill drawings are kept with their owner, EI's categories and the skill; one whose owner the replay does not
        have is left out."""
        result = self.convert(log_with_decorations([
            {"type": 2, "metadataSignature": "red", "start": 100, "end": 500, "connectedTo": {"masterID": ALPHA_ID},
             "skillMode": {"ownerID": ALPHA_ID, "category": 9, "skillID": 12345}},
            {"type": 2, "metadataSignature": "red", "start": 100, "end": 500, "connectedTo": {"masterID": ALPHA_ID},
             "skillMode": {"ownerID": 999, "category": 1, "skillID": 1}},
        ]))
        self.assertEqual([decoration.get("skill") for decoration in result["decorations"]],
                         [{"owner": self.index(result, "Alpha Character"), "category": 9, "id": 12345}])

    def test_skill_owner_anchor_is_kept(self):
        """A minion that only owns skill drawings is kept, and the owner follows it when anchors are renumbered."""
        anchors = [
            {"uniqueID": UNUSED_ID, "id": 778, "name": "Nobody",
             "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
            {"uniqueID": ORB_ID, "id": 777, "name": "Staff Clone", "masterID": ALPHA_ID, "masterIsPlayer": True,
             "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
        ]
        result = self.convert(log_with_decorations([
            {"type": 2, "metadataSignature": "red", "start": 100, "end": 500, "connectedTo": {"position": [0, 0]},
             "skillMode": {"ownerID": ORB_ID, "category": 1, "skillID": 7}},
        ], anchors=anchors))
        self.assertEqual(result["decorations"][0]["skill"]["owner"], self.index(result, "Staff Clone"))
        self.assertNotIn("Nobody", [actor["name"] for actor in result["actors"]])

    def test_squad_markers_are_flagged(self):
        metadata = [{"type": 16, "signature": "arrow", "image": "https://example.com/arrow.png", "pixelSize": 32}]
        result = self.convert(log_with_decorations([
            {"type": 16, "metadataSignature": "arrow", "start": 0, "end": 900, "connectedTo": {"position": [0, 0]}},
            {"type": 17, "metadataSignature": "arrow", "start": 0, "end": 900, "connectedTo": {"masterID": BOSS_ID}},
            {"type": 6, "metadataSignature": "arrow", "start": 0, "end": 900, "connectedTo": {"position": [0, 0]}},
        ], metadata=metadata))
        self.assertEqual([(decoration["shape"], decoration.get("marker")) for decoration in result["decorations"]],
                         [("icon", True), ("overhead_icon", True), ("icon", None)])

    def test_minions_of_players(self):
        """Anchors EI gives a player as master are that player's minions; ones named after a player lose the name."""
        anchors = [
            {"uniqueID": ORB_ID, "id": 777, "name": "Staff Clone", "masterID": ALPHA_ID, "masterIsPlayer": True,
             "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
            {"uniqueID": UNUSED_ID, "id": 778, "name": "Bravo Character", "masterID": BRAVO_ID, "masterIsPlayer": True,
             "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
            # a minion of a target is an anchor like any other
            {"uniqueID": 32, "id": 779, "name": "Add Minion", "masterID": BOSS_ID,
             "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}},
        ]
        result = self.convert(log_with_decorations([
            {"type": 8, "metadataSignature": "tether", "start": 0, "end": 900,
             "connectedTo": {"masterID": minion}, "connectedFrom": {"masterID": master}}
            for minion, master in ((ORB_ID, ALPHA_ID), (UNUSED_ID, BRAVO_ID), (32, BOSS_ID))
        ], anchors=anchors))
        kinds = [(actor["kind"], actor["name"], actor.get("master")) for actor in result["actors"][-3:]]
        self.assertEqual(kinds, [
            ("minion", "Staff Clone", self.index(result, "Alpha Character")),
            ("minion", None, self.index(result, "Bravo Character")),
            ("anchor", "Add Minion", None),
        ])

    def test_anchor_of_an_englobed_agent(self):
        """Decorations refer to the agent that englobes an anchor."""
        anchors = [{"uniqueID": ORB_ID, "parentID": 99, "id": 777, "name": "Orb",
                    "combatReplayData": {"start": 0, "end": 900, "positions": [[0, 0]]}}]
        result = self.convert(log_with_decorations([
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900, "connectedTo": {"masterID": 99}},
        ], anchors=anchors))
        self.assertEqual(result["decorations"][0]["at"], {"actor": self.index(result, "Orb")})

    def test_moving_and_rotating_connectors(self):
        result = self.convert(log_with_decorations([
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900,
             "connectedTo": {"positions": [0, 0, 100, 750, 375, 700], "interpolationMethod": 1},
             "rotationConnectedTo": {"angles": [30, 100, -60, 700], "interpolationMethod": 0}},
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900,
             "connectedTo": {"masterID": BRAVO_ID, "position": [375, 187.5, 200], "velocity": 0.25},
             "rotationConnectedTo": {"masterID": BOSS_ID, "rotationOffset": 90, "rotationOffsetMode": 2}},
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900, "connectedTo": {"masterID": BOSS_ID},
             "rotationConnectedTo": {"masterID": BOSS_ID, "dstMasterID": ALPHA_ID}},
        ]))
        path, homing, facing = result["decorations"]
        self.assertEqual(path["at"], {"path": [[100, 1000, -450], [700, 1100, -500]], "step": True})
        self.assertEqual(path["rotation"], {"path": [[100, -30], [700, 60]]})
        boss, alpha, bravo = (self.index(result, name) for name in ("Test Boss", "Alpha Character", "Bravo Character"))
        self.assertEqual(homing["at"], {"actor": bravo, "origin": [200, 1050, -475], "speed": 0.25})
        self.assertEqual(homing["rotation"], {"actor": boss, "offset": -90, "mode": "after_offset"})
        self.assertEqual(facing["rotation"], {"actor": boss, "towards": alpha})

    def test_only_drawable_mechanics_are_kept(self):
        result = self.convert(log_with_decorations([
            # a player's skill, of an owner the replay does not have
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900, "connectedTo": {"masterID": ALPHA_ID},
             "skillMode": {"ownerID": 12345, "category": 9, "skillID": 1}},
            # drawn on the screen, not on the map
            {"type": 20, "metadataSignature": "red", "start": 0, "end": 900, "text": "Charge 1 out of 10",
             "connectedTo": {"position": [10, 10], "isScreenSpace": True}},
            # attached to an actor the replay does not have
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900, "connectedTo": {"masterID": 12345}},
            # a kind the replay does not know, a missing style, an empty lifespan once clamped
            {"type": 99, "metadataSignature": "red", "start": 0, "end": 900, "connectedTo": {"masterID": BOSS_ID}},
            {"type": 2, "metadataSignature": "nope", "start": 0, "end": 900, "connectedTo": {"masterID": BOSS_ID}},
            {"type": 2, "metadataSignature": "red", "start": 2000, "end": 3000, "connectedTo": {"masterID": BOSS_ID}},
            # malformed
            {"type": 2, "metadataSignature": "red", "start": 0, "end": 900, "connectedTo": {"position": "x"}},
            # a text that is a character's name
            {"type": 22, "metadataSignature": "red", "start": 0, "end": 900, "text": "Alpha Character",
             "connectedTo": {"masterID": ALPHA_ID}},
            # kept, with the only style it uses, renumbered
            {"type": 15, "metadataSignature": "cone", "start": 600, "end": 700, "text": "3",
             "connectedTo": {"masterID": ADD_ID}},
        ]))
        self.assertEqual(result["decorations"], [
            {"shape": "rectangle", "style": 0, "start": 600, "end": 700, "text": "3",
             "at": {"actor": self.index(result, "Add")}}])
        self.assertEqual(len(result["decoration_styles"]), 1)
        self.assertEqual([actor["kind"] for actor in result["actors"]].count("anchor"), 0)

    def test_decorations_are_sorted_and_clamped(self):
        result = self.convert(log_with_decorations([
            {"type": 2, "metadataSignature": "red", "start": 500, "end": 99999, "connectedTo": {"masterID": BOSS_ID}},
            {"type": 2, "metadataSignature": "red", "start": -100, "end": 300, "connectedTo": {"masterID": BOSS_ID}},
        ]))
        self.assertEqual([(d["start"], d["end"]) for d in result["decorations"]], [(0, 300), (500, 900)])

    def test_broken_decoration_data_keeps_the_replay(self):
        log = log_with_decorations([{"type": 2}], metadata="not a list", anchors=[{"uniqueID": ORB_ID}])
        result = self.convert(log)
        self.assertNotIn("decorations", result)
        self.assertEqual([actor["kind"] for actor in result["actors"]], ["player", "player", "target", "target"])

    def test_logs_without_decorations(self):
        result = self.convert(make_log())
        self.assertNotIn("decorations", result)
        self.assertNotIn("decoration_styles", result)

    def test_input_is_not_modified(self):
        log = log_with_decorations([
            {"type": 8, "metadataSignature": "tether", "start": 300, "end": 600,
             "connectedTo": {"masterID": ORB_ID}, "connectedFrom": {"masterID": ALPHA_ID}},
        ])
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
