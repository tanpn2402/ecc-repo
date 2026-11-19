// Bar above each fenced code block in the chat: the language and a copy button.
import { useEffect, useState } from "react";
import type { CodeHeaderProps } from "@assistant-ui/react-markdown";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { copyText } from "../clipboard";
import classes from "../analysis.module.css";

export function CodeHeader({ language, code }: CodeHeaderProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () =>
    copyText(code.replace(/\n$/, "")).then(
      () => setState("copied"),
      () => setState("failed"),
    );
  const label =
    state === "copied"
      ? "Copied"
      : state === "failed"
        ? "Copy failed"
        : "Copy code";

  return (
    <div className={classes.codeHeader}>
      <Text size="xs" c="dimmed" ff="monospace">
        {language && language !== "unknown" ? language : "text"}
      </Text>
      <Tooltip
        label={label}
        withArrow
        position="left"
        opened={state !== "idle" ? true : undefined}
      >
        <ActionIcon
          variant="subtle"
          color={
            state === "copied" ? "teal" : state === "failed" ? "red" : "gray"
          }
          size="sm"
          onClick={() => void copy()}
          aria-label="Copy code"
        >
          {state === "copied" ? (
            <IconCheck size={14} />
          ) : state === "failed" ? (
            <IconX size={14} />
          ) : (
            <IconCopy size={14} />
          )}
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
