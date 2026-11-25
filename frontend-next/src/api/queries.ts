// React Query hooks over the endpoints, and the query keys the rest of the app updates.
import { useQuery } from '@tanstack/react-query';
import { api } from './endpoints';
import type { BuffTab, Encounter } from './types';

// The encounter's Nourishments, Enhancements and Other Consumables are listed on one Consumables tab, where the first of them was
const CONSUMABLES_TAB = 'consumables';
const CONSUMABLE_PARTS = ['nourishments', 'enhancements', 'other_consumables'];

export function mergeConsumables(tabs: BuffTab[]): BuffTab[] {
  const parts = tabs.filter(tab => CONSUMABLE_PARTS.includes(tab.id));
  if (parts.length === 0) return tabs;
  const merged: BuffTab = { id: CONSUMABLES_TAB, name: 'Consumables', order: parts.flatMap(tab => tab.order) };
  const first = parts[0];
  return tabs.flatMap(tab => (tab === first ? [merged] : parts.includes(tab) ? [] : [tab]));
}

const withConsumables = (encounter: Encounter): Encounter =>
  ({ ...encounter, buff_tabs: mergeConsumables(encounter.buff_tabs) });

export const keys = {
  bootstrap: ['bootstrap'] as const,
  initial: ['initial'] as const,
  encounters: ['encounters'] as const,
  encounter: (urlId: string) => ['encounter', urlId] as const,
  replay: (urlId: string) => ['replay', urlId] as const,
};

export const useBootstrapQuery = () =>
  useQuery({ queryKey: keys.bootstrap, queryFn: api.bootstrap, staleTime: Infinity });

export const useInitialQuery = () =>
  useQuery({ queryKey: keys.initial, queryFn: api.initial, staleTime: Infinity });

// the signed-in user's list; loaded on the first visit to the Encounters page, then kept for the visit
export const useEncountersQuery = (enabled: boolean) =>
  useQuery({
    queryKey: keys.encounters,
    queryFn: async () => (await api.encounters()).encounters,
    enabled,
    staleTime: Infinity,
  });

export const useEncounterQuery = (urlId: string | undefined) =>
  useQuery({
    queryKey: keys.encounter(urlId ?? ''),
    queryFn: async () => (await api.encounter(urlId!)).encounter,
    select: withConsumables,
    enabled: !!urlId,
    staleTime: Infinity,
    retry: false,
  });

export const useReplayQuery = (urlId: string) =>
  useQuery({
    queryKey: keys.replay(urlId),
    queryFn: () => api.replay(urlId),
    staleTime: Infinity,
    retry: false,
  });
