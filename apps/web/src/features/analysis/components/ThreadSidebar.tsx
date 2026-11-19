import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Menu,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconPencil,
  IconPlus,
  IconSettings,
  IconTerminal2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { compactRelativeTime } from "@/utils/datetime.utils";
import type { Thread, Workspace } from "../types";
import classes from "../analysis.module.css";
import { copyText } from "../clipboard";

/** Quotes a path for a POSIX shell. */
function shQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s)
    ? s
    : "'" + s.split("'").join("'\\''") + "'";
}

/** One chat row; the gear and a right click open the same menu. */
function ThreadItem(props: {
  thread: Thread;
  active: boolean;
  onOpen(): void;
  onRename(): void;
  onDelete(): void;
}) {
  const t = props.thread;
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState<{ ok: boolean; label: string } | null>(
    null,
  );
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), copied.ok ? 1500 : 4000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (text: string, label: string) =>
    copyText(text).then(
      () => setCopied({ ok: true, label }),
      () => setCopied({ ok: false, label: `Copy failed: ${text}` }),
    );
  const resumeCmd = `cd ${shQuote(t.cwd)} && claude --resume ${t.sessionId}`;

  return (
    <Group
      gap={0}
      wrap="nowrap"
      className={classes.threadRow}
      data-open={opened || undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        setOpened(true);
      }}
    >
      <UnstyledButton
        className={classes.threadItem}
        data-active={props.active || undefined}
        onClick={props.onOpen}
      >
        <Group gap={6} wrap="nowrap">
          {t.running && <Loader size={10} color="yellow" />}
          <Text size="sm" truncate className={classes.grow}>
            {t.title}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {compactRelativeTime(t.updatedAt)} · {t.turns} turns
          {t.costUsd ? ` · $${t.costUsd.toFixed(2)}` : ""}
        </Text>
      </UnstyledButton>
      <Menu
        position="bottom-end"
        withinPortal
        opened={opened}
        onChange={setOpened}
      >
        <Menu.Target>
          <Tooltip
            label={copied?.label ?? ""}
            opened={!!copied}
            color={copied && !copied.ok ? "red" : undefined}
            position="left"
            withArrow
            multiline
            maw={360}
          >
            <ActionIcon
              variant="subtle"
              color={copied ? (copied.ok ? "teal" : "red") : "gray"}
              size="sm"
              className={classes.threadGear}
              data-copied={copied ? true : undefined}
              aria-label="Chat actions"
            >
              {copied ? (
                copied.ok ? (
                  <IconCheck size={14} />
                ) : (
                  <IconX size={14} />
                )
              ) : (
                <IconSettings size={14} />
              )}
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconPencil size={14} />}
            onClick={props.onRename}
          >
            Rename
          </Menu.Item>
          <Menu.Item
            leftSection={<IconCopy size={14} />}
            onClick={() => void copy(t.sessionId, "Session ID copied")}
          >
            Copy session ID
          </Menu.Item>
          <Menu.Item
            leftSection={<IconTerminal2 size={14} />}
            disabled={!t.started}
            title={
              t.started
                ? resumeCmd
                : "Send a message first: the session starts with it"
            }
            onClick={() => void copy(resumeCmd, "Resume command copied")}
          >
            Copy resume command
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            disabled={t.running}
            onClick={props.onDelete}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

export function ThreadSidebar(props: {
  workspaces: Workspace[];
  workspace: Workspace | null;
  threads: Thread[];
  threadsLoading: boolean;
  activeSid: string | null;
  creating: boolean;
  onSelectWorkspace(id: number): void;
  onAddWorkspace(): void;
  onEditWorkspace(): void;
  onNewThread(): void;
  onOpenThread(sid: string): void;
  onRenameThread(t: Thread): void;
  onDeleteThread(t: Thread): void;
}) {
  return (
    <div className={classes.sidebar}>
      <Stack gap="xs" p="sm">
        <Group gap={6} wrap="nowrap">
          <Select
            size="xs"
            placeholder="Workspace"
            data={props.workspaces.map((w) => ({
              value: String(w.id),
              label: w.name,
            }))}
            value={props.workspace ? String(props.workspace.id) : null}
            onChange={(v) => v && props.onSelectWorkspace(Number(v))}
            allowDeselect={false}
            style={{ flex: 1 }}
          />
          <Tooltip label="Workspace settings">
            <ActionIcon
              variant="default"
              size="md"
              disabled={!props.workspace}
              onClick={props.onEditWorkspace}
              aria-label="Workspace settings"
            >
              <IconSettings size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="New workspace">
            <ActionIcon
              variant="default"
              size="md"
              onClick={props.onAddWorkspace}
              aria-label="New workspace"
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {props.workspace && (
          <Text size="xs" c="dimmed" truncate title={props.workspace.path}>
            {props.workspace.path}
            {props.workspace.branch ? ` · ${props.workspace.branch}` : ""}
          </Text>
        )}
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          disabled={!props.workspace}
          loading={props.creating}
          onClick={props.onNewThread}
        >
          New chat
        </Button>
      </Stack>
      <ScrollArea
        style={{ flex: 1 }}
        px="xs"
        pb="sm"
        scrollbars="y"
        classNames={{ viewport: classes.threadList }}
      >
        {props.threadsLoading && <Loader size="xs" m="sm" />}
        {props.threads.map((t) => (
          <ThreadItem
            key={t.sessionId}
            thread={t}
            active={t.sessionId === props.activeSid}
            onOpen={() => props.onOpenThread(t.sessionId)}
            onRename={() => props.onRenameThread(t)}
            onDelete={() => props.onDeleteThread(t)}
          />
        ))}
        {!props.threadsLoading && props.workspace && !props.threads.length && (
          <Text size="xs" c="dimmed" p="sm">
            No chats yet.
          </Text>
        )}
      </ScrollArea>
    </div>
  );
}
