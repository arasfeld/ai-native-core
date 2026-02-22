import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "./memory-store";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("starts empty", async () => {
    expect(await store.getAll()).toEqual([]);
  });

  it("add() stores a single entry", async () => {
    await store.add("hello");
    expect(await store.getAll()).toContain("hello");
  });

  it("add() accumulates multiple entries in order", async () => {
    await store.add("first");
    await store.add("second");
    expect(await store.getAll()).toEqual(["first", "second"]);
  });

  it("getAll() reflects all adds", async () => {
    await store.add("a");
    await store.add("b");
    await store.add("c");
    expect(await store.getAll()).toHaveLength(3);
  });
});
