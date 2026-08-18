import { Inject, Injectable } from '@nestjs/common';
import { SessionsRepository, SessionRow } from './sessions.repository';
import { WorkspaceService } from '../workspace/workspace.service';

export interface SessionError extends Error {
  code: 'unknown_project' | 'missing_workspace';
}

/**
 * Combines persistent session metadata (SQLite, via SessionsRepository) with
 * workspace resolution so the rest of the app deals with a single per-chat
 * "session" concept. Port of claude/session-manager.js.
 */
@Injectable()
export class SessionManager {
  constructor(
    @Inject(SessionsRepository) private readonly store: SessionsRepository,
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService
  ) {}

  getOrCreate(chatId: number, telegramUserId: number): SessionRow | undefined {
    return this.store.ensureSession(chatId, telegramUserId);
  }

  get(chatId: number): SessionRow | undefined {
    return this.store.getSession(chatId);
  }

  /**
   * Switches the active project for a chat. Always drops any previously
   * recorded Claude session id so a new project never inherits another
   * project's conversation context.
   * Throws an Error with `.code` set to 'unknown_project' or 'missing_workspace'.
   */
  selectProject(chatId: number, telegramUserId: number, projectName: string): SessionRow | undefined {
    const name = String(projectName || '').toLowerCase();
    const validation = this.workspaces.validate(name);
    if (!validation.ok) {
      const err = new Error(`Invalid project "${projectName}" (${validation.reason})`) as SessionError;
      err.code = validation.reason;
      throw err;
    }
    return this.store.setProject(chatId, telegramUserId, name, validation.dir);
  }

  /** Drops the Claude session id, keeping the current project/workspace. */
  reset(chatId: number): void {
    this.store.clearClaudeSession(chatId);
  }

  recordClaudeSessionId(chatId: number, claudeSessionId: string | null | undefined): void {
    if (claudeSessionId) {
      this.store.setClaudeSessionId(chatId, claudeSessionId);
    }
  }
}
