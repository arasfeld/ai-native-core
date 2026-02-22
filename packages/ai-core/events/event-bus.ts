export type EventPayload = unknown;

type Listener = (payload: EventPayload) => void;

class EventBusClass {
  private listeners: Map<string, Listener[]> = new Map();

  on(event: string, listener: Listener) {
    const arr = this.listeners.get(event) || [];
    arr.push(listener);
    this.listeners.set(event, arr);
  }

  emit(event: string, payload: EventPayload) {
    console.log(`[EventBus] Emitting event: ${event}`);
    const arr = this.listeners.get(event) || [];
    for (const listener of arr) {
      listener(payload);
    }
  }
}

export const eventBus = new EventBusClass();
