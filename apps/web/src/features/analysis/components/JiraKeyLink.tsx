// Jira keys in the chat (CORE-123, REQ-45, ...) become links that open a
// popup with the issue fetched live from Jira through the backend.
import {
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconExternalLink,
  IconFileDescription,
  IconTicket,
} from "@tabler/icons-react";
import {
  useAnalysisMutations,
  useAnalysisStatus,
  useJiraPreview,
} from "../queries";
import { useThreadActions } from "../thread-context";
import classes from "../analysis.module.css";

/** Marker href the remark plugin gives a key; the `a` override turns it into a JiraKeyLink. */
const HREF_PREFIX = "#jira:";
/** A link Claude wrote to an issue page also opens the popup. */
const BROWSE_RE = /^https?:\/\/[^/]+\/browse\/([A-Z][A-Z0-9_]*-\d+)\/?$/;

/** Regex of the configured project keys, or null when none are configured. */
export function useJiraKeyRegex(): RegExp | null {
  const { data } = useAnalysisStatus();
  const prefixes = data?.jiraPrefixes;
  return useMemo(() => {
    const clean = (prefixes ?? [])
      .map((p) => p.replace(/[^A-Z0-9_]/gi, ""))
      .filter(Boolean);
    if (!clean.length) return null;
    return new RegExp(
      `(?<![A-Za-z0-9_-])((?:${clean.join("|")})-\\d+)(?![A-Za-z0-9_])`,
      "gi",
    );
  }, [prefixes]);
}

// ---------------------------------------------------------------- markdown

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/** Splits text into text nodes and link nodes around the keys. */
function splitText(value: string, re: RegExp): MdNode[] | null {
  re.lastIndex = 0;
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(re)) {
    const key = m[1].toUpperCase();
    if (m.index! > last)
      out.push({ type: "text", value: value.slice(last, m.index) });
    out.push({
      type: "link",
      url: HREF_PREFIX + key,
      children: [{ type: "text", value: m[1] }],
    });
    last = m.index! + m[0].length;
  }
  if (!out.length) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

/**
 * remark plugin: keys in text, and inline code that is exactly a key, become
 * links. Text already inside a link is left alone. Create it with useMemo: the
 * markdown renderer re-parses when the plugin identity changes.
 */
export function remarkJiraKeys(re: RegExp) {
  const exact = new RegExp(`^${re.source}$`, "i");
  const walk = (node: MdNode) => {
    if (!node.children || node.type === "link" || node.type === "linkReference")
      return;
    const next: MdNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value) {
        const parts = splitText(child.value, re);
        if (parts) {
          next.push(...parts);
          continue;
        }
      } else if (
        child.type === "inlineCode" &&
        child.value &&
        exact.test(child.value.trim())
      ) {
        next.push({
          type: "link",
          url: HREF_PREFIX + child.value.trim().toUpperCase(),
          children: [child],
        });
        continue;
      }
      walk(child);
      next.push(child);
    }
    node.children = next;
  };
  return () => (tree: MdNode) => walk(tree);
}

/** `a` override for the chat markdown: Jira keys get the popup, other links open in a new tab. */
export function MarkdownLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown },
) {
  const { href, children, title, className } = props; // react-markdown also passes `node`
  const key = href?.startsWith(HREF_PREFIX)
    ? href.slice(HREF_PREFIX.length)
    : href?.match(BROWSE_RE)?.[1];
  if (key) return <JiraKeyLink jiraKey={key}>{children}</JiraKeyLink>;
  return (
    <a
      href={href}
      title={title}
      className={className}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

/** Plain text (user messages) with the keys made clickable. */
export function LinkifiedText({ text }: { text: string }) {
  const re = useJiraKeyRegex();
  if (!re) return <>{text}</>;
  const out: ReactNode[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <JiraKeyLink key={m.index} jiraKey={m[1].toUpperCase()}>
        {m[1]}
      </JiraKeyLink>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

// ---------------------------------------------------------------- popup

const STATUS_COLOR: Record<string, string> = {
  new: "gray",
  indeterminate: "blue",
  done: "teal",
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "–";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <Text size="xs" c="dimmed" w={72} className={classes.noShrink}>
        {label}
      </Text>
      <Text size="xs" component="div" className={classes.grow}>
        {children}
      </Text>
    </Group>
  );
}

function PreviewBody({
  jiraKey,
  onDetails,
}: {
  jiraKey: string;
  onDetails(): void;
}) {
  const { data, isLoading, error } = useJiraPreview(jiraKey, true);
  const { refreshJira } = useAnalysisMutations();

  if (isLoading) {
    return (
      <Group gap="xs" p="xs">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          Fetching {jiraKey} from Jira…
        </Text>
      </Group>
    );
  }
  if (error || !data) {
    return (
      <Alert color="yellow" p="xs" title={jiraKey}>
        <Text size="xs">{(error as Error)?.message ?? "Not found"}</Text>
      </Alert>
    );
  }

  // Details needs the full issue in the local cache; download it first when missing.
  const details = async () => {
    if (!data.cached) await refreshJira.mutateAsync(data.key);
    onDetails();
  };

  return (
    <Stack gap={8}>
      <Group gap={6} wrap="nowrap">
        <IconTicket
          size={16}
          color="var(--mantine-color-blue-4)"
          className={classes.noShrink}
        />
        <Text size="sm" fw={700}>
          {data.key}
        </Text>
        <Badge size="xs" variant="default">
          {data.type}
        </Badge>
        <Badge
          size="xs"
          variant="light"
          color={STATUS_COLOR[data.statusCategory ?? ""] ?? "gray"}
          ml="auto"
        >
          {data.status}
        </Badge>
      </Group>
      <Text size="sm" fw={500}>
        {data.summary}
      </Text>
      <Stack gap={2}>
        {data.parent && (
          <Field label="Parent">
            <JiraKeyLink jiraKey={data.parent.key}>
              {data.parent.key}
            </JiraKeyLink>{" "}
            {data.parent.summary}
          </Field>
        )}
        <Field label="Assignee">{data.assignee ?? "Unassigned"}</Field>
        <Field label="Reporter">{data.reporter ?? "–"}</Field>
        {data.priority && <Field label="Priority">{data.priority}</Field>}
        {data.fixVersions.length > 0 && (
          <Field label="Fix version">{data.fixVersions.join(", ")}</Field>
        )}
        {data.labels.length > 0 && (
          <Field label="Labels">
            <Group gap={4}>
              {data.labels.map((l) => (
                <Badge key={l} size="xs" variant="outline">
                  {l}
                </Badge>
              ))}
            </Group>
          </Field>
        )}
        <Field label="Updated">{when(data.updated)}</Field>
      </Stack>
      {data.description && (
        <ScrollArea.Autosize
          mah={220}
          type="auto"
          className={classes.jiraPreviewDesc}
        >
          <div className={classes.md}>
            <Markdown remarkPlugins={[remarkGfm]}>{data.description}</Markdown>
          </div>
        </ScrollArea.Autosize>
      )}
      {refreshJira.error && (
        <Alert color="red" p="xs">
          <Text size="xs">{(refreshJira.error as Error).message}</Text>
        </Alert>
      )}
      <Group gap="xs" justify="flex-end">
        <Tooltip
          label={
            data.cached
              ? "Cached issue with fields, links and attachments"
              : "Downloads the issue to the local cache, then opens it"
          }
        >
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<IconFileDescription size={14} />}
            loading={refreshJira.isPending}
            onClick={() => void details()}
          >
            Details
          </Button>
        </Tooltip>
        <Button
          size="compact-xs"
          variant="light"
          component="a"
          href={data.url}
          target="_blank"
          rel="noreferrer"
          rightSection={<IconExternalLink size={12} />}
        >
          Open in Jira
        </Button>
      </Group>
    </Stack>
  );
}

/** A clickable issue key; the popup content is fetched only once it opens. */
export function JiraKeyLink({
  jiraKey,
  children,
}: {
  jiraKey: string;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const { openJira } = useThreadActions();
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={440}
      position="bottom-start"
      shadow="md"
      withArrow
      withinPortal
    >
      <Popover.Target>
        <Anchor
          component="button"
          type="button"
          className={classes.jiraKey}
          onClick={(e) => {
            e.stopPropagation();
            setOpened((o) => !o);
          }}
          aria-haspopup="dialog"
          aria-expanded={opened}
        >
          {children}
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
        {opened && (
          <PreviewBody
            jiraKey={jiraKey}
            onDetails={() => {
              setOpened(false);
              openJira(jiraKey);
            }}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
