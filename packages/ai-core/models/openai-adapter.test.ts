import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// vi.hoisted ensures mockCreate is available inside the vi.mock factory
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

import { OpenAIAdapter } from "./openai-adapter";

beforeEach(() => {
  mockCreate.mockReset();
});

describe("OpenAIAdapter — generate()", () => {
  it("returns assistant message content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hello!", tool_calls: null } }],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const result = await adapter.generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.output).toBe("Hello!");
  });

  it("returns empty string when choices is empty", async () => {
    mockCreate.mockResolvedValue({ choices: [] });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const result = await adapter.generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.output).toBe("");
  });

  it("returns tool calls when the model uses them", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                function: {
                  name: "get_weather",
                  arguments: '{"location":"Tokyo"}',
                },
              },
            ],
          },
        },
      ],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const result = await adapter.generate({
      messages: [{ role: "user", content: "weather?" }],
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]?.name).toBe("get_weather");
  });

  it("prepends systemPrompt as a system message", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok", tool_calls: null } }],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    await adapter.generate({
      messages: [{ role: "user", content: "hi" }],
      systemPrompt: "Be concise.",
    });
    const sentMessages = mockCreate.mock.calls[0]![0]!.messages;
    expect(sentMessages[0]).toMatchObject({
      role: "system",
      content: "Be concise.",
    });
  });

  it("includes tools in the API request when provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok", tool_calls: null } }],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    await adapter.generate({
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "my-tool",
          description: "A tool",
          schema: z.object({ x: z.string() }),
          execute: async () => ({}),
        },
      ],
    });
    const call = mockCreate.mock.calls[0]![0]!;
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].function.name).toBe("my-tool");
  });

  it("converts assistant messages with tool calls", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok", tool_calls: null } }],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    await adapter.generate({
      messages: [
        {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "c1", name: "get_weather", arguments: '{"location":"NYC"}' },
          ],
        },
      ],
    });
    const sentMessages = mockCreate.mock.calls[0]![0]!.messages;
    expect(sentMessages[0]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "c1", function: { name: "get_weather" } }],
    });
  });

  it("converts tool result messages", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok", tool_calls: null } }],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    await adapter.generate({
      messages: [
        {
          role: "tool",
          content: '{"temp":20}',
          toolCallId: "c1",
          name: "get_weather",
        },
      ],
    });
    const sentMessages = mockCreate.mock.calls[0]![0]!.messages;
    expect(sentMessages[0]).toMatchObject({
      role: "tool",
      tool_call_id: "c1",
      content: '{"temp":20}',
    });
  });

  it("returns usage when API response includes it", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hello!", tool_calls: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const result = await adapter.generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.usage).toBeDefined();
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);
    expect(result.usage?.totalTokens).toBe(15);
    expect(result.usage?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns no usage when API response omits it", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hello!", tool_calls: null } }],
    });
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const result = await adapter.generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.usage).toBeUndefined();
  });
});

describe("OpenAIAdapter — stream()", () => {
  it("yields text chunks and skips null deltas", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "Hello" } }] };
      yield { choices: [{ delta: { content: " World" } }] };
      yield { choices: [{ delta: { content: null } }] };
    }
    mockCreate.mockResolvedValue(fakeStream());
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const chunks: string[] = [];
    for await (const chunk of adapter.stream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk.text);
    }
    expect(chunks).toEqual(["Hello", " World"]);
  });

  it("prepends systemPrompt in stream requests", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "ok" } }] };
    }
    mockCreate.mockResolvedValue(fakeStream());
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    // consume the stream
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of adapter.stream({
      messages: [{ role: "user", content: "hi" }],
      systemPrompt: "You are helpful.",
    })) {
      /* drain stream */
    }
    const sentMessages = mockCreate.mock.calls[0]![0]!.messages;
    expect(sentMessages[0]).toMatchObject({
      role: "system",
      content: "You are helpful.",
    });
  });

  it("emits a final chunk with usage when API provides it", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "Hi" } }] };
      yield { choices: [{ delta: { content: " there" } }] };
      yield { choices: [], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } };
    }
    mockCreate.mockResolvedValue(fakeStream());
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const allChunks: Array<{ text: string; usage?: unknown }> = [];
    for await (const chunk of adapter.stream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      allChunks.push(chunk);
    }
    // Text chunks come first
    expect(allChunks[0]?.text).toBe("Hi");
    expect(allChunks[1]?.text).toBe(" there");
    // Final usage chunk
    const usageChunk = allChunks[allChunks.length - 1];
    expect(usageChunk?.text).toBe("");
    expect(usageChunk?.usage).toBeDefined();
    const u = usageChunk?.usage as { promptTokens: number; completionTokens: number; totalTokens: number };
    expect(u.promptTokens).toBe(8);
    expect(u.completionTokens).toBe(4);
    expect(u.totalTokens).toBe(12);
  });

  it("does not emit a usage chunk when API omits usage", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "Hi" } }] };
    }
    mockCreate.mockResolvedValue(fakeStream());
    const adapter = new OpenAIAdapter({ apiKey: "test" });
    const allChunks: Array<{ text: string; usage?: unknown }> = [];
    for await (const chunk of adapter.stream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      allChunks.push(chunk);
    }
    expect(allChunks).toHaveLength(1);
    expect(allChunks[0]?.usage).toBeUndefined();
  });
});
