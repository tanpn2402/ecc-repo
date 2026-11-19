// The chat: assistant-ui runtime over the useThread state, rendered with primitives + Mantine.
import {
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessageNotSentError,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconFileText,
  IconPaperclip,
  IconPhoto,
  IconPlayerStopFilled,
  IconRobot,
  IconX,
} from "@tabler/icons-react";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import { AnalysisError } from "../api";
import { attachmentAdapter, convertMessage } from "../convert";
import type { ApproveMode, Attachment, TurnResult, UiMessage } from "../types";
import type { ThreadController } from "../use-thread";
import classes from "../analysis.module.css";
import {
  LinkifiedText,
  MarkdownLink,
  remarkJiraKeys,
  useJiraKeyRegex,
} from "./JiraKeyLink";
import { CodeHeader } from "./CodeHeader";
import { ApproveModeMenu } from "./ApproveModeMenu";
import { dataParts, ToolFallback, toolsByName } from "./parts";

const MD_COMPONENTS = { a: MarkdownLink, CodeHeader };

/** Assistant markdown; Jira keys of the configured projects open a popup. */
function MarkdownText() {
  const re = useJiraKeyRegex();
  // stable identity: the renderer re-parses when the plugin list changes
  const plugins = useMemo(
    () => (re ? [remarkGfm, remarkJiraKeys(re)] : [remarkGfm]),
    [re],
  );
  return (
    <MarkdownTextPrimitive
      remarkPlugins={plugins}
      components={MD_COMPONENTS}
      className={classes.md}
      smooth={false}
    />
  );
}

/** User messages are plain text; only the Jira keys become links. */
function UserText({ text }: TextMessagePartProps) {
  return <LinkifiedText text={text} />;
}

function Reasoning({ text }: { text: string }) {
  if (!text) return null;
  return (
    <details className={classes.reasoning}>
      <summary>Thinking</summary>
      <Text size="xs" c="dimmed" mt={4} style={{ whiteSpace: "pre-wrap" }}>
        {text}
      </Text>
    </details>
  );
}

function AttachmentChip({ removable }: { removable?: boolean }) {
  const type = useAuiState((s) => s.attachment.type);
  return (
    <AttachmentPrimitive.Root className={classes.attachmentChip}>
      {type === "image" ? <IconPhoto size={14} /> : <IconFileText size={14} />}
      <Text size="xs" truncate>
        <AttachmentPrimitive.Name />
      </Text>
      {removable && (
        <AttachmentPrimitive.Remove asChild>
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            aria-label="Remove attachment"
          >
            <IconX size={12} />
          </ActionIcon>
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className={classes.userMessage}>
      <Group gap={6} justify="flex-end" className={classes.attachments}>
        <MessagePrimitive.Attachments>
          {() => <AttachmentChip />}
        </MessagePrimitive.Attachments>
      </Group>
      <div className={classes.userBubble}>
        <MessagePrimitive.Parts components={{ Text: UserText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function ResultLine() {
  const r = useAuiState(
    (s) =>
      (s.message.metadata?.custom as { result?: TurnResult } | undefined)
        ?.result,
  );
  if (!r) return null;
  return (
    <Text size="xs" c="dimmed" ff="monospace">
      {r.subtype === "success" ? "done" : r.subtype.replace(/_/g, " ")} ·{" "}
      {r.numTurns} turns · {(r.durationMs / 1000).toFixed(1)} s
      {r.costUsd != null && ` · $${r.costUsd.toFixed(4)}`}
    </Text>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={classes.assistantMessage}>
      <div className={classes.avatar}>
        <IconRobot size={16} />
      </div>
      <div className={classes.assistantBody}>
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning,
            tools: { by_name: toolsByName, Fallback: ToolFallback },
            data: dataParts,
          }}
        />
        <ResultLine />
      </div>
    </MessagePrimitive.Root>
  );
}

function Empty({ workspaceName }: { workspaceName: string }) {
  return (
    <Stack align="center" gap="xs" mt={80} maw={520} mx="auto" ta="center">
      <ThemeIcon size={40} radius="md" variant="light">
        <IconRobot size={24} />
      </ThemeIcon>
      <Text fw={600}>Analyse with Claude</Text>
      <Text size="sm" c="dimmed">
        Ask about a Jira issue (e.g. "phân tích CORE-123"), a requirement, a
        feature or a merge request. Jira issues you mention are downloaded to
        the local cache with their fields, links and attachments; Claude reads
        them together with the code of <b>{workspaceName}</b>.
      </Text>
    </Stack>
  );
}

function Composer({
  running,
  approveMode,
  onApproveMode,
}: {
  running: boolean;
  approveMode: ApproveMode;
  onApproveMode(mode: ApproveMode): void;
}) {
  return (
    <div className={classes.composerWrap}>
      <ComposerPrimitive.Root className={classes.composer}>
        <Group gap={6} px="sm" pt={8} className={classes.attachments}>
          <ComposerPrimitive.Attachments>
            {() => <AttachmentChip removable />}
          </ComposerPrimitive.Attachments>
        </Group>
        <ComposerPrimitive.Input
          rows={2}
          autoFocus
          placeholder="Ask Claude… (Enter to send, Shift+Enter for a new line)"
          aria-label="Message to Claude"
          className={classes.composerInput}
        />
        <Group gap={6} px={8} pb={8}>
          <ComposerPrimitive.AddAttachment asChild>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconPaperclip size={14} />}
            >
              Attach
            </Button>
          </ComposerPrimitive.AddAttachment>
          <ApproveModeMenu mode={approveMode} onChange={onApproveMode} />
          <Box ml="auto">
            {running ? (
              <ComposerPrimitive.Cancel asChild>
                <Button
                  size="xs"
                  color="red"
                  leftSection={<IconPlayerStopFilled size={12} />}
                >
                  Stop
                </Button>
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send asChild>
                <Button size="xs" leftSection={<IconArrowUp size={14} />}>
                  Send
                </Button>
              </ComposerPrimitive.Send>
            )}
          </Box>
        </Group>
      </ComposerPrimitive.Root>
    </div>
  );
}

export interface PendingSend {
  text: string;
  attachments: Attachment[];
  message: string;
}

export function AnalysisThread(props: {
  ctl: ThreadController;
  workspaceName: string;
  disabled: boolean;
  onCliBusy(p: PendingSend): void;
}) {
  const { ctl } = props;

  const onNew = async (message: AppendMessage) => {
    const text = message.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n");
    const attachments: Attachment[] = [];
    for (const a of message.attachments ?? []) {
      const f = (a.content ?? []).find((c) => c.type === "file") as
        { data: string; mimeType: string; filename?: string } | undefined;
      if (f)
        attachments.push({
          name: f.filename || a.name,
          type: f.mimeType,
          data: f.data,
        });
    }
    try {
      await ctl.send(text, attachments);
    } catch (e) {
      if (e instanceof AnalysisError && e.code === "cli_busy")
        props.onCliBusy({ text, attachments, message: e.message });
      else ctl.setError((e as Error).message);
      throw new MessageNotSentError(); // keeps the text in the composer
    }
  };

  const runtime = useExternalStoreRuntime<UiMessage>({
    messages: ctl.messages,
    convertMessage,
    isRunning: ctl.running,
    isDisabled: props.disabled,
    onNew,
    onCancel: async () => {
      await ctl.interrupt();
    },
    adapters: { attachments: attachmentAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className={classes.threadRoot}>
        <ThreadPrimitive.Viewport className={classes.viewport} autoScroll>
          <ThreadPrimitive.Empty>
            <Empty workspaceName={props.workspaceName} />
          </ThreadPrimitive.Empty>
          <div className={classes.messages}>
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
            />
          </div>
          <ThreadPrimitive.ViewportFooter className={classes.scrollFooter}>
            <ThreadPrimitive.ScrollToBottom asChild>
              <ActionIcon
                variant="default"
                radius="xl"
                aria-label="Scroll to bottom"
              >
                <IconArrowDown size={16} />
              </ActionIcon>
            </ThreadPrimitive.ScrollToBottom>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
        <Composer
          running={ctl.running}
          approveMode={ctl.approveMode}
          onApproveMode={(mode) =>
            void ctl
              .setApproveMode(mode)
              .catch((e) => ctl.setError((e as Error).message))
          }
        />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
