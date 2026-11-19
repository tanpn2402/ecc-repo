import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBrandGit,
  IconFolder,
  IconFolderPlus,
  IconShieldCheck,
  IconTicket,
  IconX,
} from "@tabler/icons-react";
import {
  useAnalysisMutations,
  useAnalysisStatus,
  useThreadAttachments,
} from "../queries";
import type { Thread, UiMessage } from "../types";
import classes from "../analysis.module.css";
import { AttachmentsTab } from "./AttachmentsTab";
import { FolderPicker } from "./FolderPicker";

const MODELS = [
  { value: "", label: "Default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

function Section(props: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {props.title}
        </Text>
        {props.action}
      </Group>
      {props.children}
    </Stack>
  );
}

type PanelTab = "info" | "attachments";

/**
 * Right column, in two tabs. Info: folder, branch, model, extra folders, Jira
 * issues of the thread, usage. Attachments: files and images sent in the thread.
 */
export function ContextPanel(props: {
  thread: Thread | null;
  messages: UiMessage[];
  branch: string | null;
  jiraKeys: string[];
  grants: string[];
  running: boolean;
  onOpenJira(key: string): void;
  onClearGrants(): Promise<void>;
}) {
  const { thread } = props;
  const { data: status } = useAnalysisStatus();
  const { updateThread } = useAnalysisMutations();
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<PanelTab>("info");
  // Chips in the loaded messages, plus whether a turn runs: a new message with
  // attachments, or the end of its turn (the transcript then has it), refetches.
  const chipCount = useMemo(
    () => props.messages.reduce((n, m) => n + (m.attachments?.length ?? 0), 0),
    [props.messages],
  );
  const attachments = useThreadAttachments(
    thread?.sessionId ?? null,
    chipCount * 2 + (props.running ? 1 : 0),
    tab === "attachments" || chipCount > 0,
  );

  if (!thread) return <div className={classes.context} />;
  const setDirs = (addDirs: string[]) =>
    updateThread.mutate({ sid: thread.sessionId, body: { addDirs } });

  return (
    <div className={classes.context}>
      <Tabs
        value={tab}
        onChange={(v) => setTab((v as PanelTab) ?? "info")}
        className={classes.contextTabs}
      >
        <Tabs.List grow>
          <Tabs.Tab value="info">
            Info
          </Tabs.Tab>
          <Tabs.Tab
            value="attachments"
            rightSection={
              attachments.data?.length ? (
                <Badge size="xs" variant="light" circle>
                  {attachments.data.length}
                </Badge>
              ) : null
            }
          >
            Attachments
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="attachments" className={classes.contextTabPanel}>
          <ScrollArea style={{ flex: 1 }}>
            <AttachmentsTab
              items={attachments.data}
              loading={attachments.isLoading}
              error={attachments.error ? attachments.error.message : null}
            />
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="info" className={classes.contextTabPanel}>
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap="md" p="sm">
              <Section title="Folder">
                <Group gap={6} wrap="nowrap">
                  <IconFolder size={14} />
                  <Text size="xs" ff="monospace" truncate title={thread.cwd}>
                    {thread.cwd}
                  </Text>
                </Group>
                {props.branch && (
                  <Badge
                    size="sm"
                    variant="light"
                    color="orange"
                    leftSection={<IconBrandGit size={12} />}
                  >
                    {props.branch}
                  </Badge>
                )}
                {thread.cwdMissing && (
                  <Text size="xs" c="red">
                    This folder no longer exists.
                  </Text>
                )}
              </Section>

              <Section title="Model">
                <Select
                  size="xs"
                  data={MODELS.map((m) =>
                    m.value === "" && status?.defaultModel
                      ? { ...m, label: `Default (${status.defaultModel})` }
                      : m,
                  )}
                  value={thread.model}
                  disabled={props.running}
                  onChange={(v) =>
                    updateThread.mutate({
                      sid: thread.sessionId,
                      body: { model: v ?? "" },
                    })
                  }
                  allowDeselect={false}
                />
              </Section>

              <Section
                title="Extra folders"
                action={
                  <Tooltip label="Let Claude read another folder too">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      disabled={props.running}
                      onClick={() => setPicking(true)}
                      aria-label="Add folder"
                    >
                      <IconFolderPlus size={14} />
                    </ActionIcon>
                  </Tooltip>
                }
              >
                {thread.addDirs.length ? (
                  thread.addDirs.map((d) => (
                    <Group key={d} gap={4} wrap="nowrap">
                      <Text
                        size="xs"
                        ff="monospace"
                        truncate
                        title={d}
                        className={classes.grow}
                      >
                        {d}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        disabled={props.running}
                        onClick={() =>
                          setDirs(thread.addDirs.filter((x) => x !== d))
                        }
                        aria-label="Remove folder"
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">
                    None
                  </Text>
                )}
              </Section>

              <Divider />

              <Section title={`Jira (${props.jiraKeys.length})`}>
                {props.jiraKeys.length ? (
                  props.jiraKeys.map((k) => (
                    <UnstyledButton
                      key={k}
                      className={classes.dirRow}
                      onClick={() => props.onOpenJira(k)}
                    >
                      <IconTicket
                        size={14}
                        color="var(--mantine-color-blue-4)"
                      />
                      <Text size="sm">{k}</Text>
                    </UnstyledButton>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">
                    Mention an issue key in a message and it is cached here.
                  </Text>
                )}
                {status && !status.jiraEnabled && (
                  <Text size="xs" c="yellow">
                    Jira is not configured (JIRA_EMAIL / JIRA_API_TOKEN).
                  </Text>
                )}
              </Section>

              <Divider />

              {props.grants.length > 0 && (
                <>
                  <Section
                    title="Allowed this session"
                    action={
                      <Tooltip
                        label={
                          props.running
                            ? "Wait for the turn to finish"
                            : "Ask again for these from now on"
                        }
                      >
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          disabled={props.running}
                          onClick={() => void props.onClearGrants()}
                        >
                          Revoke all
                        </Button>
                      </Tooltip>
                    }
                  >
                    {props.grants.map((g) => (
                      <Group key={g} gap={6} wrap="nowrap">
                        <IconShieldCheck
                          size={14}
                          color="var(--mantine-color-teal-5)"
                        />
                        <Text size="xs" ff="monospace" truncate title={g}>
                          {g}
                        </Text>
                      </Group>
                    ))}
                  </Section>
                  <Divider />
                </>
              )}

              <Section title="Usage">
                <Text size="xs" c="dimmed">
                  {thread.turns} turns · ${thread.costUsd.toFixed(4)}
                  {thread.live ? " · process open" : ""}
                </Text>
                {status && (
                  <Text size="xs" c="dimmed">
                    {status.liveThreads}/{status.maxLive} Claude processes open
                    · SDK {status.sdkVersion ?? "?"}
                  </Text>
                )}
              </Section>
            </Stack>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>
      <FolderPicker
        opened={picking}
        title="Add a folder Claude may read"
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          if (!thread.addDirs.includes(p)) setDirs([...thread.addDirs, p]);
        }}
      />
    </div>
  );
}
