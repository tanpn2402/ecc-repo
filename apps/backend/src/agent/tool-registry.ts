import type { ZodRawShape } from 'zod';
import type { AgentEventInput } from './agent-events';
import type { AgentSdk, McpServerConfig } from './sdk';

/** MCP server name of the backend's tools: they appear to Claude as mcp__ecc__<tool>. */
export const ECC_MCP_SERVER = 'ecc';

/** What a tool handler can do besides returning a result. */
export interface ToolContext {
  sessionId: string;
  /** Adds an event to the session's live stream (e.g. jira_cached). */
  emit(event: AgentEventInput): void;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface AgentTool<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  schema: S;
  /** true: runs without asking (listed in allowedTools). false: the user approves each call on the UI. */
  readOnly: boolean;
  handler(args: any, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * A group of backend tools (Jira, GitLab, ...). To give the agent a new
 * capability, add a provider in agent/tools/ and register it in
 * analysis.module.ts — nothing in the session code changes.
 */
export interface ToolProvider {
  readonly name: string;
  tools(): AgentTool[];
}

export const TOOL_TEXT_LIMIT = 60_000;

export function textResult(text: string, isError = false): ToolResult {
  const clipped = text.length > TOOL_TEXT_LIMIT ? `${text.slice(0, TOOL_TEXT_LIMIT)}\n... (truncated, ${text.length - TOOL_TEXT_LIMIT} more chars)` : text;
  return { content: [{ type: 'text', text: clipped }], ...(isError ? { isError: true } : {}) };
}

export class ToolRegistry {
  private readonly providers: ToolProvider[] = [];

  register(provider: ToolProvider): this {
    this.providers.push(provider);
    return this;
  }

  all(): AgentTool[] {
    return this.providers.flatMap((p) => p.tools());
  }

  /** Full names of the tools that run without asking. */
  readOnlyToolNames(): string[] {
    return this.all()
      .filter((t) => t.readOnly)
      .map((t) => `mcp__${ECC_MCP_SERVER}__${t.name}`);
  }

  /** One in-process MCP server per session, so handlers know which session they serve. */
  createServer(sdk: AgentSdk, ctx: ToolContext): McpServerConfig {
    const tools = this.all().map((t) =>
      sdk.tool(
        t.name,
        t.description,
        t.schema,
        async (args) => {
          try {
            return (await t.handler(args, ctx)) as any;
          } catch (err) {
            return textResult(`${t.name} failed: ${(err as Error).message}`, true) as any;
          }
        },
        // alwaysLoad: few tools, so skip the ToolSearch round trip before the first call.
        { annotations: { readOnlyHint: t.readOnly }, alwaysLoad: true },
      ),
    );
    return sdk.createSdkMcpServer({ name: ECC_MCP_SERVER, version: '1.0.0', tools });
  }
}
