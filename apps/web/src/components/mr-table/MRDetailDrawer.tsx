import {
  Anchor,
  Badge,
  Divider,
  Drawer,
  Group,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import type { MergeRequest } from "@/types";
import { useMrReviews } from "@/hooks/use-merge-requests";

import { ConsoleTab } from "./ConsoleTab";
import { ReviewDetail } from "./ReviewDetail";
import { MRReviewHistory } from "./MRReviewHistory";

type MRDetailDrawerProps = {
  mr: MergeRequest | null;
  jiraKey: string;
  jiraTitle?: string;
  opened: boolean;
  onClose: () => void;
};

const GITLAB_BASE =
  "https://gitlab.tx-tech.com/team-csb-r6/winvest-core-fo/-/merge_requests";

const JIRA_BASE = "https://tx-tech.atlassian.net/browse";

export function MRDetailDrawer({
  mr,
  jiraKey,
  jiraTitle,
  opened,
  onClose,
}: MRDetailDrawerProps) {
  const mrReviews = useMrReviews(mr?.mrId ?? "");

  if (!mr) {
    return null;
  }

  const mrUrl = `${GITLAB_BASE}/${mr.id.replace("!", "")}`;
  const jiraUrl = `${JIRA_BASE}/${jiraKey}`;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Merge Request"
      position="right"
      size="xl"
    >
      <Stack gap="md">
        {/* Header */}
        <Stack gap="xs">
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Jira:
            </Text>

            <Anchor
              href={jiraUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              {jiraKey}
            </Anchor>
          </Group>

          {jiraTitle && (
            <Text fw={500} size="sm">
              {jiraTitle}
            </Text>
          )}

          <Group gap="xs">
            <Text size="sm" c="dimmed">
              MR:
            </Text>

            <Anchor
              href={mrUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              {mr.id}
            </Anchor>
          </Group>

          <Group gap="xs">
            <Text size="sm" c="dimmed">
              State:
            </Text>

            <Badge variant="light">{mr.status}</Badge>
          </Group>
        </Stack>

        <Divider />

        <Tabs defaultValue="console">
          <Tabs.List>
            <Tabs.Tab value="console">Console</Tabs.Tab>
            <Tabs.Tab value="detail">Detail</Tabs.Tab>
            <Tabs.Tab value="history">History</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="console" pt="md">
            <ConsoleTab review={mrReviews.data?.latest ?? null} />
          </Tabs.Panel>

          <Tabs.Panel value="detail" pt="md">
            <ReviewDetail review={mrReviews.data?.latest ?? null} />
          </Tabs.Panel>

          <Tabs.Panel value="history" pt="md">
            <MRReviewHistory history={mrReviews.data?.history ?? []} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Drawer>
  );
}
