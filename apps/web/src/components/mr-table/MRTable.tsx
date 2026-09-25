import { useMemo, useState } from "react";
import { useIssueMrs } from "@/hooks/use-jira-issues";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { Issue, MergeRequest } from "@/types";
import { Anchor, Button, Center, Code, Group, Text } from "@mantine/core";
import { MRDetailDrawer } from "./MRDetailDrawer";
import { MRReviewDialog } from "./MRReviewDialog";
import { IconMenuDeep, IconPlayerPlay } from "@tabler/icons-react";
import MRStatusBadge from "../badges/MRStatusBadge";
import { compactRelativeTime } from "@/utils/datetime.utils";
import ReviewStatusBadge from "../badges/ReviewStatusBadge";

export type MRTableProps = {
  jiraKey: string;
  issue?: Issue | null;
};

export function MRTable({ jiraKey, issue }: MRTableProps) {
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
      accessorKey: "gitlabProject",
      header: "Project",
      size: 240,
      Cell: ({ cell }) => <Code>{cell.getValue<string>()}</Code>,
    },
    {
      accessorKey: "targetBranch",
      header: "Target Branch",
      size: 180,
      Cell: ({ cell }) => <Code>{cell.getValue<string>()}</Code>,
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 140,
      Cell: ({ cell, row }) => {
        const status = cell.getValue<string>();
        const gitlabState = row.original.status;

        return <MRStatusBadge status={status} gitlabState={gitlabState} />;
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
      size: 250,
      Cell: ({ row }) => {
        const { reviewStatus, reviewVerdict, reviewCompletedAt } = row.original;
        return (
          <ReviewStatusBadge
            status={reviewStatus}
            verdict={reviewVerdict}
            completedAt={reviewCompletedAt}
          />
        );
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
  ];

  const table = useMantineReactTable({
    columns,
    data: mrs,
    enableColumnFilterModes: false,
    enableColumnOrdering: false,
    enableFacetedValues: true,
    enableFilters: false,
    enableDensityToggle: false,
    enableColumnFilters: true,
    columnFilterDisplayMode: "popover",
    enableFullScreenToggle: false,
    enableColumnActions: false,
    enableColumnResizing: false,
    enableHiding: true,
    enableColumnPinning: false,
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
    mantineTableHeadCellProps: {
      style: {
        padding: "4px 8px",
        fontSize: 10,
      },
    },
    initialState: {
      density: "xs",
      sorting: [
        {
          id: "createdAt",
          desc: true,
        },
      ],
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
        mr={
          detailMr
            ? { ...detailMr, jiraTitle: issue?.summary ?? "", jiraKey }
            : null
        }
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
