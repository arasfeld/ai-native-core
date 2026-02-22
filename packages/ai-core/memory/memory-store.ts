export interface IMemoryStore {
  add(entry: string): Promise<void>;
  getAll(): Promise<string[]>;
}

export class MemoryStore implements IMemoryStore {
  private memory: string[] = [];

  async add(entry: string): Promise<void> {
    this.memory.push(entry);
    console.log("[MemoryStore] Added:", entry);
  }

  async getAll(): Promise<string[]> {
    return this.memory;
  }
}
