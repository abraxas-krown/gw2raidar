// A tiny external store for app-wide UI state that is not server data (React Query holds that).
import * as React from 'react';

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((state: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const next = typeof update === 'function' ? update(state) : { ...state, ...update };
      if (next === state) return;
      state = next;
      listeners.forEach(listener => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object>(store: Store<T>): T {
  return React.useSyncExternalStore(store.subscribe, store.get, store.get);
}
