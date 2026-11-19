// Renderers for message parts: tool calls (by tool name) and data parts (permission, question,
// jira, notice). To give a tool its own UI, add a component and list it in `toolsByName`;
// for a new data part (a new event type in reduce.ts), add it to `dataParts`.
import { useState, type ReactNode } from "react";
import type {
  DataMessagePartProps,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Collapse,
  Group,
  Image,
  Loader,
  Paper,
  Radio,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconBrandGitlab,
  IconCheck,
  IconChevronRight,
  IconFileSearch,
  IconFileText,
  IconFolderSearch,
  IconHelpCircle,
  IconInfoCircle,
  IconPencil,
  IconShieldCheck,
  IconShieldExclamation,
  IconShieldX,
  IconTerminal2,
  IconTicket,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import { relPath, useThreadActions } from "../thread-context";
import type { Part, ToolResult } from "../types";
import classes from "../analysis.module.css";

type R = ToolResult | undefined;

function shortName(name: string): { server: string | null; tool: string } {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : { server: null, tool: name };
}

function StatusIcon({ result, isError }: { result: R; isError?: boolean }) {
  if (result === undefined)
    return <Loader size={12} color="yellow" aria-label="running" />;
  if (isError)
    return (
      <IconX size={14} color="var(--mantine-color-red-6)" aria-label="error" />
    );
  return (
    <IconCheck
      size={14}
      color="var(--mantine-color-teal-5)"
      aria-label="done"
    />
  );
}

function ResultText({ result }: { result: R }) {
  if (!result?.text && !result?.images?.length) return null;
  return (
    <>
      {result?.text && <pre className={classes.pre}>{result.text}</pre>}
      {!!result?.images?.length && (
        <Group gap="xs" p="xs">
          {result.images.map((u) => (
            <Anchor key={u} href={u} target="_blank">
              <Image src={u} h={110} w="auto" radius="sm" alt="tool result" />
            </Anchor>
          ))}
        </Group>
      )}
    </>
  );
}

/** Collapsible one-line row for a tool call. */
function ToolRow(props: {
  icon: ReactNode;
  label: string;
  detail?: string;
  result: R;
  isError?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const body =
    props.children ??
    (props.result?.text || props.result?.images?.length ? (
      <ResultText result={props.result} />
    ) : null);
  return (
    <Paper
      withBorder
      radius="sm"
      className={classes.toolRow}
      data-error={props.isError || undefined}
    >
      <UnstyledButton
        className={classes.toolHead}
        onClick={() => setOpen((o) => !o)}
        disabled={!body}
        aria-expanded={open}
      >
        <IconChevronRight
          size={14}
          className={classes.chevron}
          data-open={open || undefined}
          style={{ visibility: body ? "visible" : "hidden" }}
        />
        {props.icon}
        <Text size="xs" fw={600} className={classes.noShrink}>
          {props.label}
        </Text>
        {props.detail && (
          <Text
            size="xs"
            c="dimmed"
            ff="monospace"
            truncate
            title={props.detail}
            className={classes.grow}
          >
            {props.detail}
          </Text>
        )}
        <Box ml="auto" className={classes.noShrink}>
          <StatusIcon result={props.result} isError={props.isError} />
        </Box>
      </UnstyledButton>
      <Collapse expanded={open}>
        {body && <Box className={classes.toolBody}>{body}</Box>}
      </Collapse>
    </Paper>
  );
}

function FileTool({
  toolName,
  args,
  result,
  isError,
}: ToolCallMessagePartProps) {
  const { cwd } = useThreadActions();
  const a = (args ?? {}) as Record<string, unknown>;
  const detail =
    toolName === "Read"
      ? relPath(a.file_path, cwd) + (a.offset ? `:${a.offset}` : "")
      : toolName === "Grep"
        ? `${a.pattern ?? ""}${a.path ? `  in ${relPath(a.path, cwd)}` : ""}${a.glob ? `  ${a.glob}` : ""}`
        : toolName === "Glob"
          ? `${a.pattern ?? ""}${a.path ? `  in ${relPath(a.path, cwd)}` : ""}`
          : relPath(a.path, cwd);
  const icon =
    toolName === "Read" ? (
      <IconFileText size={14} />
    ) : toolName === "Grep" ? (
      <IconFileSearch size={14} />
    ) : (
      <IconFolderSearch size={14} />
    );
  return (
    <ToolRow
      icon={icon}
      label={toolName}
      detail={detail}
      result={result as R}
      isError={isError}
    />
  );
}

function BashTool({ args, result, isError }: ToolCallMessagePartProps) {
  const a = (args ?? {}) as { command?: string; description?: string };
  return (
    <ToolRow
      icon={<IconTerminal2 size={14} />}
      label="Bash"
      detail={a.description || a.command}
      result={result as R}
      isError={isError}
    >
      <pre className={classes.pre}>$ {a.command}</pre>
      <ResultText result={result as R} />
    </ToolRow>
  );
}

function AskTool({ result, isError }: ToolCallMessagePartProps) {
  return (
    <ToolRow
      icon={<IconHelpCircle size={14} />}
      label="Question"
      detail={result ? "answered" : "waiting for your answer"}
      result={result as R}
      isError={isError}
    />
  );
}

/** Backend tools (mcp__ecc__*): Jira and GitLab. */
function EccTool({
  toolName,
  args,
  result,
  isError,
}: ToolCallMessagePartProps) {
  const { openJira } = useThreadActions();
  const { tool } = shortName(toolName);
  const a = (args ?? {}) as Record<string, string | number | undefined>;
  if (tool.startsWith("jira_")) {
    const detail =
      tool === "jira_fetch_issue" ? String(a.key ?? "") : String(a.jql ?? "");
    return (
      <ToolRow
        icon={<IconTicket size={14} color="var(--mantine-color-blue-4)" />}
        label={tool}
        detail={detail}
        result={result as R}
        isError={isError}
      >
        {tool === "jira_fetch_issue" && a.key && (
          <Box px="xs" pt="xs">
            <Anchor
              size="xs"
              onClick={() => openJira(String(a.key).toUpperCase())}
            >
              Open {String(a.key).toUpperCase()}
            </Anchor>
          </Box>
        )}
        <ResultText result={result as R} />
      </ToolRow>
    );
  }
  const detail = String(
    a.url ??
      [
        a.project,
        a.iid ? `!${a.iid}` : "",
        a.ref,
        a.path,
        a.from && `${a.from}..${a.to}`,
      ]
        .filter(Boolean)
        .join(" "),
  );
  return (
    <ToolRow
      icon={<IconBrandGitlab size={14} color="var(--mantine-color-orange-5)" />}
      label={tool}
      detail={detail}
      result={result as R}
      isError={isError}
    />
  );
}

function ToolFallback(props: ToolCallMessagePartProps) {
  const { cwd } = useThreadActions();
  const { server, tool } = shortName(props.toolName);
  if (server === "ecc") return <EccTool {...props} />;
  const a = (props.args ?? {}) as Record<string, unknown>;
  const detail = String(
    a.file_path
      ? relPath(a.file_path, cwd)
      : (a.description ?? a.url ?? a.pattern ?? a.query ?? ""),
  );
  const write = ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(
    props.toolName,
  );
  return (
    <ToolRow
      icon={
        write ? (
          <IconPencil size={14} color="var(--mantine-color-yellow-5)" />
        ) : (
          <IconTool size={14} />
        )
      }
      label={server ? `${server} · ${tool}` : tool}
      detail={detail}
      result={props.result as R}
      isError={props.isError}
    >
      <pre className={classes.pre}>{JSON.stringify(props.args, null, 1)}</pre>
      <ResultText result={props.result as R} />
    </ToolRow>
  );
}

// ---------------------------------------------------------------- data parts

function NoticePart({ data }: DataMessagePartProps) {
  const d = data as Extract<Part, { type: "notice" }>;
  const color =
    d.level === "error" ? "red" : d.level === "warning" ? "yellow" : "blue";
  return (
    <Alert
      variant="light"
      color={color}
      p={6}
      icon={
        d.level === "info" ? (
          <IconInfoCircle size={14} />
        ) : (
          <IconAlertTriangle size={14} />
        )
      }
    >
      <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>
        {d.text}
      </Text>
    </Alert>
  );
}

function JiraPart({ data }: DataMessagePartProps) {
  const d = data as Extract<Part, { type: "jira" }>;
  const { openJira } = useThreadActions();
  return (
    <Paper withBorder radius="sm" px="xs" py={4} className={classes.jiraChip}>
      <Group gap={6} wrap="nowrap">
        <IconTicket size={14} color="var(--mantine-color-blue-4)" />
        <Anchor size="xs" fw={600} onClick={() => openJira(d.key)}>
          {d.key}
        </Anchor>
        <Text size="xs" truncate className={classes.grow}>
          {d.summary}
        </Text>
        <Badge size="xs" variant="light">
          {d.status}
        </Badge>
        <Text size="xs" c="dimmed" className={classes.noShrink}>
          cached{d.attachments ? ` · ${d.attachments} attachment(s)` : ""}
        </Text>
      </Group>
    </Paper>
  );
}

const DECISION: Record<
  string,
  { label: string; color: string; icon: ReactNode }
> = {
  allowed: {
    label: "Allowed",
    color: "teal",
    icon: <IconShieldCheck size={14} />,
  },
  allowed_session: {
    label: "Allowed for this session",
    color: "teal",
    icon: <IconShieldCheck size={14} />,
  },
  denied: { label: "Denied", color: "red", icon: <IconShieldX size={14} /> },
  expired: {
    label: "No answer in 10 minutes: denied",
    color: "red",
    icon: <IconShieldX size={14} />,
  },
};

function PermissionCard({ data }: DataMessagePartProps) {
  const d = data as Extract<Part, { type: "permission" }>;
  const { answer } = useThreadActions();
  const [reason, setReason] = useState("");
  const [denying, setDenying] = useState(false);
  const [busy, setBusy] = useState(false);
  const { server, tool } = shortName(d.tool);
  const pending = d.status === "pending";
  const decide = async (allow: boolean, scope: "once" | "session" = "once") => {
    setBusy(true);
    try {
      await answer(d.requestId, allow, { message: reason, scope });
    } finally {
      setBusy(false);
    }
  };
  const dec = DECISION[d.status];
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className={classes.card}
      data-pending={pending || undefined}
      role={pending ? "alertdialog" : undefined}
    >
      <Group gap="xs">
        <IconShieldExclamation
          size={16}
          color={pending ? "var(--mantine-color-yellow-5)" : undefined}
        />
        <Text size="sm" fw={500}>
          {pending ? "Claude wants to use" : "Permission"}
        </Text>
        {server && (
          <Badge size="xs" variant="default">
            {server}
          </Badge>
        )}
        <Code>{tool}</Code>
        {!pending && dec && (
          <Badge
            ml="auto"
            size="sm"
            variant="light"
            color={dec.color}
            leftSection={dec.icon}
          >
            {dec.label}
          </Badge>
        )}
      </Group>
      {(d.title || d.description) && (
        <Text size="xs" c="dimmed" mt={4}>
          {d.title || d.description}
        </Text>
      )}
      {pending && (
        <>
          <pre className={classes.pre}>
            {Object.entries(d.input)
              .map(
                ([k, v]) =>
                  `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
              )
              .join("\n") || "(no input)"}
          </pre>
          {d.blockedPath && (
            <Text size="xs" c="yellow" ff="monospace">
              path: {d.blockedPath}
            </Text>
          )}
          {denying ? (
            <Group
              mt="xs"
              gap="xs"
              component="form"
              onSubmit={(e) => (e.preventDefault(), void decide(false))}
            >
              <TextInput
                size="xs"
                autoFocus
                className={classes.grow}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                placeholder="Tell Claude why / what to do instead (optional)"
              />
              <Button size="xs" color="red" type="submit" loading={busy}>
                Deny
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setDenying(false)}
              >
                Back
              </Button>
            </Group>
          ) : (
            <Group mt="xs" gap="xs">
              <Button
                size="xs"
                leftSection={<IconCheck size={14} />}
                loading={busy}
                onClick={() => void decide(true)}
              >
                Allow
              </Button>
              {d.alwaysAllow && (
                <Tooltip
                  label={`Don't ask again in this thread for: ${d.alwaysAllow.join(", ")}`}
                  multiline
                  maw={360}
                  withArrow
                >
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconShieldCheck size={14} />}
                    loading={busy}
                    onClick={() => void decide(true, "session")}
                  >
                    Always allow this session
                  </Button>
                </Tooltip>
              )}
              <Button
                size="xs"
                variant="default"
                color="red"
                leftSection={<IconShieldX size={14} />}
                onClick={() => setDenying(true)}
              >
                Deny…
              </Button>
            </Group>
          )}
        </>
      )}
      {!pending && d.message && (
        <Text size="xs" c="dimmed" mt={4}>
          {d.message}
        </Text>
      )}
    </Paper>
  );
}

function QuestionCard({ data }: DataMessagePartProps) {
  const d = data as Extract<Part, { type: "question" }>;
  const { answer } = useThreadActions();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pending = d.status === "pending";
  const answers = () =>
    Object.fromEntries(
      d.questions.map((q) => [
        q.question,
        [
          ...(picked[q.question] ?? []),
          ...(other[q.question]?.trim() ? [other[q.question].trim()] : []),
        ].join(", "),
      ]),
    );
  const complete = d.questions.every(
    (q) => (picked[q.question]?.length ?? 0) > 0 || other[q.question]?.trim(),
  );
  const submit = async (skip: boolean) => {
    setBusy(true);
    try {
      await answer(d.requestId, !skip, skip ? {} : { answers: answers() });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className={classes.card}
      data-question={pending || undefined}
    >
      <Group gap="xs">
        <IconHelpCircle size={16} color="var(--mantine-color-blue-4)" />
        <Text size="sm" fw={500}>
          Claude asks
        </Text>
      </Group>
      <Stack gap="sm" mt="xs">
        {d.questions.map((q) => (
          <div key={q.question}>
            <Text size="sm" component="div">
              <Badge size="xs" variant="default" mr={6}>
                {q.header}
              </Badge>
              {q.question}
            </Text>
            {pending ? (
              <Stack gap={6} mt={6}>
                {q.multiSelect ? (
                  <Checkbox.Group
                    value={picked[q.question] ?? []}
                    onChange={(v) =>
                      setPicked((p) => ({ ...p, [q.question]: v }))
                    }
                  >
                    <Stack gap={6}>
                      {q.options.map((o) => (
                        <Checkbox
                          key={o.label}
                          value={o.label}
                          label={o.label}
                          description={o.description}
                        />
                      ))}
                    </Stack>
                  </Checkbox.Group>
                ) : (
                  <Radio.Group
                    value={picked[q.question]?.[0] ?? null}
                    onChange={(v) =>
                      setPicked((p) => ({ ...p, [q.question]: [v] }))
                    }
                  >
                    <Stack gap={6}>
                      {q.options.map((o) => (
                        <Radio
                          key={o.label}
                          value={o.label}
                          label={o.label}
                          description={o.description}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                )}
                <TextInput
                  size="xs"
                  placeholder="Other…"
                  value={other[q.question] ?? ""}
                  onChange={(e) =>
                    setOther((x) => ({
                      ...x,
                      [q.question]: e.currentTarget.value,
                    }))
                  }
                />
              </Stack>
            ) : (
              <Text
                size="xs"
                mt={4}
                c={d.answers?.[q.question] ? undefined : "dimmed"}
              >
                {d.answers?.[q.question] ??
                  (d.status === "expired" ? "no answer" : "skipped")}
              </Text>
            )}
          </div>
        ))}
      </Stack>
      {pending && (
        <Group mt="sm" gap="xs">
          <Button
            size="xs"
            disabled={!complete}
            loading={busy}
            onClick={() => void submit(false)}
          >
            Answer
          </Button>
          <Button size="xs" variant="subtle" onClick={() => void submit(true)}>
            Skip
          </Button>
        </Group>
      )}
    </Paper>
  );
}

function DataFallback({ name, data }: DataMessagePartProps) {
  return (
    <pre
      className={classes.pre}
    >{`${name}: ${JSON.stringify(data, null, 1)}`}</pre>
  );
}

export const toolsByName = {
  Read: FileTool,
  Grep: FileTool,
  Glob: FileTool,
  LS: FileTool,
  Bash: BashTool,
  AskUserQuestion: AskTool,
};
export { ToolFallback };
export const dataParts = {
  by_name: {
    notice: NoticePart,
    permission: PermissionCard,
    question: QuestionCard,
    jira: JiraPart,
  },
  Fallback: DataFallback,
};
