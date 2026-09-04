import { Anchor, Drawer, Group, Stack, Tabs, Text } from "@mantine/core";

import type { MergeRequest } from "@/types";
import { useMrReviews } from "@/hooks/use-merge-requests";

import { ConsoleTab } from "./MRConsoleTab";
import { MRReviewDetail } from "./MRReviewDetail";
import { MRReviewHistory } from "./MRReviewHistory";
import MRStatusBadge from "../badges/MRStatusBadge";

import classes from "./MRDetailDrawer.module.css";
import { useMrDetailDrawer } from "@/hooks/use-mr-detail-drawer";

type MRDetailDrawerProps = {
  mr: MergeRequest | null;
  opened: boolean;
  onClose: () => void;
};

const JIRA_BASE = "https://tx-tech.atlassian.net/browse";

export function MRDetailDrawer({ mr, opened, onClose }: MRDetailDrawerProps) {
  const mrReviews = useMrReviews(mr?.mrId ?? "");

  const { width: drawerWidth, startResize } = useMrDetailDrawer();

  if (!mr) {
    return null;
  }

  const mrUrl = mr.gitlabUrl;
  const jiraUrl = `${JIRA_BASE}/${mr.jiraKey}`;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap="xs">
          <Text>JIRA details</Text>

          {mr.jiraTitle && (
            <Text fw={500} size="md">
              {mr.jiraTitle}
            </Text>
          )}

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
              {mr.jiraKey}
            </Anchor>
          </Group>

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
              !{mr.gitlabMrIid}
            </Anchor>
          </Group>

          <Group gap="xs">
            <Text size="sm" c="dimmed">
              State:
            </Text>

            <MRStatusBadge status={mr.status} />
          </Group>
        </Stack>
      }
      position="right"
      size={drawerWidth}
      h="100vh"
      classNames={{
        content: classes.drawerContent,
        body: classes.drawerBody,
      }}
    >
      <div
        className={classes.resizeHandle}
        onPointerDown={startResize}
        style={{
          left: `calc(100% - ${drawerWidth}px)`,
        }}
      />

      <Tabs defaultValue="console" h="100%">
        <Tabs.List>
          <Tabs.Tab value="console">Console</Tabs.Tab>
          <Tabs.Tab value="detail">Detail</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="console" pt="md" h="calc(100% - 34px)">
          <ConsoleTab review={(mrReviews.data?.history ?? [])[0]} />
        </Tabs.Panel>

        <Tabs.Panel value="detail" pt="md" h="calc(100% - 34px)">
          <MRReviewDetail review={mrReviews.data?.latest ?? null} />
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md" h="calc(100% - 34px)">
          <MRReviewHistory history={mrReviews.data?.history ?? []} />
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}
