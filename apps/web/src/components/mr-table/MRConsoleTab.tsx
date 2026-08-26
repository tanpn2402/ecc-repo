import { useEffect, useRef } from "react";
import { ScrollArea, Paper } from "@mantine/core";
import Markdown from "react-markdown";
import { ReviewRun } from "@/types";

type ConsoleTabProps = {
  review: ReviewRun | null;
};

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

  return (
    <Paper
      withBorder
      radius="sm"
      style={{
        overflow: "hidden",
        background: "var(--mantine-color-dark-8)",
      }}
    >
      <ScrollArea
        h="calc(100vh - 260px)"
        viewportRef={viewportRef}
        onScrollPositionChange={handleScroll}
        type="auto"
      >
        <div
          style={{
            padding: "16px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            lineHeight: 1.5,
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
                    wordBreak: "break-all",
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
            {review?.consoleLog || "No console output."}
          </Markdown>
        </div>
      </ScrollArea>
    </Paper>
  );
}
