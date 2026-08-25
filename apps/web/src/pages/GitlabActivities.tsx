import { useMemo, useState } from "react";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
import { useGitlabActivities } from "@/hooks/use-gitlab-activities";
import { GitlabActivity } from "@/types";
import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Anchor, Button, Group, Text } from "@mantine/core";
import { extractJiraId } from "@/utils/jira.utils";
import { IconPlayerPlay } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import dayjs from "dayjs";
import { ImportOpsModal } from "@/components/modals/ImportOpsModal";

function formatDayName(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(new Date(`${date}T00:00:00`));
}

function getThisWeek() {
  const today = dayjs();
  const day = today.day();

  const monday = today.subtract(day === 0 ? 6 : day - 1, "day");

  return {
    from: monday.format("YYYY-MM-DD"),
    to: monday.add(6, "day").format("YYYY-MM-DD"),
  };
}

function addDays(value: string, days: number): string {
  return dayjs(value).add(days, "day").format("YYYY-MM-DD");
}

export function GitlabActivities() {
  const thisWeek = getThisWeek();

  const [fromDate, setFromDate] = useState<string | null>(thisWeek.from);
  const [toDate, setToDate] = useState<string | null>(thisWeek.to);

  const [importOpened, setImportOpened] = useState(false);

  const params = {
    userIds: [],
    types: [],
    from: fromDate ? addDays(fromDate, -1) : "",
    to: toDate ? addDays(toDate, 1) : "",
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
      <PageHeader
        title="GitLab Activities"
        filters={[
          <Group key="from" gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              Start date
            </Text>

            <DateInput
              value={fromDate}
              onChange={setFromDate}
              valueFormat="YYYY-MM-DD"
              clearable={false}
              size="sm"
              w={140}
            />
          </Group>,

          <Group key="to" gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              End date
            </Text>

            <DateInput
              value={toDate}
              onChange={setToDate}
              valueFormat="YYYY-MM-DD"
              clearable={false}
              size="sm"
              w={140}
            />
          </Group>,
        ]}

        actions={[
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            onClick={() => setImportOpened(true)}
          >
            Import OPS
          </Button>,
        ]}
      />
      <PageContent>
        <MantineReactTable table={table} />
      </PageContent>

      <ImportOpsModal
        opened={importOpened}
        onClose={() => setImportOpened(false)}
        activities={data ?? []}
      />
    </div>
  );
}
