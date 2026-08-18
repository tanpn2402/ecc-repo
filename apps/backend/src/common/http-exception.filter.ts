import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import logger from './logger';

/**
 * Forces every error response into the exact `{ error: string, code?: string }`
 * shape the pre-migration Express app used (see http/app.js) — the frontend
 * (apps/webapps/src/lib/api.ts's request()) reads `body.error` as a plain
 * string, so Nest's default `{statusCode, message, error}` shape would
 * silently break every error toast/message in the UI.
 *
 * Every route handler throws `new HttpException({ error, code? }, status)`
 * directly, so in the common case this filter just passes that body through
 * unchanged. It only needs to reshape the response for anything unexpected
 * that reaches here with Nest's default exception body (there shouldn't be
 * any in practice, but this is the safety net) or an uncaught non-HTTP
 * error (mapped to the same generic 500 the old app.js's error middleware
 * produced: { error: 'Internal server error' }).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ path?: string; url?: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)) {
        response.status(status).json(body);
        return;
      }
      const message = typeof body === 'string' ? body : (exception as any).message || 'Request failed';
      response.status(status).json({ error: message });
      return;
    }

    const err = exception as Error;
    logger.error('HTTP request error', { error: err?.stack || String(exception), path: request?.path || request?.url });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
  }
}
