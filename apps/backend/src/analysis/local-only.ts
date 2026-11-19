import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * True when a request comes from this machine: loopback peer, no proxy hop
 * from elsewhere (X-Forwarded-For — ngrok and similar add it), and a local
 * Host header (a tunnel through the Vite dev server keeps the tunnel's host).
 */
export function isLocalRequest(remoteAddress: string | undefined, headers: Record<string, unknown>): boolean {
  if (!remoteAddress || !LOOPBACK.has(remoteAddress)) return false;
  const xff = String(headers['x-forwarded-for'] ?? '').trim();
  if (xff && xff.split(',').some((ip) => !LOOPBACK.has(ip.trim()))) return false;
  const host = String(headers['host'] ?? '').replace(/:\d+$/, '').toLowerCase();
  return LOCAL_HOSTS.has(host);
}

/**
 * The Analysis API lists folders and runs an agent on this machine: only
 * serve it to local clients unless ANALYSIS_ALLOW_REMOTE=true.
 */
@Injectable()
export class LocalOnlyGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.analysis.allowRemote) return true;
    const req = context.switchToHttp().getRequest();
    if (isLocalRequest(req.socket?.remoteAddress, req.headers ?? {})) return true;
    throw new ForbiddenException('The Analysis tab is only available from the machine running the backend (ANALYSIS_ALLOW_REMOTE).');
  }
}
