export class MemoryStore {
  private memory: string[] = [];

  add(entry: string) {
    this.memory.push(entry);
    console.log("[MemoryStore] Added:", entry);
  }

  getAll() {
    return this.memory;
  }
}
