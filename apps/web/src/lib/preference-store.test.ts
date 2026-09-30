import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPreferenceStore } from "./preference-store";

const options = {
  key: "test-preference",
  values: ["a", "b"] as const,
  fallback: "a" as const,
};

describe("createPreferenceStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns the fallback when nothing is stored", () => {
    const store = createPreferenceStore(options);
    expect(store.get()).toBe("a");
    expect(store.getServerSnapshot()).toBe("a");
  });

  it("ignores stored values that are not allowed", () => {
    window.localStorage.setItem(options.key, "zzz");
    expect(createPreferenceStore(options).get()).toBe("a");
  });

  it("persists, applies and notifies on set", () => {
    const apply = vi.fn();
    const listener = vi.fn();
    const store = createPreferenceStore({ ...options, apply });
    const unsubscribe = store.subscribe(listener);

    store.set("b");

    expect(window.localStorage.getItem(options.key)).toBe("b");
    expect(store.get()).toBe("b");
    expect(apply).toHaveBeenCalledWith("b");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set("a");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reacts to changes made in another tab", () => {
    const apply = vi.fn();
    const listener = vi.fn();
    const store = createPreferenceStore({ ...options, apply });
    const unsubscribe = store.subscribe(listener);

    window.localStorage.setItem(options.key, "b");
    window.dispatchEvent(new StorageEvent("storage", { key: options.key, newValue: "b" }));

    expect(apply).toHaveBeenCalledWith("b");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps working for the session when storage is unavailable", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = createPreferenceStore(options);

    store.set("b");
    expect(store.get()).toBe("b");

    setItem.mockRestore();
    getItem.mockRestore();
  });
});
