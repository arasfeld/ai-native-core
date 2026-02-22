import { describe, it, expect } from "vitest";
import { z } from "zod";
import { registerTool, getToolByName, getAllTools } from "./tool-registry";

describe("tool-registry", () => {
  it("registers a tool and retrieves it by name", () => {
    registerTool({
      name: "test-ping",
      description: "A test tool",
      schema: z.object({ input: z.string() }),
      execute: async ({ input }) => ({ output: input }),
    });

    const tool = getToolByName("test-ping");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("test-ping");
  });

  it("getAllTools includes registered tools", () => {
    registerTool({
      name: "test-pong",
      description: "Another test tool",
      schema: z.object({}),
      execute: async () => ({}),
    });

    const names = getAllTools().map((t) => t.name);
    expect(names).toContain("test-pong");
  });

  it("returns undefined for unknown tool", () => {
    expect(getToolByName("does-not-exist")).toBeUndefined();
  });

  it("tool schema validates input correctly", async () => {
    const schema = z.object({ city: z.string() });
    registerTool({
      name: "test-weather",
      description: "Weather",
      schema,
      execute: async ({ city }) => ({ temp: 20, city }),
    });

    const tool = getToolByName("test-weather")!;
    const result = tool.schema.safeParse({ city: "Tokyo" });
    expect(result.success).toBe(true);

    const bad = tool.schema.safeParse({ city: 42 });
    expect(bad.success).toBe(false);
  });
});
