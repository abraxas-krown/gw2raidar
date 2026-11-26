"""Converts the combat replay data of an Elite Insights JSON log into raidar's own replay format.

The replay is stored with the encounter (``Encounter.replay_diskname()``) and shown on the encounter page's
Replay tab (``views.replay``, ``frontend/assets/replay.js``). It is a
snapshot in the site's own terms, so that a stored replay keeps its meaning whatever later versions of EI
write: this module is the only place that reads EI's replay fields. Like ``adapter``, it has no Django imports.

Format, version 5 (all times are milliseconds from the start of the log, clamped to [0, duration])::

    {
      "format": "raidar.replay", "version": 5,
      "source": {"parser": "EI 3.32.0.0"},
      "boss": "Dhuum",                 # raidar boss name (analyser.bosses base_name), the key into replay_maps.json
      "duration": 568892,
      "sample_interval": 300,          # ms between two position samples
      "phases": [{"name": "All", "start": 0, "end": 568892, "parent": None}, ...],
      "actors": [{
        "kind": "player",              # or "target", or "anchor" or "minion" (see below)
        "name": "Character Name",      # players: EncounterPlayer.character; no account names are kept
        "profession": 7, "elite": 2, "party": 1,    # players: raidar's codes
        "species": 19450,              # targets, anchors and minions: game species ID
        "master": 3,                   # minions: the index of their player
        "priority": "main",            # targets: EI's priority for the whole fight: "main" (the boss), "blocking" (must
                                       # be dealt with to progress), "nonblocking" (relevant, can be ignored); absent:
                                       # an add. Main and blocking targets are the fight's bosses
                                       # (adapter.BOSS_PRIORITIES)
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
        "boss_damage": [...],          # players: running damage total at each second, to the fight's bosses
      }, ...],
      "mechanics": [{"time": 215810, "actor": "Character Name", "name": "Dead"}, ...],  # EncounterMechanic.name
      "buffs": {"bleeding": {"name": "Bleeding", "icon": "https://...", "category": "conditions"}, ...},
      "decorations": [{"shape": "circle", "style": 0, "start": 49987, "end": 54958, "at": {"actor": 9}}, ...],
      "decoration_styles": [{"colour": "rgba(255, 0, 0, 0.15)", "radius": 420}, ...],
      "arena": [{"start": 0, "end": 71885, "image": "https://i.imgur.com/IQn2RJV.png"}, ...],
    }

"decorations" are the mechanics EI's combat replay draws on the map (areas, cones, tethers, markers), and, since
version 5, the drawings of players' skills (with "skill"); ``eiparser.decorations`` describes them. Some are attached to actors that are neither players nor targets (orbs,
projectiles, helpers): those are listed among the actors as "anchor"s, with a name, a species and the movement
fields (start to dc) only. Players' minions (clones, phantasms, spirits, pets) are listed the same way as
"minion"s, with their player as "master"; EI ties each one to its player with a line, and readers show the
decorations attached to a minion only when they show the minion. A minion's name is left out (null) when it is a
character's name. Replays of version 1, and of logs EI parsed without decorations, have neither "decorations" nor
anchors and minions; readers take them as empty.

Players and targets both have "buffs" and "conditions": the buffs and conditions on them that were ever on. The
top level "buffs" describes every code they use. The encounter's own buff list only covers what was on players,
which misses the conditions the squad puts on targets without ever getting them. Replays made before conditions
were added have no "conditions", no target "buffs" and no top level "buffs"; readers take them as empty.

Targets' "priority" replaced "boss" in version 3. Replays of version 2 and earlier have "boss": True on the main
and blocking targets (not told apart) and False on the others, non-blocking ones included; older ones have neither,
and readers take the target with the most health data for the boss.

Positions are game world coordinates, so they are independent of EI's map images and pixel sizes. The map of
each boss is the site's own: ``replay_maps.json`` in this package lists, per boss, the image (a file in
``frontend/assets/img/replay``, or null for a boss without one), the world rectangle it shows
(``world``: minX, minY, maxX, maxY) and the image's size; the replay only names its boss.

"arena" (version 4) is EI's own map images over time, as EI names them: its image urls, "" where EI shows none
(it draws the arena from actors, such as Adina's and Sabir's platforms, instead). Some bosses' maps change during
the fight (Adina's, as the arena breaks up). ``replay_maps.json`` maps each boss's EI images that the site has an
image of to that image (``ei_images``); ``arena_images`` resolves them when the replay is served, falling back to
EI's image, so a map added to the site later shows in replays already stored. Replays without "arena" show the
boss's map throughout.
"""
import json
import math
import os
from functools import lru_cache

from analyser.analyser import SPECIALISATION_BY_NAME
from analyser.buffs import BOONS_TAB
from eiparser import decorations as decoration_format
from eiparser.adapter import (_buff_info, _phase_parents, _select_phases, _select_players, boss_targets,
                              named_mechanics, target_priorities)

FORMAT = "raidar.replay"
FORMAT_VERSION = 5

MAPS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "replay_maps.json")
# Where the images named in replay_maps.json are (the frontend serves them under img/replay/)
IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "frontend", "assets", "img", "replay")

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


def arena_images(entry, arena):
    """A replay's "arena" (EI's map images over time) in the site's images: [{"start", "end", "file": the site's
    image}, or with "url": EI's, for an image the site has none of, or with neither, where EI shows no image].

    ``entry`` is the boss's ``boss_map``.
    """
    own = entry.get("ei_images") or {}
    result = []
    for item in arena or []:
        image = item.get("image") or ""
        shown = {"start": item["start"], "end": item["end"]}
        if image in own:
            shown["file"] = own[image]
        elif image:
            shown["url"] = image
        result.append(shown)
    return result


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


def _movement(data, frame, interval, duration):
    """Position samples converted from EI's map pixels (y pointing down) to world inches, and facing.

    EI scales each axis on its own, to fit the map's pixel size (CombatReplayMap.GetMapCoordRounded); its
    inchToPixel is rounded, so the scales are worked out from the map instead (``decorations.Frame``).
    """
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
        "x": [frame.point(px, py)[0] for px, py in positions],
        "y": [frame.point(px, py)[1] for px, py in positions],
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
        used.update(actor.get("buffs") or {})  # anchors have none
        used.update(actor.get("conditions") or {})
    return {buff["code"]: {"name": buff["name"], "icon": buff["icon"], "category": buff["category"]}
            for buff in buff_info if buff["code"] in used}


def _decorations(meta, frame, interval, duration, actors, ids, player_names):
    """Adds the anchors to ``actors`` and returns (decorations, styles), or nothing when EI's are unusable."""
    anchors = []
    try:
        anchor_ids = {}
        for anchor in decoration_format.anchor_actors(meta, set(ids)):
            try:
                actor = {"kind": "anchor", "name": anchor.get("name"), "species": anchor.get("id")}
                master = ids.get(anchor.get("masterID")) if anchor.get("masterIsPlayer") else None
                if master is not None and actors[master]["kind"] == "player":
                    actor["kind"] = "minion"
                    actor["master"] = master
                    # some minions are named after their player (clones); that name would bypass the privacy settings
                    if actor["name"] in player_names:
                        actor["name"] = None
                actor.update(_movement(anchor["combatReplayData"], frame, interval, duration))
            except ReplayException:
                continue
            index = len(actors) + len(anchors)
            anchors.append(actor)
            anchor_ids[anchor["uniqueID"]] = index
            if anchor.get("parentID") is not None:
                anchor_ids.setdefault(anchor["parentID"], index)
        # texts are counters and labels; one that is a character name would bypass the site's privacy settings
        arena_actors = {index for index, actor in enumerate(anchors, len(actors))
                        if actor["kind"] == "anchor" and actor.get("species") in decoration_format.ARENA_SPECIES}
        decorations, styles = decoration_format.convert(meta, frame, {**anchor_ids, **ids}, duration,
                                                        hidden_texts=player_names, arena_actors=arena_actors)
    except Exception:  # the decorations must never cost the replay
        return [], []
    # anchors are only kept when a decoration uses them
    used = set()
    for decoration in decorations:
        for key in ("at", "from", "rotation"):
            place = decoration.get(key) or {}
            used.update(place[ref] for ref in ("actor", "towards") if ref in place)
        if "skill" in decoration:
            used.add(decoration["skill"]["owner"])
    first_anchor = len(actors)
    keep = [index for index in range(first_anchor, first_anchor + len(anchors)) if index in used]
    remap = {old: first_anchor + new for new, old in enumerate(keep)}
    for decoration in decorations:
        for key in ("at", "from", "rotation"):
            place = decoration.get(key) or {}
            for ref in ("actor", "towards"):
                if ref in place:
                    place[ref] = remap.get(place[ref], place[ref])
        if "skill" in decoration:
            decoration["skill"]["owner"] = remap.get(decoration["skill"]["owner"], decoration["skill"]["owner"])
    actors.extend(anchors[index - first_anchor] for index in keep)
    return decorations, styles


def _convert(log, boss, maps_path):
    entry = boss_map(boss, maps_path)
    world = entry["world"]
    meta = log.get("combatReplayMetaData")
    if not meta:
        raise ReplayException("The log has no combat replay data")
    pixels = _check_map(meta, entry)
    frame = decoration_format.Frame(world, pixels)
    interval = int(meta.get("pollingRate") or 0)
    if interval <= 0:
        raise ReplayException("The log has an invalid combat replay polling rate")

    phases = _select_phases(log)
    full_fight = phases[0][2]
    duration = int(log.get("durationMS") or full_fight["end"])
    parents = _phase_parents(log, phases)
    # the main and blocking targets (adapter.BOSS_PRIORITIES) are the fight's bosses
    priorities = target_priorities(full_fight)
    target_indices = boss_targets(full_fight)

    actors = []
    ids = {}  # EI's actor unique IDs -> indices into actors, for the decorations
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
        actor.update(_movement(player.get("combatReplayData") or {}, frame, interval, duration))
        actor["health"] = _steps(player.get("healthPercents"), duration, 1)
        actor["barrier"] = _steps(player.get("barrierPercents"), duration, 1)
        add_buffs(actor, player.get("buffUptimes"))
        if player.get("hasCommanderTag"):
            commander = _intervals(player.get("commanderTagStates"), duration)
            if commander:
                actor["commander"] = commander
        actor["damage"] = _running_total(player["damage1S"][0])
        actor["boss_damage"] = _boss_damage(player, target_indices)
        if player.get("uniqueID") is not None:
            ids[player["uniqueID"]] = len(actors)
        actors.append(actor)

    breakbars = _breakbar_windows(log, duration)
    for index, target in targets:
        actor = {"kind": "target", "name": target["name"], "species": target.get("id")}
        if index in priorities:
            actor["priority"] = priorities[index]
        actor.update(_movement(target["combatReplayData"], frame, interval, duration))
        actor["health"] = _steps(target.get("healthPercents"), duration, 2)
        add_buffs(actor, target.get("buffs"))
        if index in breakbars:
            actor["breakbar"] = _steps(target.get("breakbarPercents"), duration, 1)
            actor["breakbar_active"] = breakbars[index]
        if target.get("uniqueID") is not None:
            ids[target["uniqueID"]] = len(actors)
        actors.append(actor)

    player_names = set(player["name"] for player in players)
    decorations, styles = _decorations(meta, frame, interval, duration, actors, ids, player_names)
    mechanics = sorted(({"time": _clamp(hit["time"], duration), "actor": hit["actor"], "name": name}
                        for name, _, hits in named_mechanics(log, player_names) for hit in hits),
                       key=lambda hit: hit["time"])

    result = {
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
    if decorations:
        result["decorations"] = decorations
        result["decoration_styles"] = styles
    arena = _arena(meta, duration)
    if arena:
        result["arena"] = arena
    return result


def _arena(meta, duration):
    """EI's map images over time: [{"start", "end", "image": EI's url, or "" for none}], in order."""
    arena = []
    for entry in meta.get("maps") or []:
        try:
            start, end = (_clamp(time, duration) for time in entry["interval"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        if end > start:
            arena.append({"start": start, "end": end, "image": entry.get("url") or ""})
    return sorted(arena, key=lambda item: item["start"])


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
