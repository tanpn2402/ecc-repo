import logger from '@/common/logger';
import * as path from 'node:path';

const PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
]);

export interface AppConfig {
  app: {
    env: string;
    isProduction: boolean;
  };
  telegram: {
    enabled: boolean;
    botToken: string;
    allowedUsers: Set<number>;
    editIntervalMs: number;
  };
  claude: {
    command: string;
    timeoutMs: number;
    permissionMode: string;
    model: string;
  };
  workspaces: Map<string, string>;
  storage: {
    databasePath: string;
  };
  uploads: {
    maxBytes: number;
  };
  http: {
    port: number;
  };
  websocket: {
    enabled: boolean;
  };
  mr: {
    gitlabAllowedHosts: Set<string>;
    jiraBaseUrl: string;
    defaultReviewWorkspace: string;
    maxConcurrentReviews: number;
    reviewSkills: Map<string, string>;
    defaultReviewSkill: string;
    gitlabToken: string;
    jiraEmail: string;
    jiraApiToken: string;
    autoReviewOnCreate: boolean;
  };
  jiraIssuesPage: {
    jiraProject: string;
    jiraGroups: { id: string; name: string }[];
  };
  gitlabActivities: {
    baseUrl: string;
    users: { id: number; name: string }[];
    activityTypes: { key: string; label: string }[];
  };
}

function parseAllowedUsers(raw: string | undefined): Set<number> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = Number(s);
        if (!Number.isInteger(n)) {
          throw new Error(
            `TELEGRAM_ALLOWED_USERS contains a non-numeric id: "${s}"`,
          );
        }
        return n;
      }),
  );
}

function parseWorkspaces(env: NodeJS.ProcessEnv): Map<string, string> {
  const prefix = 'WORKSPACE_';
  const workspaces = new Map<string, string>();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix) || !value) continue;
    const name = key.slice(prefix.length).toLowerCase();
    if (!name) continue;
    workspaces.set(name, path.resolve(value));
  }
  return workspaces;
}

function parseReviewSkills(env: NodeJS.ProcessEnv): Map<string, string> {
  const prefix = 'REVIEW_SKILL_';
  const skills = new Map<string, string>();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix) || !value) continue;
    const name = key.slice(prefix.length).toLowerCase();
    if (!name) continue;
    skills.set(name, value);
  }
  return skills;
}

function parseAllowedHosts(raw: string | undefined): Set<string> {
  const set = new Set(
    String(raw || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (set.size === 0) set.add('gitlab.tx-tech.com');
  return set;
}

const DEFAULT_GITLAB_ACTIVITY_TYPES = [
  { key: 'commit', label: 'Commit' },
  { key: 'merge_request', label: 'Merge Request' },
  { key: 'issue', label: 'Issue' },
  { key: 'comment', label: 'Comment' },
];

function parseGitlabActivityUsers(
  raw: string | undefined,
): { id: number; name: string }[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx === -1) {
        throw new Error(
          `GITLAB_ACTIVITY_USERS entry "${entry}" must be in "userId:Name" format`,
        );
      }
      const idPart = entry.slice(0, idx).trim();
      const name = entry.slice(idx + 1).trim();
      const id = Number(idPart);
      if (!Number.isInteger(id)) {
        throw new Error(
          `GITLAB_ACTIVITY_USERS contains a non-numeric id: "${idPart}"`,
        );
      }
      if (!name) {
        throw new Error(
          `GITLAB_ACTIVITY_USERS entry "${entry}" is missing a display name`,
        );
      }
      return { id, name };
    });
}

function parseGitlabActivityTypes(
  raw: string | undefined,
): { key: string; label: string }[] {
  if (!raw) return DEFAULT_GITLAB_ACTIVITY_TYPES;
  const types = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      const key = (idx === -1 ? entry : entry.slice(0, idx))
        .trim()
        .toLowerCase();
      const label = idx === -1 ? entry.trim() : entry.slice(idx + 1).trim();
      return { key, label: label || key };
    });
  return types.length ? types : DEFAULT_GITLAB_ACTIVITY_TYPES;
}

function parseJiraGroups(
  raw: string | undefined,
): { id: string; name: string }[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx === -1) {
        throw new Error(
          `JIRA_GROUPS entry "${entry}" must be in "groupId:Name" format`,
        );
      }
      const id = entry.slice(0, idx).trim();
      const name = entry.slice(idx + 1).trim();
      if (!name) {
        throw new Error(
          `JIRA_GROUPS entry "${entry}" is missing a display name`,
        );
      }
      return { id, name };
    });
}

function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN || '';
  const allowedUsers = parseAllowedUsers(env.TELEGRAM_ALLOWED_USERS);
  const workspaces = parseWorkspaces(env);

  const permissionMode = env.CLAUDE_PERMISSION_MODE || 'bypassPermissions';
  if (!PERMISSION_MODES.has(permissionMode)) {
    throw new Error(
      `Invalid CLAUDE_PERMISSION_MODE "${permissionMode}". Must be one of: ${[...PERMISSION_MODES].join(', ')}`,
    );
  }

  const nodeEnv = env.NODE_ENV || 'development';
  logger.info(`NODE_ENV = ${nodeEnv}`);

  return {
    app: {
      env: nodeEnv,
      isProduction: nodeEnv === 'production',
    },
    telegram: {
      enabled: String(botToken).trim().length > 0,
      botToken,
      allowedUsers,
      editIntervalMs: Number(env.TELEGRAM_EDIT_INTERVAL_MS || 1000),
    },
    claude: {
      command: env.CLAUDE_COMMAND || 'claude',
      timeoutMs: Number(env.CLAUDE_TIMEOUT_MS || 1800000),
      permissionMode,
      model: env.CLAUDE_MODEL || '',
    },
    workspaces,
    storage: {
      databasePath: env.DATABASE_PATH || './data/gateway.db',
    },
    uploads: {
      maxBytes: Number(env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024),
    },
    http: {
      port: Number(env.HTTP_PORT || 3000),
    },
    websocket: {
      enabled:
        String(env.WEBSOCKET_ENABLED ?? 'true').toLowerCase() !== 'false',
    },
    mr: {
      gitlabAllowedHosts: parseAllowedHosts(
        env.GITLAB_ALLOWED_HOST || env.GITLAB_ALLOWED_HOSTS,
      ),
      jiraBaseUrl: (
        env.JIRA_BASE_URL || 'https://tx-tech.atlassian.net'
      ).replace(/\/+$/, ''),
      defaultReviewWorkspace: env.MR_REVIEW_WORKSPACE
        ? path.resolve(env.MR_REVIEW_WORKSPACE)
        : '',
      maxConcurrentReviews: Number(env.MR_REVIEW_CONCURRENCY || 2),
      reviewSkills: parseReviewSkills(env),
      defaultReviewSkill: env.MR_DEFAULT_REVIEW_SKILL || 'reviewcsbfo',
      gitlabToken: env.GITLAB_TOKEN || '',
      jiraEmail: env.JIRA_EMAIL || '',
      jiraApiToken: env.JIRA_API_TOKEN || '',
      autoReviewOnCreate:
        String(env.MR_AUTO_REVIEW ?? 'true').toLowerCase() !== 'false',
    },
    jiraIssuesPage: {
      jiraProject: env.JIRA_PROJECT || 'CORE',
      jiraGroups: parseJiraGroups(env.JIRA_GROUPS),
    },
    gitlabActivities: {
      baseUrl: (
        env.GITLAB_ACTIVITIES_BASE_URL ||
        `https://${[...parseAllowedHosts(env.GITLAB_ALLOWED_HOST || env.GITLAB_ALLOWED_HOSTS)][0]}`
      ).replace(/\/+$/, ''),
      users: parseGitlabActivityUsers(env.GITLAB_ACTIVITY_USERS),
      activityTypes: parseGitlabActivityTypes(env.GITLAB_ACTIVITY_TYPES),
    },
  };
}

export {
  loadConfig,
  parseAllowedUsers,
  parseWorkspaces,
  parseAllowedHosts,
  parseReviewSkills,
  parseGitlabActivityUsers,
  parseGitlabActivityTypes,
};
