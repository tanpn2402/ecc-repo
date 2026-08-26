import { useCallback, useMemo, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Anchor, Button, Menu, ScrollArea, Select } from "@mantine/core";
import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { useJiraMetadata } from "@/hooks/use-jira-metadata";
import {
  useJiraIssues,
  useRemoveSyncedIssue,
  useSyncedIssues,
  useSyncIssue,
} from "@/hooks/use-jira-issues";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { Issue } from "@/types";
import { MRTable } from "@/components/mr-table/MRTable";
import { AddIssueModal } from "@/components/modals/AddIssueModal";
import { useSearchParams } from "react-router-dom";

export function Issues() {
  const [opened, setOpened] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get("tab") ?? "synced";
  const group = searchParams.get("group");

  const setGroup = useCallback(
    (value: string | null) => {
      setSearchParams((params) => {
        if (value) {
          params.set("group", value);
        } else {
          params.delete("group");
        }

        return params;
      });
    },
    [setSearchParams],
  );

  const setTab = useCallback(
    (value: string | null) => {
      setSearchParams((params) => {
        if (value) {
          params.set("tab", value);
        } else {
          params.delete("tab");
        }

        return params;
      });
    },
    [setSearchParams],
  );

  const atlassianIssues = useJiraIssues();
  const syncedIssues = useSyncedIssues();
  const removeSyncedIssue = useRemoveSyncedIssue();

  const jiraIssues = useMemo(() => {
    const issues =
      (tab === "synced" ? syncedIssues.data : atlassianIssues.data) || [];
    if (group) {
      return issues.filter((issue) => issue.group === group);
    }
    return issues;
  }, [atlassianIssues.data, syncedIssues.data, group, tab]);

  const { data: metadata, isLoading } = useJiraMetadata();
  const syncIssue = useSyncIssue();

  const assignIssueToGroup = useCallback(
    (jiraKey: string, groupId: string) => {
      syncIssue.mutate({
        key: jiraKey,
        group: groupId,
      });
    },
    [syncIssue],
  );

  const markIssueDone = useCallback(
    (jiraKey: string) => {
      removeSyncedIssue.mutate(jiraKey);
    },
    [removeSyncedIssue],
  );

  const { groups, groupMap } = useMemo(() => {
    return {
      groups: (metadata?.groups || []).map(({ id, name }) => ({
        value: id,
        label: name,
      })),
      groupMap: (metadata?.groups || []).reduce(
        (result, { id, name }) => {
          result[id] = name;
          return result;
        },
        {} as Record<string, string>,
      ),
    };
  }, [metadata]);

  const columns: MRT_ColumnDef<Issue>[] = [
    {
      accessorKey: "key",
      header: "Key",
      size: 120,
      Cell: ({ cell }) => {
        const jiraId = cell.getValue<string | null>();

        if (!jiraId) {
          return "-";
        }

        return (
          <Anchor
            href={`https://tx-tech.atlassian.net/browse/${jiraId}`}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
          >
            {jiraId}
          </Anchor>
        );
      },
    },
    {
      accessorKey: "summary",
      header: "Summary",
      size: 500,
    },
    // {
    //   accessorKey: "priority",
    //   header: "Priority",
    //   size: 120,
    // },
    {
      accessorKey: "sprint",
      header: "Sprint",
      size: 280,
    },
    {
      accessorKey: "assignee",
      header: "Assignee",
      size: 180,
    },
    {
      accessorKey: "group",
      header: "Group",
      size: 150,
      Cell: ({ row }) => groupMap[row.original.group] || row.original.group,
    },
  ];

  const table = useMantineReactTable({
    columns,
    data: jiraIssues,
    enableColumnFilterModes: false,
    enableColumnOrdering: true,
    enableFacetedValues: true,
    enableFilters: false,
    enableDensityToggle: false,
    enableColumnFilters: true,
    columnFilterDisplayMode: "popover",
    enableFullScreenToggle: true,
    enableColumnActions: false,
    enableColumnResizing: true,
    enableHiding: true,
    enableGrouping: true,
    groupedColumnMode: "reorder",
    enableColumnPinning: false,
    enableTopToolbar: true,
    enableRowActions: true,
    positionActionsColumn: "last",
    enableExpandAll: false,
    enableExpanding: true,
    enableBottomToolbar: false,
    initialState: {
      density: "md",
    },
    state: {
      showProgressBars:
        atlassianIssues.isLoading ||
        syncedIssues.isLoading ||
        syncIssue.isPending ||
        removeSyncedIssue.isPending,
    },
    renderRowActionMenuItems: ({ row }) => (
      <>
        <Menu.Label>Assign to group</Menu.Label>
        <ScrollArea.Autosize mah={120}>
          {groups.map(({ value, label }) => (
            <Menu.Item
              key={value}
              onClick={() => assignIssueToGroup(row.getValue("key"), value)}
            >
              {label}
            </Menu.Item>
          ))}
        </ScrollArea.Autosize>
        {tab === "synced" ? (
          <>
            <Menu.Divider />
            <Menu.Item onClick={() => markIssueDone(row.getValue("key"))}>
              Mark Done
            </Menu.Item>
          </>
        ) : null}
      </>
    ),
    renderDetailPanel: ({ row }) => <MRTable jiraKey={row.original.key} />,
  });

  return (
    <div>
      <PageHeader
        title="Issues"
        tabs={{
          items: [
            {
              value: "synced",
              label: "Synced",
            },
            {
              value: "atlassian",
              label: "Atlassian Issues",
            },
          ],
          value: tab || "synced",
          onChange: setTab,
        }}
        filters={[
          <Select
            w={160}
            placeholder="Group"
            data={groups}
            value={group}
            onChange={setGroup}
            clearable
            loading={isLoading}
          />,
        ]}
        actions={[
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setOpened(true)}
          >
            New Issue
          </Button>,
        ]}
      />

      <PageContent>
        <MantineReactTable table={table} />
      </PageContent>

      <AddIssueModal opened={opened} onClose={() => setOpened(false)} />
    </div>
  );
}
