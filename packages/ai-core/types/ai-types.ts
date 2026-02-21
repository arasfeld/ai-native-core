import type { Tool } from "../tools/tool-registry";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface ChatMessage {
  role: MessageRole;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string; // For role: "tool"
  name?: string;       // For role: "tool"
}

export interface ModelContext {
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** When set, the model may use these tools. Required for tool calling. */
  tools?: Tool[];
}
