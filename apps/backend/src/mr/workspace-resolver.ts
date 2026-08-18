import { execFileSync } from 'node:child_process';
import logger from '../common/logger';

export interface WorkspaceManagerLike {
  list(): Iterable<string>;
  getPath(name: string): string;
}

interface WorkspaceInfo {
  name: string;
  remoteProject: string | null;
}

/**
 * Resolves which configured workspace directory (from WorkspaceManager)
 * corresponds to a given GitLab "namespace/project" path, by comparing it
 * against each workspace's own `git remote get-url origin`. This lets an MR
 * review run inside the actual checked-out repository (so Claude can read
 * real code, git history, etc.) instead of introducing a second, parallel
 * "MR_REVIEW_WORKSPACE"-only path map.
 *
 * Falls back to `defaultReviewWorkspace` (MR_REVIEW_WORKSPACE env var) when
 * no configured workspace's remote matches.
 */
export class MrWorkspaceResolver {
  workspaceManager: WorkspaceManagerLike;
  defaultReviewWorkspace: string;
  _infoByDir: Map<string, WorkspaceInfo>; // dir -> { name, remoteProject: normalized "namespace/project" or null }

  constructor(workspaceManager: WorkspaceManagerLike, defaultReviewWorkspace?: string) {
    this.workspaceManager = workspaceManager;
    this.defaultReviewWorkspace = defaultReviewWorkspace || '';
    this._infoByDir = new Map();
    this._buildIndex();
  }

  _buildIndex(): void {
    for (const name of this.workspaceManager.list()) {
      const dir = this.workspaceManager.getPath(name);
      const remoteProject = this._readRemoteProjectPath(dir);
      this._infoByDir.set(dir, { name, remoteProject });
    }
  }

  _readRemoteProjectPath(dir: string): string | null {
    try {
      const out = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      })
        .toString()
        .trim();
      const match = out.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
      return match ? match[1].toLowerCase() : null;
    } catch (err: any) {
      logger.debug('No git remote for workspace (not a git checkout, or git unavailable)', { dir, error: err.message });
      return null;
    }
  }

  _findMatch(gitlabProjectPath: string): { dir: string; name: string } | null {
    const wanted = String(gitlabProjectPath || '').toLowerCase();
    for (const [dir, info] of this._infoByDir) {
      if (info.remoteProject && wanted.endsWith(info.remoteProject)) {
        return { dir, name: info.name };
      }
    }
    return null;
  }

  /** Returns an absolute workspace directory to use as cwd, or null if none is configured. */
  resolve(gitlabProjectPath: string): string | null {
    const match = this._findMatch(gitlabProjectPath);
    return match ? match.dir : this.defaultReviewWorkspace || null;
  }

  /**
   * Returns the WORKSPACE_<NAME> name backing this project's checkout (used
   * to look up a per-workspace REVIEW_SKILL_<NAME> override), or null when
   * falling back to MR_REVIEW_WORKSPACE, which has no name.
   */
  resolveName(gitlabProjectPath: string): string | null {
    const match = this._findMatch(gitlabProjectPath);
    return match ? match.name : null;
  }
}

export default MrWorkspaceResolver;
