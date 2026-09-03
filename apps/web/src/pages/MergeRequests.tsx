import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Anchor, Button, Group, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { MergeRequest } from "@/types";
import { compactRelativeTime } from "@/utils/datetime.utils";
import { IconMenuDeep, IconPlayerPlay } from "@tabler/icons-react";
import { MRDetailDrawer } from "@/components/mr-table/MRDetailDrawer";
import { MRReviewDialog } from "@/components/mr-table/MRReviewDialog";
import MRStatusBadge from "@/components/mr-table/MRStatusBadge";
import { useMergeRequests } from "@/hooks/use-merge-requests";
import { useTableQueryState } from "@/hooks/use-table-query-state";

export function MergeRequests() {
  const { data = [], isLoading, error } = useMergeRequests();
  const [detailMrId, setDetailMrId] = useState<string | null>(null);
  const [reviewMrId, setReviewMrId] = useState<string | null>(null);

  const detailMr = useMemo(
    () => (data || []).find(({ mrId }) => mrId === detailMrId),
    [data, detailMrId],
  );

  const reviewMr = useMemo(
    () => (data || []).find(({ mrId }) => mrId === reviewMrId),
    [data, reviewMrId],
  );

  if (error) {
    return <div>Failed to load merge requests</div>;
  }

  const columns = useMemo<MRT_ColumnDef<MergeRequest>[]>(
    () => [
      {
        accessorKey: "jiraKey",
        header: "Jira",
        size: 120,
        Cell: ({ row }) => (
          <Anchor
            href={`https://tx-tech.atlassian.net/browse/${row.original.jiraKey}`}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
          >
            {row.original.jiraKey}
          </Anchor>
        ),
      },

      {
        accessorKey: "jiraTitle",
        header: "Jira Title",
        size: 500,
      },

      {
        accessorKey: "gitlabProject",
        header: "Project",
        size: 220,
      },

      {
        accessorKey: "gitlabMrIid",
        header: "MR",
        size: 80,
        Cell: ({ row }) => (
          <Anchor
            href={row.original.gitlabUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
          >
            !{row.original.gitlabMrIid}
          </Anchor>
        ),
      },

      {
        accessorKey: "author",
        header: "Author",
        size: 150,
        Cell: ({ cell }) => (
          <Text>{cell.getValue<string | null>() || "-"}</Text>
        ),
      },

      {
        accessorKey: "status",
        header: "MR Status",
        size: 130,
        Cell: ({ cell, row }) => {
          const status = cell.getValue<string>();
          const gitlabState = row.original.status;

          if (["merged"].includes(gitlabState)) {
            return <MRStatusBadge status="MERGED" />;
          }

          return <MRStatusBadge status={status} />;
        },
      },

      {
        accessorKey: "reviewCompletedAt",
        header: "Last Run",
        size: 250,
        Cell: ({ row }) => {
          const { reviewStatus, reviewVerdict, reviewCompletedAt } =
            row.original;
          if (reviewStatus === "running") {
            return "Running...";
          } else if (
            reviewStatus === null ||
            reviewStatus.trim().length === 0
          ) {
            return "";
          } else {
            return `${reviewVerdict} ${compactRelativeTime(reviewCompletedAt!)}`;
          }
        },
      },

      {
        accessorKey: "createdAt",
        header: "Created At",
        size: 170,
        Cell: ({ cell }) => compactRelativeTime(cell.getValue<string>()),
      },
      {
        header: "Action",
        size: 220,
        Cell: ({ row }) => {
          return (
            <Group wrap="nowrap">
              <Button
                size="compact-sm"
                variant="default"
                onClick={() => setDetailMrId(row.original.mrId)}
                leftSection={<IconMenuDeep size={16} />}
              >
                Detail
              </Button>
              {row.original.status === "merged" ? null : (
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => setReviewMrId(row.original.mrId)}
                  leftSection={<IconPlayerPlay size={16} />}
                >
                  Review
                </Button>
              )}
            </Group>
          );
        },
      },
    ],
    [],
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
  } = useTableQueryState({
    density: "sm",
    sorting: [
      {
        id: "createdAt",
        desc: true,
      },
    ],
    columnVisibility: {
      gitlabProject: false,
    },
  });

  const table = useMantineReactTable({
    columns,
    data,
    state: {
      ...state,
      isLoading,
    },
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
    enableRowActions: false,
    positionActionsColumn: "last",
    enableBottomToolbar: false,
    enablePagination: false,

    onGroupingChange: setGrouping,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onDensityChange: setDensity,
    onExpandedChange: setExpanded,

    initialState: {},
  });

  return (
    <div>
      <PageHeader title="Merge Requests" />
      <PageContent>
        <MantineReactTable table={table} />
      </PageContent>

      <MRDetailDrawer
        mr={detailMr ?? null}
        opened={!!detailMr}
        onClose={() => setDetailMrId(null)}
      />

      <MRReviewDialog
        mr={reviewMr ?? null}
        opened={!!reviewMr}
        onClose={() => setReviewMrId(null)}
      />
    </div>
  );
}
