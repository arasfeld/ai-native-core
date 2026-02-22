import { ModelContext } from "../types/ai-types";

export interface ModelChunk {
  text: string;
}

export interface ModelResult {
  output: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: unknown;
  }[];
}

export interface AIModel {
  stream(context: ModelContext): AsyncIterable<ModelChunk>;
  generate(context: ModelContext): Promise<ModelResult>;
}

// Example: simple OpenAI stub
export class OpenAIModelStub implements AIModel {
  async *stream(context: ModelContext) {
    const lastMessage = context.messages[context.messages.length - 1];
    yield { text: `[OpenAI stub] Response to: ${lastMessage?.content}` };
  }

  async generate(context: ModelContext) {
    const lastMessage = context.messages[context.messages.length - 1];
    return { output: `[OpenAI stub] Response to: ${lastMessage?.content}` };
  }
}
