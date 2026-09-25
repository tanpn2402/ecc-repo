import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Button,
  Checkbox,
  Code,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconChevronRight,
  IconClipboard,
  IconSparkles,
} from "@tabler/icons-react";
import { useIssueMrs } from "@/hooks/use-jira-issues";
import { compactRelativeTime } from "@/utils/datetime.utils";

interface AskAiReviewModalProps {
  jiraKey: string;
  opened: boolean;
  onClose: () => void;
}

export function AskAiReviewModal({
  jiraKey,
  opened,
  onClose,
}: AskAiReviewModalProps) {
  const { data: issueMrs = [], isLoading } = useIssueMrs(jiraKey);

  const openedMrs = useMemo(
    () => issueMrs.filter((mr) => mr.status === "opened"),
    [issueMrs],
  );

  const [selectedMrIds, setSelectedMrIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (openedMrs.length > 0) {
      setSelectedMrIds(new Set(openedMrs.map((mr) => mr.mrId)));
    } else {
      setSelectedMrIds((current) => {
        if (current.size !== 0) {
          return new Set();
        }
        return current;
      });
    }
  }, [openedMrs]);

  const allSelected =
    openedMrs.length > 0 && selectedMrIds.size === openedMrs.length;

  const reviewText = useMemo(() => {
    const selectedMrs = openedMrs.filter((mr) => selectedMrIds.has(mr.mrId));

    if (selectedMrs.length === 0) {
      return "";
    }

    return `please review ${jiraKey} - MR${selectedMrs.length > 1 ? "s" : ""}: ${selectedMrs
      .map((mr) => mr.gitlabUrl)
      .join(", ")}`;
  }, [jiraKey, openedMrs, selectedMrIds]);

  const toggleMr = (mrId: string) => {
    setSelectedMrIds((current) => {
      const next = new Set(current);

      if (next.has(mrId)) {
        next.delete(mrId);
      } else {
        next.add(mrId);
      }

      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedMrIds(new Set());
    } else {
      setSelectedMrIds(new Set(openedMrs.map((mr) => mr.mrId)));
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reviewText);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconSparkles size={18} />
          <Text fw={600}>Ask AI to Review</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Select the merge requests you want to include in the AI review.
        </Text>

        {openedMrs.length > 1 ? (
          <>
            <Checkbox
              label={
                <Text size="sm" fw={500}>
                  Select all ({openedMrs.length})
                </Text>
              }
              checked={allSelected}
              indeterminate={
                selectedMrIds.size > 0 && selectedMrIds.size < openedMrs.length
              }
              onChange={toggleAll}
              disabled={isLoading || openedMrs.length === 0}
            />

            <Divider />
          </>
        ) : null}

        <ScrollArea>
          <Stack gap="xs">
            {isLoading ? (
              <Text size="sm" c="dimmed">
                Loading merge requests...
              </Text>
            ) : openedMrs.length === 0 ? (
              <Text size="sm" c="dimmed">
                No merge requests found for {jiraKey}.
              </Text>
            ) : (
              openedMrs.map((mr) => (
                <Checkbox
                  key={mr.mrId}
                  checked={selectedMrIds.has(mr.mrId)}
                  onChange={() => toggleMr(mr.mrId)}
                  label={
                    <Stack gap={0}>
                      <Group>
                        <Anchor
                          href={mr.gitlabUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                          w={40}
                        >
                          !{mr.gitlabMrIid}
                        </Anchor>
                        <IconChevronRight size={10} />
                        <Code>{mr.gitlabProject}</Code>
                        <IconChevronRight size={10} />
                        <Code>{mr.targetBranch}</Code>
                      </Group>

                      {mr.author && (
                        <Text size="xs" c="dimmed">
                          {mr.author} -{"  "}
                          <i>{compactRelativeTime(mr.createdAt!)}</i>
                        </Text>
                      )}
                    </Stack>
                  }
                />
              ))
            )}
          </Stack>
        </ScrollArea>

        <Divider />

        <Stack gap="xs">
          <Text size="xs" fw={500} c="dimmed">
            COPY TEXT
          </Text>

          <Text
            size="sm"
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
            }}
          >
            {reviewText}
          </Text>
        </Stack>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>

          <Button
            leftSection={<IconClipboard size={16} />}
            onClick={handleCopy}
            disabled={selectedMrIds.size === 0}
          >
            Copy
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
