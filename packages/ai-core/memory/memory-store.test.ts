import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "./memory-store";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("starts empty", () => {
    expect(store.getAll()).toEqual([]);
  });

  it("add() stores a single entry", () => {
    store.add("hello");
    expect(store.getAll()).toContain("hello");
  });

  it("add() accumulates multiple entries in order", () => {
    store.add("first");
    store.add("second");
    expect(store.getAll()).toEqual(["first", "second"]);
  });

  it("getAll() reflects all adds", () => {
    store.add("a");
    store.add("b");
    store.add("c");
    expect(store.getAll()).toHaveLength(3);
  });
});
