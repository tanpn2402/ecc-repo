import { useMemo } from "react";

import { Badge, Center, Stack, Text } from "@mantine/core";

import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";

import type { ReviewRun } from "@/types";

import { MRReviewDetail } from "./MRReviewDetail";
import { formatDateTime } from "@/utils/datetime.utils";

type ReviewHistoryProps = {
  history: ReviewRun[];
};

function ReviewStatus({ status }: { status: string }) {
  return <Badge variant={status === "running" ? "dot" : "light"}>{status}</Badge>;
}

export function MRReviewHistory({ history }: ReviewHistoryProps) {
  const columns = useMemo<MRT_ColumnDef<ReviewRun>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 180,
        Cell: ({ cell }) => {
          const dt = cell.getValue<string | null>();
          if (dt) {
            return formatDateTime(dt);
          }
          return "";
        },
      },
      {
        accessorKey: "completedAt",
        header: "Completed",
        size: 180,
        Cell: ({ cell }) => {
          const dt = cell.getValue<string | null>();
          if (dt) {
            return formatDateTime(dt);
          }
          return "";
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ cell }) => <ReviewStatus status={cell.getValue<string>()} />,
      },
      {
        accessorKey: "execBy",
        header: "Executed By",
        size: 160,
      },
    ],
    [],
  );

  const table = useMantineReactTable({
    columns,
    data: history,

    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,

    enableExpandAll: false,
    enableExpanding: history.length > 0,

    renderDetailPanel:
      history.length > 0
        ? ({ row }) => (
          <Stack p="md">
            <MRReviewDetail review={row.original} />
          </Stack>
        )
        : undefined,

    renderEmptyRowsFallback: () => (
      <Center>
        <Text fs="italic" size="sm">
          No history found
        </Text>
      </Center>
    ),

    initialState: {
      density: "xs",
    },
  });

  return <MantineReactTable table={table} />;
}
