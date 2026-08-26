import {
  Group,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { useClaudeUsage } from "@/hooks/use-claude-usage";
import { IconBrandGoogleAnalytics } from "@tabler/icons-react";

interface ClaudeRateLimit {
  utilization: number;
  resetsAt: string;
}

interface ClaudeUsage {
  fiveHour: ClaudeRateLimit | null;
  sevenDay: ClaudeRateLimit | null;
}

function formatResetTime(value: string) {
  const diff = new Date(value).getTime() - Date.now();

  if (diff <= 0) {
    return "now";
  }

  const minutes = Math.floor(diff / 60_000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  return `${days}d`;
}

export function ClaudeUsage() {
  const { data: usage, isLoading, isError } = useClaudeUsage();

  return (
    <Paper p="xs" radius="md" withBorder>
      <Stack gap="xs">
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light">
            <IconBrandGoogleAnalytics size={14} />
          </ThemeIcon>
          <Text size="sm">Claude usage</Text>
        </Group>

        {isLoading && (
          <Stack gap="xs">
            <Stack gap={2}>
              <Group justify="space-between">
                <Skeleton height={14} width={100} />
                <Skeleton height={14} width={25} />
              </Group>

              <Skeleton height={5} width="100%" radius="xl" />
            </Stack>

            <Stack gap={2}>
              <Group justify="space-between">
                <Skeleton height={14} width={100} />
                <Skeleton height={14} width={25} />
              </Group>

              <Skeleton height={5} width="100%" radius="xl" />
            </Stack>
          </Stack>
        )}

        {!isLoading && !isError && usage && (
          <>
            {usage.fiveHour && <UsageRow label="5h" usage={usage.fiveHour} />}

            {usage.sevenDay && <UsageRow label="7d" usage={usage.sevenDay} />}
          </>
        )}

        {isError && (
          <Text size="xs" c="dimmed">
            Usage unavailable
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function UsageRow({ label, usage }: { label: string; usage: ClaudeRateLimit }) {
  const percentage = Math.min(100, Math.max(0, usage.utilization));
  const resetLabel = `Resets in ${formatResetTime(usage.resetsAt)}`;
  return (
    <Tooltip label={resetLabel}>
      <Stack gap={2}>
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            <Text size="xs" fw={500}>
              {label}
            </Text>
            <Text size="xs" fw={200} fs="italic">
              {`(${resetLabel})`}
            </Text>
          </Group>

          <Text size="xs" c="dimmed">
            {Math.round(percentage)}%
          </Text>
        </Group>

        <Progress value={percentage} size={5} radius="xl" />
      </Stack>
    </Tooltip>
  );
}
