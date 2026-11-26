// The mechanic drawings of the replay (data.decorations, made by eiparser/decorations.py from EI's combat replay):
// areas, cones, tethers and markers, as EI's own combat replay draws them.
//
// Where a decoration is and how it is turned are worked out in world terms (inches, y up, degrees
// counter-clockwise), following EI's rules (moveContext in EI's decorations.js). Shapes are then drawn in that
// frame, so their sizes stay in inches as the map is zoomed; icons, overhead bars and texts are drawn upright, in
// screen pixels.
import { type Actor, clamp, placeOf, type PreparedReplay } from './model';
import type {
  DecorationPlace,
  DecorationRotation,
  ReplayDecoration,
  ReplayDecorationStyle,
} from './types';

// decorations drawn over the actors rather than under them
const OVERHEAD = new Set(['overhead_icon', 'overhead_progress_bar', 'overhead_text']);
// the index finds the decorations that are on at a time by the second
const BUCKET_MS = 1000;
// homing decorations are moved this often (EI: half the polling rate)
const HOMING_STEP_MS = 75;
// outlines, in screen pixels
const OUTLINE = 2;

export interface PreparedDecorations {
  decorations: ReplayDecoration[];
  styles: ReplayDecorationStyle[];
  // for each decoration attached to a player's minion (EI's line from a minion to its player, and the like), the
  // minion's player, else null: those are only drawn while the minions are, and only the selected player's
  minionMaster: (number | null)[];
  // for each second of the fight, the decorations that are on during it, in drawing order
  buckets: number[][];
  // the images icons use
  images: string[];
}

// which decorations are drawn: the mechanics, the squad markers, the players' skills, and the ones attached to
// minions
export interface DecorationLayers {
  mechanics: boolean;
  markers: boolean;
  skills: boolean;
  minions: boolean;
}

export type DecorationLayer = keyof DecorationLayers;

// the layer a decoration belongs to; a skill of a minion is a skill, shown whether the minion is or not
export function layerOf(prepared: PreparedDecorations, index: number): DecorationLayer {
  const decoration = prepared.decorations[index];
  if (decoration.marker) return 'markers';
  if (decoration.skill) return 'skills';
  return prepared.minionMaster[index] !== null ? 'minions' : 'mechanics';
}

// A skill drawing is shown only for the selected player: their own skills, and their minions'
function skillShown(replay: PreparedReplay, skill: NonNullable<ReplayDecoration['skill']>, player: number | null) {
  if (player === null) return false;
  return skill.owner === player || replay.actors[skill.owner]?.master === player;
}

// Whether a player's minion is shown (while minions are): all of them, or only the selected player's
export const minionShown = (master: number | undefined, player: number | null) => player === null || master === player;

// a part of the arena (platforms, and what is drawn on the actors that are): drawn with the map, in no layer
const isArena = (decoration: ReplayDecoration) => decoration.shape === 'platform' || !!decoration.arena;

// the layers the replay has something in
export function usedLayers(prepared: PreparedDecorations | null): Set<DecorationLayer> {
  const used = new Set<DecorationLayer>();
  prepared?.decorations.forEach((decoration, index) => {
    if (!isArena(decoration)) used.add(layerOf(prepared, index));
  });
  return used;
}

// the actors a decoration is placed or turned by
function actorsOf(decoration: ReplayDecoration) {
  const found: number[] = [];
  [decoration.at, decoration.from].forEach(place => {
    if (place && 'actor' in place) found.push(place.actor);
  });
  const rotation = decoration.rotation;
  if (rotation && 'actor' in rotation) found.push(rotation.actor);
  if (rotation && 'towards' in rotation) found.push(rotation.towards);
  return found;
}

export function prepareDecorations(replay: PreparedReplay): PreparedDecorations | null {
  const decorations = replay.data.decorations || [];
  const styles = replay.data.decoration_styles || [];
  if (!decorations.length) return null;
  const minionMaster = decorations.map(decoration => {
    const minion = actorsOf(decoration).map(index => replay.actors[index]).find(actor => actor?.kind === 'minion');
    return minion?.master ?? null;
  });
  const buckets: number[][] = Array.from({ length: Math.floor(replay.duration / BUCKET_MS) + 1 }, () => []);
  decorations.forEach((decoration, index) => {
    const last = Math.min(Math.floor(decoration.end / BUCKET_MS), buckets.length - 1);
    for (let bucket = Math.floor(decoration.start / BUCKET_MS); bucket <= last; bucket++) buckets[bucket].push(index);
  });
  const images = [...new Set(styles.map(style => style.image).filter(Boolean) as string[])];
  return { decorations, styles, minionMaster, buckets, images };
}

// the decorations of the shown layers that are on at time, under the actors (overhead: false) or over them
// (overhead: true). Skills and minions depend on the selected player (null: none, or a target is selected)
export function activeDecorations(replay: PreparedReplay, prepared: PreparedDecorations, layers: DecorationLayers,
                                  player: number | null, time: number, overhead: boolean) {
  const bucket = prepared.buckets[clamp(Math.floor(time / BUCKET_MS), 0, prepared.buckets.length - 1)];
  return bucket
    .filter(index => !isArena(prepared.decorations[index]) && layers[layerOf(prepared, index)])
    .filter(index => prepared.decorations[index].skill || prepared.minionMaster[index] === null
      || minionShown(prepared.minionMaster[index]!, player))
    .map(index => prepared.decorations[index])
    .filter(decoration => decoration.start <= time && time <= decoration.end && OVERHEAD.has(decoration.shape) === overhead)
    .filter(decoration => !decoration.skill || skillShown(replay, decoration.skill, player));
}

// the arena's decorations on at time, in drawing order: the platforms first, the highest height first (EI's z
// points down), then the shapes drawn on the arena's actors, in their own order
function activeArena(prepared: PreparedDecorations, time: number) {
  const bucket = prepared.buckets[clamp(Math.floor(time / BUCKET_MS), 0, prepared.buckets.length - 1)];
  const active = bucket
    .map(index => prepared.decorations[index])
    .filter(decoration => isArena(decoration) && decoration.start <= time && time <= decoration.end);
  const platforms = active
    .filter(decoration => decoration.shape === 'platform')
    .map(decoration => ({ decoration, height: heldAt(decoration.height, time) }))
    .sort((a, b) => b.height - a.height)
    .map(item => item.decoration);
  return [...platforms, ...active.filter(decoration => decoration.shape !== 'platform')];
}

// a [time, value] series' value at time, each value held until the next one
function heldAt(points: [number, number][] | undefined, time: number) {
  if (!points || !points.length) return 0;
  let value = points[0][1];
  for (const [at, next] of points) {
    if (at > time) break;
    value = next;
  }
  return value;
}

// ---- where, and how turned

interface Point {
  x: number;
  y: number;
}

const radians = (degrees: number) => degrees * Math.PI / 180;

function lerpAngle(a: number, b: number, f: number) {
  return a + (((b - a + 540) % 360) - 180) * f;
}

// [time, ...values] points: the values at time, linear between points unless step; held before and after
function along<T extends number[]>(points: T[], time: number, step: boolean | undefined,
                                   lerp: (a: number, b: number, f: number) => number = (a, b, f) => a + (b - a) * f) {
  if (time <= points[0][0]) return points[0].slice(1);
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i][0] <= time) {
      const next = points[i + 1];
      if (!next || step) return points[i].slice(1);
      const f = (time - points[i][0]) / (next[0] - points[i][0]);
      return points[i].slice(1).map((value, k) => lerp(value, next[k + 1], f));
    }
  }
  return points[points.length - 1].slice(1);
}

// homing decorations: the path from their origin towards their actor, worked out once
const homingPaths = new WeakMap<object, [number, number, number][]>();

function homingPath(replay: PreparedReplay, place: { actor: number; origin: [number, number, number]; speed: number },
                    end: number) {
  let path = homingPaths.get(place);
  if (!path) {
    const [start, x0, y0] = place.origin;
    let x = x0, y = y0;
    path = [[start, x, y]];
    const actor = replay.actors[place.actor];
    for (let time = start + HOMING_STEP_MS; time <= end + HOMING_STEP_MS; time += HOMING_STEP_MS) {
      const target = placeOf(replay, actor, time);
      if (target) {
        const dx = target.x - x, dy = target.y - y;
        const distance = Math.hypot(dx, dy);
        // no further than the actor
        const move = Math.min(distance, place.speed * HOMING_STEP_MS);
        if (distance > 0) {
          x += dx / distance * move;
          y += dy / distance * move;
        }
      }
      path.push([time, x, y]);
    }
    homingPaths.set(place, path);
  }
  return path;
}

// where a decoration's position is at time, before its offset, or null when its actor is not there
function positionOf(replay: PreparedReplay, place: DecorationPlace, time: number, end: number): Point | null {
  if ('origin' in place) {
    if (time < place.origin[0]) return { x: place.origin[1], y: place.origin[2] };
    const [x, y] = along(homingPath(replay, place, end), time, false);
    return { x, y };
  }
  if ('actor' in place) {
    const found = placeOf(replay, replay.actors[place.actor], time);
    return found ? { x: found.x, y: found.y } : null;
  }
  if ('path' in place) {
    const [x, y] = along(place.path, time, place.step);
    return { x, y };
  }
  return { x: place.pos[0], y: place.pos[1] };
}

interface Turn {
  // the angle the decoration is turned by
  angle: number;
  // an actor-facing rotation's offset, and how it applies
  offset: number;
  mode: 'add' | 'absolute' | 'after_offset' | null;
}

function turnOf(replay: PreparedReplay, rotation: DecorationRotation | undefined, decoration: ReplayDecoration,
                time: number): Turn | null {
  const plain = (angle: number): Turn => ({ angle, offset: 0, mode: null });
  if (!rotation) return plain(0);
  if ('towards' in rotation) {
    const from = placeOf(replay, replay.actors[rotation.actor], time);
    const to = placeOf(replay, replay.actors[rotation.towards], time);
    if (!from || !to) return null;
    return plain(Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI);
  }
  if ('actor' in rotation) {
    const place = placeOf(replay, replay.actors[rotation.actor], time);
    if (!place) return null;
    return { angle: place.facing ?? 0, offset: rotation.offset || 0, mode: rotation.offset ? rotation.mode || 'add' : null };
  }
  if ('path' in rotation) {
    return plain(along(rotation.path, time, rotation.step, rotation.unwrapped ? undefined : lerpAngle)[0]);
  }
  const lifespan = Math.max(decoration.end - decoration.start, 1);
  return plain(rotation.angle + (rotation.spin || 0) * clamp((time - decoration.start) / lifespan, 0, 1));
}

export interface Frame {
  // the decoration's origin and the angle it is turned by, in world terms
  x: number;
  y: number;
  angle: number;
}

// the origin and angle a decoration is drawn with at time (EI's moveContext), or null when it can not be placed
export function frameOf(replay: PreparedReplay, decoration: ReplayDecoration, time: number,
                        place: DecorationPlace = decoration.at, rotation = decoration.rotation): Frame | null {
  const position = positionOf(replay, place, time, decoration.end);
  const turn = turnOf(replay, rotation, decoration, time);
  if (!position || !turn) return null;
  let { x, y } = position;
  let angle = turn.angle;
  const [dx, dy] = place.offset || [0, 0];
  if (!place.offset_turns) {
    x += dx;
    y += dy;
  }
  if (turn.mode === 'add') angle += turn.offset;
  if (place.offset_turns) {
    const cos = Math.cos(radians(angle)), sin = Math.sin(radians(angle));
    x += dx * cos - dy * sin;
    y += dx * sin + dy * cos;
  }
  if (turn.mode === 'after_offset') angle += turn.offset;
  if (turn.mode === 'absolute') angle = turn.offset;
  return { x, y, angle };
}

// how far a growing shape has grown: 0 to 1
export function growthOf(decoration: ReplayDecoration, time: number) {
  const end = decoration.grow_end;
  if (end === undefined || end <= decoration.start) return 1;
  const grown = clamp((time - decoration.start) / (end - decoration.start), 0, 1);
  return decoration.grow_reverse ? 1 - grown : grown;
}

// a progress bar's value at time, 0 to 100
export function progressOf(decoration: ReplayDecoration, time: number) {
  const points = decoration.progress;
  if (!points || !points.length) return 100;
  return clamp(along(points, time, decoration.progress_step)[0], 0, 100);
}

// ---- drawing

export interface DecorationScene {
  context: CanvasRenderingContext2D;
  // screen pixels per inch
  scale: number;
  toScreen: (x: number, y: number) => { x: number; y: number };
  // how far above an actor's centre overhead decorations start, in screen pixels
  actorTop: (actor: Actor) => number;
  images: Record<string, HTMLImageElement>;
}

// The arena's decorations on at time (drawn with the map, before everything else, whatever is toggled): the
// platforms' images, sized in inches and turned with them, at their opacity, and the shapes on the arena's actors
export function drawArena(scene: DecorationScene, replay: PreparedReplay, prepared: PreparedDecorations,
                          time: number) {
  const context = scene.context;
  activeArena(prepared, time).forEach(decoration => {
    const style = prepared.styles[decoration.style] || {};
    if (decoration.shape !== 'platform') {
      context.save();
      try {
        drawDecoration(scene, replay, decoration, style, time);
      } finally {
        context.restore();
      }
      return;
    }
    const image = style.image ? scene.images[style.image] : undefined;
    const frame = image && frameOf(replay, decoration, time);
    if (!image || !frame) return;
    // a moving platform has its own width and height; an image on an actor is world_size high, and as wide as
    // the image's shape makes it (EI's IconMechanicDrawable)
    const height = style.height || style.world_size || 0;
    const width = style.width || (image.height ? height * image.width / image.height : 0);
    const opacity = decoration.opacity?.length ? clamp(along(decoration.opacity, time, false)[0], 0, 1) : 1;
    if (!width || !height || opacity <= 0) return;
    const screen = scene.toScreen(frame.x, frame.y);
    context.save();
    try {
      context.globalAlpha = opacity;
      context.translate(screen.x, screen.y);
      // world inches with y up, turned, then y down again so the image is drawn the right way round
      context.scale(scene.scale, -scene.scale);
      context.rotate(radians(frame.angle));
      context.scale(1, -1);
      context.drawImage(image, -width / 2, -height / 2, width, height);
    } finally {
      context.restore();
    }
  });
}

export function drawDecorations(scene: DecorationScene, replay: PreparedReplay, prepared: PreparedDecorations,
                                layers: DecorationLayers, player: number | null, time: number, overhead: boolean) {
  activeDecorations(replay, prepared, layers, player, time, overhead).forEach(decoration => {
    const style = prepared.styles[decoration.style] || {};
    const context = scene.context;
    context.save();
    try {
      drawDecoration(scene, replay, decoration, style, time);
    } finally {
      context.restore();
    }
  });
}

function drawDecoration(scene: DecorationScene, replay: PreparedReplay, decoration: ReplayDecoration,
                        style: ReplayDecorationStyle, time: number) {
  switch (decoration.shape) {
    case 'line':
      return drawLine(scene, replay, decoration, style, time);
    case 'icon':
    case 'overhead_icon':
      return drawIcon(scene, replay, decoration, style, time);
    case 'overhead_progress_bar':
      return drawOverheadBar(scene, replay, decoration, style, time);
    case 'text':
    case 'overhead_text':
      return drawText(scene, replay, decoration, style, time);
  }
  const frame = frameOf(replay, decoration, time);
  if (!frame) return;
  const context = scene.context;
  const screen = scene.toScreen(frame.x, frame.y);
  // world inches with y up, turned by the decoration's angle
  context.translate(screen.x, screen.y);
  context.scale(scene.scale, -scene.scale);
  context.rotate(radians(frame.angle));
  const grown = growthOf(decoration, time);
  context.beginPath();
  switch (decoration.shape) {
    case 'circle': {
      const min = style.min_radius || 0;
      context.arc(0, 0, Math.max(0, min + grown * ((style.radius || 0) - min)), 0, 2 * Math.PI);
      break;
    }
    case 'doughnut': {
      const inner = style.inner_radius || 0, outer = style.outer_radius || 0;
      const moving = inner + grown * (outer - inner);
      // EI: a growing doughnut's outer edge moves out; a shrinking one's inner edge moves in
      const [from, to] = decoration.grow_reverse ? [moving, outer] : [inner, moving];
      context.arc(0, 0, Math.max(0, to), 0, 2 * Math.PI, false);
      context.moveTo(Math.max(0, from), 0);
      context.arc(0, 0, Math.max(0, from), 0, 2 * Math.PI, true);
      break;
    }
    case 'pie': {
      const half = radians((style.opening || 0) / 2);
      context.moveTo(0, 0);
      context.arc(0, 0, grown * (style.radius || 0), -half, half, false);
      context.closePath();
      break;
    }
    case 'rectangle': {
      const width = grown * (style.width || 0), height = grown * (style.height || 0);
      context.rect(-width / 2, -height / 2, width, height);
      break;
    }
    case 'progress_bar': {
      // a bar on the ground: kept upright, filled by its progress
      context.rotate(-radians(frame.angle));
      const width = style.width || 0, height = style.height || 0;
      const done = progressOf(decoration, time) / 100;
      context.fillStyle = style.secondary_colour || 'rgba(0, 0, 0, 0.4)';
      context.fillRect(-width / 2, -height / 2, width, height);
      context.fillStyle = style.colour || 'white';
      context.fillRect(-width / 2, -height / 2, width * done, height);
      return;
    }
    case 'polygon': {
      const sides = Math.max(3, style.sides || 3), r = grown * (style.radius || 0);
      for (let i = 0; i <= sides; i++) {
        const a = i * 2 * Math.PI / sides;
        if (i === 0) context.moveTo(r * Math.cos(a), r * Math.sin(a));
        else context.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
      context.closePath();
      break;
    }
    case 'custom_polygon': {
      (decoration.points || []).forEach(([x, y], i) => {
        if (i === 0) context.moveTo(grown * x, grown * y);
        else context.lineTo(grown * x, grown * y);
      });
      context.closePath();
      break;
    }
    default:
      return;
  }
  paint(scene, decoration, style);
}

// fill or outline the current path, which is in world inches
function paint(scene: DecorationScene, decoration: ReplayDecoration, style: ReplayDecorationStyle) {
  const context = scene.context;
  const colour = style.colour || 'rgba(255, 255, 255, 0.3)';
  if (decoration.fill) {
    context.fillStyle = colour;
    context.fill('evenodd');
  } else {
    context.lineWidth = OUTLINE / scene.scale;
    context.strokeStyle = colour;
    context.stroke();
  }
}

// lines join their two ends, and grow from "at" towards "from"
function drawLine(scene: DecorationScene, replay: PreparedReplay, decoration: ReplayDecoration,
                  style: ReplayDecorationStyle, time: number) {
  if (!decoration.from) return;
  const a = frameOf(replay, decoration, time, decoration.at, undefined);
  const b = frameOf(replay, decoration, time, decoration.from, undefined);
  if (!a || !b) return;
  const grown = growthOf(decoration, time);
  const [start, end] = decoration.grow_reverse ? [b, a] : [a, b];
  const from = scene.toScreen(start.x, start.y);
  const to = scene.toScreen(start.x + (end.x - start.x) * grown, start.y + (end.y - start.y) * grown);
  const context = scene.context;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  const thickness = style.thickness || 2;
  context.lineWidth = style.thickness_world ? thickness * scene.scale : thickness;
  context.strokeStyle = style.colour || 'rgba(255, 255, 255, 0.5)';
  context.stroke();
}

// the screen point an overhead decoration is drawn above, and how far above its actor's centre it starts
function overheadAnchor(scene: DecorationScene, replay: PreparedReplay, decoration: ReplayDecoration, time: number) {
  const frame = frameOf(replay, decoration, time);
  if (!frame) return null;
  const screen = scene.toScreen(frame.x, frame.y);
  const at = decoration.at;
  const actor = 'actor' in at ? replay.actors[at.actor] : null;
  return { x: screen.x, y: screen.y, lift: actor ? scene.actorTop(actor) : 0 };
}

function drawIcon(scene: DecorationScene, replay: PreparedReplay, decoration: ReplayDecoration,
                  style: ReplayDecorationStyle, time: number) {
  const image = style.image ? scene.images[style.image] : undefined;
  const overhead = decoration.shape === 'overhead_icon';
  const anchor = overhead ? overheadAnchor(scene, replay, decoration, time) : null;
  const frame = overhead ? null : frameOf(replay, decoration, time);
  const centre = anchor || (frame && scene.toScreen(frame.x, frame.y));
  if (!centre) return;
  const size = style.pixel_size || (style.world_size || 0) * scene.scale || 24;
  const y = anchor ? anchor.y - anchor.lift - size / 2 - 2 : centre.y;
  const context = scene.context;
  context.globalAlpha = style.opacity ?? 1;
  if (image && image.width) {
    const width = size * image.width / image.height;
    context.drawImage(image, centre.x - width / 2, y - size / 2, width, size);
  }
  if (decoration.text) {
    context.globalAlpha = 1;
    context.font = `bold ${Math.round(size / 1.5)}px "Source Sans Pro", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    context.strokeText(decoration.text, centre.x, y);
    context.fillStyle = 'white';
    context.fillText(decoration.text, centre.x, y);
  }
}

function drawOverheadBar(scene: DecorationScene, replay: PreparedReplay, decoration: ReplayDecoration,
                         style: ReplayDecorationStyle, time: number) {
  const anchor = overheadAnchor(scene, replay, decoration, time);
  if (!anchor) return;
  const width = style.pixel_width || 35, height = style.pixel_height || 6;
  const x = anchor.x - width / 2, y = anchor.y - anchor.lift - height - 3;
  const done = progressOf(decoration, time) / 100;
  const context = scene.context;
  context.fillStyle = style.secondary_colour || 'rgba(0, 0, 0, 0.6)';
  context.fillRect(x, y, width, height);
  context.fillStyle = style.colour || 'white';
  context.fillRect(x, y, width * done, height);
  context.lineWidth = 1;
  context.strokeStyle = style.colour || 'white';
  context.strokeRect(x, y, width, height);
}

function drawText(scene: DecorationScene, replay: PreparedReplay, decoration: ReplayDecoration,
                  style: ReplayDecorationStyle, time: number) {
  if (!decoration.text) return;
  const overhead = decoration.shape === 'overhead_text';
  const anchor = overhead ? overheadAnchor(scene, replay, decoration, time) : null;
  const frame = overhead ? null : frameOf(replay, decoration, time);
  const centre = anchor || (frame && scene.toScreen(frame.x, frame.y));
  if (!centre) return;
  const context = scene.context;
  context.font = '600 13px "Source Sans Pro", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const y = anchor ? anchor.y - anchor.lift - 10 : centre.y;
  if (style.background) {
    const width = context.measureText(decoration.text).width + 8;
    context.fillStyle = style.background;
    context.fillRect(centre.x - width / 2, y - 9, width, 18);
  }
  context.fillStyle = style.colour || 'white';
  context.fillText(decoration.text, centre.x, y);
}
