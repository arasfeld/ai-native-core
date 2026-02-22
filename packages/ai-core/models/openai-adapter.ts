import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AIModel, ModelChunk, ModelResult } from "./model-interface";
import type { Tool } from "../tools/tool-registry";
import type { ChatMessage, ModelContext } from "../types/ai-types";

/** Options for the OpenAI-compatible adapter (OpenAI or Ollama). */
export interface OpenAIAdapterOptions {
  /** Model name (e.g. "gpt-4o-mini", "llama3.2"). */
  model?: string;
  /** API base URL. Use "http://localhost:11434/v1" for Ollama. */
  baseURL?: string;
  /** API key. Optional for Ollama; required for OpenAI. */
  apiKey?: string;
}

const defaultModel = "gpt-4o-mini";

function toOpenAIMessages(
  messages: ChatMessage[],
): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === "string"
                ? tc.arguments
                : JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: m.toolCallId!,
        content: m.content ?? "",
      };
    }
    return {
      role: m.role as "system" | "user" | "assistant",
      content: m.content ?? "",
    };
  });
}

function toOpenAITools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      // Cast for Zod 4 vs zod-to-json-schema typings
      parameters: zodToJsonSchema(t.schema as never, {
        $refStrategy: "none",
      }) as OpenAI.ChatCompletionTool["function"]["parameters"],
    },
  }));
}

/**
 * OpenAI-compatible model adapter. Works with OpenAI or any compatible API (e.g. Ollama at http://localhost:11434/v1).
 */
export class OpenAIAdapter implements AIModel {
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAIAdapterOptions = {}) {
    const model = options.model ?? defaultModel;
    const baseURL = options.baseURL;
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "ollama";

    this.model = model;
    this.client = new OpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
    });
  }

  async *stream(context: ModelContext): AsyncIterable<ModelChunk> {
    const messages = toOpenAIMessages(context.messages);
    if (context.systemPrompt) {
      messages.unshift({ role: "system", content: context.systemPrompt });
    }

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,
      temperature: context.temperature,
      max_tokens: context.maxTokens,
      ...(context.tools &&
        context.tools.length > 0 && { tools: toOpenAITools(context.tools) }),
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { text: delta };
    }
  }

  async generate(context: ModelContext): Promise<ModelResult> {
    const messages = toOpenAIMessages(context.messages);
    if (context.systemPrompt) {
      messages.unshift({ role: "system", content: context.systemPrompt });
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: false,
      temperature: context.temperature,
      max_tokens: context.maxTokens,
      ...(context.tools &&
        context.tools.length > 0 && { tools: toOpenAITools(context.tools) }),
      ...(context.tools && context.tools.length > 0 && { tool_choice: "auto" }),
    });

    const choice = response.choices[0];
    if (!choice?.message) {
      return { output: "" };
    }

    const msg = choice.message;
    const output = typeof msg.content === "string" ? msg.content : "";
    const toolCalls = msg.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      output,
      ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
    };
  }
}
