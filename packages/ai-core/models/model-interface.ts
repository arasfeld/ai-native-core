export interface ModelContext {
  prompt: string;
}

export interface ModelChunk {
  text: string;
}

export interface ModelResult {
  output: string;
}

export interface AIModel {
  stream(context: ModelContext): AsyncIterable<ModelChunk>;
  generate(context: ModelContext): Promise<ModelResult>;
}

// Example: simple OpenAI stub
export class OpenAIModelStub implements AIModel {
  async *stream(context: ModelContext) {
    yield { text: `[OpenAI stub] ${context.prompt}` };
  }

  async generate(context: ModelContext) {
    return { output: `[OpenAI stub] ${context.prompt}` };
  }
}
