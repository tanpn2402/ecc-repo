import { useEffect, useRef } from "react";
import { ScrollArea } from "@mantine/core";
import { ReviewRun } from "@/types";

export interface ConsoleTabProps {
  review: ReviewRun | null;
}

export function ConsoleTab({ review }: ConsoleTabProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

    autoScrollRef.current = distanceFromBottom <= 8;
  };

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || !autoScrollRef.current) return;

    viewport.scrollTop = viewport.scrollHeight;
  }, [review?.consoleLog]);

  const consoleLog = review?.consoleLog ?? "";

  return (
    <ScrollArea
      h="calc(100vh - 260px)"
      viewportRef={viewportRef}
      onScrollPositionChange={handleScroll}
      type="auto"
      styles={{
        viewport: {
          backgroundColor: "#111",
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
        {consoleLog || "No console output."}
      </pre>
    </ScrollArea>
  );
}
