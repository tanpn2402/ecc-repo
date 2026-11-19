/**
 * The only file that loads @anthropic-ai/claude-agent-sdk. Everything else in
 * agent/ talks to the `AgentSdk` interface, so an SDK upgrade (its API moves
 * fast; the version is pinned in package.json) or the fake SDK used by tests
 * only touches this file and fake-sdk.ts.
 *
 * The package is ESM-only and this backend compiles to CommonJS, so it is
 * loaded with a dynamic import() and its types use resolution-mode "import".
 */
import type * as Sdk from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };

export type {
  CanUseTool,
  HookCallback,
  McpServerConfig,
  Options as SdkOptions,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
  SessionMessage,
  SDKSessionInfo,
} from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };

import { createFakeSdk } from './fake-sdk';

export interface AgentSdk {
  version: string;
  query: typeof Sdk.query;
  createSdkMcpServer: typeof Sdk.createSdkMcpServer;
  tool: typeof Sdk.tool;
  getSessionMessages: typeof Sdk.getSessionMessages;
  getSessionInfo: typeof Sdk.getSessionInfo;
  renameSession: typeof Sdk.renameSession;
  deleteSession: typeof Sdk.deleteSession;
}

// Kept out of TypeScript's reach so the CommonJS output does not rewrite the
// import() into a require() of an ESM-only package.
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

let loaded: Promise<AgentSdk> | null = null;

export function loadSdk(fake: boolean): Promise<AgentSdk> {
  if (!loaded) {
    loaded = fake
      ? Promise.resolve(createFakeSdk())
      : dynamicImport('@anthropic-ai/claude-agent-sdk').then((m) => ({
          version: readSdkVersion(),
          query: m.query,
          createSdkMcpServer: m.createSdkMcpServer,
          tool: m.tool,
          getSessionMessages: m.getSessionMessages,
          getSessionInfo: m.getSessionInfo,
          renameSession: m.renameSession,
          deleteSession: m.deleteSession,
        }));
    loaded.catch(() => (loaded = null));
  }
  return loaded;
}

function readSdkVersion(): string {
  try {
    // package.json is not in the package's "exports", so read it from disk.
    const path = require('node:path') as typeof import('node:path');
    const fs = require('node:fs') as typeof import('node:fs');
    const entry = require.resolve('@anthropic-ai/claude-agent-sdk');
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(entry), 'package.json'), 'utf8'));
    return String(pkg.version);
  } catch {
    return 'unknown';
  }
}
