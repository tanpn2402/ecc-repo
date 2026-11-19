import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconFolder } from "@tabler/icons-react";
import { useAnalysisMutations } from "../queries";
import type { Workspace } from "../types";
import { ConfirmDialog } from "./dialogs";
import { FolderPicker } from "./FolderPicker";

/** Create or edit a workspace: a folder of the backend machine, a name, and notes for Claude. */
export function WorkspaceModal(props: {
  opened: boolean;
  workspace: Workspace | null;
  onClose(): void;
  onSaved(w: Workspace): void;
  onDeleted(): void;
}) {
  const m = useAnalysisMutations();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const editing = !!props.workspace;

  useEffect(() => {
    if (!props.opened) return;
    setPath(props.workspace?.path ?? "");
    setName(props.workspace?.name ?? "");
    setNotes(props.workspace?.contextMd ?? "");
    setError(null);
    setConfirming(false);
  }, [props.opened, props.workspace]);

  const save = async () => {
    setError(null);
    try {
      const body = { path, name, contextMd: notes };
      const w = editing
        ? await m.updateWorkspace.mutateAsync({ id: props.workspace!.id, body })
        : await m.createWorkspace.mutateAsync(body);
      props.onSaved(w);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <ConfirmDialog
        opened={props.opened && confirming}
        title="Delete workspace"
        confirmLabel="Delete workspace"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await m.deleteWorkspace.mutateAsync(props.workspace!.id);
          props.onDeleted();
        }}
      >
        Delete workspace <b>{props.workspace?.name}</b> and all its chats? Their
        Claude transcripts are deleted too. The folder{" "}
        <code>{props.workspace?.path}</code> is not touched.
      </ConfirmDialog>
      <Modal
        opened={props.opened && !picking && !confirming}
        onClose={props.onClose}
        title={editing ? "Edit workspace" : "New workspace"}
        size="lg"
      >
        <Stack gap="sm">
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput
              label="Folder"
              description="A folder on the machine running the backend (usually a git checkout)"
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              style={{ flex: 1 }}
              placeholder="/home/me/projects/app"
            />
            <Button
              variant="default"
              leftSection={<IconFolder size={16} />}
              onClick={() => setPicking(true)}
            >
              Browse
            </Button>
          </Group>
          <TextInput
            label="Name"
            placeholder="Defaults to the folder name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Textarea
            label="Notes for Claude"
            description="Added to the system prompt of every thread in this workspace (conventions, modules, test data, ...)"
            autosize
            minRows={4}
            maxRows={12}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
          {error && (
            <Alert color="red" p="xs">
              <Text size="sm">{error}</Text>
            </Alert>
          )}
          <Group justify="space-between">
            {editing ? (
              <Button
                variant="subtle"
                color="red"
                onClick={() => setConfirming(true)}
              >
                Delete workspace
              </Button>
            ) : (
              <span />
            )}
            <Button
              onClick={() => void save()}
              disabled={!path.trim()}
              loading={
                m.createWorkspace.isPending || m.updateWorkspace.isPending
              }
            >
              {editing ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <FolderPicker
        opened={picking}
        initialPath={path || null}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPath(p);
          if (!name) setName(p.split("/").pop() ?? "");
          setPicking(false);
        }}
      />
    </>
  );
}
