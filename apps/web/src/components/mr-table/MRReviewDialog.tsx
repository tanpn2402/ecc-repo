import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";

import type { MergeRequest } from "@/types";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useTriggerReview } from "@/hooks/use-merge-requests";
import { IconPlayerPlay } from "@tabler/icons-react";

type ReviewForm = {
  workspace: string;
};

type MRReviewDialogProps = {
  jiraKey: string;
  mr: MergeRequest | null;
  opened: boolean;
  onClose: () => void;
};

export function MRReviewDialog({ jiraKey, mr, opened, onClose }: MRReviewDialogProps) {
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
        jiraKey,
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
      title={`Review ${mr?.id ?? ""}`}
      centered
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
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
