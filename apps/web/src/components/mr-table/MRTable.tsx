import { useMemo, useState } from "react";
import { useIssueMrs } from "@/hooks/use-jira-issues";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { MergeRequest } from "@/types";
import { Anchor, Button, Center, Group, Text } from "@mantine/core";
import { MRDetailDrawer } from "./MRDetailDrawer";
import { MRReviewDialog } from "./MRReviewDialog";
import { IconMenuDeep, IconPlayerPlay } from "@tabler/icons-react";
import MRStatusBadge from "./MRStatusBadge";
import { compactRelativeTime } from "@/utils/datetime.utils";

export type MRTableProps = {
  jiraKey: string;
};

export function MRTable({ jiraKey }: MRTableProps) {
  const [detailMrId, setDetailMrId] = useState<string | null>(null);
  const [reviewMrId, setReviewMrId] = useState<string | null>(null);

  const issueMrs = useIssueMrs(jiraKey);

  const detailMr = useMemo(
    () => (issueMrs.data || []).find(({ mrId }) => mrId === detailMrId),
    [issueMrs.data, detailMrId],
  );

  const reviewMr = useMemo(
    () => (issueMrs.data || []).find(({ mrId }) => mrId === reviewMrId),
    [issueMrs.data, reviewMrId],
  );

  const mrs = useMemo(() => {
    return issueMrs.data || [];
  }, [issueMrs.data]);

  const columns: MRT_ColumnDef<MergeRequest>[] = [
    {
      accessorKey: "gitlabMrIid",
      header: "MR",
      size: 100,
      Cell: ({ cell, row }) => {
        const mrUrl = cell.getValue<string | null>();

        if (!mrUrl) {
          return "-";
        }

        return (
          <Anchor
            href={row.original.gitlabUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
          >
            !{mrUrl}
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
        const gitlabState = row.original.status;

        if (["merged"].includes(gitlabState)) {
          return <MRStatusBadge status="MERGED" />;
        }

        return <MRStatusBadge status={status} />;
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      size: 160,
      Cell: ({ cell }) => compactRelativeTime(cell.getValue<string>()),
    },
    {
      accessorKey: "reviewCompletedAt",
      header: "Last Run",
      size: 200,
      Cell: ({ row }) => {
        const { reviewStatus, reviewVerdict, reviewCompletedAt } = row.original;
        if (reviewStatus === "running") {
          return "Running...";
        } else if (reviewStatus === null || reviewStatus.trim().length === 0) {
          return "";
        } else {
          return `${reviewVerdict} ${compactRelativeTime(reviewCompletedAt!)}`;
        }
      },
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
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => setReviewMrId(row.original.mrId)}
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
        mr={detailMr ?? null}
        opened={!!detailMr}
        onClose={() => setDetailMrId(null)}
      />

      <MRReviewDialog
        mr={reviewMr ?? null}
        opened={!!reviewMr}
        onClose={() => setReviewMrId(null)}
      />
    </>
  );
}
