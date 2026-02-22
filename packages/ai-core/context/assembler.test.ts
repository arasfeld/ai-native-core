import { describe, it, expect } from "vitest";
import { z } from "zod";
import { assembleContext } from "./assembler";

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
