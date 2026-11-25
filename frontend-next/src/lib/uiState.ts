// UI state kept from page to page for this visit (not saved): which tab of the encounter page is open, and the
// replay panel's toggles.
import { createStore, useStore } from './store';

export interface ReplayShow {
  players: { boons: boolean; conditions: boolean; dps: boolean };
  bosses: { boons: boolean; conditions: boolean };
  targets: { boons: boolean; conditions: boolean };
}

export interface UiState {
  // 'combat_stats', 'boss_metrics', 'replay', or a buff tab's id
  encounterTab: string;
  replayShow: ReplayShow;
}

export const uiStore = createStore<UiState>({
  encounterTab: 'combat_stats',
  replayShow: {
    players: { boons: true, conditions: false, dps: false },
    bosses: { boons: false, conditions: false },
    targets: { boons: false, conditions: false },
  },
});

export const useUiState = () => useStore(uiStore);
