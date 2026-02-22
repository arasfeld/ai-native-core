import { AIModel } from "../models/model-interface";
import { getToolByName } from "../tools/tool-registry";
import { ChatMessage, ModelContext } from "../types/ai-types";
import { MemoryStore } from "../memory/memory-store";
import { buildSystemPrompt } from "../context/assembler";

export interface AgentResult {
  output: string;
  history: ChatMessage[];
}

export interface AgentOptions {
  maxIterations?: number;
  onChunk?: (text: string) => void;
  memory?: MemoryStore;
}

export async function runAgent(
  model: AIModel,
  context: ModelContext,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const { maxIterations = 5, onChunk, memory } = options;

  const effectiveSystemPrompt = buildSystemPrompt(
    memory ? memory.getAll() : [],
    context.systemPrompt,
  );
  const effectiveContext: ModelContext = {
    ...context,
    systemPrompt: effectiveSystemPrompt || undefined,
  };

  const currentMessages = [...context.messages];
  let iteration = 0;

  function writeToMemory(output: string): void {
    if (!memory) return;
    const userTurn = context.messages[context.messages.length - 1];
    if (userTurn?.role === "user" && typeof userTurn.content === "string") {
      memory.add(`User: ${userTurn.content}`);
    }
    memory.add(`Assistant: ${output}`);
  }

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AgentRuntime] Iteration ${iteration}`);

    const result = await model.generate({
      ...effectiveContext,
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
          ...effectiveContext,
          messages: currentMessages,
        })) {
          onChunk(chunk.text);
          streamedOutput += chunk.text;
        }
        currentMessages.push({ role: "assistant", content: streamedOutput });
        writeToMemory(streamedOutput);
        return { output: streamedOutput, history: currentMessages };
      }
      writeToMemory(result.output);
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
