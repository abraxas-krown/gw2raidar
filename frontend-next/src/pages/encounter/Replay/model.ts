// The replay's data model: where the actors are and what state they are in at a time, and the panel's view of
// them. Pure functions, no DOM: the canvas, controls and panel all read from here.
import type {
  ActorState,
  Interval,
  ReplayActor,
  ReplayBuffInfo,
  ReplayData,
  ReplayView,
  Series,
  TargetPriority,
  ViewBuff,
  ViewParty,
  ViewTarget,
} from './types';

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
export const DEFAULT_SPEED_INDEX = SPEEDS.indexOf(1);
// back and forward skip 5 seconds of watching: more of the fight when it plays faster
export const SKIP_MS = 5000;
export const MAX_ZOOM = 16;
export const MIN_MAP_HEIGHT = 320;
// space left above the top element and below the timeline when the view fills the window
export const WINDOW_MARGIN_TOP = 8;
export const WINDOW_MARGIN_BOTTOM = 16;
// how often the panel is updated while playing
export const VIEW_INTERVAL_MS = 125;
// the selected player's trail
export const TRAIL_MS = 6000;
// EI starts a commander tag when the player is first seen or the tag is first reported, a moment into the log; a
// tag that starts this early was held from the start
const COMMANDER_FROM_START_MS = 5000;
// one per party; chosen to read on the site's dark purple background
const PARTY_COLOURS = ['#E7CCA9', '#6FB7E0', '#7FCB8A', '#C98BDB', '#E58A6E',
  '#5DC6BE', '#D9C35C', '#9AA4F0', '#E07AA5', '#A0C76A'];
// the canvas's colours; Replay.module.css has its own copies of some, keep the two in step
export const COLOURS = {
  background: '#15141e',
  text: '#FCF1E2',
  muted: '#958cbb',
  down: '#CF890F',
  dead: '#BF3F47',
  target: '#BF3F47',
  breakbar: '#58C4D8',
  targetEdge: '#461530',
  selected: '#FCF1E2',
};

export const partyColour = (party: number | undefined) =>
  PARTY_COLOURS[((party || 1) - 1) % PARTY_COLOURS.length];

// a #RRGGBB colour with black mixed in: 0 keeps it, 1 is black
export function darken(colour: string, amount: number) {
  const value = parseInt(colour.slice(1, 7), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// index of the last [time, value] at or before time, or -1
function lastAt(points: Series, time: number) {
  let low = 0, high = points.length - 1, found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (points[middle][0] <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function valueAt(points: Series | undefined, time: number, fallback: number) {
  if (!points || !points.length) return fallback;
  const index = lastAt(points, time);
  return index < 0 ? fallback : points[index][1];
}

export function within(intervals: Interval[] | undefined, time: number) {
  return !!intervals && intervals.some(([start, end]) => start <= time && time < end);
}

function lerpAngle(a: number, b: number, f: number) {
  const delta = ((b - a + 540) % 360) - 180;
  return a + delta * f;
}

// thousands with at most one decimal: 1000 is "1 K", 28423 is "28.4 K"
export const kilo = (value: number) => `${Math.round(value / 100) / 10} K`;

// a running total of one value per second (damage, boss_damage) at time, in between the seconds
function totalAt(series: number[] | undefined, time: number) {
  if (!series || !series.length) return 0;
  const at = clamp(time / 1000, 0, series.length - 1);
  const second = Math.floor(at), next = Math.min(second + 1, series.length - 1);
  return series[second] + (series[next] - series[second]) * (at - second);
}

// the widths of the health and barrier sections of a health bar: barrier fills missing health, and when there is
// more of it than that, the bar is rescaled so health and barrier fill it together (as in the game)
function healthBar(health: number, barrier: number) {
  const scale = 100 / Math.max(100, health + barrier);
  return { health: health * scale, barrier: barrier * scale };
}

export function formatTime(ms: number, tenths = false) {
  ms = Math.max(0, ms);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000) % 60;
  let text = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  if (tenths) text += `.${Math.floor(ms / 100) % 10}`;
  return text;
}

export const actorName = (actor: ReplayActor) => actor.name || 'Private player';

// what the map's label shows for an actor: a minion's name, with its player's
export function actorLabel(replay: PreparedReplay, actor: Actor) {
  if (actor.kind !== 'minion') return actorName(actor);
  const master = actor.master === undefined ? undefined : replay.actors[actor.master];
  const name = actor.name || 'Minion';
  return master ? `${name} (${actorName(master)})` : name;
}

// ---- the replay, prepared once

export interface Actor extends ReplayActor {
  index: number;
  // players: their specialisation's name, for their icon
  spec?: string;
}

export interface World {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PreparedReplay {
  data: ReplayData;
  duration: number;
  interval: number;
  world: World;
  actors: Actor[];
  players: Actor[];
  targets: Actor[];
  // the players' minions, when the replay has decorations
  minions: Actor[];
  // replays made before targets had "priority" or "boss": the target with the most health data stands for the boss
  guessedBoss: Actor | null;
}

// the area the actors moved in, for a boss without a map
function boundsOf(actors: ReplayActor[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  actors.forEach(actor => {
    actor.x.forEach(x => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
    actor.y.forEach(y => { minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  });
  const pad = 250;
  return [minX - pad, minY - pad, maxX + pad, maxY + pad];
}

export function prepareReplay(
  data: ReplayData,
  specialisation?: (profession: number | undefined, elite: number | undefined) => string | undefined,
): PreparedReplay {
  const [minX, minY, maxX, maxY] = data.map ? data.map.world : boundsOf(data.actors);
  const world = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  const actors: Actor[] = data.actors.map((source, index) => {
    const actor: Actor = { ...source, index };
    const tag = actor.commander;
    if (tag && tag.length && tag[0][0] > 0 && tag[0][0] <= COMMANDER_FROM_START_MS) {
      actor.commander = [[0, tag[0][1]], ...tag.slice(1)];
    }
    if (actor.kind === 'player' && specialisation) actor.spec = specialisation(actor.profession, actor.elite);
    return actor;
  });
  const players = actors.filter(actor => actor.kind === 'player');
  const targets = actors.filter(actor => actor.kind === 'target');
  const minions = actors.filter(actor => actor.kind === 'minion');
  const guessedBoss = targets.reduce<Actor | null>((best, target) =>
    !best || (target.health || []).length > (best.health || []).length ? target : best, null);
  return {
    data, duration: data.duration, interval: data.sample_interval, world, actors, players, targets, minions, guessedBoss,
  };
}

// one of the fight's bosses (a main or blocking target), not an add: drawn larger and listed first
export const isBoss = (replay: PreparedReplay, target: Actor) =>
  target.priority ? BOSS_PRIORITIES.has(target.priority)
    : 'boss' in target ? !!target.boss
    : target === replay.guessedBoss;

// the target priorities of the fight's bosses (eiparser.replay.BOSS_PRIORITIES)
const BOSS_PRIORITIES = new Set<TargetPriority>(['main', 'blocking']);

// ---- actors at a time

export interface Place {
  x: number;
  y: number;
  facing: number | null;
}

// where an actor is at time, or null when it is not there
export function placeOf(replay: PreparedReplay, actor: Actor, time: number): Place | null {
  if (time < actor.start || time > actor.end || !actor.x.length) return null;
  const at = clamp((time - actor.sample_start) / replay.interval, 0, actor.x.length - 1);
  const index = Math.floor(at), next = Math.min(index + 1, actor.x.length - 1), f = at - index;
  return {
    x: actor.x[index] + (actor.x[next] - actor.x[index]) * f,
    y: actor.y[index] + (actor.y[next] - actor.y[index]) * f,
    facing: actor.facing && actor.facing.length ? lerpAngle(actor.facing[index], actor.facing[next], f) : null,
  };
}

// a target's defiance bar (percent) while it is up, or null
export function breakbarOf(target: Actor, time: number) {
  if (!target.breakbar_active || !within(target.breakbar_active, time) || within(target.dead, time)) return null;
  return valueAt(target.breakbar, time, 100);
}

export function stateOf(actor: Actor, time: number): ActorState {
  if (within(actor.dc, time)) return 'dc';
  if (within(actor.dead, time)) return 'dead';
  if (within(actor.down, time)) return 'down';
  return 'alive';
}

// a player's boss and total DPS from the start of the fight until time; none in the first second
function dpsOf(player: Actor, time: number) {
  if (time < 1000) return { boss: 0, total: 0 };
  return { boss: totalAt(player.boss_damage, time) * 1000 / time, total: totalAt(player.damage, time) * 1000 / time };
}

// ---- the panel's view

export interface BuffLookup {
  info: Record<string, ReplayBuffInfo>;
  // the order buffs and conditions are listed in
  buffRank: Record<string, number>;
  conditionRank: Record<string, number>;
}

export function buffLookup(info: Record<string, ReplayBuffInfo>, buffOrder: string[], conditionOrder: string[]): BuffLookup {
  const ranks = (order: string[]) => Object.fromEntries(order.map((code, index) => [code, index]));
  return { info, buffRank: ranks(buffOrder), conditionRank: ranks(conditionOrder) };
}

// the buffs (or conditions) of series that are on at time, in rank order, then by name; buffs without info are
// not listed
function activeBuffs(series: Record<string, Series> | undefined, time: number, info: Record<string, ReplayBuffInfo>,
                     rank: Record<string, number>) {
  const active: ViewBuff[] = [];
  Object.keys(series || {}).forEach(code => {
    const buff = info[code];
    const stacks = valueAt(series![code], time, 0);
    if (buff && stacks > 0) active.push({ code, stacks, name: buff.name, icon: buff.icon });
  });
  const order = (buff: ViewBuff) => buff.code in rank ? rank[buff.code] : Infinity;
  return active.sort((a, b) => order(a) !== order(b) ? order(a) - order(b) : a.name.localeCompare(b.name));
}

// the state of players (by party) and targets at time: bosses above the players, the other targets below them
export function buildView(replay: PreparedReplay, time: number, selected: number | null, buffs: BuffLookup): ReplayView {
  const parties = new Map<number, ViewParty>();
  // the DPS bars are scaled to the highest total DPS of the squad
  const dps = new Map(replay.players.map(player => [player, dpsOf(player, time)]));
  const maxDps = Math.max(1, ...Array.from(dps.values(), value => value.total));
  replay.players.forEach(player => {
    const state = stateOf(player, time);
    const health = state === 'dead' ? 0 : valueAt(player.health, time, 100);
    const barrier = state === 'dead' ? 0 : valueAt(player.barrier, time, 0);
    const playerDps = dps.get(player)!;
    const party = player.party || 0;
    if (!parties.has(party)) parties.set(party, { party, colour: partyColour(party), players: [] });
    parties.get(party)!.players.push({
      index: player.index,
      name: player.name,
      private: !!player.private,
      // while they have a commander tag
      commander: within(player.commander, time),
      spec: player.spec,
      state,
      health,
      barrier,
      bar: healthBar(health, barrier),
      buffs: activeBuffs(player.buffs, time, buffs.info, buffs.buffRank),
      conditions: activeBuffs(player.conditions, time, buffs.info, buffs.conditionRank),
      dps: {
        boss: playerDps.boss,
        total: playerDps.total,
        bossWidth: 100 * playerDps.boss / maxDps,
        totalWidth: 100 * playerDps.total / maxDps,
        text: `${kilo(playerDps.boss)} / ${kilo(playerDps.total)}`,
      },
      selected: selected === player.index,
    });
  });
  const targets: ViewTarget[] = replay.targets
    .filter(target => time >= target.start && time <= target.end)
    .map(target => {
      const state = stateOf(target, time);
      return {
        index: target.index,
        name: target.name,
        boss: isBoss(replay, target),
        state,
        health: state === 'dead' ? 0 : valueAt(target.health, time, 100),
        breakbar: breakbarOf(target, time),
        buffs: activeBuffs(target.buffs, time, buffs.info, buffs.buffRank),
        conditions: activeBuffs(target.conditions, time, buffs.info, buffs.conditionRank),
        selected: selected === target.index,
      };
    });
  return {
    time,
    parties: [...parties.values()].sort((a, b) => a.party - b.party),
    bosses: targets.filter(target => target.boss),
    adds: targets.filter(target => !target.boss),
  };
}
