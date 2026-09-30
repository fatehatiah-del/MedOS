/**
 * A small localStorage-backed store for per-device UI preferences (theme,
 * sidebar state). It is shaped for `useSyncExternalStore` and stays in sync
 * across browser tabs.
 */
export interface PreferenceStore<T extends string> {
  get: () => T;
  getServerSnapshot: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

interface PreferenceStoreOptions<T extends string> {
  key: string;
  values: readonly T[];
  fallback: T;
  /** Side effect that reflects the value in the document (e.g. a data attribute). */
  apply?: (value: T) => void;
}

export function createPreferenceStore<T extends string>({
  key,
  values,
  fallback,
  apply,
}: PreferenceStoreOptions<T>): PreferenceStore<T> {
  const listeners = new Set<() => void>();
  // Used when storage is unavailable (private mode, blocked cookies).
  let memory: T | null = null;

  const isValid = (value: string | null): value is T =>
    value !== null && (values as readonly string[]).includes(value);

  const get = (): T => {
    try {
      const stored = window.localStorage.getItem(key);
      if (isValid(stored)) return stored;
    } catch {
      // Fall through to the in-memory value.
    }
    return memory ?? fallback;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== key) return;
    apply?.(get());
    notify();
  };

  return {
    get,
    getServerSnapshot: () => fallback,
    set(value) {
      memory = value;
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // The preference still applies for this session.
      }
      apply?.(value);
      notify();
    },
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
  };
}
