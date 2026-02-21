import { z, ZodSchema } from "zod";

export interface Tool<T = any, R = any> {
  name: string;
  description: string;
  schema: ZodSchema<T>;
  execute: (input: T) => Promise<R>;
}

const registry = new Map<string, Tool>();

export function registerTool(tool: Tool) {
  console.log(`[ToolRegistry] Registering tool: ${tool.name}`);
  registry.set(tool.name, tool);
}

export function getToolByName(name: string): Tool | undefined {
  return registry.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(registry.values());
}
