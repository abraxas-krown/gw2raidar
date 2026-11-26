"""Converts the mechanic drawings of an EI JSON log (``combatReplayMetaData.decorations``) into the replay's own terms.

EI only writes them with its RawCombatReplayDecorations setting (see ``runner.CONFIG``). They mirror the objects EI's
own combat replay draws: a decoration has a kind, a lifespan, connectors that place and rotate it (on an actor, at a
point, along a path), and the signature of a metadata entry that gives its look. This module turns them into::

    "decorations": [{
        "shape": "circle",             # see SHAPES
        "style": 0,                    # index into "decoration_styles"
        "start": 49987, "end": 54958,  # ms, clamped to the log
        "fill": True,                  # shapes: filled rather than outlined (absent: outlined)
        "grow_end": 52000,             # shapes: grows from start until then (absent: full size throughout)
        "grow_reverse": True,          # shapes: shrinks instead
        "at": {...},                   # where it is drawn, see below
        "from": {...},                 # lines: the other end; a growing line grows from "at" towards it
        "rotation": {...},             # see below; absent: not rotated
        "points": [[x, y], ...],       # custom polygons: inches, relative to "at", world axes
        "progress": [[time, percent], ...], "progress_step": True,   # progress bars
        "text": "...",                 # texts and icons
        "marker": True,                # squad markers (icons the squad places, on the ground or over an actor)
        "skill": {"owner": 3, "category": 9, "id": 12345},   # a player's skill: its owner (an index into
                                       # "actors"; a player, or a minion), EI's categories (SKILL_CATEGORIES), the skill
        "arena": True,                 # drawn on an actor that is a part of the arena (ARENA_SPECIES): the arena, not
                                       # a mechanic, drawn with the map like platforms
        "opacity": [[time, 0.5], ...], # platforms: opacity over time (0 to 1), linear between points
        "height": [[time, -4729], ...],   # platforms: height over time, held until the next; the highest value is
                                       # drawn first (EI's z points down)
    }, ...],
    "decoration_styles": [{"colour": "rgba(255, 0, 0, 0.15)", "radius": 420, ...}, ...],

Positions ("at", "from"), all in game world inches:

- ``{"actor": 3}``: on that actor (an index into "actors")
- ``{"pos": [x, y]}``: a fixed point
- ``{"path": [[time, x, y], ...], "step": True}``: moves along a path (linear between points unless "step")
- ``{"actor": 3, "origin": [time, x, y], "speed": 0.5}``: starts at origin at that time, then homes in on the actor
  at that many inches per ms

and any of them can have ``"offset": [dx, dy]`` (inches, world axes) and ``"offset_turns": True`` when the offset
is applied after the rotation, so that it turns with the decoration.

Rotations, all in degrees counter-clockwise from +x (world, y up), like the actors' facing:

- ``{"angle": 90}``, and ``{"angle": 90, "spin": -180}`` when it turns by "spin" over its lifespan
- ``{"path": [[time, angle], ...], "step": True}``: by the shortest turn between points, or, with ``"unwrapped":
  True``, as the angles are (a platform can turn more than half a turn between two points)
- ``{"actor": 3, "offset": 45, "mode": "add"}``: the actor's facing; "mode" is how the offset applies, as in EI:
  "add" (to the facing), "absolute" (instead of the facing) or "after_offset" (after the position's offset)
- ``{"actor": 3, "towards": 5}``: facing from one actor to another

Styles have only the fields their shape uses: colour, secondary_colour, background (CSS colours); radius,
min_radius, inner_radius, outer_radius, width, height, world_size (inches); opening (pie, degrees); sides (regular
polygon); thickness (line: screen pixels, or inches with thickness_world); pixel_width, pixel_height, pixel_size
(screen pixels); image (url); opacity.

Actors that decorations are attached to but that are neither players nor targets come from EI's
``combatReplayMetaData.actors``, and are added to the replay's actors as ``"kind": "anchor"`` (positions only), or
as ``"kind": "minion"`` when EI gives them a player as master (``masterID``, ``masterIsPlayer``).

The drawings of players' skills (EI's skillMode) are kept with "skill": their owner, EI's categories and the skill.
The site's replay shows only the selected player's (EI's own replay goes by SKILL_CATEGORIES). The ones drawn on the
screen rather than the map are left out, as are decorations attached to actors the replay does not have.

Platforms ("shape": "platform") are parts of the arena that move or come and go, such as Qadim's and Sabir's: an
image ("image", "width" and "height", or "world_size", in inches) at "at", turned by "rotation", with an "opacity"
and a "height". They are not mechanics: readers draw them with the map, under everything else, and in "height"
order. EI has two kinds: images on an actor (background icons; the actor is an anchor) and images that follow
their own keyframes (moving platforms, from logs without platform actors), both turned into the same form.
"""
import math

# EI's decoration kinds (CombatReplayDescription.Types) and the replay's names for them
SHAPES = {
    1: "platform", 10: "platform", 2: "circle", 3: "doughnut", 6: "icon", 7: "overhead_icon", 8: "line", 11: "pie", 13: "progress_bar",
    14: "overhead_progress_bar", 15: "rectangle", 16: "icon", 17: "overhead_icon", 20: "text",
    21: "polygon", 22: "overhead_text", 24: "custom_polygon",
}
# EI's squad markers (on the ground, and over an actor): icons like any other, flagged "marker" so they can be shown
# on their own, as EI's combat replay does
SQUAD_MARKERS = frozenset([16, 17])
# The species (EI's IDs) of actors that are a part of the arena, whose drawings are the arena rather than mechanics:
# Adina's platforms (EI's TargetID.AdinaPlateform, an ID of EI's own), which EI draws as hexagons on a blank map.
# Check them when upgrading EI (DEPLOY.md).
ARENA_SPECIES = frozenset([-104])
# EI's categories of skill drawings (SkillDecorationCategory in EI's global.js), as bit flags. EI's combat replay shows,
# by default, the ones in any category but SHOW_ON_SELECT and CROWD_CONTROL to everyone, and the others (every one
# has SHOW_ON_SELECT) only while their owner, or the owner's player, is selected.
SKILL_CATEGORIES = {
    "show_on_select": 1, "important_buffs": 2, "projectile_management": 4, "heal": 8, "cleanse": 16, "strip": 32,
    "portal": 64, "crowd_control": 128,
}
# EI's moving platform (a platform with its own keyframes); its other platforms (background icons) are on an actor
MOVING_PLATFORM = 10
# a background icon's opacity fades into its next value over this long (EI's BackgroundIconMechanicDrawable)
FADE_MS = 1500
ROTATION_MODES = {0: "add", 1: "absolute", 2: "after_offset"}
STEP = 1  # EI's InterpolationMethod.Step

# metadata field -> style field
STYLE_FIELDS = {
    "color": "colour", "secondaryColor": "secondary_colour", "backgroundColor": "background",
    "radius": "radius", "minRadius": "min_radius", "innerRadius": "inner_radius", "outerRadius": "outer_radius",
    "width": "width", "height": "height", "openingAngle": "opening", "nbPolygon": "sides",
    "thickness": "thickness", "worldSizeThickness": "thickness_world",
    "pixelWidth": "pixel_width", "pixelHeight": "pixel_height",
    "image": "image", "pixelSize": "pixel_size", "worldSize": "world_size", "opacity": "opacity",
}


class Frame:
    """EI's map pixels (y down) to game world inches (y up); EI's angles are for the y-down map."""

    def __init__(self, world, pixels):
        self.min_x, _, _, self.max_y = world
        self.scale_x = (world[2] - world[0]) / pixels[0]
        self.scale_y = (world[3] - world[1]) / pixels[1]

    def point(self, px, py):
        return [round(self.min_x + px * self.scale_x, 1), round(self.max_y - py * self.scale_y, 1)]

    @staticmethod
    def angle(ei_angle):
        return round(-float(ei_angle), 1)

    @staticmethod
    def vector(dx, dy):
        """An offset in inches along EI's map axes, along the world's."""
        return [round(float(dx), 1), round(-float(dy), 1)]


class _Skip(Exception):
    """The decoration can not be shown."""


def _clamp(time, duration):
    return min(max(int(time), 0), duration)


def _actor(ids, unique_id):
    index = ids.get(unique_id)
    if index is None:
        raise _Skip()
    return index


def _position(connector, frame, ids, duration):
    if not connector or connector.get("isScreenSpace"):
        raise _Skip()
    if "velocity" in connector:
        x, y, time = connector["position"]
        result = {"actor": _actor(ids, connector["masterID"]), "origin": [_clamp(time, duration)] + frame.point(x, y),
                  "speed": round(float(connector["velocity"]), 4)}
    elif "masterID" in connector:
        result = {"actor": _actor(ids, connector["masterID"])}
    elif "positions" in connector:
        values = connector["positions"]
        result = {"path": [[_clamp(values[i + 2], duration)] + frame.point(values[i], values[i + 1])
                           for i in range(0, len(values) - 2, 3)]}
        if not result["path"]:
            raise _Skip()
        if connector.get("interpolationMethod") == STEP:
            result["step"] = True
    elif "position" in connector:
        result = {"pos": frame.point(*connector["position"][:2])}
    else:
        raise _Skip()
    if connector.get("offset"):
        result["offset"] = frame.vector(*connector["offset"][:2])
        if connector.get("offsetAfterRotation"):
            result["offset_turns"] = True
    return result


def _rotation(connector, frame, ids, duration):
    if not connector:
        return None
    if "dstMasterID" in connector:
        return {"actor": _actor(ids, connector["masterID"]), "towards": _actor(ids, connector["dstMasterID"])}
    if "masterID" in connector:
        result = {"actor": _actor(ids, connector["masterID"])}
        offset = connector.get("rotationOffset") or 0
        if offset:
            result["offset"] = frame.angle(offset)
            result["mode"] = ROTATION_MODES.get(connector.get("rotationOffsetMode"), "add")
        return result
    if "angles" in connector:
        values = connector["angles"]
        result = {"path": [[_clamp(values[i + 1], duration), frame.angle(values[i])]
                           for i in range(0, len(values) - 1, 2)]}
        if connector.get("interpolationMethod") == STEP:
            result["step"] = True
        return result
    if "angle" in connector:
        result = {"angle": frame.angle(connector["angle"])}
        if connector.get("spinAngle"):
            result["spin"] = frame.angle(connector["spinAngle"])
        return result
    raise _Skip()


def _style(metadata):
    return {STYLE_FIELDS[key]: value for key, value in metadata.items()
            if key in STYLE_FIELDS and value is not None and value is not False}


def _linear_at(points, time):
    """The value of sorted, linear [time, value] points at time; held before the first and after the last."""
    if time <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if time <= t1:
            return v0 if t1 == t0 else v0 + (v1 - v0) * (time - t0) / (t1 - t0)
    return points[-1][1]


def _series(points, duration, digits, step):
    """[[time, value], ...] of [time, value] pairs within the log, rounded, without points that change nothing.

    A step series (each value holds until the next) keeps the value it has at the log's start, and needs no repeats
    of a value. A linear one gets its values at the log's start and end, and only needs the two ends of a stretch
    where it stays the same.
    """
    points = sorted(([float(time), float(value)] for time, value in points), key=lambda point: point[0])
    if not points:
        return []
    if step:
        clipped = [[_clamp(time, duration), value] for time, value in points if time <= duration] or [points[0]]
    else:
        clipped = ([[0, _linear_at(points, 0)]] + [point for point in points if 0 < point[0] < duration]
                   + [[duration, _linear_at(points, duration)]])
    result = []
    for time, value in clipped:
        point = [_clamp(time, duration), round(value, digits)]
        if result and result[-1][0] == point[0]:
            if result[-1][1] == point[1]:
                continue
            if step or (len(result) > 1 and result[-2][0] == point[0]):
                # the later of two values at the same time is the one that holds; a linear series keeps the value it
                # had until then too (EI's keyframes for an instant change), but needs no third
                result.pop()
            else:
                result.append(point)
                continue
        if result and result[-1][1] == point[1]:
            if step:
                continue
            if len(result) > 1 and result[-2][1] == point[1]:
                result[-1] = point
                continue
        result.append(point)
    return result


def _platform(item, frame, ids, duration, style, start, end):
    """A platform: a part of the arena, drawn under everything else (see the module's docstring)."""
    result = {"shape": "platform", "style": style, "start": start, "end": end}
    if item.get("type") == MOVING_PLATFORM:
        # keyframes [x, y, z, angle in radians, opacity, time], linear in between; nothing before the first
        keyframes = sorted(item.get("positions") or [], key=lambda keyframe: keyframe[5])
        if not keyframes:
            raise _Skip()
        result["start"] = max(start, _clamp(keyframes[0][5], duration))
        result["at"] = {"path": [[_clamp(k[5], duration)] + frame.point(k[0], k[1]) for k in keyframes]}
        result["rotation"] = {"path": [[_clamp(k[5], duration), frame.angle(math.degrees(k[3]))] for k in keyframes],
                              "unwrapped": True}
        result["opacity"] = _series(([k[5], k[4]] for k in keyframes), duration, 2, False)
        result["height"] = _series(([k[5], k[2]] for k in keyframes), duration, 0, True)
    else:
        # an image on an actor; its opacity holds, then fades into the next value over the FADE_MS before it
        result["at"] = _position(item.get("connectedTo"), frame, ids, duration)
        rotation = _rotation(item.get("rotationConnectedTo"), frame, ids, duration)
        if rotation:
            result["rotation"] = rotation
        values = item.get("opacities") or [1, item["start"]]
        opacity = [[values[1], values[0]]]
        for i in range(2, len(values) - 1, 2):
            previous_time, previous = opacity[-1]
            # EI goes through them in its order: a time earlier than the one before it takes effect at that one
            # (Sabir's platforms list one), at once
            time = max(values[i + 1], previous_time)
            if values[i] != previous:
                opacity.append([max(previous_time, time - FADE_MS), previous])
                opacity.append([time, values[i]])
        result["opacity"] = _series(opacity, duration, 2, False)
        heights = item.get("heights") or []
        result["height"] = _series(([heights[i + 1], heights[i]] for i in range(0, len(heights) - 1, 2)),
                                   duration, 0, True)
    if result["start"] >= end:
        raise _Skip()
    return result


def _decoration(item, frame, ids, duration, style_index):
    shape = SHAPES.get(item.get("type"))
    if shape is None:
        raise _Skip()
    style = style_index.get(item.get("metadataSignature"))
    if style is None:
        raise _Skip()
    start, end = _clamp(item["start"], duration), _clamp(item["end"], duration)
    if end <= start:
        raise _Skip()
    if shape == "platform":
        return _platform(item, frame, ids, duration, style, start, end)
    result = {"shape": shape, "style": style, "start": start, "end": end,
              "at": _position(item.get("connectedTo"), frame, ids, duration)}
    if item.get("type") in SQUAD_MARKERS:
        result["marker"] = True
    skill = item.get("skillMode")
    if skill:
        # a drawing of a player's skill (or a minion's): its owner, EI's categories, and the skill
        result["skill"] = {"owner": _actor(ids, skill.get("ownerID")), "category": int(skill.get("category") or 0),
                           "id": int(skill["skillID"])}
    rotation = _rotation(item.get("rotationConnectedTo"), frame, ids, duration)
    if rotation:
        result["rotation"] = rotation
    if shape == "line":
        result["from"] = _position(item.get("connectedFrom"), frame, ids, duration)
    if item.get("fill"):
        result["fill"] = True
    if item.get("growingEnd"):
        result["grow_end"] = _clamp(item["growingEnd"], duration)
        if item.get("growingReverse"):
            result["grow_reverse"] = True
    if item.get("points"):
        result["points"] = [frame.vector(x, y) for x, y in item["points"]]
    if item.get("progress"):
        result["progress"] = [[_clamp(time, duration), round(float(percent), 1)] for time, percent in item["progress"]]
        if item.get("interpolationMethod") == STEP:
            result["progress_step"] = True
    if item.get("text"):
        result["text"] = item["text"]
    return result


def convert(meta, frame, ids, duration, hidden_texts=(), arena_actors=()):
    """Returns (decorations, styles) of EI's ``combatReplayMetaData``.

    ``ids`` maps EI's actor unique IDs to indices into the replay's actors, anchors included. Decorations whose
    text is one of ``hidden_texts`` are left out. Decorations on one of ``arena_actors`` (indices of actors that
    are a part of the arena, see ARENA_SPECIES) are flagged "arena".
    """
    metadata = meta.get("decorationMetadata") or []
    styles = [_style(entry) for entry in metadata]
    style_index = {entry.get("signature"): index for index, entry in enumerate(metadata)}
    decorations = []
    for item in meta.get("decorations") or []:
        if item.get("text") in hidden_texts:
            continue
        try:
            decoration = _decoration(item, frame, ids, duration, style_index)
        except (_Skip, KeyError, TypeError, ValueError, IndexError):
            continue  # one decoration EI wrote differently than expected is left out, not the others
        if decoration["shape"] != "platform" and decoration["at"].get("actor") in arena_actors:
            decoration["arena"] = True
        decorations.append(decoration)
    decorations.sort(key=lambda decoration: decoration["start"])
    return _drop_unused_styles(decorations, styles)


def _drop_unused_styles(decorations, styles):
    """Keeps the styles of the decorations kept (the skills' and the left-out ones' are not), renumbered."""
    used = sorted(set(decoration["style"] for decoration in decorations))
    remap = {old: new for new, old in enumerate(used)}
    for decoration in decorations:
        decoration["style"] = remap[decoration["style"]]
    return decorations, [styles[old] for old in used]


def anchor_actors(meta, listed_ids):
    """EI's ``combatReplayMetaData.actors`` that are not already players or targets of the replay."""
    return [actor for actor in meta.get("actors") or []
            if actor.get("uniqueID") not in listed_ids and (actor.get("combatReplayData") or {}).get("positions")]
