import type { AppConfig } from "./configuration";

/** Port of index.js's validateStartupConfig — throws before anything starts if misconfigured. */
export function validateStartupConfig(
  config: AppConfig,
  errLog: (msg: string) => void = console.error,
  wrnLog: (msg: string) => void = console.warn,
): void {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!config.telegram.botToken) warnings.push("TELEGRAM_BOT_TOKEN is not set");
  if (config.telegram.allowedUsers.size === 0)
    problems.push(
      "TELEGRAM_ALLOWED_USERS is empty — no one would be able to use the bot",
    );
  if (config.workspaces.size === 0)
    problems.push("No WORKSPACE_<NAME> variables are configured");
  if (warnings.length) {
    for (const w of warnings) wrnLog(`Configuration warning: ${w}`);
  }
  if (problems.length) {
    for (const p of problems) errLog(`Configuration error: ${p}`);
    throw new Error("Invalid configuration, see errors above");
  }
}
