import { AIModel } from "../models/model-interface";
import { getToolByName } from "../tools/tool-registry";
import { ChatMessage, ModelContext } from "../types/ai-types";

export interface AgentResult {
  output: string;
  history: ChatMessage[];
}

export async function runAgent(
  model: AIModel,
  context: ModelContext,
  maxIterations: number = 5,
): Promise<AgentResult> {
  let currentMessages = [...context.messages];
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
        console.log(`[AgentRuntime] Executing tool: ${tool.name} with args:`, input);
        const output = await tool.execute(input);

        currentMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: JSON.stringify(output),
        });
      } catch (error: any) {
        console.error(`[AgentRuntime] Tool execution failed: ${tool.name}`, error);
        currentMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: `Error: ${error.message}`,
        });
      }
    }
  }

  throw new Error("Maximum agent iterations reached");
}
