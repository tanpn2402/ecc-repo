import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { AnalysisThread, type PendingSend } from "./components/AnalysisThread";
import { ContextPanel } from "./components/ContextPanel";
import { ConfirmDialog, RenameDialog } from "./components/dialogs";
import { JiraDrawer } from "./components/JiraDrawer";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { WorkspaceModal } from "./components/WorkspaceModal";
import {
  useAnalysisMutations,
  useAnalysisStatus,
  useAnalysisThreads,
  useAnalysisWorkspaces,
} from "./queries";
import { ThreadActionsContext, type ThreadActions } from "./thread-context";
import type { Thread } from "./types";
import { useThread } from "./use-thread";
import { lastApproveMode } from "./approve-mode";
import classes from "./analysis.module.css";

const LAST_WS = "ecc.analysis.workspace";

function readLastWorkspace(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_WS));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** /analysis[/:workspaceId[/:sid]] — workspaces, their threads, and the open chat. */
export function AnalysisPage() {
  const params = useParams<{ workspaceId?: string; sid?: string }>();
  const navigate = useNavigate();
  const { data: status } = useAnalysisStatus();
  const { data: workspaces = [], isLoading: wsLoading } =
    useAnalysisWorkspaces();

  const workspaceId = params.workspaceId ? Number(params.workspaceId) : null;
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
  const sid = params.sid ?? null;
  const { data: threads = [], isLoading: threadsLoading } = useAnalysisThreads(
    workspace?.id ?? null,
  );
  const m = useAnalysisMutations();
  const ctl = useThread(sid);

  const [wsModal, setWsModal] = useState<"new" | "edit" | null>(null);
  const [jiraKey, setJiraKey] = useState<string | null>(null);
  const [cliBusy, setCliBusy] = useState<PendingSend | null>(null);
  const [renaming, setRenaming] = useState<Thread | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);

  // Pick a workspace when none is in the URL: the last used one, else the first.
  useEffect(() => {
    if (wsLoading || workspace || !workspaces.length) return;
    const last = readLastWorkspace();
    const target = workspaces.find((w) => w.id === last) ?? workspaces[0];
    navigate(`/analysis/${target.id}`, { replace: true });
  }, [wsLoading, workspace, workspaces, navigate]);

  useEffect(() => {
    if (!workspace) return;
    try {
      localStorage.setItem(LAST_WS, String(workspace.id));
    } catch {
      /* storage unavailable */
    }
  }, [workspace]);

  const thread: Thread | null = useMemo(
    () => threads.find((t) => t.sessionId === sid) ?? ctl.thread,
    [threads, sid, ctl.thread],
  );

  const actions: ThreadActions | null = useMemo(
    () =>
      sid
        ? {
            sid,
            cwd: thread?.cwd ?? "",
            answer: (rid, allow, extra) => ctl.answer(rid, allow, extra),
            openJira: setJiraKey,
          }
        : null,
    [sid, thread?.cwd, ctl],
  );

  const newThread = async () => {
    if (!workspace) return;
    const t = await m.createThread.mutateAsync({
      workspaceId: workspace.id,
      approveMode: lastApproveMode(),
    });
    navigate(`/analysis/${workspace.id}/${t.sessionId}`);
  };

  const deleteThread = async (t: Thread) => {
    await m.deleteThread.mutateAsync(t.sessionId);
    if (t.sessionId === sid && workspace) navigate(`/analysis/${workspace.id}`);
  };

  const notReady = status && (!status.login.ok || status.sdkError);

  return (
    <div className={classes.page}>
      <ThreadSidebar
        workspaces={workspaces}
        workspace={workspace}
        threads={threads}
        threadsLoading={threadsLoading}
        activeSid={sid}
        creating={m.createThread.isPending}
        onSelectWorkspace={(id) => navigate(`/analysis/${id}`)}
        onAddWorkspace={() => setWsModal("new")}
        onEditWorkspace={() => setWsModal("edit")}
        onNewThread={() => void newThread()}
        onOpenThread={(id) =>
          workspace && navigate(`/analysis/${workspace.id}/${id}`)
        }
        onRenameThread={setRenaming}
        onDeleteThread={setDeleting}
      />

      <div className={classes.center}>
        {notReady && (
          <Alert
            color="yellow"
            radius={0}
            icon={<IconAlertTriangle size={16} />}
            p="xs"
          >
            {status.sdkError
              ? `Claude Agent SDK failed to load: ${status.sdkError}`
              : status.login.detail}
          </Alert>
        )}
        {status?.fake && (
          <Alert color="blue" radius={0} p={6}>
            <Text size="xs">
              ANALYSIS_FAKE=1: replies come from a scripted fake agent, not
              Claude.
            </Text>
          </Alert>
        )}
        {ctl.error && (
          <Alert
            color="red"
            radius={0}
            p="xs"
            withCloseButton
            onClose={() => ctl.setError(null)}
          >
            <Text size="sm">{ctl.error}</Text>
          </Alert>
        )}

        {wsLoading ? (
          <Center h="100%">
            <Loader />
          </Center>
        ) : !workspaces.length ? (
          <Center h="100%">
            <Stack align="center" gap="xs">
              <Text fw={600}>No workspace yet</Text>
              <Text size="sm" c="dimmed" maw={420} ta="center">
                A workspace is a folder on the machine running the backend
                (usually a git checkout). Claude works in it; you can open many
                chats per workspace.
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setWsModal("new")}
              >
                New workspace
              </Button>
            </Stack>
          </Center>
        ) : !sid ? (
          <Center h="100%">
            <Stack align="center" gap="xs">
              <Text c="dimmed" size="sm">
                Open a chat on the left, or start a new one.
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                disabled={!workspace}
                loading={m.createThread.isPending}
                onClick={() => void newThread()}
              >
                New chat
              </Button>
            </Stack>
          </Center>
        ) : ctl.loading ? (
          <Center h="100%">
            <Loader />
          </Center>
        ) : (
          actions && (
            <ThreadActionsContext.Provider value={actions}>
              <AnalysisThread
                key={sid}
                ctl={ctl}
                workspaceName={workspace?.name ?? ""}
                disabled={!thread || thread.cwdMissing || !!notReady}
                onCliBusy={setCliBusy}
              />
            </ThreadActionsContext.Provider>
          )
        )}
      </div>

      <ContextPanel
        thread={sid ? thread : null}
        messages={ctl.messages}
        branch={ctl.branch}
        jiraKeys={ctl.jiraKeys}
        grants={ctl.grants}
        running={ctl.running}
        onOpenJira={setJiraKey}
        onClearGrants={() =>
          ctl.clearGrants().catch((e) => ctl.setError((e as Error).message))
        }
      />

      <WorkspaceModal
        opened={wsModal !== null}
        workspace={wsModal === "edit" ? workspace : null}
        onClose={() => setWsModal(null)}
        onSaved={(w) => {
          setWsModal(null);
          navigate(`/analysis/${w.id}`);
        }}
        onDeleted={() => {
          setWsModal(null);
          navigate("/analysis");
        }}
      />

      <JiraDrawer jiraKey={jiraKey} onClose={() => setJiraKey(null)} />

      <RenameDialog
        opened={!!renaming}
        title="Rename chat"
        label="Title"
        initial={renaming?.title ?? ""}
        maxLength={120}
        onClose={() => setRenaming(null)}
        onSubmit={(title) =>
          m.updateThread.mutateAsync({
            sid: renaming!.sessionId,
            body: { title },
          })
        }
      />

      <ConfirmDialog
        opened={!!deleting}
        title="Delete chat"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteThread(deleting!)}
      >
        Delete <b>{deleting?.title}</b>? Its Claude transcript is deleted too,
        so it can no longer be resumed from the terminal.
      </ConfirmDialog>

      <Modal
        opened={!!cliBusy}
        onClose={() => setCliBusy(null)}
        title="Thread in use elsewhere"
      >
        <Stack>
          <Text size="sm">{cliBusy?.message}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCliBusy(null)}>
              Cancel
            </Button>
            <Button
              color="yellow"
              onClick={() => {
                const p = cliBusy!;
                setCliBusy(null);
                ctl
                  .send(p.text, p.attachments, true)
                  .catch((e) => ctl.setError((e as Error).message));
              }}
            >
              Send anyway
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
