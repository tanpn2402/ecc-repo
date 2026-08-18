// Authorization is based solely on numeric Telegram user IDs, never usernames,
// since usernames are user-editable and cannot be trusted for access control.

export interface UnauthorizedError extends Error {
  code: 'UNAUTHORIZED';
}

export function isAuthorized(allowedUsers: Set<number> | undefined | null, telegramUserId: unknown): boolean {
  if (!allowedUsers || allowedUsers.size === 0) return false;
  if (telegramUserId === undefined || telegramUserId === null) return false;
  return allowedUsers.has(Number(telegramUserId));
}

export function assertAuthorized(allowedUsers: Set<number> | undefined | null, telegramUserId: unknown): void {
  if (!isAuthorized(allowedUsers, telegramUserId)) {
    const err = new Error('Unauthorized Telegram user') as UnauthorizedError;
    err.code = 'UNAUTHORIZED';
    throw err;
  }
}
