import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { runAgent } from "./agent-runtime";
import { registerTool } from "../tools/tool-registry";
import type { AIModel } from "../models/model-interface";

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
