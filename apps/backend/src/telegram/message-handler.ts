import { Inject, Injectable } from '@nestjs/common';
import logger from '../common/logger';
import { isAuthorized } from '../security/authorization';
import { StreamingReply } from './streaming-reply';
import { TelegramApi } from './telegram-api';
import { SessionManager } from './session-manager';
import { WorkspaceService } from '../workspace/workspace.service';
import { ClaudeClient } from '../claude/claude-client';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

const START_TEXT = `Claude Agent Gateway

Available commands:

/projects
/project <name>
/status
/new
/reset
/stop
/help

Send any normal message to Claude Code.`;

const HELP_TEXT = `Claude Agent Gateway — command reference

/start            Show the welcome message
/help             Show this help
/projects         List configured projects/workspaces
/project          Show the currently selected project
/project <name>   Switch to the given project's workspace
/status           Show current project, workspace, and Claude session state
/new              Start a brand new Claude conversation for the current project
/reset            Clear the current Claude conversation (keeps the project)
/stop             Stop the Claude process currently running for this chat

Anything else you type is sent directly to Claude Code, running in the
workspace of your currently selected project.`;

/** Parses "/command arg1 arg2" into { command, args }. Returns null for non-commands. */
export function parseCommand(text: unknown): { command: string; args: string[] } | null {
  if (typeof text !== 'string' || !text.startsWith('/')) return null;
  const parts = text.trim().split(/\s+/);
  const command = parts[0].slice(1).split('@')[0].toLowerCase();
  if (!command) return null;
  return { command, args: parts.slice(1) };
}

/**
 * The core Telegram command/prompt dispatcher — authorization gate, command
 * parsing/routing, file-upload handling, and driving Claude runs via
 * StreamingReply. Port of telegram/message-handler.js's createMessageHandler
 * factory, now a Nest-injectable service (TelegramService calls
 * handleUpdate() from its UpdateHandler callback).
 */
@Injectable()
export class MessageHandlerService {
  constructor(
    @Inject(TelegramApi) private readonly api: TelegramApi,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionManager) private readonly sessionManager: SessionManager,
    @Inject(WorkspaceService) private readonly workspaceManager: WorkspaceService,
    @Inject(ClaudeClient) private readonly claudeClient: ClaudeClient
  ) {}

  async handleUpdate(update: any): Promise<void> {
    const message = update.message;
    if (!message) return; // ignore edited_message, callback_query, etc.

    const chatId = message.chat.id;
    const userId = message.from?.id;

    if (!isAuthorized(this.config.telegram.allowedUsers, userId)) {
      logger.warn('Rejected unauthorized Telegram user', { chatId, userId });
      await this.safeSend(chatId, '🚫 You are not authorized to use this bot.');
      return;
    }

    this.sessionManager.getOrCreate(chatId, userId);
    logger.info('Telegram update received', { chatId, userId });

    try {
      if (typeof message.text === 'string' && message.text.startsWith('/')) {
        await this.handleCommand(message, chatId, userId);
      } else if (message.document) {
        await this.handleDocument(message, chatId, userId);
      } else if (message.photo?.length) {
        await this.handlePhoto(message, chatId, userId);
      } else if (typeof message.text === 'string' && message.text.trim()) {
        await this.handlePrompt(chatId, userId, message.text);
      }
      // Other message kinds (stickers, voice, etc.) are silently ignored.
    } catch (err: any) {
      logger.error('Unhandled error processing update', { chatId, userId, error: err.stack || err.message });
      await this.safeSend(chatId, '⚠️ An unexpected error occurred. Please try again.');
    }
  }

  private async handleCommand(message: any, chatId: number, userId: number): Promise<any> {
    const parsed = parseCommand(message.text)!;
    const { command, args } = parsed;

    switch (command) {
      case 'start':
        return this.safeSend(chatId, START_TEXT);

      case 'help':
        return this.safeSend(chatId, HELP_TEXT);

      case 'projects': {
        const names = this.workspaceManager.list();
        const body = names.length ? names.map((n) => `• ${n}`).join('\n') : '(no projects configured)';
        return this.safeSend(chatId, `Available projects:\n\n${body}`);
      }

      case 'project':
        return this.handleProjectCommand(chatId, userId, args);

      case 'status':
        return this.handleStatusCommand(chatId);

      case 'new':
        return this.handleNewCommand(chatId);

      case 'reset':
        return this.handleResetCommand(chatId);

      case 'stop': {
        const wasRunning = this.claudeClient.stop(chatId);
        return this.safeSend(
          chatId,
          wasRunning ? '🛑 Stopped the running Claude process.' : 'No Claude process is currently running for this chat.'
        );
      }

      default:
        return this.safeSend(chatId, `Unknown command: /${command}. Send /help to see available commands.`);
    }
  }

  private async handleProjectCommand(chatId: number, userId: number, args: string[]): Promise<any> {
    const session = this.sessionManager.get(chatId);

    if (args.length === 0) {
      if (session?.project) {
        return this.safeSend(chatId, `Current project: ${session.project}\nWorkspace: ${session.workspace}`);
      }
      return this.safeSend(chatId, 'No project selected yet. Use /projects to see options, then /project <name>.');
    }

    const requested = args[0];
    try {
      const updated = this.sessionManager.selectProject(chatId, userId, requested)!;
      return this.safeSend(chatId, `Project switched to: ${updated.project}\nWorkspace: ${updated.workspace}`);
    } catch (err: any) {
      if (err.code === 'unknown_project') {
        const names = this.workspaceManager.list();
        return this.safeSend(
          chatId,
          `Unknown project: "${requested}".\nAvailable projects: ${names.join(', ') || '(none configured)'}`
        );
      }
      if (err.code === 'missing_workspace') {
        logger.error('Configured workspace directory missing on disk', { project: requested });
        return this.safeSend(chatId, `Project "${requested}" is misconfigured on the server. Contact the administrator.`);
      }
      throw err;
    }
  }

  private async handleStatusCommand(chatId: number): Promise<any> {
    const session = this.sessionManager.get(chatId);
    if (!session?.project) {
      return this.safeSend(chatId, 'Project: (none selected)\nUse /projects then /project <name>.');
    }
    const lines = [
      `Project: ${session.project}`,
      `Workspace: ${session.workspace}`,
      `Claude session: ${session.claudeSessionId ? 'active' : 'none'}`,
      `Claude process: ${this.claudeClient.isRunning(chatId) ? 'running' : 'not running'}`,
    ];
    return this.safeSend(chatId, lines.join('\n'));
  }

  private async handleNewCommand(chatId: number): Promise<any> {
    const session = this.sessionManager.get(chatId);
    if (!session?.project) {
      return this.safeSend(chatId, 'No project selected yet. Use /projects then /project <name>.');
    }
    this.sessionManager.reset(chatId);
    return this.safeSend(chatId, `Started a new Claude conversation for project: ${session.project}`);
  }

  private async handleResetCommand(chatId: number): Promise<any> {
    const session = this.sessionManager.get(chatId);
    this.sessionManager.reset(chatId);
    return this.safeSend(chatId, session?.project ? `Session reset for project: ${session.project}` : 'Session reset.');
  }

  private async handleDocument(message: any, chatId: number, userId: number): Promise<void> {
    const doc = message.document;
    await this.receiveUpload(chatId, userId, {
      fileId: doc.file_id,
      fileName: doc.file_name || 'file',
      fileSize: doc.file_size,
      caption: message.caption,
    });
  }

  private async handlePhoto(message: any, chatId: number, userId: number): Promise<void> {
    const largest = message.photo[message.photo.length - 1];
    await this.receiveUpload(chatId, userId, {
      fileId: largest.file_id,
      fileName: 'photo.jpg',
      fileSize: largest.file_size,
      caption: message.caption,
    });
  }

  private async receiveUpload(
    chatId: number,
    userId: number,
    { fileId, fileName, fileSize, caption }: { fileId: string; fileName: string; fileSize?: number; caption?: string }
  ): Promise<any> {
    const session = this.sessionManager.get(chatId);
    if (!session?.project) {
      return this.safeSend(chatId, 'Select a project first with /project <name> before sending files.');
    }

    if (fileSize && fileSize > this.config.uploads.maxBytes) {
      return this.safeSend(
        chatId,
        `File too large (${Math.round(fileSize / 1024)} KB). Limit is ${Math.round(this.config.uploads.maxBytes / 1024)} KB.`
      );
    }

    await this.api.sendChatAction(chatId, 'upload_document');
    let savedPath: string | null;
    try {
      const fileInfo = await this.api.getFile(fileId);
      const buffer = await this.api.downloadFile(fileInfo.file_path);
      if (buffer.length > this.config.uploads.maxBytes) {
        return this.safeSend(chatId, 'File too large after download. Rejected.');
      }
      savedPath = this.workspaceManager.writeUpload(session.project!, fileName, buffer);
    } catch (err: any) {
      logger.error('Failed to download Telegram file', { chatId, error: err.message });
      return this.safeSend(chatId, '⚠️ Failed to download the file from Telegram.');
    }

    const relPath = `.tmp/${savedPath!.split('/').pop()}`;
    logger.info('Stored uploaded file', { chatId, project: session.project, relPath });

    const captionPart = caption ? `\n\nUser's note about the file: ${caption}` : '';
    const prompt = `Attached file(s) at "${relPath}" (relative to the project root). Please inspect it using your normal tools as appropriate.${captionPart}`;

    return this.handlePrompt(chatId, userId, prompt);
  }

  private async handlePrompt(chatId: number, userId: number, promptText: string): Promise<void> {
    const session = this.sessionManager.get(chatId);
    if (!session?.project) {
      await this.safeSend(chatId, 'Select a project first: /projects then /project <name>.');
      return;
    }

    const reply = new StreamingReply(this.api, chatId, { editIntervalMs: this.config.telegram.editIntervalMs });
    const initialText = this.claudeClient.isRunning(chatId)
      ? '⏳ Queued — will start once the current task finishes...'
      : '🤖 Claude is working...';
    await reply.start(initialText);

    let resolvedSessionId = session.claudeSessionId;

    try {
      const result = await this.claudeClient.run(
        chatId,
        { cwd: session.workspace!, prompt: promptText, resumeSessionId: session.claudeSessionId },
        {
          onEvent: (evt: any) => {
            if (evt.kind === 'text_delta') reply.addTextDelta(evt.text);
            else if (evt.kind === 'tool_use') reply.noteToolUse(evt.name);
            else if (evt.kind === 'init') resolvedSessionId = evt.sessionId;
          },
        }
      );

      const finalSessionId = result.sessionId || resolvedSessionId;
      if (finalSessionId) this.sessionManager.recordClaudeSessionId(chatId, finalSessionId);

      logger.info('Claude process finished', {
        chatId,
        project: session.project,
        sessionId: finalSessionId,
        isError: result.isError,
      });

      await reply.finish(result.text, { isError: result.isError });
    } catch (err: any) {
      logger.error('Claude invocation failed', { chatId, project: session.project, error: err.stack || err.message });
      await reply.fail('Claude Code is unavailable right now. Please try again later or contact the administrator.');
    }
  }

  private async safeSend(chatId: number, text: string): Promise<void> {
    try {
      await this.api.sendMessage(chatId, text);
    } catch (err: any) {
      logger.error('Failed to send Telegram message', { chatId, error: err.message });
    }
  }
}
