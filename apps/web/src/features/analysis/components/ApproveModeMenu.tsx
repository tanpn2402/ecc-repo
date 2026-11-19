// Composer control for how Claude's tool calls are approved, like Claude Desktop.
import { Button, Menu, Text } from "@mantine/core";
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconHandStop,
  IconPencilCheck,
  type Icon,
} from "@tabler/icons-react";
import type { ApproveMode } from "../types";

const MODES: {
  value: ApproveMode;
  label: string;
  description: string;
  icon: Icon;
  color: string;
}[] = [
  {
    value: "manual",
    label: "Ask permissions",
    description: "Approve each command and file edit yourself.",
    icon: IconHandStop,
    color: "gray",
  },
  {
    value: "edits",
    label: "Auto-accept edits",
    description:
      "File edits inside the chat's folders go through; commands still ask.",
    icon: IconPencilCheck,
    color: "blue",
  },
  {
    value: "auto",
    label: "Auto-approve all",
    description:
      "Every command and edit runs without asking. git push/commit/checkout, reset --hard, rm -rf and sudo stay blocked; Claude's questions still wait for you.",
    icon: IconBolt,
    color: "orange",
  },
];

export function ApproveModeMenu(props: {
  mode: ApproveMode;
  onChange(mode: ApproveMode): void;
  disabled?: boolean;
}) {
  const current = MODES.find((m) => m.value === props.mode) ?? MODES[0];
  return (
    <Menu position="top-start" width={320} withinPortal>
      <Menu.Target>
        <Button
          size="xs"
          variant={props.mode === "manual" ? "subtle" : "light"}
          color={current.color}
          leftSection={<current.icon size={14} />}
          rightSection={<IconChevronDown size={12} />}
          disabled={props.disabled}
          aria-label={`Approve mode: ${current.label}`}
        >
          {current.label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>When Claude wants to run a tool</Menu.Label>
        {MODES.map((m) => (
          <Menu.Item
            key={m.value}
            leftSection={
              <m.icon size={16} color={`var(--mantine-color-${m.color}-5)`} />
            }
            rightSection={
              m.value === props.mode ? <IconCheck size={14} /> : undefined
            }
            onClick={() => props.onChange(m.value)}
          >
            <Text size="sm" fw={500}>
              {m.label}
            </Text>
            <Text size="xs" c="dimmed">
              {m.description}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
