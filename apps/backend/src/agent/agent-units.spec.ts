import { adfToMarkdown } from '../jira-cache/adf-to-markdown';
import { blockedBashReason } from './bash-guard';
import { MessageMapper } from './message-mapper';
import { buildPrompt, PromptError } from './prompt';
import { transcriptAttachments, transcriptToUiMessages } from './history';
import { sessionGrantFor } from './agent-session';

describe('MessageMapper', () => {
  it('keys deltas by message and block, and skips text_set for streamed messages', () => {
    const m = new MessageMapper(() => 'url');
    const out = [
      ...m.map({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm1' } } } as any),
      ...m.map({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } } } as any),
      ...m.map({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm1', content: [{ type: 'text', text: 'Hi' }] } } as any),
      ...m.map({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm2', content: [{ type: 'text', text: 'Full' }] } } as any),
    ];
    expect(out).toEqual([
      { type: 'text', key: 'm1:0', delta: 'Hi' },
      { type: 'text_set', key: 'm2:a0', text: 'Full' },
    ]);
  });

  it('maps tool results with images and drops subagent text', () => {
    const m = new MessageMapper((_d, t) => `img.${t}`);
    const res = m.map({
      type: 'user',
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }, { type: 'image', source: { data: 'AA', media_type: 'image/png' } }] }] },
    } as any);
    expect(res[0]).toMatchObject({ type: 'tool_result', toolUseId: 't1', text: 'ok', images: ['img.image/png'] });
    expect(m.map({ type: 'assistant', parent_tool_use_id: 'p', message: { id: 'x', content: [{ type: 'text', text: 'inner' }] } } as any)).toEqual([]);
  });
});

describe('buildPrompt / history', () => {
  it('inlines text attachments and hides them and the ecc context in history', () => {
    const data = Buffer.from('a,b').toString('base64');
    const { content, chips } = buildPrompt('look', [{ name: 'x.csv', type: 'text/csv', data }], 'Jira X cached');
    expect(chips).toEqual([{ name: 'x.csv', kind: 'text' }]);
    const msgs = transcriptToUiMessages(
      [{ type: 'user', uuid: 'u1', session_id: 's', message: { content }, parent_tool_use_id: null, parent_agent_id: null }],
      () => '',
      { running: false },
    );
    expect(msgs[0]).toMatchObject({ text: 'look', attachments: [{ name: 'x.csv', kind: 'text' }] });
  });

  it('rejects unsupported attachments and empty messages', () => {
    expect(() => buildPrompt('', [])).toThrow(PromptError);
    expect(() => buildPrompt('x', [{ name: 'a.exe', type: 'application/octet-stream', data: '' }])).toThrow(PromptError);
  });
});

describe('blockedBashReason', () => {
  it.each(['git push origin x', 'git checkout develop', 'rm -rf build', 'git reset --hard HEAD~1'])('blocks %s', (cmd) => {
    expect(blockedBashReason(cmd)).not.toBeNull();
  });
  it.each(['git log -5', 'git diff develop...HEAD', 'ls -la', 'grep -rn foo src'])('allows %s', (cmd) => {
    expect(blockedBashReason(cmd)).toBeNull();
  });
});

describe('adfToMarkdown', () => {
  it('renders common nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Scope' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'strong' }] }, { type: 'text', text: ' and ' }, { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x' } }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] }] },
        ] },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'm', alt: 'shot.png' } }] },
      ],
    };
    const md = adfToMarkdown(doc, { mediaName: (_id, alt) => (alt === 'shot.png' ? '10_shot.png' : undefined) });
    expect(md).toContain('## Scope');
    expect(md).toContain('**bold** and [link](https://x)');
    expect(md).toContain('- one');
    expect(md).toContain('| A |');
    expect(md).toContain('![shot.png](attachments/10_shot.png)');
  });
});

describe('sessionGrantFor', () => {
  it('scopes the CLI suggestions to the session and drops unsafe ones', () => {
    const g = sessionGrantFor('Bash', [
      { type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }] },
      { type: 'setMode', mode: 'bypassPermissions', destination: 'session' },
      { type: 'addDirectories', directories: ['/tmp/x'], destination: 'userSettings' },
    ]);
    expect(g.map((u) => [u.type, u.destination])).toEqual([
      ['addRules', 'session'],
      ['addDirectories', 'session'],
    ]);
  });

  it('falls back to the tool name, but never for a bare Bash', () => {
    expect(sessionGrantFor('Write', undefined)).toEqual([{ type: 'addRules', behavior: 'allow', destination: 'session', rules: [{ toolName: 'Write' }] }]);
    expect(sessionGrantFor('Bash', [])).toEqual([]);
  });
});

describe('transcriptAttachments', () => {
  it('reads text files and images back from user messages, numbered like the UI messages', () => {
    const csv = buildPrompt('compare these', [
      { name: 'a.csv', type: 'text/csv', data: Buffer.from('x,y\n1,2').toString('base64') },
      { name: 'shot.png', type: 'image/png', data: Buffer.from('png').toString('base64') },
    ], 'Jira CORE-1 is cached').content;
    const entries = [
      { type: 'user', uuid: 'u1', parent_tool_use_id: null, message: { role: 'user', content: 'hello' } },
      { type: 'assistant', uuid: 'a1', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } },
      { type: 'user', uuid: 't1', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
      { type: 'user', uuid: 'u2', parent_tool_use_id: null, message: { role: 'user', content: csv } },
    ] as any[];
    const stored: string[] = [];
    const out = transcriptAttachments(entries, (_d, t) => (stored.push(t), '/img/1.png'));
    expect(out).toEqual([
      { index: 0, message: 1, messageText: 'compare these', name: 'a.csv', kind: 'text', size: 7, text: 'x,y\n1,2' },
      { index: 1, message: 1, messageText: 'compare these', name: 'image-1.png', kind: 'image', size: 3, url: '/img/1.png' },
    ]);
    expect(stored).toEqual(['image/png']);
  });
});
