import 'reflect-metadata';
import 'dotenv/config';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { loadConfig } from './config/configuration';
import { validateStartupConfig } from './config/config.validation';
import { AppModule } from './app.module';
import logger from './common/logger';

function checkClaudeAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(command, ['--version'], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        logger.error(
          'Claude Code CLI is not available. Prompts will fail until this is fixed.',
          {
            command,
            error: err.message,
          },
        );
        resolve(false);
      } else {
        logger.info('Claude Code CLI detected', {
          command,
          version: stdout.trim(),
        });
        resolve(true);
      }
    });
  });
}

function checkWorkspaces(workspaces: Map<string, string>): void {
  for (const [name, dir] of workspaces) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      logger.warn('Configured workspace directory does not exist yet', {
        project: name,
        dir,
      });
    }
  }
}

async function bootstrap() {
  // Config is loaded and validated once, synchronously, before NestFactory
  // even runs — matching index.js's main() ordering exactly (fail fast,
  // never start Telegram polling or the HTTP server on bad configuration).
  const config = loadConfig();
  validateStartupConfig(config);

  logger.info('Starting Telegram Claude Gateway', {
    workspaces: [...config.workspaces.keys()],
    allowedUserCount: config.telegram.allowedUsers.size,
    permissionMode: config.claude.permissionMode,
  });

  await checkClaudeAvailable(config.claude.command);
  checkWorkspaces(config.workspaces);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    {
      logger: ['log', 'error', 'warn', 'debug'],
    },
  );

  // Keeps the WebSocket transport as plain `ws` (mounted on the shared HTTP
  // server at /ws via MrGateway) instead of Nest's socket.io default.
  app.useWebSocketAdapter(new WsAdapter(app));

  logger.info('Initialized WebSocket adapter', {
    path: '/ws',
    transport: 'ws',
  });

  // Serves apps/webapps/dist if a production build exists (same check as
  // the pre-migration http/app.js), with a SPA fallback for client routes
  // like /mrs/:id. In dev, the Vite dev server serves the frontend instead
  // (see apps/webapps/vite.config.ts's proxy) — this process may run with
  // no build present yet, exactly as before.
  const webappsDistDir = path.resolve(__dirname, '../../web/dist');
  logger.info('Checking for webapps build', { expected: webappsDistDir });

  const hasWebappsBuild = fs.existsSync(
    path.join(webappsDistDir, 'index.html'),
  );

  if (hasWebappsBuild) {
    app.useStaticAssets(webappsDistDir, { maxAge: '1h', index: false });
  } else {
    logger.warn(
      'No webapps build found, frontend will not be served from this process',
      { expected: webappsDistDir },
    );
  }

  app
    .getHttpAdapter()
    .getInstance()
    .get('/{*splat}', (req: any, res: any, next: any) => {
      if (req.path.startsWith('/api/')) return next();
      if (!hasWebappsBuild) return next();
      res.sendFile(
        path.join(webappsDistDir, 'index.html'),
        (err: Error) => err && next(err),
      );
    });

  process.on('unhandledRejection', (err: any) => {
    logger.error('Unhandled promise rejection', {
      error: err?.stack || String(err),
    });
  });

  app.enableShutdownHooks();

  await app.listen(config.http.port);
  logger.info('ECC server listening', {
    port: config.http.port,
    websocket: config.websocket.enabled,
  });
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error', { error: err.stack || err.message });
  process.exit(1);
});
