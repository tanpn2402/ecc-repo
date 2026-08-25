import { Badge, Code, Group, Stack, Text } from "@mantine/core";

import type { ReviewRun } from "@/types";

type ReviewDetailProps = {
  review: ReviewRun | null;
};

export function ReviewDetail({ review }: ReviewDetailProps) {
  if (!review) {
    return (
      <Text c="dimmed" size="sm">
        No review available.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Status
        </Text>

        <Badge variant="light">{review.status}</Badge>
      </Group>

      {review.verdict && (
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Verdict
          </Text>

          <Text size="sm">{review.verdict}</Text>
        </Group>
      )}

      {review.summary && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Summary
          </Text>

          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {review.summary}
          </Text>
        </Stack>
      )}

      {review.findings?.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Findings
          </Text>

          <Code block>{JSON.stringify(review.findings, null, 2)}</Code>
        </Stack>
      )}

      {review.errorMessage && (
        <Stack gap={4}>
          <Text size="sm" fw={500} c="red">
            Error
          </Text>

          <Code block>{review.errorMessage}</Code>
        </Stack>
      )}
    </Stack>
  );
}
