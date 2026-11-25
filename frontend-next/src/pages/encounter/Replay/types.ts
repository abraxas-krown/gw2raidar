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

export interface ReplayActor {
  kind: 'player' | 'target';
  name?: string | null;
  private?: boolean;
  party?: number;
  profession?: number;
  elite?: number;
  // targets: one of the fight's main targets (replays made before this field guess the boss)
  boss?: boolean;
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
  image: string | null;
  world: [number, number, number, number];
  size?: [number, number];
}

export interface ReplayData {
  duration: number;
  sample_interval: number;
  map?: ReplayMap | null;
  actors: ReplayActor[];
  phases: ReplayPhase[];
  buffs?: Record<string, ReplayBuffInfo>;
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
