import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { runAgent } from "./agent-runtime";
import { registerTool } from "../tools/tool-registry";
import { MemoryStore } from "../memory/memory-store";
import type { AIModel } from "../models/model-interface";
import type { UsageMetrics } from "../types/ai-types";

const sampleUsage: UsageMetrics = {
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  durationMs: 100,
};

// Minimal mock model factory
function makeModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    generate: vi.fn().mockResolvedValue({ output: "ok" }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { text: "ok" };
    }),
    ...overrides,
  };
}

const baseContext = {
  messages: [{ role: "user" as const, content: "hello" }],
};

beforeEach(() => {
  // Register a stable tool used across tests
  registerTool({
    name: "rt-echo",
    description: "Echo for agent-runtime tests",
    schema: z.object({ msg: z.string() }),
    execute: async ({ msg }) => ({ echoed: msg }),
  });
});

describe("runAgent — non-streaming", () => {
  it("returns model output when there are no tool calls", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "Hello!" }),
    });
    const result = await runAgent(model, baseContext);
    expect(result.output).toBe("Hello!");
  });

  it("includes user and assistant messages in history", async () => {
    const model = makeModel();
    const result = await runAgent(model, baseContext);
    expect(result.history[0]?.role).toBe("user");
    expect(result.history[1]?.role).toBe("assistant");
  });

  it("executes a registered tool call and loops", async () => {
    const model = makeModel({
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          output: "",
          toolCalls: [
            { id: "c1", name: "rt-echo", arguments: { msg: "ping" } },
          ],
        })
        .mockResolvedValueOnce({ output: "pong" }),
    });
    const result = await runAgent(model, baseContext);
    expect(result.output).toBe("pong");
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it("handles an unknown tool gracefully and continues", async () => {
    const model = makeModel({
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          output: "",
          toolCalls: [{ id: "c1", name: "nonexistent-tool", arguments: {} }],
        })
        .mockResolvedValueOnce({ output: "recovered" }),
    });
    const result = await runAgent(model, baseContext);
    expect(result.output).toBe("recovered");
  });

  it("throws when maxIterations is exceeded", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({
        output: "",
        toolCalls: [{ id: "c1", name: "rt-echo", arguments: { msg: "loop" } }],
      }),
    });
    await expect(
      runAgent(model, baseContext, { maxIterations: 2 }),
    ).rejects.toThrow("Maximum agent iterations reached");
  });
});

describe("runAgent — streaming", () => {
  it("calls onChunk with streamed text and returns accumulated output", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { text: "Hi" };
        yield { text: " there" };
      }),
    });
    const chunks: string[] = [];
    const result = await runAgent(model, baseContext, {
      onChunk: (t) => chunks.push(t),
    });
    expect(chunks).toEqual(["Hi", " there"]);
    expect(result.output).toBe("Hi there");
  });

  it("passes systemPrompt through to stream context", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { text: "ok" };
      }),
    });
    await runAgent(
      model,
      { ...baseContext, systemPrompt: "Be brief." },
      { onChunk: () => {} },
    );
    const streamCtx = (model.stream as ReturnType<typeof vi.fn>).mock
      .calls[0]![0]!;
    expect(streamCtx.systemPrompt).toBe("Be brief.");
  });
});

describe("runAgent — usage tracking", () => {
  it("returns usage from generate() in non-streaming mode", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "hello", usage: sampleUsage }),
    });
    const result = await runAgent(model, baseContext);
    expect(result.usage).toEqual(sampleUsage);
  });

  it("returns undefined usage when model does not emit it", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "hello" }),
    });
    const result = await runAgent(model, baseContext);
    expect(result.usage).toBeUndefined();
  });

  it("calls onUsage callback once per iteration (non-streaming)", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "hello", usage: sampleUsage }),
    });
    const onUsage = vi.fn();
    await runAgent(model, baseContext, { onUsage });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith(sampleUsage, 1);
  });

  it("accumulates usage across two iterations (tool call loop)", async () => {
    const toolUsage: UsageMetrics = { promptTokens: 20, completionTokens: 3, totalTokens: 23, durationMs: 50 };
    const finalUsage: UsageMetrics = { promptTokens: 25, completionTokens: 8, totalTokens: 33, durationMs: 80 };
    const model = makeModel({
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          output: "",
          toolCalls: [{ id: "c1", name: "rt-echo", arguments: { msg: "ping" } }],
          usage: toolUsage,
        })
        .mockResolvedValueOnce({ output: "pong", usage: finalUsage }),
    });
    const onUsage = vi.fn();
    const result = await runAgent(model, baseContext, { onUsage });
    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(result.usage).toEqual({
      promptTokens: 45,
      completionTokens: 11,
      totalTokens: 56,
      durationMs: 130,
    });
  });

  it("captures usage from the final stream chunk", async () => {
    const streamUsage: UsageMetrics = { promptTokens: 12, completionTokens: 6, totalTokens: 18, durationMs: 60 };
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { text: "streamed" };
        yield { text: "", usage: streamUsage };
      }),
    });
    const onUsage = vi.fn();
    const result = await runAgent(model, baseContext, { onChunk: () => {}, onUsage });
    expect(result.usage).toEqual(streamUsage);
    expect(onUsage).toHaveBeenCalledWith(streamUsage, 1);
  });
});

describe("runAgent — memory integration", () => {
  it("injects memory entries into system prompt (non-streaming)", async () => {
    const memory = new MemoryStore();
    await memory.add("User: previous question");
    await memory.add("Assistant: previous answer");

    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "reply" }),
    });
    await runAgent(model, baseContext, { memory });

    const generateCtx = (model.generate as ReturnType<typeof vi.fn>).mock
      .calls[0]![0]!;
    expect(generateCtx.systemPrompt).toContain("Past conversation:");
    expect(generateCtx.systemPrompt).toContain("User: previous question");
    expect(generateCtx.systemPrompt).toContain("Assistant: previous answer");
  });

  it("injects memory entries into system prompt (streaming)", async () => {
    const memory = new MemoryStore();
    await memory.add("User: past");
    await memory.add("Assistant: remembered");

    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { text: "streamed" };
      }),
    });
    await runAgent(model, baseContext, { onChunk: () => {}, memory });

    const streamCtx = (model.stream as ReturnType<typeof vi.fn>).mock
      .calls[0]![0]!;
    expect(streamCtx.systemPrompt).toContain("Past conversation:");
    expect(streamCtx.systemPrompt).toContain("User: past");
  });

  it("writes user turn and assistant reply to store after non-streaming return", async () => {
    const memory = new MemoryStore();
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "my answer" }),
    });
    await runAgent(model, baseContext, { memory });

    const entries = await memory.getAll();
    expect(entries).toContain("User: hello");
    expect(entries).toContain("Assistant: my answer");
  });

  it("writes user turn and assistant reply to store after streaming return", async () => {
    const memory = new MemoryStore();
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { text: "stream" };
        yield { text: "ed" };
      }),
    });
    await runAgent(model, baseContext, { onChunk: () => {}, memory });

    const entries = await memory.getAll();
    expect(entries).toContain("User: hello");
    expect(entries).toContain("Assistant: streamed");
  });

  it("does not write to memory when memory option is absent", async () => {
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "no memory" }),
    });
    // Should not throw when no memory provided
    await expect(runAgent(model, baseContext)).resolves.toBeDefined();
  });

  it("does not throw when store is empty", async () => {
    const memory = new MemoryStore();
    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "ok" }),
    });
    await expect(runAgent(model, baseContext, { memory })).resolves.toBeDefined();
  });

  it("preserves base systemPrompt alongside memory entries", async () => {
    const memory = new MemoryStore();
    await memory.add("User: past");

    const model = makeModel({
      generate: vi.fn().mockResolvedValue({ output: "ok" }),
    });
    await runAgent(model, { ...baseContext, systemPrompt: "Be helpful." }, { memory });

    const generateCtx = (model.generate as ReturnType<typeof vi.fn>).mock
      .calls[0]![0]!;
    expect(generateCtx.systemPrompt).toContain("Be helpful.");
    expect(generateCtx.systemPrompt).toContain("Past conversation:");
  });
});
