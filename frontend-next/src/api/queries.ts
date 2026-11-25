// React Query hooks over the endpoints, and the query keys the rest of the app updates.
import { useQuery } from '@tanstack/react-query';
import { api } from './endpoints';
import type { BuffTab, Encounter } from './types';

// The buff tabs the encounter has, merged into fewer tabs: each is a tab of a group of buffs for each tab it
// replaces (in the order given, so the gear comes last), where the first of them was.
const MERGED_TABS = [
  { id: 'effects', name: 'Effects', parts: ['offensive_buffs', 'support_buffs', 'defensive_buffs'] },
  { id: 'debuffs_and_conditions', name: 'Debuffs', parts: ['debuffs', 'conditions'] },
  { id: 'equipped_buffs', name: 'Equipped Buffs', parts: ['nourishments', 'enhancements', 'other_consumables', 'gear_buffs'] },
];

export function mergeTabs(tabs: BuffTab[]): BuffTab[] {
  return MERGED_TABS.reduce((all, { id, name, parts }) => {
    const found = parts.flatMap(part => all.find(tab => tab.id === part) ?? []);
    if (found.length === 0) return all;
    const merged: BuffTab = {
      id,
      name,
      order: found.flatMap(tab => tab.order),
      groups: found.map(tab => tab.order),
      groupIds: found.map(tab => tab.id),
    };
    return all.flatMap(tab => (tab === found[0] ? [merged] : found.includes(tab) ? [] : [tab]));
  }, tabs);
}

const withMergedTabs = (encounter: Encounter): Encounter =>
  ({ ...encounter, buff_tabs: mergeTabs(encounter.buff_tabs) });

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
    select: withMergedTabs,
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
