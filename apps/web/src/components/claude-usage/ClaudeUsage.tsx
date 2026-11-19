import {
  Center,
  Group,
  Paper,
  Progress,
  RingProgress,
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

/** Collapsed navbar: one ring for the 5-hour window, both windows in the tooltip. */
function CompactUsage({
  usage,
  isLoading,
  isError,
}: {
  usage: ClaudeUsage | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const rows = [
    { label: "5h", value: usage?.fiveHour },
    { label: "7d", value: usage?.sevenDay },
  ].filter((r) => r.value) as { label: string; value: ClaudeRateLimit }[];
  const main = rows[0]?.value;
  const pct = main ? Math.min(100, Math.max(0, main.utilization)) : 0;
  const label = isLoading ? (
    "Loading Claude usage…"
  ) : isError || !rows.length ? (
    "Claude usage unavailable"
  ) : (
    <Stack gap={2}>
      <Text size="xs" fw={600}>
        Claude usage
      </Text>
      {rows.map((r) => (
        <Text key={r.label} size="xs">
          {r.label}: {Math.round(r.value.utilization)}% · resets in{" "}
          {formatResetTime(r.value.resetsAt)}
        </Text>
      ))}
    </Stack>
  );

  return (
    <Tooltip label={label} position="right" withArrow>
      <Center>
        <RingProgress
          size={40}
          thickness={4}
          roundCaps
          sections={[{ value: pct, color: pct >= 80 ? "red" : "blue" }]}
          label={
            <Text size="9px" ta="center" fw={600}>
              {main ? `${Math.round(pct)}%` : "–"}
            </Text>
          }
          aria-label="Claude usage"
        />
      </Center>
    </Tooltip>
  );
}

export function ClaudeUsage({ compact = false }: { compact?: boolean }) {
  const { data: usage, isLoading, isError } = useClaudeUsage();

  if (compact) {
    return (
      <CompactUsage
        usage={usage as ClaudeUsage | undefined}
        isLoading={isLoading}
        isError={isError}
      />
    );
  }

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
