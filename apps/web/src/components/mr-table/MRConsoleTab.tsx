import { Code, Text } from "@mantine/core";

import type { ReviewRun } from "@/types";

type ConsoleTabProps = {
  review: ReviewRun | null;
};

export function ConsoleTab({ review }: ConsoleTabProps) {
  if (!review) {
    return (
      <Text c="dimmed" size="sm">
        No review running.
      </Text>
    );
  }

  return (
    <Code
      block
      style={{
        minHeight: 400,
        maxHeight: 600,
        overflow: "auto",
        whiteSpace: "pre-wrap",
      }}
    >
      {review.consoleLog || "Waiting for console output..."}
    </Code>
  );
}
