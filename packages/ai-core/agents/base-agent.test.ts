import { describe, it, expect } from "vitest";
import { BaseAgent } from "./base-agent";

describe("BaseAgent", () => {
  it("stores the agent name", () => {
    const agent = new BaseAgent("test-agent");
    expect(agent.name).toBe("test-agent");
  });

  it("run() returns an echo of the input", async () => {
    const agent = new BaseAgent("echo");
    const result = await agent.run("hello world");
    expect(result.result).toBe("Echo: hello world");
  });

  it("run() works with an empty string input", async () => {
    const agent = new BaseAgent("empty");
    const result = await agent.run("");
    expect(result.result).toBe("Echo: ");
  });
});
