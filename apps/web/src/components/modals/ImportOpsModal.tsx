import { useEffect, useMemo, useState } from "react";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
  type MRT_RowSelectionState,
} from "@repo/mantine-table";

import type { GitlabActivity } from "@/types";
import { extractJiraId } from "@/utils/jira.utils";
import { IconDatabaseImport } from "@tabler/icons-react";

interface ImportOpsModalProps {
  opened: boolean;
  onClose: () => void;
  activities: GitlabActivity[];
}

interface ImportActivity extends GitlabActivity {
  jiraId: string;
  effort: number;
}

const calculateEfforts = (count: number): number[] => {
  if (count <= 0) {
    return [];
  }

  const base = Math.floor(100 / count / 5) * 5;
  const remainder = 100 - base * count;

  const efforts = Array(count).fill(base);

  for (let i = 0; i < remainder / 5; i++) {
    efforts[count - 1 - i] += 5;
  }

  return efforts;
};

export function ImportOpsModal({
  opened,
  onClose,
  activities,
}: ImportOpsModalProps) {
  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});

  const users = useMemo(() => {
    const map = new Map<number, string>();

    for (const activity of activities) {
      if (!map.has(activity.userId)) {
        map.set(activity.userId, activity.userName);
      }
    }

    return Array.from(map.entries()).map(([id, name]) => ({
      value: String(id),
      label: name,
    }));
  }, [activities]);

  // Default to the first user
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }

    setSelectedUserId(users[0]?.value ?? null);
    setRowSelection({});
  }, [opened, users]);

  const data = useMemo<ImportActivity[]>(() => {
    const unique = new Map<string, GitlabActivity>();

    for (const activity of activities) {
      const jiraId = extractJiraId(activity.title);

      if (!jiraId) {
        continue;
      }

      if (selectedUserId && String(activity.userId) !== selectedUserId) {
        continue;
      }

      if (!unique.has(jiraId)) {
        unique.set(jiraId, activity);
      }
    }

    const rows = Array.from(unique.values());

    // Group Jira tasks by date
    const rowsByDate = new Map<string, GitlabActivity[]>();

    for (const activity of rows) {
      const dateRows = rowsByDate.get(activity.date) ?? [];

      dateRows.push(activity);
      rowsByDate.set(activity.date, dateRows);
    }

    // Calculate effort for each date
    const result: ImportActivity[] = [];

    for (const [, dateRows] of rowsByDate) {
      const efforts = calculateEfforts(dateRows.length);

      dateRows.forEach((activity, index) => {
        const jiraId = extractJiraId(activity.title)!;

        result.push({
          ...activity,
          jiraId,
          effort: efforts[index],
        });
      });
    }

    return result;
  }, [activities, selectedUserId]);

  const columns = useMemo<MRT_ColumnDef<ImportActivity>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        size: 90,
      },
      {
        accessorKey: "effort",
        header: "Effort",
        size: 80,
        Cell: ({ cell }) => {
          return cell.getValue<number>();
        },
      },
      {
        accessorKey: "jiraId",
        header: "JIRA ID",
        size: 120,
      },
      {
        accessorKey: "title",
        header: "Title",
        size: 500,
      },
    ],
    [],
  );

  const table = useMantineReactTable({
    columns,
    data,

    enableRowSelection: true,
    enableMultiRowSelection: true,

    onRowSelectionChange: setRowSelection,

    state: {
      rowSelection,
    },

    getRowId: (row) => row.jiraId,

    enableColumnActions: false,
    enableColumnFilters: false,
    enableFilters: false,
    enableSorting: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    enableColumnOrdering: false,
    enableColumnResizing: true,

    initialState: {
      density: "xs",
    },
  });

  const selectedActivities = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  const handleImport = () => {
    console.log("Import OPS - selected rows:", selectedActivities);

    selectedActivities.forEach((activity) => {
      console.log({
        jiraId: activity.jiraId,
        date: activity.date,
        user: activity.userName,
        title: activity.title,
      });
    });

    // TODO:
    // trigger import API here

    onClose();
  };

  const handleUserChange = (value: string | null) => {
    setSelectedUserId(value);

    // Clear selected rows because the dataset changed.
    setRowSelection({});
  };

  const handleClose = () => {
    setRowSelection({});
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import OPS"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Select the Jira issues you want to import.
          </Text>

          <Text size="sm" c="dimmed">
            {selectedActivities.length} selected
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={500}>
            User
          </Text>

          <Select
            placeholder="Select user"
            data={users}
            value={selectedUserId}
            onChange={handleUserChange}
            allowDeselect={false}
            searchable
            size="sm"
            w={180}
          />
        </Group>

        <MantineReactTable table={table} />

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>

          <Button
            disabled={selectedActivities.length === 0}
            onClick={handleImport}
            leftSection={<IconDatabaseImport size={16} />}
          >
            Start Import
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
