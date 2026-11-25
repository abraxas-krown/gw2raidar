// The shapes of the backend's responses (docs/frontend-api.md), as far as this frontend reads them.

// ---- bootstrap.json: reference data, the same for everyone

export interface Area {
  name: string;
  mode?: number;
  tag?: string | null;  // "CM", "LCM"
  icon?: string;
  kind?: number;
  enrage?: number;
}

export interface BuffInfo {
  name: string;
  icon: string;
  // present for buffs that stack in intensity (their value is a number of stacks): the most they can have, or
  // null (a buff of an encounter, whose most is not known); the Overview's say only true
  stacks?: boolean | number | null;
}

export interface BuffTab {
  id: string;
  name: string;
  order: string[];
  // a tab of several kinds of buff (made of the tabs of the encounter): the buffs of each, in `order`, shown as
  // groups, and the id of the tab each came from
  groups?: string[][];
  groupIds?: string[];
}

export interface Bootstrap {
  archetypes: Record<string, string>;
  areas: Record<string, Area>;
  // the kinds of encounter (raids, fractals, …): their "all" entry, how many columns their menu has, and their wings
  boss_locations: { name: string; all?: string; columns?: number; wings: { name: string; bosses: number[] }[] }[];
  // profession id -> elite id -> specialisation name
  specialisations: Record<string, Record<string, string>>;
  categories: Record<string, string>;
  buffs: Record<string, BuffInfo>;
  buff_tabs: BuffTab[];
  version: { id: string; timestamp?: number };
  debug: boolean;
  urls: { admin: string; download: string; report: string; api_upload?: string; api_categories?: string };
}

// ---- initial.json (and login.json, register.json): the user

export interface Account {
  name: string;
  api_key: string;
}

export interface Session {
  username: string;  // "" for a guest
  email?: string;
  is_staff?: boolean;
  accounts?: Account[];
  privacy?: number;
  last_notification_id?: number;
}

// ---- encounters.json: the user's encounter list

export interface EncounterRow {
  id: number;
  url_id: string;
  area: string;
  area_id?: number;
  mode?: number;
  mode_tag?: string | null;
  success: boolean;
  boss_health?: number | null;
  duration: number;
  started_at: number;
  uploaded_at: number;
  character: string;
  account: string;
  archetype: number | string;
  profession: number | string;
  elite: number | string;
  category: number | null;
  tags: string[];
}

// ---- encounter/<url_id>.json

// The stats objects are big and vary by encounter; only what this frontend reads is named
export type NumberBag = Partial<Record<string, number>>;

export interface PlayerEvents {
  dead_count?: number;
  dead_time?: number;
  down_count?: number;
  down_time?: number;
  disconnect_count?: number;
  disconnect_time?: number;
}

export interface Performance {
  actual?: NumberBag & { dps_perc?: string };
  actual_boss?: Partial<Record<string, number | string>> & { shielded?: NumberBag };
  received?: Partial<Record<string, number | string>>;
  shielded?: Partial<Record<string, number | string>>;
  buffs?: Partial<Record<string, number | string>>;
  buffs_out?: Partial<Record<string, number | string>>;
}

export interface StatBlock {
  actual?: NumberBag;
  actual_boss?: NumberBag;
  received?: NumberBag;
  shielded?: NumberBag;
  buffs?: NumberBag;
  buffs_out?: NumberBag;
  mechanics?: Partial<Record<string, number | string>>;
  events?: PlayerEvents;
  performance?: Performance;
}

export interface Member extends StatBlock {
  name?: string | null;
  account?: string | null;
  archetype: number | string;
  profession: number | string;
  elite: number | string;
  self?: boolean;
  commander?: boolean;
}

export interface Party extends StatBlock {
  members: Member[];
}

export interface Phase extends StatBlock {
  duration: number;
  group?: NumberBag;
  individual?: NumberBag;
  parties: Record<string, Party>;
}

export interface BossMetric {
  name: string;
  short_name: string;
  long_name: string;
  data_type?: number;
  split_by_phase?: boolean;
}

export interface Encounter {
  id: number;
  url_id: string;
  name: string;
  icon?: string;
  filename?: string;
  evtc_url?: string;
  evtc_version?: string;
  downloadable?: boolean;
  uploaded_by?: string;
  uploaded_at?: number;
  started_at: number;
  duration: number;
  success: boolean;
  boss_health?: number | null;
  mode_tag?: string | null;
  has_report?: boolean;
  has_replay?: boolean;
  participated?: boolean;
  tags?: string;  // comma-separated
  category?: number | string | null;
  phase_order?: string[];
  phase_parents?: Record<string, string | null>;
  phases: Record<string, Phase>;
  buff_tabs: BuffTab[];
  buffs: Record<string, BuffInfo>;
  boss_metrics: BossMetric[];
  max_player_dps?: number;
  max_player_recv?: number;
  max_player_breakbar?: number;
}

// ---- poll.json: what happened to the user's uploads since the last poll

export type Notification =
  | { type: 'upload'; filename: string; upload_id: number; uploaded_by: string; encounter_id: number; encounter_url_id: string; encounter?: EncounterRow }
  | { type: 'upload_error'; upload_id: number; error: string };

// ---- replay/<url_id>.json: passed to the replay viewer as it is (see Replay/viewer.d.ts)
export type { ReplayData } from "../pages/encounter/Replay/viewer";
