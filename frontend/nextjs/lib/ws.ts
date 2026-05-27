// lib/ws.ts — WebSocket client stub for live updates.
// Real backend will accept `project:subscribe` and emit artifact/relation/validation/version/export events.
// This client is intentionally minimal: register handlers, it reconnects on drop.

type EventName =
  | "artifact:created" | "artifact:updated" | "artifact:deleted"
  | "relation:created" | "relation:deleted"
  | "validation:completed" | "version:created" | "export:completed";

type Handler = (payload: unknown) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<EventName, Set<Handler>>();
  private subscribedProjects = new Set<string>();
  private retry = 0;

  connect(url: string) {
    if (typeof window === "undefined") return;
    if (this.ws && this.ws.readyState <= 1) return;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.retry = 0;
      for (const id of this.subscribedProjects) {
        this.ws?.send(JSON.stringify({ event: "project:subscribe", payload: { projectId: id } }));
      }
    };
    this.ws.onmessage = (ev) => {
      try {
        const { event, payload } = JSON.parse(ev.data);
        this.handlers.get(event)?.forEach((h) => h(payload));
      } catch { /* ignore malformed */ }
    };
    this.ws.onclose = () => {
      const delay = Math.min(30000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(url), delay);
    };
  }
  subscribeProject(id: string) {
    this.subscribedProjects.add(id);
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ event: "project:subscribe", payload: { projectId: id } }));
    }
  }
  on(event: EventName, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }
}

export const ws = new WSClient();
