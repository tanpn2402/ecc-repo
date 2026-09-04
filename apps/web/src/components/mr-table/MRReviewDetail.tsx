import { Badge, Code, Group, ScrollArea, Stack, Text } from "@mantine/core";

import type { ReviewRun } from "@/types";
import Markdown from "react-markdown";
import ReviewStatusBadge from "../badges/ReviewStatusBadge";

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
    <ScrollArea h="100%" type="auto" px="md">
      <Stack gap="md">
        <Group>
          <Text size="sm" fw={500} w={200}>
            Status
          </Text>

          <Badge variant="light">{review.status}</Badge>
        </Group>

        {review.verdict && (
          <Group>
            <Text size="sm" fw={500} w={200}>
              Verdict
            </Text>

            <ReviewStatusBadge
              status={review.status}
              verdict={review.verdict}
              completedAt={review.completedAt}
            />
          </Group>
        )}

        {review.summary && (
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Summary
            </Text>
            <div
              style={{
                padding: "16px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.5,
                background: "var(--mantine-color-dark-8)",
              }}
            >
              <Markdown
                components={{
                  h1: ({ children }) => (
                    <h1 style={{ fontSize: 18, marginTop: 8 }}>{children}</h1>
                  ),

                  h2: ({ children }) => (
                    <h2 style={{ fontSize: 16, marginTop: 16 }}>{children}</h2>
                  ),

                  h3: ({ children }) => (
                    <h3 style={{ fontSize: 14, marginTop: 12 }}>{children}</h3>
                  ),

                  p: ({ children }) => (
                    <p style={{ margin: "8px 0" }}>{children}</p>
                  ),

                  code: ({ children }) => (
                    <code
                      style={{
                        background: "var(--mantine-color-dark-9)",
                        padding: "2px 5px",
                        borderRadius: 3,
                        wordBreak: "keep-all",
                      }}
                    >
                      {children}
                    </code>
                  ),

                  pre: ({ children }) => (
                    <pre
                      style={{
                        background: "var(--mantine-color-dark-9)",
                        padding: "12px",
                        borderRadius: 4,
                        overflowX: "auto",
                        whiteSpace: "break-spaces",
                      }}
                    >
                      {children}
                    </pre>
                  ),

                  ul: ({ children }) => (
                    <ul style={{ paddingLeft: 24 }}>{children}</ul>
                  ),

                  ol: ({ children }) => (
                    <ol style={{ paddingLeft: 24 }}>{children}</ol>
                  ),
                }}
              >
                {review.summary}
              </Markdown>
            </div>
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
                  overflowWrap: "break-word",
                  whiteSpace: "break-spaces",
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

            <Code>{review.errorMessage}</Code>
          </Stack>
        )}
      </Stack>
    </ScrollArea>
  );
}
