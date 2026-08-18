import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

export type WorkspaceValidation =
  | { ok: true; dir: string }
  | { ok: false; reason: 'unknown_project' }
  | { ok: false; reason: 'missing_workspace'; dir: string };

/**
 * Only names explicitly configured via WORKSPACE_<NAME> env vars are ever
 * valid. Telegram input can select among these names but can never supply a
 * raw path. Port of workspace/workspace-manager.js's WorkspaceManager class,
 * now DI-provided instead of manually `new`'d in index.js.
 */
@Injectable()
export class WorkspaceService {
  readonly workspaces: Map<string, string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.workspaces = config.workspaces;
  }

  list(): string[] {
    return [...this.workspaces.keys()].sort();
  }

  has(name: string | null | undefined): boolean {
    if (!name) return false;
    return this.workspaces.has(String(name).toLowerCase());
  }

  getPath(name: string | null | undefined): string | null {
    if (!this.has(name)) return null;
    return this.workspaces.get(String(name).toLowerCase()) ?? null;
  }

  /** Verifies the configured directory actually exists on disk. */
  validate(name: string | null | undefined): WorkspaceValidation {
    const dir = this.getPath(name);
    if (!dir) {
      return { ok: false, reason: 'unknown_project' };
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { ok: false, reason: 'missing_workspace', dir };
    }
    return { ok: true, dir };
  }

  /** Directory inside the workspace where uploaded files are stored. */
  uploadsDir(name: string): string | null {
    const dir = this.getPath(name);
    if (!dir) return null;
    return path.join(dir, '.tmp');
  }

  ensureUploadsDir(name: string): string | null {
    const dir = this.uploadsDir(name);
    if (!dir) return null;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Builds a safe destination path for an uploaded file, guaranteed to stay
   * inside the workspace's .tmp directory. The original filename is
   * sanitized but a random prefix is used to avoid collisions/traversal.
   */
  safeUploadPath(name: string, originalFilename: string): string | null {
    const dir = this.ensureUploadsDir(name);
    if (!dir) return null;
    const base = path.basename(originalFilename || 'file');
    const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';
    const prefix = crypto.randomBytes(6).toString('hex');
    const finalName = `${prefix}_${sanitized}`;
    const fullPath = path.join(dir, finalName);

    // Defensive check: resolved path must remain within the uploads directory.
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
      throw new Error('Resolved upload path escapes uploads directory');
    }
    return resolved;
  }

  /** Writes downloaded file content into the workspace's uploads dir. Returns the absolute path. */
  writeUpload(name: string, originalFilename: string, buffer: Buffer): string | null {
    const dest = this.safeUploadPath(name, originalFilename);
    if (!dest) return null;
    fs.writeFileSync(dest, buffer);
    return dest;
  }
}
