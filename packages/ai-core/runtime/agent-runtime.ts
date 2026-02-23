import { AIModel } from "../models/model-interface";
import { getToolByName } from "../tools/tool-registry";
import { ChatMessage, ModelContext, UsageMetrics } from "../types/ai-types";
import { IMemoryStore } from "../memory/memory-store";
import { buildSystemPrompt } from "../context/assembler";

export interface AgentResult {
  output: string;
  history: ChatMessage[];
  usage?: UsageMetrics;
}

export interface AgentOptions {
  maxIterations?: number;
  onChunk?: (text: string) => void;
  memory?: IMemoryStore;
  onUsage?: (usage: UsageMetrics, iteration: number) => void;
}

function addUsage(a: UsageMetrics | undefined, b: UsageMetrics): UsageMetrics {
  if (!a) return b;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    durationMs: a.durationMs + b.durationMs,
  };
}

export async function runAgent(
  model: AIModel,
  context: ModelContext,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const { maxIterations = 5, onChunk, memory, onUsage } = options;
  let accumulatedUsage: UsageMetrics | undefined;

  const effectiveSystemPrompt = buildSystemPrompt(
    memory ? await memory.getAll() : [],
    context.systemPrompt,
  );
  const effectiveContext: ModelContext = {
    ...context,
    systemPrompt: effectiveSystemPrompt || undefined,
  };

  const currentMessages = [...context.messages];
  let iteration = 0;

  async function writeToMemory(output: string): Promise<void> {
    if (!memory) return;
    const userTurn = context.messages[context.messages.length - 1];
    if (userTurn?.role === "user" && typeof userTurn.content === "string") {
      await memory.add(`User: ${userTurn.content}`);
    }
    await memory.add(`Assistant: ${output}`);
  }

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AgentRuntime] Iteration ${iteration}`);

    const result = await model.generate({
      ...effectiveContext,
      messages: currentMessages,
    });

    if (result.usage) {
      accumulatedUsage = addUsage(accumulatedUsage, result.usage);
      onUsage?.(result.usage, iteration);
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      if (onChunk) {
        // Stream fresh — currentMessages still ends with the user message
        let streamedOutput = "";
        let streamUsage: UsageMetrics | undefined;
        for await (const chunk of model.stream({
          ...effectiveContext,
          messages: currentMessages,
        })) {
          if (chunk.usage) {
            streamUsage = chunk.usage;
          }
          if (chunk.text) {
            onChunk(chunk.text);
            streamedOutput += chunk.text;
          }
        }
        if (streamUsage) {
          accumulatedUsage = addUsage(accumulatedUsage, streamUsage);
          onUsage?.(streamUsage, iteration);
        }
        currentMessages.push({ role: "assistant", content: streamedOutput });
        await writeToMemory(streamedOutput);
        return { output: streamedOutput, history: currentMessages, usage: accumulatedUsage };
      }
      // Non-streaming: use the generate result
      currentMessages.push({ role: "assistant", content: result.output });
      await writeToMemory(result.output);
      return {
        output: result.output,
        history: currentMessages,
        usage: accumulatedUsage,
      };
    }

    // Tool calls: push generate result (with toolCalls) so tool responses have context
    // Note: tc.arguments is already a JSON string from the adapter — do NOT re-stringify
    currentMessages.push({
      role: "assistant",
      content: result.output,
      toolCalls: result.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: String(tc.arguments),
      })),
    });

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
