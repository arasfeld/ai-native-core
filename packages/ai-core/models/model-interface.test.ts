import { describe, it, expect } from "vitest";
import { OpenAIModelStub } from "./model-interface";

describe("OpenAIModelStub", () => {
  it("stream yields a response mentioning the last message content", async () => {
    const stub = new OpenAIModelStub();
    const chunks: string[] = [];
    for await (const chunk of stub.stream({
      messages: [{ role: "user", content: "ping" }],
    })) {
      chunks.push(chunk.text);
    }
    expect(chunks.join("")).toContain("ping");
  });

  it("generate returns a response mentioning the last message content", async () => {
    const stub = new OpenAIModelStub();
    const result = await stub.generate({
      messages: [{ role: "user", content: "ping" }],
    });
    expect(result.output).toContain("ping");
  });
});
