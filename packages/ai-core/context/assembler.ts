import { Tool } from "../tools/tool-registry";
import type { RetrievedChunk } from "../retrieval/retriever-interface";

export interface ContextInput {
  userInput: string;
  tools?: Tool[];
  memory?: string;
}

export function assembleContext({
  userInput,
  tools = [],
  memory = "",
}: ContextInput) {
  let prompt = "";
  if (memory) prompt += `Memory: ${memory}\n`;
  if (tools.length > 0)
    prompt += `Tools available: ${tools.map((t) => t.name).join(", ")}\n`;
  prompt += `User input: ${userInput}`;
  return prompt;
}

export function buildSystemPrompt(entries: string[], base?: string): string {
  const parts: string[] = [];
  if (base) parts.push(base);
  if (entries.length > 0)
    parts.push(`Past conversation:\n${entries.join("\n")}`);
  return parts.join("\n\n");
}

export function buildRAGSystemPrompt(
  chunks: RetrievedChunk[],
  memoryEntries: string[],
  base?: string,
): string {
  const parts: string[] = [];
  if (base) parts.push(base);
  if (chunks.length > 0) {
    const chunkText = chunks
      .map((c) => (c.source ? `[${c.source}] ${c.content}` : c.content))
      .join("\n\n");
    parts.push(`## Relevant Context\n${chunkText}`);
  }
  if (memoryEntries.length > 0)
    parts.push(`Past conversation:\n${memoryEntries.join("\n")}`);
  return parts.join("\n\n");
}
