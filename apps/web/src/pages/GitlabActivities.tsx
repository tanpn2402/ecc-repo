import { useMemo } from "react";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { useGitlabActivities } from "@/hooks/use-gitlab-activities";
import { GitlabActivity } from "@/types";
import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Anchor } from "@mantine/core";
import { extractJiraId } from "@/utils/jira.utils";

function formatDayName(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(new Date(`${date}T00:00:00`));
}

export function GitlabActivities() {
  const params = {
    userIds: [],
    types: [],
    from: "2026-08-01",
    to: "2026-08-26",
  };

  const { data = [], isLoading } = useGitlabActivities(params);

  const columns = useMemo<MRT_ColumnDef<GitlabActivity>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        Cell: ({ cell }) => {
          const date = cell.getValue<string>();
          return `${date} (${formatDayName(date)})`;
        },
        size: 200,
      },
      {
        accessorKey: "datetime",
        header: "Time",
        size: 120,
        Cell: ({ cell }) => {
          const datetime = cell.getValue<string>();

          if (!datetime) {
            return "-";
          }

          const date = new Date(datetime);

          if (Number.isNaN(date.getTime())) {
            return "-";
          }

          return new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).format(date);
        },
      },
      {
        accessorKey: "userName",
        header: "User",
      },
      {
        accessorKey: "typeLabel",
        header: "Activity",
        size: 200,
      },
      {
        id: "jiraId",
        header: "Jira ID",
        size: 120,
        accessorFn: (row) => extractJiraId(row.title ?? ""),
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
        accessorKey: "title",
        header: "Title",
        size: 700,
      },
    ],
    [],
  );

  const table = useMantineReactTable({
    columns,
    data,
    enableGrouping: true,
    enableColumnOrdering: true,
    enableColumnResizing: true,
    initialState: {
      grouping: ["date"],
      expanded: true,
    },
    groupedColumnMode: "reorder",
    state: {
      isLoading,
    },
    enablePagination: false,
    enableColumnActions: false,
  });

  return (
    <div>
      <PageHeader title="GitLab Activities" filters={[]} />
      <PageContent>
        <MantineReactTable table={table} />
      </PageContent>
    </div>
  );
}
