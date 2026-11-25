// The user's display settings, kept in localStorage under "settings" with the same shape the current frontend
// uses (frontend/assets/script.js), so on the same origin both frontends share them.
import { createStore, useStore } from './store';
import type { Palette } from './percentiles';

export type SortProp = 'area' | 'started_at' | 'duration' | 'character' | 'account' | 'uploaded_at' | 'category';

export interface EncounterFilter {
  success: boolean | null;
  mode?: number | null;           // 0 normal, 1 CM, 2 LCM; null for all
  area?: string | null;
  character?: string | null;
  account?: string | null;
  duration_from?: string | null;  // "m[:ss]"
  duration_till?: string | null;
  started_from?: string | null;   // "yyyy[-mm[-dd]]"
  started_till?: string | null;
  uploaded_from?: string | null;
  uploaded_till?: string | null;
  category?: number | null;       // 0 for uncategorised
  tag?: string | null;
}

export interface Settings {
  encounterSort: {
    prop: SortProp;
    dir: 'up' | 'down';
    filters: boolean;  // true while the filter panel is hidden
    filter: EncounterFilter;
  };
  comparePerc: number;
  compareGlobalPerc: number[];
  palette?: Palette;
}

const STORAGE_KEY = 'settings';

const DEFAULTS: Settings = {
  encounterSort: { prop: 'uploaded_at', dir: 'down', filters: false, filter: { success: null } },
  comparePerc: 50,
  compareGlobalPerc: [99, 90, 50],
};

function load(): Settings {
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    // unavailable (private mode) or not JSON: the defaults
  }
  const settings: Settings = { ...DEFAULTS, ...stored };
  settings.encounterSort = {
    ...DEFAULTS.encounterSort,
    ...stored.encounterSort,
    filter: { ...DEFAULTS.encounterSort.filter, ...stored.encounterSort?.filter },
  };
  if (!settings.comparePerc) settings.comparePerc = DEFAULTS.comparePerc;
  if (!settings.compareGlobalPerc) settings.compareGlobalPerc = DEFAULTS.compareGlobalPerc;
  return settings;
}

export const settingsStore = createStore<Settings>(load());

settingsStore.subscribe(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsStore.get()));
  } catch {
    // not saved; the settings still apply to this visit
  }
});

export const useSettings = () => useStore(settingsStore);

export function updateSettings(update: (settings: Settings) => Settings) {
  settingsStore.set(update);
}

export function updateEncounterSort(update: Partial<Settings['encounterSort']>) {
  settingsStore.set(s => ({ ...s, encounterSort: { ...s.encounterSort, ...update } }));
}

export function updateEncounterFilter(update: Partial<EncounterFilter>) {
  settingsStore.set(s => ({
    ...s,
    encounterSort: { ...s.encounterSort, filter: { ...s.encounterSort.filter, ...update } },
  }));
}
