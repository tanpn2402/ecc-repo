import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Anchor,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";

import type { MergeRequest } from "@/types";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useTriggerReview } from "@/hooks/use-merge-requests";
import { IconPlayerPlay } from "@tabler/icons-react";

type ReviewForm = {
  workspace: string;
  devFeedback: string;
};

type MRReviewDialogProps = {
  mr: MergeRequest | null;
  opened: boolean;
  onClose: () => void;
};

export function MRReviewDialog({ mr, opened, onClose }: MRReviewDialogProps) {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const triggerReview = useTriggerReview();

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReviewForm>({
    defaultValues: {
      workspace: "",
      devFeedback: "",
    },
  });

  const workspace = watch("workspace");

  useEffect(() => {
    if (!opened) {
      reset();
    }
  }, [opened, reset]);

  const onSubmit = (values: ReviewForm) => {
    if (!mr) {
      return;
    }

    triggerReview.mutate(
      {
        mrId: mr.mrId,
        workspace: values.workspace,
        jiraKey: mr.jiraKey ?? "",
        devFeedback: values.devFeedback.trim() || undefined,
      },
      {
        onSuccess: onClose,
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text>
          Review{" "}
          <Anchor
            href={mr?.gitlabUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            !{mr?.gitlabMrIid}
          </Anchor>
        </Text>
      }
      centered
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <Text>
            <Anchor
              href={`https://tx-tech.atlassian.net/browse/${mr?.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {mr?.jiraKey}
            </Anchor>{" "}
            {mr?.jiraTitle}
          </Text>

          <Text size="sm" c="dimmed">
            Select the workspace where Claude Code should run the review.
          </Text>

          <Select
            label="Workspace"
            placeholder="Select workspace"
            searchable
            data={workspaces.map((item) => ({
              value: item.name,
              label: item.label,
              path: item.path,
            }))}
            value={workspace}
            onChange={(value) =>
              setValue("workspace", value ?? "", {
                shouldValidate: true,
              })
            }
            renderOption={({ option }) => {
              const workspace = workspaces.find(
                (item) => item.name === option.value,
              );

              if (!workspace) {
                return option.label;
              }

              return (
                <Stack gap={0}>
                  <Text size="sm">{workspace.label}</Text>

                  <Text size="xs" c="dimmed" truncate>
                    {workspace.path}
                  </Text>
                </Stack>
              );
            }}
            disabled={isLoading || triggerReview.isPending}
            error={errors.workspace?.message}
            required
          />

          <Textarea
            label="Developer Feedback"
            description="Optional. Add feedback from the developer for a re-review."
            placeholder="e.g. Fixed the authorization issue in the print endpoint. Please verify the fix."
            minRows={4}
            autosize
            maxRows={10}
            {...{
              value: watch("devFeedback"),
              onChange: (event) =>
                setValue("devFeedback", event.currentTarget.value),
            }}
            disabled={triggerReview.isPending}
          />

          {triggerReview.error && (
            <Text size="sm" c="red">
              {triggerReview.error.message}
            </Text>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={onClose}
              disabled={triggerReview.isPending}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              loading={triggerReview.isPending}
              disabled={!workspace}
              leftSection={<IconPlayerPlay size={20} />}
            >
              Start Review
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
