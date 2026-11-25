// Types for the replay data (replay/<url_id>.json, made by eiparser/replay.py) and for the replay viewer copied
// in vendor/replay.js, which sets window.RaidarReplay when imported.
// TODO(replay-rewrite): these go away with the viewer when it becomes a React component.

export interface ReplayBuffInfo {
  name: string;
  icon: string;
}

export interface ReplayActor {
  kind: 'player' | 'target';
  name?: string | null;
  private?: boolean;
  party?: number;
  profession?: number;
  elite?: number;
  boss?: boolean;
  start?: number;
  end?: number;
  x: number[];
  y: number[];
  [key: string]: unknown;
}

export interface ReplayPhase {
  name: string;
  start: number;
  end: number;
  parent?: string | null;
}

export interface ReplayData {
  duration: number;
  sample_interval: number;
  map?: { image: string; world: [number, number, number, number]; size?: [number, number] };
  actors: ReplayActor[];
  phases: ReplayPhase[];
  buffs?: Record<string, ReplayBuffInfo>;
  [key: string]: unknown;
}

// The state of players and targets the viewer reports to the panel next to the map (onView)
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
  state: 'alive' | 'down' | 'dead' | 'dc' | string;
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
  state: string;
  health: number;
  breakbar: number | null;
  buffs: ViewBuff[];
  conditions: ViewBuff[];
  selected: boolean;
}

export interface ReplayView {
  time: number;
  parties: { party: number; colour: string; players: ViewPlayer[] }[];
  bosses: ViewTarget[];
  adds: ViewTarget[];
}

export interface ViewerOptions {
  staticRoot?: string;
  topElement?: HTMLElement | null;
  specialisation?: (profession: number | undefined, elite: number | undefined) => string | undefined;
  buffOrder?: string[];
  conditionOrder?: string[];
  buffInfo?: Record<string, ReplayBuffInfo>;
  mapTheme?: Record<string, string>;
  onView?: (view: ReplayView) => void;
}

export interface Viewer {
  data: ReplayData;
  seek(ms: number): void;
  select(actorIndex: number): void;
  setMapTheme(colours: Record<string, string>): void;
  scrollIntoView(): void;
  destroy(): void;
}

declare global {
  interface Window {
    RaidarReplay: {
      Viewer: new (root: HTMLElement, data: ReplayData, options?: ViewerOptions) => Viewer;
      partyColour(party: number): string;
      formatTime(ms: number, tenths?: boolean): string;
      kilo(value: number): string;
    };
  }
}
