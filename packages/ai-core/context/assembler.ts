import { Tool } from "../tools/tool-registry";

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
