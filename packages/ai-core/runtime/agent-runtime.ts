import { AIModel } from "../models/model-interface";
import { getToolByName } from "../tools/tool-registry";
import { ChatMessage, ModelContext } from "../types/ai-types";

export interface AgentResult {
  output: string;
  history: ChatMessage[];
}

export interface AgentOptions {
  maxIterations?: number;
  onChunk?: (text: string) => void;
}

export async function runAgent(
  model: AIModel,
  context: ModelContext,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const { maxIterations = 5, onChunk } = options;
  const currentMessages = [...context.messages];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AgentRuntime] Iteration ${iteration}`);

    const result = await model.generate({
      ...context,
      messages: currentMessages,
    });

    // Add assistant message to history
    currentMessages.push({
      role: "assistant",
      content: result.output,
      toolCalls: result.toolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      })),
    });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      if (onChunk) {
        let streamedOutput = "";
        for await (const chunk of model.stream({
          ...context,
          messages: currentMessages,
        })) {
          onChunk(chunk.text);
          streamedOutput += chunk.text;
        }
        currentMessages.push({ role: "assistant", content: streamedOutput });
        return { output: streamedOutput, history: currentMessages };
      }
      return {
        output: result.output,
        history: currentMessages,
      };
    }

    // Handle tool calls
    for (const toolCall of result.toolCalls) {
      const tool = getToolByName(toolCall.name);

      if (!tool) {
        console.error(`[AgentRuntime] Tool not found: ${toolCall.name}`);
        currentMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: `Error: Tool ${toolCall.name} not found.`,
        });
        continue;
      }

      try {
        const raw = toolCall.arguments;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const input = tool.schema.parse(parsed);
        console.log(
          `[AgentRuntime] Executing tool: ${tool.name} with args:`,
          input,
        );
        const output = await tool.execute(input);

        currentMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: JSON.stringify(output),
        });
      } catch (error) {
        console.error(
          `[AgentRuntime] Tool execution failed: ${tool.name}`,
          error,
        );
        currentMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  throw new Error("Maximum agent iterations reached");
}
