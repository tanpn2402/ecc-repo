const LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

function format(level: string, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] [${level}] ${msg}${metaStr}`;
}

export function info(msg: string, meta?: Record<string, unknown>): void {
  console.log(format('INFO', msg, meta));
}

export function warn(msg: string, meta?: Record<string, unknown>): void {
  console.warn(format('WARN', msg, meta));
}

export function error(msg: string, meta?: Record<string, unknown>): void {
  console.error(format('ERROR', msg, meta));
}

export function debug(msg: string, meta?: Record<string, unknown>): void {
  if (process.env.LOG_LEVEL === 'DEBUG') {
    console.log(format('DEBUG', msg, meta));
  }
}

export default { info, warn, error, debug, LEVELS };
