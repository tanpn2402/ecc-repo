import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  Image,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconArrowUpRight, IconFileText, IconPhoto } from "@tabler/icons-react";
import type { ThreadAttachment } from "../types";
import classes from "../analysis.module.css";

function formatSize(a: ThreadAttachment): string {
  if (a.kind === "text") {
    return a.size < 1000
      ? `${a.size} chars`
      : `${(a.size / 1000).toFixed(1)}k chars`;
  }
  return a.size < 1024 * 1024
    ? `${Math.max(1, Math.round(a.size / 1024))} KB`
    : `${(a.size / 1024 / 1024).toFixed(1)} MB`;
}

/** Scrolls the chat to the n-th user message and highlights it briefly. */
export function scrollToUserMessage(n: number): void {
  const el = document.querySelectorAll<HTMLElement>(`.${classes.userMessage}`)[
    n
  ];
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(classes.flash);
  window.setTimeout(() => el.classList.remove(classes.flash), 1600);
}

/** Second tab of the right column: every file and image sent in the thread. */
export function AttachmentsTab(props: {
  items: ThreadAttachment[] | undefined;
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState<ThreadAttachment | null>(null);

  if (props.loading && !props.items) {
    return (
      <Center p="md">
        <Loader size="sm" />
      </Center>
    );
  }
  if (props.error) {
    return (
      <Alert color="red" m="sm" p="xs">
        <Text size="xs">{props.error}</Text>
      </Alert>
    );
  }
  const items = props.items ?? [];
  if (!items.length) {
    return (
      <Text size="xs" c="dimmed" p="sm">
        No attachments yet. Files and images you attach to a message are listed
        here.
      </Text>
    );
  }

  // Grouped by the message they came with, in thread order.
  const groups: { message: number; text: string; items: ThreadAttachment[] }[] =
    [];
  for (const a of items) {
    const last = groups[groups.length - 1];
    if (last && last.message === a.message) last.items.push(a);
    else groups.push({ message: a.message, text: a.messageText, items: [a] });
  }

  return (
    <>
      <Stack gap="md" p="sm">
        {groups.map((g) => (
          <Stack key={g.message} gap={2}>
            <Group gap={4} wrap="nowrap" justify="space-between">
              <Text
                size="xs"
                c="dimmed"
                truncate
                title={g.text}
                className={classes.grow}
              >
                Message {g.message + 1}
                {g.text ? ` · ${g.text}` : ""}
              </Text>
              <Tooltip label="Show the message in the chat">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => scrollToUserMessage(g.message)}
                  aria-label="Show message"
                >
                  <IconArrowUpRight size={12} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {g.items.map((a) => (
              <UnstyledButton
                key={a.index}
                className={classes.dirRow}
                onClick={() => setOpen(a)}
                title={`Open ${a.name}`}
              >
                {a.kind === "image" ? (
                  <IconPhoto size={14} color="var(--mantine-color-grape-4)" />
                ) : (
                  <IconFileText size={14} color="var(--mantine-color-blue-4)" />
                )}
                <Text size="sm" truncate className={classes.grow}>
                  {a.name}
                </Text>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {formatSize(a)}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        ))}
      </Stack>

      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        title={open?.name}
        size="xl"
      >
        {open && (
          <Stack gap="sm">
            {open.kind === "image" && open.url ? (
              <Image src={open.url} alt={open.name} fit="contain" mah="70vh" />
            ) : (
              <ScrollArea.Autosize mah="65vh">
                <Text
                  component="pre"
                  size="xs"
                  ff="monospace"
                  m={0}
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {open.text}
                </Text>
              </ScrollArea.Autosize>
            )}
            {open.truncated && (
              <Text size="xs" c="yellow">
                Showing the first {open.text?.length.toLocaleString()} of{" "}
                {open.size.toLocaleString()} characters.
              </Text>
            )}
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Message {open.message + 1} · {formatSize(open)}
              </Text>
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconArrowUpRight size={14} />}
                onClick={() => {
                  const n = open.message;
                  setOpen(null);
                  scrollToUserMessage(n);
                }}
              >
                Show in chat
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
