import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunAgent } = vi.hoisted(() => ({ mockRunAgent: vi.fn() }));

vi.mock("@repo/ai-core", () => ({
  OpenAIAdapter: class MockOpenAIAdapter {},
  runAgent: mockRunAgent,
  registerWeatherTool: vi.fn(),
  getAllTools: vi.fn().mockReturnValue([]),
}));

vi.mock("@repo/db", () => ({
  migrate: vi.fn().mockResolvedValue(undefined),
  PgMemoryStore: class MockPgMemoryStore {
    constructor(public readonly sessionId: string) {}
    async add(_entry: string) {}
    async getAll() { return []; }
  },
}));

import { chatBodySchema, buildServer } from "./server.js";

beforeEach(() => {
  mockRunAgent.mockReset();
  mockRunAgent.mockResolvedValue({ output: "ok", history: [] });
});

describe("chatBodySchema", () => {
  it("accepts a message string", () => {
    expect(chatBodySchema.safeParse({ message: "hello" }).success).toBe(true);
  });

  it("accepts message + systemPrompt", () => {
    expect(
      chatBodySchema.safeParse({
        message: "hello",
        systemPrompt: "Be concise.",
      }).success,
    ).toBe(true);
  });

  it("rejects missing message", () => {
    expect(chatBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-string message", () => {
    expect(chatBodySchema.safeParse({ message: 42 }).success).toBe(false);
  });
});

describe("GET /", () => {
  it("returns hello world", async () => {
    const server = await buildServer();
    const response = await server.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hello: "world" });
    await server.close();
  });
});

describe("POST /chat", () => {
  it("responds with SSE content-type", async () => {
    mockRunAgent.mockImplementation(
      async (
        _m: unknown,
        _c: unknown,
        opts: { onChunk?: (t: string) => void },
      ) => {
        opts.onChunk?.("hi");
        return { output: "hi", history: [] };
      },
    );
    const server = await buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hello" },
    });
    expect(response.headers["content-type"]).toContain("text/event-stream");
    await server.close();
  });

  it("emits text and done events", async () => {
    mockRunAgent.mockImplementation(
      async (
        _m: unknown,
        _c: unknown,
        opts: { onChunk?: (t: string) => void },
      ) => {
        opts.onChunk?.("Hello");
        return { output: "Hello", history: [] };
      },
    );
    const server = await buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi" },
    });
    expect(response.body).toContain("event: text");
    expect(response.body).toContain('"content":"Hello"');
    expect(response.body).toContain("event: done");
    await server.close();
  });

  it("emits an error event when runAgent throws", async () => {
    mockRunAgent.mockRejectedValue(new Error("model failure"));
    const server = await buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi" },
    });
    expect(response.body).toContain("event: error");
    expect(response.body).toContain("model failure");
    await server.close();
  });

  it("passes systemPrompt to runAgent", async () => {
    const server = await buildServer();
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi", systemPrompt: "Be brief." },
    });
    const context = mockRunAgent.mock.calls[0]![1]!;
    expect(context.systemPrompt).toBe("Be brief.");
    await server.close();
  });
});

describe("POST /chat — session memory", () => {
  it("passes undefined memory when no sessionId", async () => {
    const server = await buildServer();
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi" },
    });
    const opts = mockRunAgent.mock.calls[0]![2]!;
    expect(opts.memory).toBeUndefined();
    await server.close();
  });

  it("passes a memory store when sessionId is provided", async () => {
    const server = await buildServer();
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi", sessionId: "s1" },
    });
    const opts = mockRunAgent.mock.calls[0]![2]!;
    expect(opts.memory).toBeDefined();
    await server.close();
  });

  it("same sessionId produces stores with matching sessionId", async () => {
    const server = await buildServer();
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "first", sessionId: "same-session" },
    });
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "second", sessionId: "same-session" },
    });
    const mem1 = mockRunAgent.mock.calls[0]![2]!.memory;
    const mem2 = mockRunAgent.mock.calls[1]![2]!.memory;
    expect(mem1.sessionId).toBe("same-session");
    expect(mem2.sessionId).toBe("same-session");
    await server.close();
  });

  it("different sessionIds get stores with different sessionIds", async () => {
    const server = await buildServer();
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi", sessionId: "session-a" },
    });
    await server.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi", sessionId: "session-b" },
    });
    const mem1 = mockRunAgent.mock.calls[0]![2]!.memory;
    const mem2 = mockRunAgent.mock.calls[1]![2]!.memory;
    expect(mem1.sessionId).toBe("session-a");
    expect(mem2.sessionId).toBe("session-b");
    await server.close();
  });
});
