import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Current branch of the git repository containing `dir`, read from .git/HEAD
 * (no git process). Detached HEAD returns the short commit; null when `dir`
 * is not inside a repository. Handles worktrees (.git file with gitdir:).
 */
export function gitBranch(dir: string): string | null {
  let d: string;
  try {
    d = fs.realpathSync(dir);
  } catch {
    return null;
  }
  for (;;) {
    const dotGit = path.join(d, '.git');
    if (fs.existsSync(dotGit)) return readHead(dotGit);
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}

/** True when `dir` itself is the root of a git checkout. */
export function isGitRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

function readHead(dotGit: string): string | null {
  try {
    let gitDir = dotGit;
    if (fs.statSync(dotGit).isFile()) {
      const m = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
      if (!m) return null;
      gitDir = path.resolve(path.dirname(dotGit), m[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return ref ? ref[1] : head.slice(0, 8);
  } catch {
    return null;
  }
}
