/**
 * Bash commands the agent may never run from the Analysis tab, even when the
 * user clicks Allow: they change or discard git state, or delete files. The
 * agent works in the user's real checkout.
 */
const BLOCKED: Array<[RegExp, string]> = [
  [/\bgit\s+push\b/, 'git push'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\b/, 'git clean'],
  [/\bgit\s+(checkout|switch|restore)\b/, 'changing the checked-out branch or files'],
  [/\bgit\s+(rebase|merge|cherry-pick|revert|commit|stash|branch\s+-[dD])\b/, 'changing git history'],
  [/\brm\s+(-\w*[rf]\w*\s+)/, 'rm -r / rm -f'],
  [/\b(sudo|mkfs|dd\s+if=|shutdown|reboot)\b/, 'system commands'],
];

/** Returns why the command is blocked, or null when it may be asked about / run. */
export function blockedBashReason(command: unknown): string | null {
  const cmd = String(command ?? '');
  for (const [re, what] of BLOCKED) {
    if (re.test(cmd)) return `Blocked in the Analysis tab: ${what}. Ask the user to run it themselves if needed.`;
  }
  return null;
}
