// Types for the replay data (replay/<url_id>.json, made by eiparser/replay.py: its docstring describes the format)
// and for the state of players and targets the panel next to the map shows.

export interface ReplayBuffInfo {
  name: string;
  icon: string;
  category?: string;
}

// [start, end] times, in ms from the start of the log
export type Interval = [number, number];
// [time, value] changes; each value holds until the next
export type Series = [number, number][];

// "main": the boss; "blocking": must be dealt with to progress; "nonblocking": relevant, but can be ignored
export type TargetPriority = 'main' | 'blocking' | 'nonblocking';

export interface ReplayActor {
  // anchors: actors that decorations are attached to, neither players nor targets; only their movement is given.
  // minions: players' minions (clones, phantasms, spirits, pets), the same as anchors with their player as master
  kind: 'player' | 'target' | 'anchor' | 'minion';
  // minions: the index of their player
  master?: number;
  name?: string | null;
  private?: boolean;
  party?: number;
  profession?: number;
  elite?: number;
  // targets: EI's priority for the whole fight; main and blocking targets are the fight's bosses, and a target
  // without one is an add
  priority?: TargetPriority;
  // targets of replays made before "priority" (version 2 and earlier): one of the fight's main or blocking targets.
  // Replays older still have neither, and the boss is guessed
  boss?: boolean;
  // targets, anchors and minions: the game's species ID
  species?: number;
  // when the actor is present
  start: number;
  end: number;
  // time of the first sample of x, y and facing
  sample_start: number;
  // game world position in inches, one sample every sample_interval
  x: number[];
  y: number[];
  // degrees counter-clockwise from +x (world, y up), one per sample, or empty
  facing?: number[];
  down?: Interval[];
  dead?: Interval[];
  dc?: Interval[];
  commander?: Interval[];
  health?: Series;
  barrier?: Series;
  buffs?: Record<string, Series>;
  conditions?: Record<string, Series>;
  breakbar?: Series;
  breakbar_active?: Interval[];
  // players: running damage totals at each second, to everything and to the fight's targets
  damage?: number[];
  boss_damage?: number[];
}

export interface ReplayPhase {
  name: string;
  start: number;
  end: number;
  parent?: string | null;
}

export interface ReplayMap {
  // the boss's map, shown where "arena" says nothing
  image: string | null;
  world: [number, number, number, number];
  size?: [number, number];
  // the map over time, where EI's changes during the fight or is blank (null: no image; the arena is drawn from
  // its platforms); the site's own images where it has them, else EI's
  arena?: { start: number; end: number; image: string | null }[];
}

// ---- mechanic drawings (eiparser/decorations.py describes them). Positions and sizes are game world inches,
// angles are degrees counter-clockwise from +x (world, y up), like the actors' facing.

// where a decoration is: on an actor, at a point, along a path, or homing in on an actor from a point
export type DecorationPlace = (
  | { actor: number }
  | { pos: [number, number] }
  | { path: [number, number, number][]; step?: boolean }
  | { actor: number; origin: [number, number, number]; speed: number }
) & {
  // moved by this much, before the rotation or, with offset_turns, after it (turning with the decoration)
  offset?: [number, number];
  offset_turns?: boolean;
};

export type DecorationRotation =
  | { angle: number; spin?: number }
  // by the shortest turn between points, or with unwrapped, as the angles are (more than half a turn is kept)
  | { path: [number, number][]; step?: boolean; unwrapped?: boolean }
  | { actor: number; offset?: number; mode?: 'add' | 'absolute' | 'after_offset' }
  | { actor: number; towards: number };

export type DecorationShape =
  | 'circle' | 'doughnut' | 'pie' | 'rectangle' | 'line' | 'polygon' | 'custom_polygon'
  | 'progress_bar' | 'overhead_progress_bar' | 'icon' | 'overhead_icon' | 'text' | 'overhead_text'
  // a part of the arena that moves or comes and goes (Qadim's, Sabir's): drawn with the map, not a mechanic
  | 'platform';

export interface ReplayDecoration {
  shape: DecorationShape;
  // index into decoration_styles
  style: number;
  start: number;
  end: number;
  // shapes: filled rather than outlined
  fill?: boolean;
  // shapes: grow from start until grow_end, or shrink with grow_reverse
  grow_end?: number;
  grow_reverse?: boolean;
  at: DecorationPlace;
  // lines: the other end
  from?: DecorationPlace;
  rotation?: DecorationRotation;
  // custom polygons: relative to the position
  points?: [number, number][];
  // progress bars: [time, percent]
  progress?: [number, number][];
  progress_step?: boolean;
  text?: string;
  // squad markers (icons the squad places on the ground or over an actor), shown on their own
  marker?: boolean;
  // on an actor that is a part of the arena (Adina's platforms): the arena, drawn with the map, not a mechanic
  arena?: boolean;
  // a player's skill: its owner (a player, or a minion), EI's categories (SKILL_CATEGORY in decorations.ts) and the
  // skill's ID
  skill?: { owner: number; category: number; id: number };
  // platforms: [time, opacity 0 to 1], linear between points
  opacity?: [number, number][];
  // platforms: [time, height], each held until the next; the highest value is drawn first (EI's z points down)
  height?: [number, number][];
}

export interface ReplayDecorationStyle {
  colour?: string;
  secondary_colour?: string;
  background?: string;
  radius?: number;
  min_radius?: number;
  inner_radius?: number;
  outer_radius?: number;
  width?: number;
  height?: number;
  // pies: degrees
  opening?: number;
  // regular polygons: sides
  sides?: number;
  // lines: screen pixels, or inches with thickness_world
  thickness?: number;
  thickness_world?: boolean;
  // overhead progress bars and icons: screen pixels
  pixel_width?: number;
  pixel_height?: number;
  pixel_size?: number;
  world_size?: number;
  image?: string;
  opacity?: number;
}

export interface ReplayData {
  duration: number;
  sample_interval: number;
  map?: ReplayMap | null;
  actors: ReplayActor[];
  phases: ReplayPhase[];
  buffs?: Record<string, ReplayBuffInfo>;
  // replays made before mechanic drawings, and of logs without them, have none
  decorations?: ReplayDecoration[];
  decoration_styles?: ReplayDecorationStyle[];
}

// ---- the panel's view of players and targets at one time

export type ActorState = 'alive' | 'down' | 'dead' | 'dc';

export interface ViewBuff {
  code: string;
  stacks: number;
  name: string;
  icon: string;
}

export interface ViewPlayer {
  index: number;
  name?: string | null;
  private: boolean;
  commander: boolean;
  spec?: string;
  state: ActorState;
  health: number;
  barrier: number;
  bar: { health: number; barrier: number };
  buffs: ViewBuff[];
  conditions: ViewBuff[];
  dps: { boss: number; total: number; bossWidth: number; totalWidth: number; text: string };
  selected: boolean;
}

export interface ViewTarget {
  index: number;
  name?: string | null;
  boss: boolean;
  state: ActorState;
  health: number;
  breakbar: number | null;
  buffs: ViewBuff[];
  conditions: ViewBuff[];
  selected: boolean;
}

export interface ViewParty {
  party: number;
  colour: string;
  players: ViewPlayer[];
}

export interface ReplayView {
  time: number;
  parties: ViewParty[];
  bosses: ViewTarget[];
  adds: ViewTarget[];
}
