# EPIC-001 · Tab Analysis (chat với Claude Agent SDK trên workspace local)

| | |
|---|---|
| Trạng thái | **Đã đóng** (2026-11-19). Phase 1–5 xong. Phase 6 (chuyển review MR / Telegram sang SDK) tách khỏi epic này, làm ở epic sau |
| Phạm vi code | `apps/backend/src/{realtime,agent,analysis,jira-cache}/`, `apps/web/src/features/analysis/`, `apps/web/src/api/socket.api.ts` |
| Tham khảo | `/data/ttl/tools/swing-probe/webapp` (`ai.py`, `fsdirs.py`, `ui/src/ai/*`): cùng bài toán, viết bằng Python + assistant-ui |

## 1. Mục tiêu
Thêm tab **Analysis** vào web. Người dùng:
1. Chọn một **workspace** là một folder trên máy đang chạy backend (máy dev local).
2. Mở nhiều **thread** chat trong workspace đó để phân tích Jira, yêu cầu, chức năng, review MR hoặc hỏi đáp về code.
3. Khi tin nhắn nhắc tới Jira, backend lấy issue qua Jira API (token đã có), lưu cache vào `~/.ecc/jira/<KEY>/`; agent chỉ cần đọc file trong folder đó.
4. Agent dùng được GitLab (token đã có) qua tool của backend để xem MR, diff, branch, file ở ref khác.

## 2. Quyết định đã chốt

Nguyên tắc chung: **làm bản đơn giản nhất chạy được, nhưng tách đúng chỗ để sau này thêm mà không phải sửa lõi.**

| # | Quyết định |
|---|---|
| D1 | Dùng **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), **ghim đúng một version**. Không dùng `@anthropic-ai/sdk` (không có tool đọc file, session, resume) |
| D2 | Mỗi thread = một session Claude Code. Lịch sử chat đọc từ transcript của Claude Code (`~/.claude/projects/...`), **không lưu message vào DB**. DB chỉ lưu meta |
| D3 | Realtime chuyển sang **Socket.IO** cho cả app (thay `ws` thuần). Analysis dùng namespace `/analysis` |
| D4 | Frontend dùng **Mantine + assistant-ui primitives** với `useExternalStoreRuntime`. Logic `reduce`/`convert` lấy từ swing-probe, phần view viết lại bằng Mantine |
| D5 | Mặc định agent **chỉ đọc**: Read/Grep/Glob và tool đọc Jira/GitLab chạy không cần hỏi. Tool khác (Bash, Write, Edit…) phải được người dùng duyệt trên UI |
| D6 | Cấu hình bằng **biến môi trường**, chưa làm màn hình Settings: `ANALYSIS_ROOTS` (mặc định `~,/data`), `ANALYSIS_MODEL`, `ANALYSIS_MAX_TURNS` (60), `ANALYSIS_MAX_LIVE` (2), `ECC_HOME` (`~/.ecc`) |
| D7 | Cache Jira dùng **chung cho mọi workspace** tại `~/.ecc/jira/` |
| D8 | Chưa làm: import session CLI, fork, rename từ transcript, màn hình Settings. Data model vẫn chừa chỗ cho chúng (mục 8). "Allow for this session" đã làm sau (mục 11) |

## 3. Kiến trúc

```
web  features/analysis  (Mantine + assistant-ui)
  │  REST /api/analysis/*, /api/fs/dirs
  │  Socket.IO namespace /analysis  (room = sessionId)
  ▼
backend (NestJS)
  realtime/      SocketIoAdapter + RealtimeGateway (event cũ: jira.review.*, mr.data.updated)
  agent/         AgentSession, AgentSessionManager, ToolRegistry, event mapping   ← lõi, không biết gì về Jira
  agent/tools/   jira.tools.ts, gitlab.tools.ts                                   ← plugin, đăng ký vào ToolRegistry
  jira-cache/    JiraCacheService → ~/.ecc/jira/<KEY>/                            ← dùng lại JiraClient
  analysis/      AnalysisController, AnalysisGateway, FsDirsService, repository (drizzle)
```

Ranh giới:
- `agent/` chỉ biết: chạy một session, phát event, hỏi quyền, gọi tool đã đăng ký. Không import Jira/GitLab.
- Mỗi nhóm tool là một **provider** đăng ký vào `ToolRegistry`. Thêm tool mới thì thêm file, không sửa lõi.
- `AnalysisGateway` chỉ chuyển event giữa socket và `AgentSessionManager`.

## 4. Backend

### 4.1 Realtime: Socket.IO (Phase 1)
- Thêm `@nestjs/platform-socket.io` và `socket.io`; trong `main.ts` đổi `WsAdapter` thành `IoAdapter`. Gỡ `@nestjs/platform-ws` và `ws` nếu không còn chỗ nào dùng.
- Sửa `ws/mr.gateway.ts` (đổi tên thành `realtime/realtime.gateway.ts`):
  - `broadcast()` đổi thành `server.emit(type, payload)`;
  - `jira.review.subscribe` đổi thành `@SubscribeMessage`, trả snapshot qua **ack**.
- Phía web, viết lại `api/socket.api.ts` bằng `socket.io-client` nhưng **giữ nguyên interface** (`connect`, `on`, `send`, `isConnected`). Thêm `emitWithAck`. `vite.config.ts`: đổi proxy `/ws` thành `/socket.io` với `ws: true`.
- Nghiệm thu: Issues/MR vẫn cập nhật realtime; Console tab vẫn nhận snapshot.

### 4.2 Agent core (Phase 2)
Chuyển từ `class Session` của swing-probe `ai.py` sang TypeScript.

**`AgentSession`** (một thread):
- Prompt đưa vào `query()` dạng **async iterable** (hàng đợi tin nhắn user), nên một process Claude sống qua nhiều lượt.
- Options:
  - `cwd`, `additionalDirectories: [ECC_HOME/jira, ...addDirs]`
  - `settingSources: ['user','project','local']`
  - `systemPrompt: { type: 'preset', preset: 'claude_code', append }`, trong đó `append` = prompt Analysis + `contextMd` của workspace
  - `includePartialMessages: true`, `maxTurns`, `model`, `stderr` (giữ 30 dòng cuối để báo lỗi)
  - `mcpServers: { ecc: toolRegistry.createServer(session) }`, `allowedTools: toolRegistry.readOnlyToolNames()` cùng `Read`, `Grep`, `Glob`
  - `canUseTool`: xem mục Quyền
  - `hooks.PreToolUse`: chặn Bash nguy hiểm (`git push|reset|checkout|clean`, `rm -rf`…) bằng `permissionDecision: 'deny'`
  - Lượt đầu truyền `sessionId` (UUID tạo sẵn khi tạo thread); các lượt sau truyền `resume`
- **Event log**: `emit(type, data)` gán `id` tăng dần, giữ event của lượt hiện tại trong RAM và ghi thêm vào `ECC_HOME/sessions/<sid>/events.ndjson`. Server khởi động lại giữa lượt thì phát `notice` + `done{status:'stopped'}`.
- **Chuyển message SDK thành event** (theo `on_message`):
  - `stream_event` `text_delta` / `thinking_delta` → `text` / `thinking` với `key = messageId:index`
  - tin nhắn assistant chưa được stream → `text_set`; `tool_use`; `tool_result` (cắt còn 20k ký tự, ảnh lưu thành file và trả URL)
  - bỏ qua message có `parent_tool_use_id` (bên trong subagent)
  - `system/init` → `init`; `compact_boundary` → `notice`; kết quả → `result` (cost của lượt, turns, duration) và cộng vào `costUsd` của thread (xem 11.x Chi phí)
- Mỗi lượt đọc branch hiện tại (`.git/HEAD`), phát `branch`; nếu khác lượt trước thì phát thêm `notice`.

**Quyền** (`canUseTool`):
- Tạo `requestId`, phát `permission_request` (hoặc `question` nếu tool là `AskUserQuestion`), chờ Promise.
- Nhận `permission:answer` thì resolve: `allow` (với `AskUserQuestion` thì truyền `updatedInput.answers`) hoặc `deny`.
- Quá 10 phút không trả lời thì `deny`. Khi interrupt, mọi yêu cầu đang chờ cũng bị `deny`.

**`AgentSessionManager`**:
- `Map<sid, AgentSession>`.
- Tối đa `ANALYSIS_MAX_LIVE` process sống: khi cần chỗ thì ngắt session rảnh lâu nhất; nếu tất cả đang bận thì báo lỗi 409.
- Reaper chạy mỗi 30 giây, ngắt session rảnh quá 15 phút (tin nhắn sau sẽ resume).
- Chặn gửi khi lượt trước còn chạy (409 `busy`).
- Kiểm tra `cli_busy` (theo `check_cli_busy`): nếu transcript bị nơi khác ghi trong 120 giây gần nhất thì báo 409, UI có nút "Send anyway".
- `history(sid)`: đọc transcript và trả về **cùng dạng message** với reducer phía web (theo `history()` của swing-probe). Đang chạy thì chỉ trả phần trước lượt hiện tại (`turnEntryCount`).

**`AgentRunner` interface**: `SdkRunner` (thật) và `FakeRunner` (kịch bản cố định, bật bằng `ANALYSIS_FAKE=1`) để test và demo không tốn token.

**Spike đầu Phase 2** (nửa ngày): trên version SDK sẽ ghim, kiểm tra tên và cách dùng thực tế của streaming input, `interrupt`, `canUseTool`, `hooks`, `createSdkMcpServer`/`tool`, và các hàm đọc session (`getSessionMessages`/`listSessions`…). Hàm nào thiếu trong TS thì đọc thẳng file jsonl trong `~/.claude/projects`. Ghi kết quả vào cuối file này.

### 4.3 Tool registry + Jira cache (Phase 3)

```ts
interface ToolProvider {
  name: string                          // 'jira', 'gitlab', ...
  tools(ctx: ToolContext): AgentTool[]  // ctx: { session, emit }
}
interface AgentTool {
  name: string
  description: string
  schema: ZodRawShape
  readOnly: boolean                     // true → vào allowedTools, chạy không hỏi
  handler(args, ctx): Promise<ToolResult>
}
```

`ToolRegistry` gom mọi provider thành một server MCP in-process tên `ecc` (`mcp__ecc__<tool>`).

**`JiraCacheService.ensure(key, { force? })`** dùng lại `mr/jira-client.ts`:
- Gọi `GET /rest/api/3/issue/{key}?expand=names,renderedFields` và remote links (`fetchRemoteLinks` đã có).
- Tải attachment qua `attachment[].content` với basic auth; giới hạn `MAX_UPLOAD_BYTES`; làm sạch tên file.
- Chỉ tải lại khi `fields.updated` mới hơn `meta.jiraUpdated`; attachment đã có (theo id) thì bỏ qua.
- Cấu trúc thư mục:
  ```
  ~/.ecc/jira/<KEY>/
    issue.md        # summary, status, assignee, description (ADF → markdown), bảng custom field có tên
    issue.json      # raw
    fields.json     # { "<tên field>": value }
    links.json      # issuelinks + remote links
    attachments/<id>_<file>
    meta.json       # fetchedAt, jiraUpdated, attachments[]
  ```

**Provider `jira`** (`agent/tools/jira.tools.ts`):
- `jira_fetch_issue(key, includeLinked?)` (readOnly): lưu cache, trả đường dẫn và tóm tắt, phát `jira_cached`.
- `jira_search(jql)` (readOnly).

**Provider `gitlab`** (`agent/tools/gitlab.tools.ts`), dùng lại `mr/gitlab-client.ts`, đều readOnly:
- `gitlab_get_mr`, `gitlab_get_mr_diff`, `gitlab_list_branches`, `gitlab_get_file(project, ref, path)`, `gitlab_compare(from, to)`.

**Tự lấy trước:** trước mỗi lượt, `AnalysisService` dò key Jira và URL Jira trong tin nhắn (dùng lại `parse-issue-input.ts` / `jira-url.ts`), gọi `ensure()`, rồi thêm vào cuối prompt một dòng: `Jira CORE-123 đã cache tại ~/.ecc/jira/CORE-123/issue.md`.

Token Jira/GitLab chỉ nằm trong backend, không truyền vào env của agent.

### 4.4 Analysis API (Phase 4)

**Chọn folder** (`FsDirsService`, chuyển từ `fsdirs.py`):
- `GET /api/fs/dirs?path=&hidden=`
- Không có `path` thì trả danh sách `roots`.
- Chỉ trả **tên thư mục con**, kèm `git`/`branch`; `realpath` phải nằm trong `ANALYSIS_ROOTS`; cấm `..`; ẩn symlink trỏ ra ngoài; tối đa 500 mục.

**Schema drizzle**:
```
analysis_workspaces(id, name, path, context_md, created_at, updated_at)
analysis_threads(session_id PK, workspace_id, title, cwd, add_dirs JSON, model,
                 started, turns, cost_usd, event_seq, last_branch,
                 last_own_activity, turn_entry_count, created_at, updated_at)
analysis_thread_jira(session_id, jira_key, PK(session_id, jira_key))
```

**REST** `/api/analysis`:
- `GET status`: SDK version, cách đăng nhập (`ANTHROPIC_API_KEY` hay Claude login, không lộ secret), số session đang sống.
- `GET|POST workspaces`, `PATCH|DELETE workspaces/:id`
- `GET|POST workspaces/:id/threads`
- `GET threads/:sid`: trả `{ thread, messages, events (nếu đang chạy), lastEventId }`
- `PATCH threads/:sid`: `title`, `model`, `addDirs`. `cwd` chỉ đổi được trước tin nhắn đầu.
- `DELETE threads/:sid`
- `GET threads/:sid/files/:name`: ảnh của tool result và ảnh người dùng đính kèm.
- `GET threads/:sid/attachments`: file và ảnh người dùng đã đính kèm trong thread (tab Attachments).
- `GET jira-cache/:key` và `jira-cache/:key/attachments/:file`: để xem trước.

**Socket.IO `/analysis`**:

| Chiều | Event | Payload / ack |
|---|---|---|
| C→S | `thread:join` | `{sid, after}` → ack `{events: id > after}`, rồi join room |
| C→S | `thread:leave` | `{sid}` |
| C→S | `chat:send` | `{sid, text, attachments?, force?}` → ack `{ok}` hoặc `{error, code: 'busy'|'cli_busy'|'no_room'}` |
| C→S | `chat:interrupt` | `{sid}` |
| C→S | `permission:answer` | `{sid, requestId, allow, message?, answers?}` |
| S→C | `ai:event` | `{sid, id, type, t, ...}` |

Các `type` của `ai:event`: `user`, `init`, `branch`, `text`, `text_set`, `thinking`, `tool_use`, `tool_result`, `permission_request`, `question`, `permission_resolved`, `jira_cached`, `notice`, `error`, `result`, `done`.

Dùng **một** tên event với `id` tăng dần, nên client chỉ cần một reducer; reconnect thì `thread:join` với `after = lastEventId`.

**Bảo mật:** `/api/fs`, `/api/analysis` và namespace `/analysis` chỉ nhận request từ localhost (guard kiểm tra remote address và `Host`), vì Vite đang mở `allowedHosts` cho ngrok.

## 5. Frontend (Phase 5)

Cấu trúc `apps/web/src/features/analysis/`:
```
api.ts            REST + socket (namespace /analysis)
types.ts          UiMessage, Part, AiEvent (giống swing-probe types.ts)
reduce.ts         applyEvent(messages, ev) – hàm thuần, chép từ swing-probe
convert.ts        UiMessage → ThreadMessageLike, attachmentAdapter, onNew
store.ts          state theo thread (jotai hoặc zustand): messages, running, lastEventId
runtime.tsx       useExternalStoreRuntime
parts/registry.ts map tên tool / tên data part → component
parts/*.tsx       ToolCard, PermissionCard, QuestionCard, NoticePart, JiraCard, MrCard
Thread.tsx        ThreadPrimitive / MessagePrimitive / ComposerPrimitive + Mantine
Sidebar.tsx       workspace switcher + danh sách thread
FolderPicker.tsx  Modal Mantine gọi /api/fs/dirs
ContextPanel.tsx  Jira đã cache trong thread, xem trước attachment, branch hiện tại
AnalysisPage.tsx  layout 3 cột
```

- Route `/analysis` và `/analysis/:workspaceId/:sid?` trong `main.tsx`; mục nav "Analysis" trong `NavbarSimple.tsx`.
- Dependency (ghim như swing-probe): `@assistant-ui/react@0.15.32`, `@assistant-ui/react-markdown@0.14.24`, `remark-gfm@4.0.1`. Chỉ dùng primitives, **không** dùng Tailwind/shadcn.
- Mapping trong `convert.ts`: `text` → `text`, `thinking` → `reasoning`, `tool` → `tool-call`; các phần riêng (`permission`, `question`, `notice`, `jira`) → `data-<type>`.
- Mở thread: gọi `GET threads/:sid` để lấy `messages` (từ transcript), áp `events` đang chạy, rồi `thread:join {after: lastEventId}`.
- Composer: đính kèm `.md/.txt/.csv` và ảnh (≤ 5 MB, gửi base64); nút Stop gọi `chat:interrupt`.

**Layout:**
```
┌──────────────┬──────────────────────────────────────┬─────────────────┐
│ Workspace ▼  │  Thread title        branch: develop │ Context         │
│ [+ New chat] │                                      │ Jira (3)        │
│ ─ thread 1 ● │  user: phân tích CORE-1234 ...       │  CORE-1234 ↻    │
│ ─ thread 2   │  assistant: ...markdown...           │   2 attachments │
│              │   ▸ Read src/order/service.ts  ✓     │  CORE-1200      │
│              │   ▸ jira_fetch_issue CORE-1200 ✓     │                 │
│              │   ┌ Bash: git log -5  [Allow][Deny] ┐│                 │
│              │  [composer ................] [Send]  │ $0.42 · 6 turns │
└──────────────┴──────────────────────────────────────┴─────────────────┘
```

## 6. Kế hoạch triển khai

| # | Phase | Phụ thuộc | Nghiệm thu |
|---|---|---|---|
| 1 | Socket.IO cho cả app | – | Issues/MR vẫn realtime; build và lint pass |
| 2 | Agent core + spike SDK + `FakeRunner` | – | Test với `FakeRunner`: gửi, stream, tool, xin quyền, interrupt, resume, giới hạn MAX_LIVE |
| 3 | ToolRegistry + JiraCache + tool jira/gitlab | 2 | `jira_fetch_issue CORE-x` tạo đủ file trong `~/.ecc/jira/CORE-x/`; lần hai không tải lại |
| 4 | Analysis API + gateway + FsDirs | 1, 2, 3 | Tạo workspace, thread; chat thật với một repo; reload giữa lượt vẫn thấy tiếp |
| 5 | Frontend Analysis | 1, 4 | Luồng đầy đủ trên UI; trả lời yêu cầu quyền và AskUserQuestion; mở lại thread cũ hiển thị giống lúc chạy |
| 6 | ~~Chuyển review MR + Telegram sang `agent/`~~ (tách ra epic sau) | 2 | Hai chức năng cũ chạy như trước; xoá `claude-process.ts`, `claude-parser.ts` |

Phase 1 và Phase 2 làm song song được.

## 7. Test
- Backend (jest):
  - `FsDirsService`: root, `..`, symlink ra ngoài;
  - event mapping từ message SDK mẫu;
  - `AgentSessionManager` với `FakeRunner`;
  - `JiraCacheService` với mock fetch (ADF → markdown, tải lại theo `updated`).
- Web: unit test `applyEvent` và so sánh `history()` với kết quả reducer trên cùng một kịch bản.

## 8. Điểm mở rộng (để sau, không phải sửa lõi)

| Muốn thêm | Làm ở đâu |
|---|---|
| Tool mới (Confluence, DB query, comment Jira…) | Thêm một `ToolProvider` trong `agent/tools/`; tool có ghi đặt `readOnly: false` để tự đi qua bước xin quyền |
| UI riêng cho một tool | Thêm component và đăng ký trong `parts/registry.ts` |
| Event mới | Thêm `type` trong `ai:event`, thêm một case trong `applyEvent` |
| "Allow for this session" | Thêm cột `allowed_rules` vào `analysis_threads`, đưa lại qua `settings` khi resume (như swing-probe `session_rules`) |
| Fork / import session CLI / rename | Hàm session của SDK; thêm cột `source`, `forked_from` |
| Màn hình Settings | Chuyển các biến `ANALYSIS_*` sang bảng settings; đọc qua một `AnalysisConfig` duy nhất |
| Prompt riêng theo loại việc (review MR, phân tích yêu cầu) | Preset prompt trong `analysis/prompts/`, chọn khi tạo thread |

## 9. Rủi ro
- **API của SDK TS khác bản Python và đổi nhanh:** ghim version, làm spike ở Phase 2, gom mọi chỗ gọi SDK vào `agent/sdk-runner.ts`.
- **RAM:** mỗi process vài trăm MB, nên có `ANALYSIS_MAX_LIVE` và reaper.
- **Hai nơi cùng resume một session làm hỏng transcript:** đã có kiểm tra `cli_busy`.
- **Lộ file hệ thống qua chọn folder:** giới hạn roots, chỉ trả tên thư mục, chỉ nhận request từ localhost.
- **Attachment Jira lớn hoặc nhị phân:** giới hạn dung lượng; agent đọc được ảnh/PDF bằng Read, file khác chỉ liệt kê.

## 10. Kết quả spike SDK (2026-11-17)

Version ghim: `@anthropic-ai/claude-agent-sdk@0.3.325` (đi kèm Claude Code CLI 2.1.325), `zod@4`.

- **Module:** SDK là ESM-only, backend build ra CommonJS. Toàn bộ việc nạp SDK nằm trong `agent/sdk.ts` (dùng `import()` động; type dùng `resolution-mode: "import"`). Fake SDK nằm ở `agent/fake-sdk.ts`.
- **Có đủ trong bản TS:** `query()` với prompt là `AsyncIterable` (chat nhiều lượt trên một process), `Query.interrupt()` / `close()` / `setModel()`, `canUseTool`, `hooks.PreToolUse`, `createSdkMcpServer` + `tool()`, cùng các hàm session `getSessionMessages`, `getSessionInfo`, `listSessions`, `renameSession`, `tagSession`, `forkSession`, `deleteSession`. Không cần đọc file jsonl bằng tay.
- **Tool MCP mặc định bị hoãn nạp:** agent phải gọi `ToolSearch` trước khi dùng. Tool của ECC đặt `alwaysLoad: true` để bỏ bước này.
- **Tool có trong `allowedTools` thì không đi qua `canUseTool`:** SDK có in cảnh báo `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`; đây là chủ ý vì các tool đó chỉ đọc.
- **Lệnh Bash chỉ đọc** (ví dụ `git status`) được Claude Code tự cho phép, không hỏi. Lệnh có ghi (`touch`, ...) đi qua `canUseTool`. Lệnh nguy hiểm bị hook `bash-guard.ts` chặn trước cả bước hỏi.
- **Mỗi lượt có một `system/init`** khi chạy ở chế độ streaming input.
- **Đăng nhập:** dùng Claude Code login của user chạy backend (`apiKeySource: none`), hoặc `ANTHROPIC_API_KEY`.
- **Race khi reconnect** (đã sửa, có test): process cũ kết thúc bất đồng bộ sau khi lượt mới đã bắt đầu trên process mới. Mỗi lượt nhớ process của nó (`turnLive`), và chỉ stream của đúng process đó được kết thúc lượt.

## 11. Ghi chú triển khai

- Workspace = một folder. Thread chạy với `cwd` là folder của workspace; folder phụ thêm ở panel bên phải.
- Event chỉ có trong lượt đang chạy (thẻ quyền, câu hỏi, chip Jira, dòng kết quả) không có trong transcript của Claude. Mở lại thread chỉ còn text và tool call; danh sách Jira vẫn lấy từ bảng `analysis_thread_jira`.
- `apps/web/src/api/client.ts`: `baseURL` mặc định đổi từ `"api"` sang `"/api"`. Đường dẫn tương đối bị resolve sai ở route nhiều cấp (`/analysis/1` thành `/analysis/api/...`).
- Chạy thử không tốn token: `ANALYSIS_FAKE=1`. Test: `apps/backend/src/agent/*.spec.ts`.

### 11.x "Always allow this session"

- Thẻ xin quyền có thêm nút **Always allow this session** khi CLI đưa ra gợi ý quy tắc (`options.suggestions`, ví dụ `Bash(git:*)`). Tool không phải Bash mà không có gợi ý thì cho phép theo tên tool. Bash không có gợi ý thì không hiện nút.
- `sessionGrantFor` đổi mọi gợi ý sang `destination: 'session'` (không bao giờ ghi vào file settings), bỏ `setMode` khác `acceptEdits` (không cho `bypassPermissions`).
- Trả về CLI qua `updatedPermissions`; đồng thời lưu ở `ECC_HOME/sessions/<sid>/permissions.json` để process mới (resume, đổi model, idle reaper) nhận lại qua `allowedTools` / `additionalDirectories` / `permissionMode`.
- Bash guard (PreToolUse) vẫn chạy trước, nên rule đã cho phép không vượt qua được danh sách lệnh bị chặn.
- Panel phải hiện "Allowed this session" + **Revoke all** (`DELETE /api/analysis/threads/:sid/grants`, đóng process đang giữ rule; từ chối khi đang chạy turn).

### 11.x Mã Jira bấm được trong chat

- Mã thuộc `ANALYSIS_JIRA_PREFIXES` (vd `CORE,REQ,TKT`, không phân biệt hoa thường) trong tin nhắn người dùng và câu trả lời của Claude thành link. Markdown của Claude: remark plugin `remarkJiraKeys` đổi text và inline code đúng bằng một mã thành link `#jira:KEY`; link tới `<jira>/browse/KEY` cũng mở popup.
- Bấm vào mở Popover gọi `GET /api/analysis/jira/:key/preview`: backend gọi thẳng Jira API với vài field (summary, status, type, priority, assignee, reporter, labels, fix version, parent, description), không ghi file, không tải attachment, giữ trong bộ nhớ 60 giây. Description (ADF → markdown) cắt ở 1500 ký tự.
- **Details** mở drawer cache; issue chưa có trong `~/.ecc/jira` thì tải đầy đủ trước (`POST .../refresh`). **Open in Jira** mở trang Jira.

### 11.x Chế độ duyệt (approve mode), giống Claude Desktop

- Mỗi thread có `approveMode`: `manual` (hỏi từng lệnh), `edits` (Edit/MultiEdit/Write/NotebookEdit vào file nằm trong `cwd` hoặc extra folders tự qua; Bash vẫn hỏi), `auto` (mọi tool tự qua).
- Xử lý trong `canUseTool` của `AgentSession` (không dùng `permissionMode: bypassPermissions`), nên đổi chế độ có hiệu lực ngay, kể cả giữa turn, không cần khởi động lại process. Chuyển sang chế độ rộng hơn sẽ tự duyệt các thẻ đang chờ mà chế độ mới bao phủ (`permission_resolved` với message "Approved by … mode").
- Trong mọi chế độ: Bash guard (PreToolUse) vẫn chặn git push/commit/checkout/reset --hard, rm -rf, sudo...; `AskUserQuestion` vẫn chờ người dùng trả lời.
- Lưu ở `ECC_HOME/sessions/<sid>/permissions.json` dạng `{ mode, grants }` (file cũ chỉ là mảng grants vẫn đọc được). Event `approve_mode`. API: `PATCH /api/analysis/threads/:sid { approveMode }`, `POST .../threads { approveMode }`; `GET threads/:sid` trả `approveMode`.
- Web: nút chọn chế độ ở composer; chat mới dùng chế độ chọn gần nhất (localStorage `ecc.analysis.approveMode`).

### 11.x Chi phí (cost) của thread

- `total_cost_usd` trong message `result` của SDK là **tổng cộng dồn của cả `query()`**, không phải cost của một lượt. Process resume có thể bắt đầu từ tổng đã lưu trong transcript. Bản đầu cộng thẳng giá trị này vào `costUsd` mỗi lượt nên số hiển thị bị phóng đại (một thread hiện $621 trong khi thực tế $25).
- `AgentSession.turnCost()` lấy hiệu giữa tổng mới và tổng process báo lần trước. Event `result` mang `costUsd` = cost của lượt, `sessionCostUsd` = tổng của thread. `costUsd` của các thread tạo trước bản sửa vẫn giữ số cũ (sai).
- Đã so transcript với VSCode extension: mỗi request của ECC không tốn hơn (context ban đầu ~27k so với ~45–50k, 5,1 request mỗi câu hỏi so với 7,3). Usage tăng chủ yếu vì thread dài (context lên tới ~490k): nên mở thread mới cho mỗi chủ đề.

### 11.x Panel phải dạng tab, tab Attachments

- Panel phải có hai tab: **Info** (folder, model, extra folders, Jira, quyền, usage) và **Attachments** (badge số lượng).
- Attachments đọc từ transcript (`transcriptAttachments` trong `agent/history.ts`): file text lấy lại nội dung từ thẻ `<attachment>` (trả tối đa 200k ký tự, có cờ `truncated`), ảnh lưu thành file trong `ECC_HOME/sessions/<sid>/` và trả URL. Ảnh không còn tên gốc trong prompt nên đặt tên `image-<n>`.
- Nhóm theo tin nhắn; `message` đếm tin nhắn user giống `transcriptToUiMessages`, nên nút "Show in chat" cuộn đúng bubble. Bấm file mở popup xem nội dung.
- Web tải lại danh sách khi số chip attachment trong thread đổi hoặc khi turn kết thúc (lúc đó transcript đã có tin nhắn mới).
- `res.sendFile` cần `{ dotfiles: 'allow' }`: `ECC_HOME` mặc định là `~/.ecc`, Express từ chối mọi đường dẫn đi qua thư mục bắt đầu bằng dấu chấm (trước đây ảnh tool result và attachment Jira đều trả 500). Đường dẫn đã được service kiểm tra trước.
