import { io, type Socket } from "socket.io-client";

export type SocketEventHandler<T = unknown> = (payload: T) => void;

export interface SocketClient {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  on<T = unknown>(event: string, handler: SocketEventHandler<T>): () => void;
  send(event: string, data?: unknown): void;
  emitWithAck<T = unknown>(event: string, data?: unknown): Promise<T>;
}

/**
 * One Socket.IO connection per namespace ("/" = app-wide events, "/analysis"
 * = the Analysis tab). Same origin as the page: in dev Vite proxies
 * /socket.io to the backend (see vite.config.ts).
 */
export class SocketApi implements SocketClient {
  private socket: Socket | null = null;

  constructor(private readonly namespace = "/") {}

  /** The underlying Socket.IO socket (created on first use, not yet connected). */
  get raw(): Socket {
    if (!this.socket) {
      this.socket = io(this.namespace, { autoConnect: false, transports: ["websocket"] });
    }
    return this.socket;
  }

  connect() {
    if (!this.raw.connected) this.raw.connect();
  }

  disconnect() {
    this.socket?.disconnect();
  }

  isConnected() {
    return !!this.socket?.connected;
  }

  on<T = unknown>(event: string, handler: SocketEventHandler<T>): () => void {
    const listener = (payload: T) => handler(payload);
    this.raw.on(event, listener);
    return () => {
      this.raw.off(event, listener);
    };
  }

  send(event: string, data?: unknown) {
    this.raw.emit(event, data);
  }

  emitWithAck<T = unknown>(event: string, data?: unknown): Promise<T> {
    return this.raw.timeout(30_000).emitWithAck(event, data) as Promise<T>;
  }
}

export const socket = new SocketApi("/");
