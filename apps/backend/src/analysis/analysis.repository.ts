import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE_DB, type DrizzleDb } from '@/db/database.provider';
import { analysisThreadJira, analysisThreads, analysisWorkspaces } from '@/db/schema';
import type { AgentSessionMeta } from '../agent/agent-session';
import type { AgentSessionStore } from '../agent/agent-session-manager';

export type WorkspaceRow = typeof analysisWorkspaces.$inferSelect;
export type ThreadRow = typeof analysisThreads.$inferSelect;

const now = () => new Date().toISOString();

function rowToMeta(r: ThreadRow): AgentSessionMeta {
  return {
    sessionId: r.sessionId,
    cwd: r.cwd,
    addDirs: JSON.parse(r.addDirsJson || '[]'),
    model: r.model,
    title: r.title,
    started: r.started,
    turns: r.turns,
    costUsd: r.costUsd,
    eventSeq: r.eventSeq,
    lastBranch: r.lastBranch,
    lastOwnActivity: r.lastOwnActivity,
    turnEntryCount: r.turnEntryCount,
  };
}

/** Workspaces, threads and their Jira keys; also the AgentSessionStore of the agent manager. */
@Injectable()
export class AnalysisRepository implements AgentSessionStore {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  // ---------------------------------------------------------------- workspaces

  listWorkspaces(): WorkspaceRow[] {
    return this.db.select().from(analysisWorkspaces).orderBy(desc(analysisWorkspaces.updatedAt)).all();
  }

  getWorkspace(id: number): WorkspaceRow | null {
    return this.db.select().from(analysisWorkspaces).where(eq(analysisWorkspaces.id, id)).get() ?? null;
  }

  createWorkspace(input: { name: string; path: string; contextMd?: string }): WorkspaceRow {
    const t = now();
    return this.db
      .insert(analysisWorkspaces)
      .values({ name: input.name, path: input.path, contextMd: input.contextMd ?? '', createdAt: t, updatedAt: t })
      .returning()
      .get();
  }

  updateWorkspace(id: number, patch: Partial<Pick<WorkspaceRow, 'name' | 'path' | 'contextMd'>>): WorkspaceRow | null {
    this.db.update(analysisWorkspaces).set({ ...patch, updatedAt: now() }).where(eq(analysisWorkspaces.id, id)).run();
    return this.getWorkspace(id);
  }

  touchWorkspace(id: number): void {
    this.db.update(analysisWorkspaces).set({ updatedAt: now() }).where(eq(analysisWorkspaces.id, id)).run();
  }

  deleteWorkspace(id: number): void {
    this.db.delete(analysisWorkspaces).where(eq(analysisWorkspaces.id, id)).run();
  }

  // ---------------------------------------------------------------- threads

  listThreads(workspaceId: number): ThreadRow[] {
    return this.db
      .select()
      .from(analysisThreads)
      .where(eq(analysisThreads.workspaceId, workspaceId))
      .orderBy(desc(analysisThreads.updatedAt))
      .all();
  }

  getThread(sessionId: string): ThreadRow | null {
    return this.db.select().from(analysisThreads).where(eq(analysisThreads.sessionId, sessionId)).get() ?? null;
  }

  createThread(input: { sessionId: string; workspaceId: number; cwd: string; addDirs: string[]; model: string }): ThreadRow {
    const t = now();
    return this.db
      .insert(analysisThreads)
      .values({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        cwd: input.cwd,
        addDirsJson: JSON.stringify(input.addDirs),
        model: input.model,
        createdAt: t,
        updatedAt: t,
      })
      .returning()
      .get();
  }

  deleteThread(sessionId: string): void {
    this.db.delete(analysisThreadJira).where(eq(analysisThreadJira.sessionId, sessionId)).run();
    this.db.delete(analysisThreads).where(eq(analysisThreads.sessionId, sessionId)).run();
  }

  // ---------------------------------------------------------------- AgentSessionStore

  load(sessionId: string): AgentSessionMeta | null {
    const row = this.getThread(sessionId);
    return row ? rowToMeta(row) : null;
  }

  save(meta: AgentSessionMeta): void {
    this.db
      .update(analysisThreads)
      .set({
        cwd: meta.cwd,
        addDirsJson: JSON.stringify(meta.addDirs),
        model: meta.model,
        title: meta.title,
        started: meta.started,
        turns: meta.turns,
        costUsd: meta.costUsd,
        eventSeq: meta.eventSeq,
        lastBranch: meta.lastBranch,
        lastOwnActivity: meta.lastOwnActivity,
        turnEntryCount: meta.turnEntryCount,
        updatedAt: now(),
      })
      .where(eq(analysisThreads.sessionId, meta.sessionId))
      .run();
  }

  // ---------------------------------------------------------------- Jira keys

  addJiraKey(sessionId: string, jiraKey: string): void {
    this.db.insert(analysisThreadJira).values({ sessionId, jiraKey, createdAt: now() }).onConflictDoNothing().run();
  }

  jiraKeys(sessionId: string): string[] {
    return this.db
      .select({ key: analysisThreadJira.jiraKey })
      .from(analysisThreadJira)
      .where(eq(analysisThreadJira.sessionId, sessionId))
      .orderBy(analysisThreadJira.createdAt)
      .all()
      .map((r) => r.key);
  }

  hasJiraKey(sessionId: string, jiraKey: string): boolean {
    return !!this.db
      .select()
      .from(analysisThreadJira)
      .where(and(eq(analysisThreadJira.sessionId, sessionId), eq(analysisThreadJira.jiraKey, jiraKey)))
      .get();
  }
}
