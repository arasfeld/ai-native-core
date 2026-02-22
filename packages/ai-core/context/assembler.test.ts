import { describe, it, expect } from "vitest";
import { z } from "zod";
import { assembleContext, buildSystemPrompt } from "./assembler";

describe("assembleContext", () => {
  it("includes the user input", () => {
    const result = assembleContext({ userInput: "hello" });
    expect(result).toContain("User input: hello");
  });

  it("prepends memory when provided", () => {
    const result = assembleContext({ userInput: "hi", memory: "past context" });
    expect(result).toContain("Memory: past context");
    expect(result.indexOf("Memory")).toBeLessThan(result.indexOf("User input"));
  });

  it("omits the memory line when memory is not provided", () => {
    const result = assembleContext({ userInput: "hi" });
    expect(result).not.toContain("Memory:");
  });

  it("lists tool names when tools are provided", () => {
    const tool = {
      name: "my-tool",
      description: "A tool",
      schema: z.object({}),
      execute: async () => ({}),
    };
    const result = assembleContext({ userInput: "hi", tools: [tool] });
    expect(result).toContain("my-tool");
    expect(result).toContain("Tools available:");
  });

  it("omits the tools line when tools array is empty", () => {
    const result = assembleContext({ userInput: "hi", tools: [] });
    expect(result).not.toContain("Tools available:");
  });

  it("includes both memory and tools when both are provided", () => {
    const tool = {
      name: "calc",
      description: "Calculator",
      schema: z.object({}),
      execute: async () => ({}),
    };
    const result = assembleContext({
      userInput: "go",
      memory: "ctx",
      tools: [tool],
    });
    expect(result).toContain("Memory: ctx");
    expect(result).toContain("calc");
    expect(result).toContain("User input: go");
  });
});

describe("buildSystemPrompt", () => {
  it("returns empty string with no args", () => {
    expect(buildSystemPrompt([])).toBe("");
  });

  it("returns base when no entries", () => {
    expect(buildSystemPrompt([], "Be concise.")).toBe("Be concise.");
  });

  it("returns memory block when no base", () => {
    const result = buildSystemPrompt(["User: hi", "Assistant: hello"]);
    expect(result).toContain("Past conversation:");
    expect(result).toContain("User: hi");
    expect(result).toContain("Assistant: hello");
  });

  it("joins both with double newline separator", () => {
    const result = buildSystemPrompt(["User: hi"], "Be brief.");
    expect(result).toBe("Be brief.\n\nPast conversation:\nUser: hi");
  });

  it("joins multiple entries with newline", () => {
    const result = buildSystemPrompt(["User: a", "Assistant: b", "User: c"]);
    expect(result).toBe("Past conversation:\nUser: a\nAssistant: b\nUser: c");
  });
});
