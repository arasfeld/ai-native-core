import { describe, it, expect, vi } from "vitest";
import { eventBus } from "./event-bus";

// Use unique event names per test to avoid cross-test listener accumulation
// (eventBus is a module-level singleton)

describe("eventBus", () => {
  it("calls a listener when its event is emitted", () => {
    const listener = vi.fn();
    eventBus.on("eb-basic", listener);
    eventBus.emit("eb-basic", { value: 1 });
    expect(listener).toHaveBeenCalledWith({ value: 1 });
  });

  it("calls multiple listeners registered for the same event", () => {
    const a = vi.fn();
    const b = vi.fn();
    eventBus.on("eb-multi", a);
    eventBus.on("eb-multi", b);
    eventBus.emit("eb-multi", "payload");
    expect(a).toHaveBeenCalledWith("payload");
    expect(b).toHaveBeenCalledWith("payload");
  });

  it("does not call a listener registered for a different event", () => {
    const listener = vi.fn();
    eventBus.on("eb-other", listener);
    eventBus.emit("eb-unrelated", {});
    expect(listener).not.toHaveBeenCalled();
  });

  it("emitting with no listeners does not throw", () => {
    expect(() => eventBus.emit("eb-no-listeners", {})).not.toThrow();
  });

  it("calls a listener multiple times when emitted multiple times", () => {
    const listener = vi.fn();
    eventBus.on("eb-repeat", listener);
    eventBus.emit("eb-repeat", 1);
    eventBus.emit("eb-repeat", 2);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
