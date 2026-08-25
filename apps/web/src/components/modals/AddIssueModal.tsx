import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { useAddIssue } from "@/hooks/use-jira-issues";
import { useJiraMetadata } from "@/hooks/use-jira-metadata";

interface AddIssueForm {
  input: string;
  group: string | null;
}

interface AddIssueModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddIssueModal({ opened, onClose }: AddIssueModalProps) {
  const addIssue = useAddIssue();
  const { data: metadata, isLoading: metadataLoading } = useJiraMetadata();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AddIssueForm>({
    defaultValues: {
      input: "",
      group: null,
    },
  });

  const group = watch("group");

  useEffect(() => {
    if (!opened) {
      reset();
    }
  }, [opened, reset]);

  const onSubmit = (values: AddIssueForm) => {
    if (!values.group) {
      return;
    }

    addIssue.mutate(
      {
        input: values.input.trim(),
        group: values.group,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  const groupOptions =
    metadata?.groups.map((group) => ({
      value: group.id,
      label: group.name,
    })) ?? [];

  return (
    <Modal opened={opened} onClose={onClose} title="Add Issue" centered>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <TextInput
            data-autofocus
            label="Jira Issue"
            placeholder="https://tx-tech.atlassian.net/browse/CORE-123"
            {...register("input", {
              required: "Jira issue URL is required",
            })}
            error={errors.input?.message}
            tabIndex={1}
          />

          <Select
            label="Group"
            placeholder="Select group"
            data={groupOptions}
            value={group}
            onChange={(value) => setValue("group", value)}
            disabled={metadataLoading}
            error={errors.group?.message}
            searchable
            required
          />

          {addIssue.error && (
            <div style={{ color: "var(--mantine-color-red-6)" }}>
              {addIssue.error.message}
            </div>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={onClose}
              disabled={addIssue.isPending}
            >
              Cancel
            </Button>

            <Button type="submit" loading={addIssue.isPending}>
              Add Issue
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
