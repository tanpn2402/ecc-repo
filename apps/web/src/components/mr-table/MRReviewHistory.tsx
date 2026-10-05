import { useMemo } from "react";

import { Button, Center, Group, ScrollArea, Stack, Text } from "@mantine/core";

import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";

import type { MergeRequest, ReviewRun } from "@/types";

import { MRReviewDetail } from "./MRReviewDetail";
import { compactRelativeTime } from "@/utils/datetime.utils";
import ReviewStatusBadge from "../badges/ReviewStatusBadge";
import { IconDownload } from "@tabler/icons-react";

type ReviewHistoryProps = {
  mr: MergeRequest;
  history: ReviewRun[];
};

export function MRReviewHistory({ mr, history }: ReviewHistoryProps) {
  function exportReviewHistoryCsv(history: ReviewRun[]) {
    const headers = [
      "Created",
      "Completed",
      "Status",
      "Summary",
      "Executed By",
    ];

    const rows = history.map((review) => [
      review.createdAt ?? "",
      review.completedAt ?? "",
      review.verdict ?? "",
      review.summary ?? "",
      review.execBy ?? "",
    ]);

    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      mr.gitlabProject + "_" + mr.gitlabMrIid + "_" + "review_history.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  const columns = useMemo<MRT_ColumnDef<ReviewRun>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 180,
        Cell: ({ cell }) => {
          const dt = cell.getValue<string | null>();
          if (dt) {
            return compactRelativeTime(dt);
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
            return compactRelativeTime(dt);
          }
          return "";
        },
      },
      {
        accessorKey: "verdict",
        header: "Status",
        size: 120,
        Cell: ({ cell, row }) => (
          <ReviewStatusBadge
            verdict={cell.getValue<string>()}
            status={row.original.status}
          />
        ),
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

    mantineDetailPanelProps: {
      style: {
        padding: 0,
      },
    },

    renderDetailPanel:
      history.length > 0
        ? ({ row }) => (
            <Stack>
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
      sorting: [
        {
          id: "createdAt",
          desc: true,
        },
      ],
    },
  });

  return (
    <Stack h="100%">
      <Group justify="flex-end">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={16} />}
          onClick={() => exportReviewHistoryCsv(history)}
        >
          Export CSV
        </Button>
      </Group>

      <ScrollArea h="100%" type="auto">
        <MantineReactTable table={table} />
      </ScrollArea>
    </Stack>
  );
}
