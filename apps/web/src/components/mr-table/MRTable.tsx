import { useMemo, useState } from "react";
import { useIssueMrs } from "@/hooks/use-jira-issues";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { MergeRequest } from "@/types";
import { Anchor, Badge, Button, Center, Group, Text } from "@mantine/core";
import { MRDetailDrawer } from "./MRDetailDrawer";
import { MRReviewDialog } from "./MRReviewDialog";
import { IconMenuDeep, IconPlayerPlay } from "@tabler/icons-react";
import MRStatusBadge from "./MRStatusBadge";

export type MRTableProps = {
  jiraKey: string;
};

export function MRTable({ jiraKey }: MRTableProps) {
  const [detailMr, setDetailMr] = useState<MergeRequest | null>(null);
  const [reviewMr, setReviewMr] = useState<MergeRequest | null>(null);

  const issueMrs = useIssueMrs(jiraKey);

  const mrs = useMemo(() => {
    return issueMrs.data || [];
  }, [issueMrs.data]);

  const columns: MRT_ColumnDef<MergeRequest>[] = [
    {
      accessorKey: "id",
      header: "MR",
      size: 100,
      Cell: ({ cell }) => {
        const mrUrl = cell.getValue<string | null>();

        if (!mrUrl) {
          return "-";
        }

        return (
          <Anchor
            href={`https://gitlab.tx-tech.com/team-csb-r6/winvest-core-fo/-/merge_requests/${mrUrl.replace("!", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
          >
            {mrUrl}
          </Anchor>
        );
      },
    },
    {
      accessorKey: "author",
      header: "Author",
      size: 180,
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 140,
      Cell: ({ cell, row }) => {
        const status = cell.getValue<string>();
        const gitlabState = row.getValue<string>("state");

        if (["merged"].includes(gitlabState)) {
          return <MRStatusBadge status='MERGED' />;
        }

        return (
          <MRStatusBadge status={status} />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      size: 160,
    },
    {
      accessorKey: "lastRun",
      header: "Last Run",
      size: 160,
    },
    {
      accessorKey: "actionLabel",
      header: "Action",
      size: 260,
      sortingFn: undefined,
      Cell: ({ cell, row }) => {
        return (
          <Group wrap="nowrap">
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => setDetailMr(row.original)}
              leftSection={<IconMenuDeep size={16} />}
            >
              Detail
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => setReviewMr(row.original)}
              leftSection={<IconPlayerPlay size={16} />}
            >
              Review
            </Button>
          </Group>
        );
      },
    },
  ];

  const table = useMantineReactTable({
    columns,
    data: mrs,
    enableColumnFilterModes: false,
    enableColumnOrdering: true,
    enableFacetedValues: true,
    enableFilters: false,
    enableDensityToggle: false,
    enableColumnFilters: true,
    columnFilterDisplayMode: "popover",
    enableFullScreenToggle: false,
    enableColumnActions: false,
    enableColumnResizing: true,
    enableHiding: true,
    enableColumnPinning: true,
    enableTopToolbar: false,
    enableRowActions: false,
    positionActionsColumn: "last",
    enableBottomToolbar: false,
    enablePagination: false,
    mantineLoadingOverlayProps: {
      display: "none",
    },
    mantineTableBodyProps: {
      style: {
        minHeight: "36px",
      },
    },
    initialState: {
      density: "xs",
    },
    state: {
      isLoading: issueMrs.isLoading,
      pagination: {
        pageIndex: 0,
        pageSize: 1,
      },
    },
    renderEmptyRowsFallback: () => (
      <Center>
        <Text fs="italic" size="sm">
          No Merge Requests found
        </Text>
      </Center>
    ),
  });

  return (
    <>
      <MantineReactTable table={table} />
      <MRDetailDrawer
        mr={detailMr}
        jiraKey={jiraKey}
        opened={!!detailMr}
        onClose={() => setDetailMr(null)}
      />

      <MRReviewDialog
        mr={reviewMr}
        jiraKey={jiraKey}
        opened={!!reviewMr}
        onClose={() => setReviewMr(null)}
      />
    </>
  );
}
