import { useCallback, useMemo, useState } from "react";
import {
  IconCircleCheck,
  IconExclamationCircle,
  IconPlus,
} from "@tabler/icons-react";
import {
  Anchor,
  Badge,
  BadgeProps,
  Button,
  Center,
  Group,
  Menu,
  ScrollArea,
  Select,
  Skeleton,
  Tooltip,
} from "@mantine/core";
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
import { compactRelativeTime } from "@/utils/datetime.utils";
import { useTableQueryState } from "@/hooks/use-table-query-state";

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

  const { data: metadata, isLoading } = useJiraMetadata();
  const atlassianIssues = useJiraIssues({ enabled: tab !== "synced" });
  const syncedIssues = useSyncedIssues({ enabled: tab === "synced" });
  const removeSyncedIssue = useRemoveSyncedIssue();
  const syncIssue = useSyncIssue();

  const jiraIssues = useMemo(() => {
    const issues =
      (tab === "synced" ? syncedIssues.data : atlassianIssues.data) || [];
    if (group) {
      return issues.filter((issue) => issue.group === group);
    }
    return issues;
  }, [atlassianIssues.data, syncedIssues.data, group, tab]);

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

  const columns = useMemo<MRT_ColumnDef<Issue>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Key",
        size: 120,
        filterVariant: "multi-select",
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
        size: 700,
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
        filterVariant: "multi-select",
      },
      {
        accessorKey: "assignee",
        header: "Assignee",
        size: 180,
        filterVariant: "multi-select",
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 180,
        filterVariant: "multi-select",
        Cell: ({ cell }) => {
          const status = cell.getValue<string>();
          if (status === "-") {
            return <Skeleton height={16} radius="xl" />;
          }
          const color: Record<string, BadgeProps["color"]> = {
            "Development Done": "green",
            "Delivered To PDM": "blue",
            Open: "gray",
            "In Progress": "yellow",
            Backlog: "indigo",
          };

          const variant: Record<string, BadgeProps["variant"]> = {
            Backlog: "outline",
            "In Progress": "dot",
          };

          return (
            <Badge
              color={color[status] ?? "gray"}
              variant={variant[status] ?? "light"}
            >
              {status}
            </Badge>
          );
        },
      },
      {
        accessorKey: "reviewedPassByAI",
        header: "Reviewed by AI",
        size: 100,
        Cell: ({ cell, row }) => {
          const reviewedPassByAI = cell.getValue<boolean | undefined>();
          const labels = row.original.labels;
          if (reviewedPassByAI === undefined) {
            return <Skeleton height={16} radius="xl" />;
          }
          if (!labels || labels.length === 0) {
            return null;
          }
          return (
            <Tooltip
              label={
                labels ? (
                  <Group gap="sm">
                    {labels.map((label) => (
                      <Badge key={label} variant="default">
                        {label}
                      </Badge>
                    ))}
                  </Group>
                ) : undefined
              }
            >
              <Center w="100%">
                {reviewedPassByAI ? (
                  <IconCircleCheck size={20} color="green" />
                ) : (
                  <IconExclamationCircle size={20} color="orange" />
                )}
              </Center>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created At",
        size: 140,
        Cell: ({ cell }) => compactRelativeTime(cell.getValue<string>()),
      },
      {
        accessorKey: "updated",
        header: "Updated At",
        size: 140,
        Cell: ({ cell }) => compactRelativeTime(cell.getValue<string>()),
      },
      {
        accessorKey: "group",
        header: "Group",
        size: 150,
        filterVariant: "multi-select",
        Cell: ({ row }) => groupMap[row.original.group] || row.original.group,
      },
    ],
    [groupMap],
  );

  const {
    state,
    setGrouping,
    setSorting,
    setColumnFilters,
    setGlobalFilter,
    setColumnVisibility,
    setDensity,
    setExpanded,
    setIsFullScreen,
  } = useTableQueryState({
    density: "md",
    grouping: ["group"],
    columnVisibility: {
      sprint: false,
      updated: false,
    },
    sorting: [{ id: "createdAt", desc: true }],
  });

  const table = useMantineReactTable({
    columns,
    data: jiraIssues,
    enableColumnFilterModes: false,
    enableColumnOrdering: true,
    enableFacetedValues: true,
    enableFilters: true,
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
    enablePagination: false,
    enableGlobalFilter: true,

    state: {
      ...state,
      isLoading: atlassianIssues.isLoading || syncedIssues.isLoading,
      showProgressBars:
        atlassianIssues.isFetching ||
        syncedIssues.isFetching ||
        syncIssue.isPending ||
        removeSyncedIssue.isPending,
    },

    onGroupingChange: setGrouping,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onDensityChange: setDensity,
    onExpandedChange: setExpanded,
    onIsFullScreenChange: setIsFullScreen,

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
            <Menu.Item
              onClick={() =>
                assignIssueToGroup(row.getValue("key"), row.original.group)
              }
            >
              Re-fetch Jira Data
            </Menu.Item>
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
