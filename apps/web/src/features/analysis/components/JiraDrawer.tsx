import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { analysisApi } from "../api";
import { useAnalysisMutations, useCachedJira } from "../queries";
import classes from "../analysis.module.css";

/** The cached issue.md of one Jira issue, with its attachments served by the backend. */
export function JiraDrawer(props: { jiraKey: string | null; onClose(): void }) {
  const key = props.jiraKey;
  const { data, isLoading, error } = useCachedJira(key);
  const { refreshJira } = useAnalysisMutations();
  const toUrl = (url: string) =>
    key && url.startsWith("attachments/")
      ? analysisApi.jiraAttachmentUrl(key, url)
      : url;

  return (
    <Drawer
      opened={!!key}
      onClose={props.onClose}
      position="right"
      size="xl"
      title={key ?? ""}
    >
      {isLoading && <Loader size="sm" />}
      {error && (
        <Alert color="yellow" p="xs">
          {(error as Error).message}
        </Alert>
      )}
      {data && (
        <Stack gap="sm">
          <Group gap="xs">
            <Badge variant="light">{data.status}</Badge>
            <Text size="xs" c="dimmed">
              cached {new Date(data.fetchedAt).toLocaleString()}
            </Text>
            <Anchor href={data.url} target="_blank" size="xs">
              <Group gap={2}>
                Open in Jira <IconExternalLink size={12} />
              </Group>
            </Anchor>
            <Button
              ml="auto"
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              loading={refreshJira.isPending}
              onClick={() => key && refreshJira.mutate(key)}
            >
              Refresh
            </Button>
          </Group>
          {refreshJira.error && (
            <Alert color="red" p="xs">
              {(refreshJira.error as Error).message}
            </Alert>
          )}
          <div className={classes.md}>
            <Markdown remarkPlugins={[remarkGfm]} urlTransform={toUrl}>
              {data.markdown ?? ""}
            </Markdown>
          </div>
        </Stack>
      )}
    </Drawer>
  );
}
