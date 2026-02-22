import { AIModel, ModelChunk, ModelResult } from "../models/model-interface";
import { ModelContext } from "../types/ai-types";
import { runAgent } from "./agent-runtime";
import { registerWeatherTool } from "../tools/weather-tool";

class MockAgentModel implements AIModel {
  private callCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *stream(_context: ModelContext): AsyncIterable<ModelChunk> {
    yield { text: "Mock response" };
  }

  async generate(context: ModelContext): Promise<ModelResult> {
    this.callCount++;

    if (this.callCount === 1) {
      // First call: model decides to call the weather tool
      return {
        output: "Let me check the weather for you.",
        toolCalls: [
          {
            id: "call_123",
            name: "get_weather",
            arguments: { location: "San Francisco, CA" },
          },
        ],
      };
    } else {
      // Second call: model sees the tool result and gives a final answer
      const toolResult = context.messages.find((m) => m.role === "tool");
      return {
        output: `The weather in San Francisco is sunny with a temperature of ${JSON.parse(toolResult?.content || "{}").temperature} degrees.`,
      };
    }
  }
}

async function testAgent() {
  console.log("--- Starting Agent Test ---");

  registerWeatherTool();

  const model = new MockAgentModel();
  const context: ModelContext = {
    messages: [{ role: "user", content: "What is the weather in SF?" }],
  };

  try {
    const result = await runAgent(model, context);
    console.log("\n--- Final Result ---");
    console.log("Output:", result.output);
    console.log("\n--- Full Message History ---");
    console.log(JSON.stringify(result.history, null, 2));
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testAgent();
