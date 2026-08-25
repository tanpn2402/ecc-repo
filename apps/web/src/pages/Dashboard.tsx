import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { useJiraMetadata } from "@/hooks/use-jira-metadata";
import { Badge, Box, Button, Group, Select, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import React, { useMemo, useState } from "react";

import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
} from "@repo/mantine-table";
type Person = {
  name: {
    firstName: string;
    lastName: string;
  };
  address: string;
  city: string;
  state: string;
};

//nested data is ok, see accessorKeys in ColumnDef below
const data: Person[] = [
  {
    name: {
      firstName: "Robert",
      lastName: "Davis",
    },
    address: "261 Battle Ford",
    city: "Columbus",
    state: "Ohio",
  },
  {
    name: {
      firstName: "Robert",
      lastName: "Smith",
    },
    address: "566 Brakus Inlet",
    city: "Westerville",
    state: "Ohio",
  },
  {
    name: {
      firstName: "Kevin",
      lastName: "Yan",
    },
    address: "7777 Kuhic Knoll",
    city: "South Linda",
    state: "West Virginia",
  },
  {
    name: {
      firstName: "John",
      lastName: "Upton",
    },
    address: "722 Emie Stream",
    city: "Huntington",
    state: "Washington",
  },
  {
    name: {
      firstName: "Nathan",
      lastName: "Harris",
    },
    address: "1 Kuhic Knoll",
    city: "Ohiowa",
    state: "Nebraska",
  },
];

const tabs = [
  { value: "synced", label: "Synced" },
  { value: "atlassian", label: "Atlassian Issues" },
];

const groups = [
  { value: "backend", label: "Backend" },
  { value: "frontend", label: "Frontend" },
  { value: "devops", label: "DevOps" },
];

export function Dashboard() {
  const [tab, setTab] = useState<string | null>("synced");
  const [group, setGroup] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const { data: metadata, isLoading } = useJiraMetadata();

  const groups = useMemo(
    () =>
      (metadata?.groups || []).map(({ id, name }) => ({
        value: id,
        label: name,
      })),
    [],
  );

  //should be memoized or stable
  const columns = useMemo<MRT_ColumnDef<Person>[]>(
    () => [
      {
        accessorKey: "name.firstName", //access nested data with dot notation
        header: "First Name",
      },
      {
        accessorKey: "name.lastName",
        header: "Last Name",
      },
      {
        accessorKey: "address", //normal accessorKey
        header: "Address",
      },
      {
        accessorKey: "city",
        header: "City",
      },
      {
        accessorKey: "state",
        header: "State",
      },
    ],
    [],
  );

  const table = useMantineReactTable({
    columns,
    data, //must be memoized or stable (useState, useMemo, defined outside of this component, etc.)
    enableColumnFilterModes: true,
    enableColumnOrdering: true,
    enableFacetedValues: true,
    enableGrouping: true,
    enablePinning: true,
    enableRowActions: true,
    enableRowSelection: true,
    initialState: { showColumnFilters: true, showGlobalFilter: true },
  });

  return (
    <div>
      <PageHeader
        title="Issues"
        tabs={{
          items: [
            {
              value: "synced",
              label: "Synced",
            },
            {
              value: "atlassian",
              label: "Atlassian Issues",
            },
          ],
          value: tab || "synced",
          onChange: setTab,
        }}
        filters={[
          <Select
            w={160}
            placeholder="Group"
            data={groups}
            value={group}
            onChange={setGroup}
            clearable
            loading={isLoading}
          />,
          <Select
            w={140}
            placeholder="Status"
            data={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
            value={status}
            onChange={setStatus}
            clearable
          />,
        ]}
        actions={[
          <Button leftSection={<IconPlus size={16} />}>New Issue</Button>,
        ]}
      />

      <PageContent>
        <MantineReactTable table={table} />
      </PageContent>
    </div>
  );
}
