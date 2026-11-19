import { Inject, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import type { AgentEvent, Attachment } from '../agent/agent-events';
import { AnalysisService, toHttpError } from './analysis.service';
import { isLocalRequest } from './local-only';

type Ack = { ok: true; [k: string]: unknown } | { ok: false; error: string; code: string };

const room = (sid: string) => `thread:${sid}`;

async function ack(fn: () => Promise<Record<string, unknown> | void>): Promise<Ack> {
  try {
    return { ok: true, ...((await fn()) ?? {}) };
  } catch (err) {
    const http = toHttpError(err);
    const body = http.getResponse() as { message?: string; code?: string };
    return { ok: false, error: body?.message ?? http.message, code: body?.code ?? 'error' };
  }
}

/**
 * Socket.IO namespace /analysis. Client -> server messages answer through the
 * ack; server -> client is one event, `ai:event` ({ sid, id, type, ... }),
 * sent to the room of the thread, plus `thread:status` ({ sid, running }) to
 * everyone so thread lists can show which threads are running.
 */
@WebSocketGateway({ namespace: '/analysis' })
export class AnalysisGateway implements OnModuleInit, OnGatewayConnection {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly analysis: AnalysisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.analysis.agents.on('event', (sid: string, ev: AgentEvent) => {
      this.server?.to(room(sid)).emit('ai:event', { sid, ...ev });
      if (ev.type === 'user' || ev.type === 'done') {
        this.server?.emit('thread:status', { sid, running: ev.type === 'user' });
      }
    });
  }

  handleConnection(client: Socket): void {
    if (this.config.analysis.allowRemote) return;
    if (!isLocalRequest(client.handshake.address, client.handshake.headers as Record<string, unknown>)) {
      client.disconnect(true);
    }
  }

  /** Joins the thread's room and returns the events after `after` (replay after a reconnect). */
  @SubscribeMessage('thread:join')
  join(@ConnectedSocket() client: Socket, @MessageBody() body: { sid: string; after?: number }) {
    return ack(async () => {
      const session = await this.analysis.agents.get(String(body?.sid));
      await client.join(room(session.id));
      return { events: session.eventsAfter(Number(body?.after ?? 0)), lastEventId: session.lastEventId, running: session.busy };
    });
  }

  @SubscribeMessage('thread:leave')
  leave(@ConnectedSocket() client: Socket, @MessageBody() body: { sid: string }) {
    return ack(async () => {
      await client.leave(room(String(body?.sid)));
    });
  }

  @SubscribeMessage('chat:send')
  send(@MessageBody() body: { sid: string; text: string; attachments?: Attachment[]; force?: boolean }) {
    return ack(() => this.analysis.send(String(body?.sid), body?.text ?? '', body?.attachments ?? [], !!body?.force));
  }

  @SubscribeMessage('chat:interrupt')
  interrupt(@MessageBody() body: { sid: string }) {
    return ack(() => this.analysis.agents.interrupt(String(body?.sid)));
  }

  @SubscribeMessage('permission:answer')
  answer(
    @MessageBody()
    body: {
      sid: string;
      requestId: string;
      allow: boolean;
      message?: string;
      answers?: Record<string, string | string[]>;
      scope?: 'once' | 'session';
    },
  ) {
    return ack(async () => ({
      decision: await this.analysis.agents.answer(
        String(body?.sid),
        String(body?.requestId),
        !!body?.allow,
        body?.message ?? '',
        body?.answers,
        body?.scope === 'session' ? 'session' : 'once',
      ),
    }));
  }
}
