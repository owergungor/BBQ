import { useSyncExternalStore } from "react";

export interface DomainStore<T> {
  getState: () => T;
  setState: (updater: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (listener: () => void) => () => void;
  useStore: <Selected = T>(selector?: (state: T) => Selected) => Selected;
}

export function createDomainStore<T>(initialState: T): DomainStore<T> {
  let state = initialState;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState = (updater: Partial<T> | ((prev: T) => Partial<T>)) => {
    const nextPartial = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...nextPartial };
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const useStore = <Selected = T>(selector: (state: T) => Selected = (s) => s as unknown as Selected): Selected => {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(initialState)
    );
  };

  return { getState, setState, subscribe, useStore };
}
