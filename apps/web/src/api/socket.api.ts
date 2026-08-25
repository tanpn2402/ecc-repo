export type SocketEventHandler<T = unknown> = (payload: T) => void;

export interface SocketClient {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  on<T = unknown>(event: string, handler: SocketEventHandler<T>): () => void;
  send(data: unknown): void;
}

function getSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ws`;
}

class SocketApi implements SocketClient {
  private socket: WebSocket | null = null;

  private handlers = new Map<string, Set<SocketEventHandler>>();

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.socket = new WebSocket(getSocketUrl());

    this.socket.onopen = () => {
      console.log("[WS] connected");
    };

    this.socket.onmessage = (event) => {
      console.error("[WS] message", event);
      this.handleMessage(event.data);
    };

    this.socket.onerror = (event) => {
      console.error("[WS] error", event);
    };

    this.socket.onclose = () => {
      console.log("[WS] disconnected");
      this.socket = null;
    };
  }

  disconnect() {
    if (!this.socket) {
      return;
    }

    this.socket.close();
    this.socket = null;
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  on<T = unknown>(event: string, handler: SocketEventHandler<T>): () => void {
    let handlers = this.handlers.get(event);

    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }

    handlers.add(handler as SocketEventHandler);

    // unsubscribe
    return () => {
      handlers?.delete(handler as SocketEventHandler);

      if (handlers?.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  send(data: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.socket.send(JSON.stringify(data));
  }

  private handleMessage(rawData: string) {
    let message: {
      type?: string;
      payload?: unknown;
    };

    try {
      message = JSON.parse(rawData);
    } catch {
      console.warn("[WS] Invalid message:", rawData);
      return;
    }

    if (!message.type) {
      return;
    }

    const handlers = this.handlers.get(message.type);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(message.payload);
    }
  }
}

export const socket = new SocketApi();
