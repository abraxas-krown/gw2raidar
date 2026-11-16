"""Converts the combat replay data of an Elite Insights JSON log into raidar's own replay format.

The replay is stored with the encounter (``Encounter.replay_diskname()``) and shown on the encounter page's
Replay tab (``views.replay``, ``raidar/static/raidar/replay.js``). It is a
snapshot in the site's own terms, so that a stored replay keeps its meaning whatever later versions of EI
write: this module is the only place that reads EI's replay fields. Like ``adapter``, it has no Django imports.

Format, version 1 (all times are milliseconds from the start of the log, clamped to [0, duration])::

    {
      "format": "raidar.replay", "version": 1,
      "source": {"parser": "EI 3.32.0.0"},
      "boss": "Dhuum",                 # raidar boss name (analyser.bosses base_name), the key into replay_maps.json
      "duration": 568892,
      "sample_interval": 300,          # ms between two position samples
      "phases": [{"name": "All", "start": 0, "end": 568892, "parent": None}, ...],
      "actors": [{
        "kind": "player",              # or "target"
        "name": "Character Name",      # players: EncounterPlayer.character; no account names are kept
        "profession": 7, "elite": 2, "party": 1,    # players: raidar's codes
        "species": 19450,              # targets: game species ID
        "boss": True,                  # targets: one of the fight's main targets (EI's full fight targets), not an add
        "start": 0, "end": 568892,     # when the actor is present
        "sample_start": 0,             # time of the first sample of x, y and facing
        "x": [...], "y": [...],        # game world position in inches, one sample every sample_interval
        "facing": [...],               # degrees counter-clockwise from +x (world, y up), one per sample, or empty
        "down": [[start, end], ...], "dead": [...], "dc": [...],
        "commander": [[start, end], ...],           # players with a commander tag: when they had it
        "health": [[time, percent], ...],           # health over time; each value holds until the next
        "barrier": [[time, percent], ...],          # players: barrier, in percent of their health
        "buffs": {"might": [[time, stacks], ...], ...},   # buff codes (analyser.buffs), see REPLAY_BUFF_TABS
        "conditions": {"bleeding": [[time, stacks], ...], ...},   # see REPLAY_CONDITION_TABS
        "breakbar": [[time, percent], ...],         # targets with a defiance bar: its value over time
        "breakbar_active": [[start, end], ...],     # targets with a defiance bar: when it is up (can be broken)
        "damage": [...],               # players: running damage total at each second, to everything (DPS bars)
        "boss_damage": [...],          # players: running damage total at each second, to the fight's targets
      }, ...],
      "mechanics": [{"time": 215810, "actor": "Character Name", "name": "Dead"}, ...],  # EncounterMechanic.name
      "buffs": {"bleeding": {"name": "Bleeding", "icon": "https://...", "category": "conditions"}, ...},
    }

Players and targets both have "buffs" and "conditions": the buffs and conditions on them that were ever on. The
top level "buffs" describes every code they use. The encounter's own buff list only covers what was on players,
which misses the conditions the squad puts on targets without ever getting them. Replays made before conditions
were added have no "conditions", no target "buffs" and no top level "buffs"; readers take them as empty.

Positions are game world coordinates, so they are independent of EI's map images and pixel sizes. The map of
each boss is the site's own: ``replay_maps.json`` in this package lists, per boss, the image (a file in
``raidar/static/raidar/img/replay``, or null for a boss without one), the world rectangle it shows
(``world``: minX, minY, maxX, maxY) and the image's size; the replay only names its boss.
"""
import json
import math
import os
from functools import lru_cache

from analyser.analyser import SPECIALISATION_BY_NAME
from analyser.buffs import BOONS_TAB
from eiparser.adapter import _buff_info, _phase_parents, _select_phases, _select_players, named_mechanics

FORMAT = "raidar.replay"
FORMAT_VERSION = 1

MAPS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "replay_maps.json")
# Where the images named in replay_maps.json are (served as static files under raidar/img/replay/)
IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "raidar", "static", "raidar", "img", "replay")

# EI draws every map with its longer side this many pixels long (CombatReplayMap.GetPixelMapSize)
EI_MAP_PIXELS = 750
# EI rounds inchToPixel to 3 decimals
SCALE_TOLERANCE = 0.0006

# EI's breakbar phases start this long before the bar is up, when breakbarActive is not given
BREAKBAR_ACTIVE_DELAY = 2000

# The buffs kept for each player, by the tab the site lists them on (analyser.buffs.BUFF_CATEGORIES)
REPLAY_BUFF_TABS = frozenset([BOONS_TAB, "offensive_buffs", "support_buffs", "defensive_buffs"])
REPLAY_CONDITION_TABS = frozenset(["conditions"])


class ReplayException(Exception):
    """No replay can be made from this log; the encounter is stored without one."""


@lru_cache(maxsize=None)
def _load_maps(path):
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def boss_map(boss, maps_path=MAPS_PATH):
    """The site's map of ``boss``: {"image": file name or None, "world": [minX, minY, maxX, maxY], "size": [w, h]}."""
    entry = _load_maps(maps_path).get(boss)
    if entry is None:
        raise ReplayException("No replay map for %s" % boss)
    return entry


def _clamp(time, duration):
    return min(max(int(time), 0), duration)


def _intervals(pairs, duration):
    """EI's [start, end] lists, clamped to the log; EI marks open ends with the largest and smallest int64."""
    result = []
    for start, end in pairs or []:
        start, end = _clamp(start, duration), _clamp(end, duration)
        if end > start:
            result.append([start, end])
    return result


def _ei_pixel_size(size):
    """The size EI draws a map of ``size`` at: the longer side EI_MAP_PIXELS long, the ratio kept."""
    width, height = size
    ratio = width / height
    if ratio > 1:
        return EI_MAP_PIXELS, int(round(EI_MAP_PIXELS / ratio))
    if ratio < 1:
        return int(round(ratio * EI_MAP_PIXELS)), EI_MAP_PIXELS
    return EI_MAP_PIXELS, EI_MAP_PIXELS


def _check_map(meta, entry):
    """EI's map frame must be the one the site's map was taken from, or the positions would be misplaced.

    Returns EI's map size in pixels.
    """
    min_x, _, max_x, _ = entry["world"]
    try:
        scale = float(meta["inchToPixel"])
        pixels = tuple(int(side) for side in meta["sizes"])
    except (KeyError, TypeError, ValueError):
        raise ReplayException("The log has no combat replay map data")
    expected = _ei_pixel_size(entry["size"])
    if pixels != expected or abs(scale - expected[0] / (max_x - min_x)) > SCALE_TOLERANCE:
        raise ReplayException("EI's combat replay map (%sx%s px at %s px/inch) does not match the site's map %s" % (
            pixels[0], pixels[1], scale, entry))
    return pixels


def _movement(data, world, pixels, interval, duration):
    """Position samples converted from EI's map pixels (y pointing down) to world inches, and facing.

    EI scales each axis on its own, to fit the map's pixel size (CombatReplayMap.GetMapCoordRounded); its
    inchToPixel is rounded, so the scales are worked out from the map instead.
    """
    min_x, min_y, max_x, max_y = world
    scale_x = (max_x - min_x) / pixels[0]
    scale_y = (max_y - min_y) / pixels[1]
    positions = data.get("positions")
    if not positions:
        raise ReplayException("The log has no combat replay positions")
    start = _clamp(data.get("start", 0), duration)
    facing = data.get("orientations") or []
    if facing and len(facing) != len(positions):
        raise ReplayException("Combat replay positions and orientations differ in length")
    return {
        "start": start,
        "end": _clamp(data.get("end", duration), duration),
        "sample_start": int(math.ceil(data.get("start", 0) / interval) * interval),
        "x": [round(min_x + px * scale_x, 1) for px, _ in positions],
        "y": [round(max_y - py * scale_y, 1) for _, py in positions],
        # EI's orientations are for its y-down map: the world angle is the opposite
        "facing": [_world_angle(angle) for angle in facing],
        "down": _intervals(data.get("down"), duration),
        "dead": _intervals(data.get("dead"), duration),
        "dc": _intervals(data.get("dc"), duration),
    }


def _world_angle(ei_angle):
    angle = int(round(-ei_angle)) % 360
    return angle - 360 if angle > 180 else angle


def _steps(points, duration, digits=None):
    """[time, value] changes, clamped to the log; of several values at one time the last holds."""
    result = []
    for time, value in points or []:
        time = _clamp(time, duration)
        value = round(float(value), digits) if digits is not None else int(value)
        if result and result[-1][0] == time:
            result.pop()
        if not result or result[-1][1] != value:
            result.append([time, value])
    return result


def _buff_states(uptimes, code_by_id, duration):
    """{buff code: [[time, stacks], ...]} of EI's buff uptimes, for the buffs that were ever on."""
    buffs = {}
    for buff in uptimes or []:
        code = code_by_id.get(buff["id"])
        if code is None:
            continue
        states = _steps(buff.get("states"), duration)
        if any(stacks for _, stacks in states):
            buffs[code] = states
    return buffs


def _breakbar_windows(log, duration):
    """{index into the log's targets: [[start, end], ...]}: when each target's defiance bar is up.

    EI makes a phase of each (breakbarPhase); the bar is up from breakbarActive (EI: 2 seconds after the
    phase starts) until the phase ends, when it is broken or has recovered.
    """
    windows = {}
    for phase in log.get("phases") or []:
        if not phase.get("breakbarPhase") or not phase.get("targets"):
            continue
        start = phase.get("breakbarActive")
        if start is None:
            start = phase["start"] + BREAKBAR_ACTIVE_DELAY
        start, end = _clamp(start, duration), _clamp(phase["end"], duration)
        if end > start:
            windows.setdefault(phase["targets"][0], []).append([start, end])
    return {index: sorted(spans) for index, spans in windows.items()}


def _running_total(series):
    return [int(value) for value in series or []]


def _boss_damage(player, target_indices):
    """Sum of the full fight running totals against the fight's targets."""
    per_target = [player["targetDamage1S"][index][0] for index in target_indices]
    length = max((len(series) for series in per_target), default=0)
    return [int(sum(series[second] for series in per_target if second < len(series))) for second in range(length)]


def _used_buffs(actors, buff_info):
    """{buff code: {"name", "icon", "category"}} for the buffs and conditions on the actors."""
    used = set()
    for actor in actors:
        used.update(actor["buffs"])
        used.update(actor["conditions"])
    return {buff["code"]: {"name": buff["name"], "icon": buff["icon"], "category": buff["category"]}
            for buff in buff_info if buff["code"] in used}


def _convert(log, boss, maps_path):
    entry = boss_map(boss, maps_path)
    world = entry["world"]
    meta = log.get("combatReplayMetaData")
    if not meta:
        raise ReplayException("The log has no combat replay data")
    pixels = _check_map(meta, entry)
    interval = int(meta.get("pollingRate") or 0)
    if interval <= 0:
        raise ReplayException("The log has an invalid combat replay polling rate")

    phases = _select_phases(log)
    full_fight = phases[0][2]
    duration = int(log.get("durationMS") or full_fight["end"])
    parents = _phase_parents(log, phases)
    target_indices = full_fight.get("targets") or []

    actors = []
    players = _select_players(log)
    targets = [(index, target) for index, target in enumerate(log.get("targets") or [])
               if not target.get("isFake") and (target.get("combatReplayData") or {}).get("positions")]
    # EI lists the buffs on targets under "buffs", in the same form as the players' "buffUptimes"
    code_by_id, buff_info = _buff_info(log, players + [{"buffUptimes": target.get("buffs")} for _, target in targets])
    category = {buff["code"]: buff["category"] for buff in buff_info}
    buff_ids = {buff_id: code for buff_id, code in code_by_id.items() if category[code] in REPLAY_BUFF_TABS}
    condition_ids = {buff_id: code for buff_id, code in code_by_id.items() if category[code] in REPLAY_CONDITION_TABS}

    def add_buffs(actor, uptimes):
        actor["buffs"] = _buff_states(uptimes, buff_ids, duration)
        actor["conditions"] = _buff_states(uptimes, condition_ids, duration)

    for player in players:
        profession, elite = SPECIALISATION_BY_NAME[player["profession"]]
        actor = {"kind": "player", "name": player["name"], "profession": int(profession), "elite": int(elite),
                 "party": player.get("group") or 0}
        actor.update(_movement(player.get("combatReplayData") or {}, world, pixels, interval, duration))
        actor["health"] = _steps(player.get("healthPercents"), duration, 1)
        actor["barrier"] = _steps(player.get("barrierPercents"), duration, 1)
        add_buffs(actor, player.get("buffUptimes"))
        if player.get("hasCommanderTag"):
            commander = _intervals(player.get("commanderTagStates"), duration)
            if commander:
                actor["commander"] = commander
        actor["damage"] = _running_total(player["damage1S"][0])
        actor["boss_damage"] = _boss_damage(player, target_indices)
        actors.append(actor)

    breakbars = _breakbar_windows(log, duration)
    for index, target in targets:
        actor = {"kind": "target", "name": target["name"], "species": target.get("id"),
                 "boss": index in target_indices}
        actor.update(_movement(target["combatReplayData"], world, pixels, interval, duration))
        actor["health"] = _steps(target.get("healthPercents"), duration, 2)
        add_buffs(actor, target.get("buffs"))
        if index in breakbars:
            actor["breakbar"] = _steps(target.get("breakbarPercents"), duration, 1)
            actor["breakbar_active"] = breakbars[index]
        actors.append(actor)

    player_names = set(player["name"] for player in players)
    mechanics = sorted(({"time": _clamp(hit["time"], duration), "actor": hit["actor"], "name": name}
                        for name, _, hits in named_mechanics(log, player_names) for hit in hits),
                       key=lambda hit: hit["time"])

    return {
        "format": FORMAT,
        "version": FORMAT_VERSION,
        "source": {"parser": "EI %s" % (log.get("eliteInsightsVersion") or "unknown")},
        "boss": boss,
        "duration": duration,
        "sample_interval": interval,
        "phases": [{"name": name, "start": _clamp(phase["start"], duration), "end": _clamp(phase["end"], duration),
                    "parent": parents.get(name)} for _, name, phase in phases],
        "actors": actors,
        "mechanics": mechanics,
        "buffs": _used_buffs(actors, buff_info),
    }


def convert(log, boss, maps_path=MAPS_PATH):
    """Returns the replay of a parsed EI JSON log of an encounter with ``boss`` (raidar's boss base name).

    Raises ReplayException when no replay can be made: the boss has no map, the log lacks the data, or EI's
    output is not what this module expects.
    """
    try:
        return _convert(log, boss, maps_path)
    except ReplayException:
        raise
    except Exception as error:  # anything unexpected in EI's output must not break the upload
        raise ReplayException("Unexpected combat replay data: %s: %s" % (type(error).__name__, error))
