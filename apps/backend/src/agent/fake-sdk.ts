import * as crypto from 'node:crypto';
import type { AgentSdk, SDKUserMessage, SessionMessage } from './sdk';

/**
 * Scripted stand-in for the Claude Agent SDK (ANALYSIS_FAKE=1, unit tests).
 * Each user message gets a streamed echo. Keywords in the message trigger the
 * other paths of the UI:
 *   "tool"       -> a Read tool call and its result
 *   "permission" -> a Bash call that goes through canUseTool
 *   "ask"        -> an AskUserQuestion form
 *   "fail"       -> a result with is_error
 *   "slow"       -> streams slowly (to try Stop)
 * Transcripts are kept in memory so history() works.
 */
export function createFakeSdk(): AgentSdk {
  const transcripts = new Map<string, SessionMessage[]>();
  const modified = new Map<string, number>();

  const record = (sid: string, type: 'user' | 'assistant', message: unknown) => {
    const list = transcripts.get(sid) ?? [];
    list.push({ type, uuid: crypto.randomUUID(), session_id: sid, message, parent_tool_use_id: null, parent_agent_id: null });
    transcripts.set(sid, list);
    modified.set(sid, Date.now());
  };

  const query: AgentSdk['query'] = ({ prompt, options = {} }) => {
    const sid = options.resume ?? options.sessionId ?? crypto.randomUUID();
    let interrupted = false;
    let closed = false;
    /** Like the CLI: a running total for this query(), not per turn. */
    let totalCostUsd = 0;
    // Like the CLI: allowedTools rules and "always allow" answers skip the prompt for this process.
    const allowed = new Set<string>(options.allowedTools ?? []);
    const ruleFor = (name: string, input: any) => (name === 'Bash' ? `Bash(${String(input?.command ?? '').split(' ')[0]}:*)` : name);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function* run(): AsyncGenerator<any, void> {
      yield { type: 'system', subtype: 'init', session_id: sid, model: options.model || 'fake', cwd: options.cwd, permissionMode: 'default', mcp_servers: [{ name: 'ecc', status: 'connected' }] };
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        if (closed) return;
        interrupted = false;
        record(sid, 'user', user.message);
        const content = user.message.content as any;
        const text = typeof content === 'string' ? content : (content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
        const say = async function* (reply: string) {
          const id = 'msg_' + crypto.randomUUID();
          yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id } } };
          for (const word of reply.split(/(?<= )/)) {
            if (interrupted || closed) break;
            yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: word } } };
            await sleep(/slow/i.test(text) ? 300 : 15);
          }
          const message = { id, role: 'assistant', content: [{ type: 'text', text: reply }] };
          record(sid, 'assistant', message);
          yield { type: 'assistant', parent_tool_use_id: null, message };
        };
        const callTool = async function* (name: string, input: Record<string, unknown>, output: string) {
          const id = 'toolu_' + crypto.randomUUID().slice(0, 8);
          const message = { id: 'msg_' + id, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] };
          record(sid, 'assistant', message);
          yield { type: 'assistant', parent_tool_use_id: null, message };
          let result = output;
          let isError = false;
          if (name !== 'Read' && options.canUseTool && !allowed.has(ruleFor(name, input))) {
            const ctrl = new AbortController();
            const rule = ruleFor(name, input);
            const m = /^(\w+)\((.*)\)$/.exec(rule);
            const suggestions = name === 'Bash' ? [{ type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: m![1], ruleContent: m![2] }] }] : undefined;
            const decision: any = (await options.canUseTool(name, input, { signal: ctrl.signal, toolUseID: id, suggestions } as any)) ?? { behavior: 'deny', message: 'no decision' };
            for (const u of decision.updatedPermissions ?? []) {
              if (u.type === 'addRules') for (const r of u.rules) allowed.add(r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName);
            }
            if (decision.behavior === 'deny') {
              result = decision.message;
              isError = true;
            } else if (name === 'AskUserQuestion') {
              result = 'User answered: ' + JSON.stringify(decision.updatedInput?.answers ?? {});
            }
          }
          const userMsg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: result, is_error: isError }] };
          record(sid, 'user', userMsg);
          yield { type: 'user', parent_tool_use_id: null, message: userMsg };
        };

        if (/tool/i.test(text)) yield* callTool('Read', { file_path: `${options.cwd}/README.md` }, '# README\n(fake content)');
        if (/write/i.test(text)) yield* callTool('Write', { file_path: `${options.cwd}/notes.txt`, content: 'fake' }, 'File created');
        if (/outside/i.test(text)) yield* callTool('Write', { file_path: '/etc/fake-outside.txt', content: 'fake' }, 'File created');
        if (/permission/i.test(text)) yield* callTool('Bash', { command: 'git status', description: 'Show git status' }, 'On branch main\nnothing to commit');
        if (/ask/i.test(text)) {
          yield* callTool('AskUserQuestion', {
            questions: [{ question: 'Which branch should I compare against?', header: 'Branch', multiSelect: false, options: [{ label: 'develop', description: 'Integration branch' }, { label: 'main', description: 'Release branch' }] }],
          }, '');
        }
        yield* say(`(fake) You said: ${text.split('<ecc-context>')[0].trim()} `);
        const failed = /fail/i.test(text);
        totalCostUsd += 0.01;
        yield { type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed || interrupted, num_turns: 1, duration_ms: 42, total_cost_usd: totalCostUsd, usage: {}, session_id: sid, errors: failed ? ['fake failure'] : [] };
      }
    }

    const gen = run() as any;
    gen.interrupt = async () => {
      interrupted = true;
    };
    gen.close = () => {
      closed = true;
      void gen.return(undefined);
    };
    gen.setModel = async () => undefined;
    return gen;
  };

  return {
    version: 'fake',
    query,
    tool: ((name: string, description: string, inputSchema: unknown, handler: unknown, extras?: unknown) => ({ name, description, inputSchema, handler, ...((extras as object) ?? {}) })) as any,
    createSdkMcpServer: ((o: { name: string }) => ({ type: 'sdk', name: o.name, instance: null })) as any,
    getSessionMessages: async (sid) => [...(transcripts.get(sid) ?? [])],
    getSessionInfo: async (sid) => (transcripts.has(sid) ? ({ sessionId: sid, summary: '', lastModified: modified.get(sid) ?? 0 } as any) : undefined),
    renameSession: async () => undefined,
    deleteSession: async (sid) => {
      transcripts.delete(sid);
    },
  };
}
