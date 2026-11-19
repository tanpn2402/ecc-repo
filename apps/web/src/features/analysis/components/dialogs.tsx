// Mantine replacements for window.prompt / window.confirm: they stay open while
// the request runs and show its error instead of closing on failure.
// Modal unmounts its content when closed, so the form state below starts fresh on every open.
import { useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

function useSubmit(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert
      color="red"
      variant="light"
      p="xs"
      icon={<IconAlertTriangle size={16} />}
    >
      <Text size="sm">{error}</Text>
    </Alert>
  );
}

interface RenameProps {
  opened: boolean;
  title: string;
  label: string;
  initial: string;
  maxLength?: number;
  onClose(): void;
  onSubmit(value: string): Promise<unknown>;
}

function RenameForm(props: RenameProps) {
  const [value, setValue] = useState(props.initial);
  const { busy, error, run } = useSubmit(props.onClose);
  const trimmed = value.trim();
  const unchanged = trimmed === props.initial.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed && !unchanged) void run(() => props.onSubmit(trimmed));
      }}
    >
      <Stack gap="sm">
        <TextInput
          label={props.label}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          maxLength={props.maxLength}
          data-autofocus
          onFocus={(e) => e.currentTarget.select()}
          error={!trimmed ? "Cannot be empty" : undefined}
        />
        <ErrorLine error={error} />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={props.onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!trimmed || unchanged}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/** A one-field rename form. */
export function RenameDialog(props: RenameProps) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.title}
      size="md"
    >
      <RenameForm {...props} />
    </Modal>
  );
}

interface ConfirmProps {
  opened: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onClose(): void;
  onConfirm(): Promise<unknown>;
}

function ConfirmBody(props: ConfirmProps) {
  const { busy, error, run } = useSubmit(props.onClose);
  return (
    <Stack gap="sm">
      <Text size="sm" component="div">
        {props.children}
      </Text>
      <ErrorLine error={error} />
      <Group justify="flex-end" gap="xs">
        <Button
          variant="default"
          onClick={props.onClose}
          disabled={busy}
          data-autofocus
        >
          Cancel
        </Button>
        <Button
          color="red"
          loading={busy}
          onClick={() => void run(props.onConfirm)}
        >
          {props.confirmLabel ?? "Delete"}
        </Button>
      </Group>
    </Stack>
  );
}

/** A confirmation for destructive actions; Cancel has the focus. */
export function ConfirmDialog(props: ConfirmProps) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.title}
      size="md"
    >
      <ConfirmBody {...props} />
    </Modal>
  );
}
