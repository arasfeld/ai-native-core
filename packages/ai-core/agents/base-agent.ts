export class BaseAgent {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async run(input: string) {
    console.log(`[Agent ${this.name}] Running with input:`, input);
    return { result: `Echo: ${input}` };
  }
}
