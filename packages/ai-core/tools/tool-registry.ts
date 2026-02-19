import { z, ZodSchema } from "zod";

export interface Tool {
  name: string;
  description: string;
  schema: ZodSchema;
  execute: (input: any) => Promise<any>;
}

const registry = new Map<string, Tool>();

export function registerTool(tool: Tool) {
  registry.set(tool.name, tool);
}

export function getToolByName(name: string) {
  return registry.get(name);
}
