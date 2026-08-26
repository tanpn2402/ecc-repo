import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface ClaudeRateLimit {
  utilization: number;
  resets_at: string;
}

interface ClaudeUsageResponse {
  five_hour?: ClaudeRateLimit | null;
  seven_day?: ClaudeRateLimit | null;

  // Keep these because Claude may return them.
  seven_day_opus?: ClaudeRateLimit | null;
  seven_day_sonnet?: ClaudeRateLimit | null;
  seven_day_oauth_apps?: ClaudeRateLimit | null;
}

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    expiresAt?: number;
  };
}

@Injectable()
export class ClaudeService {
  private readonly usageUrl =
    'https://api.anthropic.com/api/oauth/usage';

  private readonly credentialsPath = join(
    homedir(),
    '.claude',
    '.credentials.json',
  );

  async getUsage() {
    const accessToken = await this.getAccessToken();

    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Claude Code OAuth credentials not found',
      );
    }

    const response = await fetch(this.usageUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-cli (external, cli)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      const body = await response.text();

      throw new ServiceUnavailableException(
        `Claude usage API returned ${response.status}: ${body}`,
      );
    }

    const data =
      (await response.json()) as ClaudeUsageResponse;

    return {
      fiveHour: data.five_hour
        ? {
            utilization: data.five_hour.utilization,
            resetsAt: data.five_hour.resets_at,
          }
        : null,

      sevenDay: data.seven_day
        ? {
            utilization: data.seven_day.utilization,
            resetsAt: data.seven_day.resets_at,
          }
        : null,

      // Optional, but useful if you want model-specific usage later.
      sevenDayOpus: data.seven_day_opus
        ? {
            utilization: data.seven_day_opus.utilization,
            resetsAt: data.seven_day_opus.resets_at,
          }
        : null,

      sevenDaySonnet: data.seven_day_sonnet
        ? {
            utilization: data.seven_day_sonnet.utilization,
            resetsAt: data.seven_day_sonnet.resets_at,
          }
        : null,
    };
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      const content = await fs.readFile(
        this.credentialsPath,
        'utf8',
      );

      const credentials =
        JSON.parse(content) as ClaudeCredentials;

      return credentials.claudeAiOauth?.accessToken ?? null;
    } catch {
      return null;
    }
  }
}