import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { gitBranch, isGitRoot } from '../common/git-branch';

const MAX_ENTRIES = 500;

export class FsError extends Error {}

export interface DirEntry {
  name: string;
  path: string;
  git: boolean;
  branch: string | null;
}

export interface DirListing {
  path: string | null;
  parent: string | null;
  roots: string[];
  git: boolean;
  branch: string | null;
  dirs: DirEntry[];
  truncated: boolean;
}

/**
 * Folder picker backend (port of swing-probe fsdirs.py): lists sub-folder
 * NAMES inside ANALYSIS_ROOTS — never files or contents. Paths are resolved
 * (realpath) and must stay inside a root; `..` is refused and symlinks that
 * leave the roots are hidden.
 */
@Injectable()
export class FsDirsService {
  readonly roots: string[];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.roots = config.analysis.roots
      .map((r) => {
        try {
          return fs.realpathSync(r);
        } catch {
          return null;
        }
      })
      .filter((r): r is string => !!r && fs.statSync(r).isDirectory());
  }

  inside(p: string): boolean {
    return this.roots.some((r) => p === r || p.startsWith(r.endsWith(path.sep) ? r : r + path.sep));
  }

  /** Absolute, existing folder inside the roots -> its real path; FsError otherwise. */
  checkDir(p: string): string {
    if (!p || !path.isAbsolute(p)) throw new FsError('Give an absolute folder path');
    if (p.split(/[\\/]/).includes('..')) throw new FsError("'..' is not allowed");
    let real: string;
    try {
      real = fs.realpathSync(p);
    } catch {
      throw new FsError(`${p} does not exist`);
    }
    if (!this.inside(real)) {
      throw new FsError(`${p} is outside the allowed roots (ANALYSIS_ROOTS): ${this.roots.join(', ') || 'none'}`);
    }
    if (!fs.statSync(real).isDirectory()) throw new FsError(`${p} is not a folder`);
    return real;
  }

  list(p?: string, hidden = false): DirListing {
    if (!p) {
      return {
        path: null,
        parent: null,
        roots: this.roots,
        git: false,
        branch: null,
        dirs: this.roots.map((r) => ({ name: r, path: r, git: isGitRoot(r), branch: isGitRoot(r) ? gitBranch(r) : null })),
        truncated: false,
      };
    }
    const real = this.checkDir(p);
    let names: string[];
    try {
      names = fs.readdirSync(real).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    } catch {
      throw new FsError(`No permission to read ${real}`);
    }
    const dirs: DirEntry[] = [];
    for (const name of names) {
      if (!hidden && name.startsWith('.')) continue;
      const full = path.join(real, name);
      try {
        if (!fs.statSync(full).isDirectory()) continue;
        if (fs.lstatSync(full).isSymbolicLink() && !this.inside(fs.realpathSync(full))) continue;
      } catch {
        continue;
      }
      const git = isGitRoot(full);
      dirs.push({ name, path: full, git, branch: git ? gitBranch(full) : null });
      if (dirs.length >= MAX_ENTRIES) break;
    }
    const parent = path.dirname(real);
    return {
      path: real,
      parent: parent !== real && this.inside(parent) ? parent : null,
      roots: this.roots,
      git: isGitRoot(real),
      branch: gitBranch(real),
      dirs,
      truncated: dirs.length >= MAX_ENTRIES,
    };
  }
}
