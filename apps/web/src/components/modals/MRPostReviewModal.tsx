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
import { IconChevronRight } from "@tabler/icons-react";

import { useCreateMrReview, useIssueMrs } from "@/hooks/use-jira-issues";
import { compactRelativeTime } from "@/utils/datetime.utils";

export interface MRReviewModalProps {
  opened: boolean;
  jiraKey: string;
  onClose: () => void;
}

export function MRPostReviewModal({
  opened,
  jiraKey,
  onClose,
}: MRReviewModalProps) {
  const { data: issueMrs = [], isLoading } = useIssueMrs(jiraKey);

  const openedMrs = useMemo(
    () => issueMrs.filter((mr) => mr.status === "opened"),
    [issueMrs],
  );

  const [selectedMrIds, setSelectedMrIds] = useState<Set<string>>(new Set());

  const [review, setReview] = useState("");

  const createReviewMutation = useCreateMrReview(jiraKey);

  const allSelected =
    openedMrs.length > 0 && selectedMrIds.size === openedMrs.length;

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
    setSelectedMrIds((current) => {
      if (current.size === openedMrs.length) {
        return new Set();
      }

      return new Set(openedMrs.map((mr) => mr.mrId));
    });
  };

  // Select all opened MRs when the list is loaded/changed.
  useEffect(() => {
    if (!opened) {
      return;
    }

    setSelectedMrIds(new Set(openedMrs.map((mr) => mr.mrId)));
  }, [opened, openedMrs]);

  const selectedMrs = useMemo(
    () => openedMrs.filter((mr) => selectedMrIds.has(mr.mrId)),
    [openedMrs, selectedMrIds],
  );

  const handleClose = () => {
    if (createReviewMutation.isPending) {
      return;
    }

    setReview("");
    setSelectedMrIds(new Set());
    createReviewMutation.reset();

    onClose();
  };

  const handleSubmit = () => {
    if (selectedMrs.length === 0 || !review.trim()) {
      return;
    }

    createReviewMutation.mutate(
      {
        gitlabUrls: selectedMrs.map((mr) => mr.gitlabUrl),
        review: review.trim(),
      },
      {
        onSuccess: () => {
          handleClose();
        },
      },
    );
  };

  const submitDisabled =
    isLoading ||
    selectedMrs.length === 0 ||
    !review.trim() ||
    createReviewMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`Review MRs - ${jiraKey}`}
      centered
      size="lg"
    >
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Merge requests
          </Text>

          <Text size="xs" c="dimmed">
            Select the merge requests you want the AI to review.
          </Text>
        </Stack>

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

        <ScrollArea.Autosize mah={260}>
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
                      <Group gap="xs">
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
                          {mr.author} -{" "}
                          <i>{compactRelativeTime(mr.createdAt!)}</i>
                        </Text>
                      )}
                    </Stack>
                  }
                />
              ))
            )}
          </Stack>
        </ScrollArea.Autosize>

        <Divider />

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Review instruction
          </Text>

          <textarea
            value={review}
            onChange={(event) => setReview(event.currentTarget.value)}
            placeholder="Please review the selected merge requests..."
            rows={7}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "8px 10px",
              borderRadius: "4px",
              border: "1px solid var(--mantine-color-default-border)",
              background: "var(--mantine-color-body)",
              color: "var(--mantine-color-text)",
              fontFamily: "inherit",
              fontSize: "var(--mantine-font-size-sm)",
              lineHeight: 1.5,
            }}
          />
        </Stack>

        {createReviewMutation.isError && (
          <Text size="sm" c="red">
            {createReviewMutation.error instanceof Error
              ? createReviewMutation.error.message
              : "Failed to create review"}
          </Text>
        )}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {selectedMrs.length} of {openedMrs.length} MR
            {openedMrs.length !== 1 ? "s" : ""} selected
          </Text>

          <Group gap="sm">
            <Button
              variant="default"
              onClick={handleClose}
              disabled={createReviewMutation.isPending}
            >
              Cancel
            </Button>

            <Button
              onClick={handleSubmit}
              loading={createReviewMutation.isPending}
              disabled={submitDisabled}
            >
              Post Review
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
