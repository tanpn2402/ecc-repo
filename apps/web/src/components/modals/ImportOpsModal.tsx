import { useEffect, useMemo, useState } from "react";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
  type MRT_RowSelectionState,
} from "@repo/mantine-table";

import type { GitlabActivity, OpsImportActivity, OpsProject } from "@/types";
import { extractJiraId } from "@/utils/jira.utils";
import { IconDatabaseImport } from "@tabler/icons-react";
import { useOpsProjects } from "@/hooks/use-ops";
import { getOpsScript } from "@/utils/ops.utils";

interface ImportOpsModalProps {
  opened: boolean;
  onClose: () => void;
  activities: GitlabActivity[];
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
  const [projectByJira, setProjectByJira] = useState<
    Record<string, OpsProject | null>
  >({});

  const { data: opsProjects = [], isLoading: isProjectsLoading } =
    useOpsProjects();

  const opsProjectMap = useMemo(
    () =>
      opsProjects.reduce(
        (result, project) => {
          result[project.optId] = project;
          return result;
        },
        {} as Record<string, OpsProject>,
      ),
    [opsProjects],
  );

  const opsProjectOptions = useMemo(
    () =>
      opsProjects.map((project) => ({
        value: project.optId,
        label: project.name,
      })),
    [opsProjects],
  );

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

  const data = useMemo<OpsImportActivity[]>(() => {
    const unique = new Map<string, GitlabActivity>();

    for (const activity of activities) {
      const jiraId = extractJiraId(activity.title);

      if (selectedUserId && String(activity.userId) !== selectedUserId) {
        continue;
      }

      const key = `${activity.date}_${jiraId}`;

      if (!unique.has(key)) {
        unique.set(key, activity);
      }
    }

    const rows = Array.from(unique.values());

    // Group Jira tasks by date
    const rowsByDate = new Map<
      string,
      Array<GitlabActivity & { isSelected: boolean }>
    >();

    for (const activity of rows) {
      const dateRows = rowsByDate.get(activity.date) ?? [];
      dateRows.push({
        ...activity,
        isSelected: !!rowSelection[activity.id],
      });
      rowsByDate.set(activity.date, dateRows);
    }

    // Calculate effort for each date
    const result: OpsImportActivity[] = [];

    for (const [, dateRows] of rowsByDate) {
      const efforts = calculateEfforts(
        dateRows.filter((r) => r.isSelected).length,
      );

      let index = 0;
      dateRows.forEach((activity) => {
        const jiraId = extractJiraId(activity.title)!;

        result.push({
          ...activity,
          jiraId,
          effort: activity.isSelected ? efforts[index++] : 0,
          opsProjectValueId: opsProjects[0]?.valueId ?? null,
          opsProjectOptId: opsProjects[0]?.optId ?? null,
        });
      });
    }

    return result;
  }, [activities, selectedUserId, rowSelection]);

  useEffect(() => {
    if (!opsProjects.length) {
      return;
    }

    setProjectByJira((current) => {
      const next = { ...current };

      for (const row of data) {
        if (!next[row.id]) {
          next[row.id] = opsProjects[0];
        }
      }

      return next;
    });
  }, [opsProjects, data]);

  const columns = useMemo<MRT_ColumnDef<OpsImportActivity>[]>(
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
        id: "opsProject",
        header: "OPS Project",
        size: 120,
        Cell: ({ row }) => {
          const id = row.original.id;

          return (
            <Select
              data={opsProjectOptions}
              value={projectByJira[id]?.optId ?? null}
              onChange={(value) => {
                if (!value) {
                  return;
                }

                setProjectByJira((current) => ({
                  ...current,
                  [id]: value ? opsProjectMap[value] : null,
                }));
              }}
              placeholder="Select project"
              size="xs"
              allowDeselect={false}
              disabled={isProjectsLoading || opsProjectOptions.length === 0}
              comboboxProps={{
                withinPortal: true,
              }}
            />
          );
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
    [opsProjectOptions, projectByJira, opsProjectMap],
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

    getRowId: (row) => row.id,

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
    const activities = selectedActivities.map<OpsImportActivity>((activity) => {
      return {
        ...activity,
        opsProjectOptId: projectByJira[activity.id]?.optId ?? null,
        opsProjectValueId: projectByJira[activity.id]?.valueId ?? null,
      };
    });
    const script = getOpsScript(activities, { isAutoSubmit: false });
    console.log(script);
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
