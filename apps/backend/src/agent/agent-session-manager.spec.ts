import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentEvent } from './agent-events';
import type { AgentSessionMeta } from './agent-session';
import { AgentSessionManager, type AgentSessionStore } from './agent-session-manager';
import { ToolRegistry } from './tool-registry';

class MemoryStore implements AgentSessionStore {
  rows = new Map<string, AgentSessionMeta>();
  load(sid: string) {
    const m = this.rows.get(sid);
    return m ? { ...m, addDirs: [...m.addDirs] } : null;
  }
  save(meta: AgentSessionMeta) {
    this.rows.set(meta.sessionId, { ...meta });
  }
}

function meta(sessionId: string, cwd: string): AgentSessionMeta {
  return {
    sessionId,
    cwd,
    addDirs: [],
    model: '',
    title: null,
    started: false,
    turns: 0,
    costUsd: 0,
    eventSeq: 0,
    lastBranch: null,
    lastOwnActivity: 0,
    turnEntryCount: null,
  };
}

describe('AgentSessionManager (fake SDK)', () => {
  let home: string;
  let store: MemoryStore;
  let manager: AgentSessionManager;
  let events: Array<{ sid: string; ev: AgentEvent }>;

  const waitFor = async (pred: () => boolean, ms = 5000) => {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const done = (sid: string, n = 1) => waitFor(() => events.filter((e) => e.sid === sid && e.ev.type === 'done').length >= n);

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-agent-'));
    store = new MemoryStore();
    manager = new AgentSessionManager({
      config: { eccHome: home, model: '', maxTurns: 5, maxBudgetUsd: null, maxLive: 1, idleMinutes: 15, fake: true },
      store,
      tools: new ToolRegistry(),
      systemAppend: () => '',
      prepareTurn: async (_s, text) => (text.includes('CORE-1') ? 'Jira CORE-1 is cached' : undefined),
    });
    events = [];
    manager.on('event', (sid, ev) => events.push({ sid, ev }));
    store.save(meta('s1', home));
    store.save(meta('s2', home));
  });

  afterEach(async () => {
    await manager.shutdown();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('streams a turn, persists meta and rebuilds history from the transcript', async () => {
    await manager.send('s1', 'hello CORE-1 with a tool');
    await done('s1');
    const types = events.map((e) => e.ev.type);
    expect(types[0]).toBe('user');
    expect(types).not.toContain('text_set'); // streamed text is not repeated
    expect(types).toEqual(expect.arrayContaining(['branch', 'init', 'tool_use', 'tool_result', 'text', 'result', 'done']));
    // ids are strictly increasing
    const ids = events.map((e) => e.ev.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);

    const saved = store.load('s1')!;
    expect(saved.started).toBe(true);
    expect(saved.turns).toBe(1);
    expect(saved.title).toBe('hello CORE-1 with a tool');

    const history = await manager.history('s1');
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[0].text).toBe('hello CORE-1 with a tool'); // <ecc-context> stripped
    const tool = history[1].parts!.find((p) => p.type === 'tool');
    expect(tool).toMatchObject({ name: 'Read', status: 'done' });

    // events of the finished turn can be replayed after a reconnect
    const session = await manager.get('s1');
    expect(session.eventsAfter(0).length).toBe(events.length);
    expect(fs.existsSync(path.join(home, 'sessions', 's1', 'events.ndjson'))).toBe(true);
  });

  it('bridges permission requests and AskUserQuestion to answers', async () => {
    await manager.send('s1', 'permission please, then ask');
    await waitFor(() => events.some((e) => e.ev.type === 'permission_request'));
    const req = events.find((e) => e.ev.type === 'permission_request')!.ev;
    expect(req.tool).toBe('Bash');
    await manager.answer('s1', String(req.requestId), false, 'not now');

    await waitFor(() => events.some((e) => e.ev.type === 'question'));
    const q = events.find((e) => e.ev.type === 'question')!.ev;
    await manager.answer('s1', String(q.requestId), true, '', { 'Which branch should I compare against?': 'develop' });
    await done('s1');

    const resolved = events.filter((e) => e.ev.type === 'permission_resolved').map((e) => e.ev.decision);
    expect(resolved).toEqual(['denied', 'answered']);
    const results = events.filter((e) => e.ev.type === 'tool_result').map((e) => e.ev);
    expect(results[0]).toMatchObject({ isError: true, text: 'not now' });
    expect(String(results[1].text)).toContain('develop');
  });

  it('remembers "always allow in this session" across processes until revoked', async () => {
    await manager.send('s1', 'permission');
    await waitFor(() => events.some((e) => e.ev.type === 'permission_request'));
    const req = events.find((e) => e.ev.type === 'permission_request')!.ev;
    expect(req.alwaysAllow).toEqual(['Bash(git:*)']);
    expect(await manager.answer('s1', String(req.requestId), true, '', undefined, 'session')).toBe('allowed_session');
    await done('s1');
    expect(await manager.grants('s1')).toEqual(['Bash(git:*)']);
    // the grant was written for the session only, never to a settings file
    const saved = JSON.parse(fs.readFileSync(path.join(home, 'sessions', 's1', 'permissions.json'), 'utf8'));
    expect(saved.grants[0].destination).toBe('session');

    await manager.reconfigure('s1'); // new process: the grant comes back through allowedTools
    await manager.send('s1', 'permission again');
    await done('s1', 2);
    expect(events.filter((e) => e.ev.type === 'permission_request').length).toBe(1);

    await manager.clearGrants('s1');
    expect(await manager.grants('s1')).toEqual([]);
    await manager.send('s1', 'permission third');
    await waitFor(() => events.filter((e) => e.ev.type === 'permission_request').length === 2);
    const req2 = events.filter((e) => e.ev.type === 'permission_request')[1].ev;
    await manager.answer('s1', String(req2.requestId), true);
    await done('s1', 3);
  });

  it('approve modes: edits approves edits in the folder only, auto approves all but questions, and persists', async () => {
    const asked = () => events.filter((e) => e.ev.type === 'permission_request').map((e) => e.ev.tool);

    await manager.setApproveMode('s1', 'edits');
    // fake order: Write inside the folder, Write to /etc, then Bash
    await manager.send('s1', 'write outside permission');
    await waitFor(() => asked().length === 1);
    const outside = events.find((e) => e.ev.type === 'permission_request')!.ev;
    expect(outside.tool).toBe('Write'); // the Write inside the folder went through without a card
    expect((outside.input as { file_path: string }).file_path).toBe('/etc/fake-outside.txt');

    // switching to auto approves the request that is waiting, and the Bash after it
    await manager.setApproveMode('s1', 'auto');
    await done('s1');
    expect(asked()).toEqual(['Write']);
    const resolved = events.filter((e) => e.ev.type === 'permission_resolved').map((e) => [e.ev.requestId, e.ev.decision]);
    expect(resolved).toEqual([[outside.requestId, 'allowed']]);
    expect(events.filter((e) => e.ev.type === 'tool_result' && e.ev.isError).length).toBe(0);
    expect(events.filter((e) => e.ev.type === 'approve_mode').map((e) => e.ev.mode)).toEqual(['edits', 'auto']);

    // auto: Bash and Write pass, AskUserQuestion still asks
    await manager.send('s1', 'permission write ask');
    await waitFor(() => events.some((e) => e.ev.type === 'question'));
    expect(asked().length).toBe(1);
    const q = events.find((e) => e.ev.type === 'question')!.ev;
    await manager.answer('s1', String(q.requestId), false);
    await done('s1', 2);

    // the mode is stored with the thread
    await manager.shutdown();
    const again = new AgentSessionManager({
      config: { eccHome: home, model: '', maxTurns: 5, maxBudgetUsd: null, maxLive: 1, idleMinutes: 15, fake: true },
      store,
      tools: new ToolRegistry(),
      systemAppend: () => '',
    });
    expect((await again.get('s1')).approveMode).toBe('auto');
    await again.shutdown();
  });

  it('refuses a second turn while one runs, and stops on interrupt', async () => {
    await manager.send('s1', 'slow slow slow slow slow slow slow slow');
    await expect(manager.send('s1', 'again')).rejects.toMatchObject({ code: 'busy' });
    await waitFor(() => events.some((e) => e.ev.type === 'text'));
    await manager.interrupt('s1');
    await done('s1');
    expect(events.find((e) => e.ev.type === 'done')!.ev.status).toBe('stopped');
  });

  it('resumes on a new process after a reconnect without the old process ending the new turn', async () => {
    await manager.send('s1', 'first');
    await done('s1');
    await manager.reconfigure('s1'); // closes the process; its stream ends asynchronously
    await manager.send('s1', 'second');
    await done('s1', 2);
    const statuses = events.filter((e) => e.ev.type === 'done').map((e) => e.ev.status);
    expect(statuses).toEqual(['done', 'done']);
    expect(events.some((e) => e.ev.type === 'error')).toBe(false);
    expect((await manager.history('s1')).filter((m) => m.role === 'user').map((m) => m.text).slice(-2)).toEqual(['first', 'second']);
  });

  it('keeps at most maxLive processes, closing the idle one', async () => {
    await manager.send('s1', 'first');
    await done('s1');
    expect(manager.isLive('s1')).toBe(true);
    await manager.send('s2', 'second');
    await done('s2');
    expect(manager.isLive('s2')).toBe(true);
    expect(manager.isLive('s1')).toBe(false);
  });

  it('counts each turn once although total_cost_usd is a running total of the process', async () => {
    await manager.send('s1', 'one');
    await done('s1');
    await manager.send('s1', 'two');
    await done('s1', 2);
    const costs = () => events.filter((e) => e.sid === 's1' && e.ev.type === 'result').map((e) => [e.ev.costUsd, e.ev.sessionCostUsd]);
    expect(costs()).toEqual([[0.01, 0.01], [0.01, 0.02]]); // not 0.01 + 0.02
    expect(store.load('s1')!.costUsd).toBe(0.02);

    await manager.reconfigure('s1'); // new process, its total starts again
    await manager.send('s1', 'three');
    await done('s1', 3);
    expect(costs()[2]).toEqual([0.01, 0.03]);
  });
});
