import { Badge, Code, Group, ScrollArea, Stack, Text } from "@mantine/core";

import type { ReviewRun } from "@/types";

type MRReviewDetailProps = {
  review: ReviewRun | null;
};

export function MRReviewDetail({ review }: MRReviewDetailProps) {
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

          <pre
            style={{
              margin: 0,
              padding: "12px 16px",
              minHeight: "100%",
              color: "#d4d4d4",
              backgroundColor: "var(--mantine-color-dark-9)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
            }}
          >
            {review.summary}
          </pre>
        </Stack>
      )}

      {review.findings?.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Findings
          </Text>

          <ScrollArea
            h="400px"
            type="auto"
            styles={{
              viewport: {
                backgroundColor: "var(--mantine-color-dark-9)",
              },
            }}
          >
            <pre
              style={{
                margin: 0,
                padding: "12px 16px",
                minHeight: "100%",
                color: "#d4d4d4",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
              }}
            >
              {JSON.stringify(review.findings, null, 2)}
            </pre>
          </ScrollArea>
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
