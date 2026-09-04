import { compactRelativeTime } from "@/utils/datetime.utils";
import { Badge, BadgeProps, Group, Text } from "@mantine/core";

export type ReviewStatusBadgeProps = {
  status?: string | null;
  verdict?: string | null;
  completedAt?: string | null;
};

const BadgeColorMap: Record<string, BadgeProps["color"]> = {
  APPROVE: "green",
  APPROVED: "green",
  REJECT: "red",
  COMMENT: "blue",
  REQUEST_CHANGES: "orange",
};

const BadgeVariantMap: Record<string, BadgeProps["variant"]> = {
  APPROVE: "light",
  APPROVED: "light",
  REJECT: "outline",
  COMMENT: "outline",
  REQUEST_CHANGES: "outline",
};

export default function ReviewStatusBadge({
  status,
  verdict,
  completedAt,
}: ReviewStatusBadgeProps) {
  if (status === "running") {
    return <Badge variant="dot">Running...</Badge>;
  }

  if (status === null || status === undefined || status.trim().length === 0) {
    return "";
  }

  return (
    <Group gap="xs">
      <Badge
        variant={BadgeVariantMap[String(verdict).toUpperCase()] || "outline"}
        color={BadgeColorMap[String(verdict).toUpperCase()] || undefined}
      >
        {verdict}
      </Badge>
      {completedAt ? (
        <Text size="xs" c="dimmed">
          {compactRelativeTime(completedAt!)}
        </Text>
      ) : null}
    </Group>
  );
}
