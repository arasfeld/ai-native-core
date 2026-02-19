import { AIModel, ModelContext } from "../models/model-interface";
import { Tool, getToolByName } from "../tools/tool-registry";

export async function runAgent(
  model: AIModel,
  context: ModelContext,
  tools: Tool[] = [],
) {
  console.log("[Runtime] Starting agent loop");

  // Call the model
  const result = await model.generate(context);

  // Check for tool calls in a naive way (stub)
  for (const tool of tools) {
    if (result.output.includes(tool.name)) {
      console.log(`[Runtime] Detected tool call: ${tool.name}`);
      const toolResult = await tool.execute({});
      console.log("[Runtime] Tool result:", toolResult);
    }
  }

  return result;
}
