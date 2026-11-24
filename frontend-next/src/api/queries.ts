// React Query hooks over the endpoints, and the query keys the rest of the app updates.
import { useQuery } from '@tanstack/react-query';
import { api } from './endpoints';

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
