import { useCallback, useEffect, useRef } from "react";
import { useSetAtom, useAtomValue, useAtom } from "jotai";
import {
  atlassianIssuesAtom,
  syncedIssuesAtom,
  atlassianLoadedAtom,
  syncedLoadedAtom,
  issuesLoadingAtom,
  issuesErrorAtom,
  syncingKeysAtom,
  removingKeysAtom,
  activeReviewMrIdsAtom,
  mrReviewsAtom,
  mrReviewsLoadingAtom,
  mrReviewsErrorAtom,
  issueMrsAtom,
  issueMrsLoadingKeysAtom,
  issueMrsErrorsAtom,
  workspacesAtom,
  workspacesLoadedAtom,
  workspacesLoadingAtom,
  workspacesErrorAtom,
  jiraIssueGroup,
  type JiraIssueGroup,
} from "@/atoms";
import {
  fetchAtlassianIssues,
  fetchSyncedIssues,
  syncIssue,
  removeSyncedIssue,
  fetchMrReviews,
  fetchIssueMrs,
  fetchWorkspaces,
} from "@/lib/jira-api";

/**
 * Fetches only the active Jira Issues page tab's table (not both) and
 * exposes the Sync action. Each tab is fetched once and cached — switching
 * tabs re-fetches only if that tab hasn't loaded yet, or has been marked
 * stale. Sync only ever touches issue metadata — never MR data (see
 * useIssueMrs) — so review actions live in useIssueMrs instead of here.
 */
export function useJiraIssuesData() {
  const pageTab = useAtomValue(jiraIssueGroup);
  const setAtlassian = useSetAtom(atlassianIssuesAtom);
  const setSynced = useSetAtom(syncedIssuesAtom);
  const [atlassianLoaded, setAtlassianLoaded] = useAtom(atlassianLoadedAtom);
  const [syncedLoaded, setSyncedLoaded] = useAtom(syncedLoadedAtom);
  const setLoading = useSetAtom(issuesLoadingAtom);
  const setError = useSetAtom(issuesErrorAtom);
  const setSyncingKeys = useSetAtom(syncingKeysAtom);
  const removingKeys = useAtomValue(removingKeysAtom);
  const setRemovingKeys = useSetAtom(removingKeysAtom);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (tab: JiraIssueGroup) => {
      setLoading(true);
      setError(null);
      try {
        if (tab === "atlassian") {
          const atlassian = await fetchAtlassianIssues();
          if (mountedRef.current) {
            setAtlassian(atlassian);
            setAtlassianLoaded(true);
          }
        } else {
          const synced = await fetchSyncedIssues();
          if (mountedRef.current) {
            setSynced(synced);
            setSyncedLoaded(true);
          }
        }
      } catch (err: any) {
        if (mountedRef.current) setError(err.message || "Failed to load Jira issues");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [setAtlassian, setSynced, setAtlassianLoaded, setSyncedLoaded, setLoading, setError]
  );

  useEffect(() => {
    if (pageTab === "atlassian" && !atlassianLoaded) load("atlassian");
    if (pageTab === "synced" && !syncedLoaded) load("synced");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab, atlassianLoaded, syncedLoaded]);

  const refetch = useCallback(() => load(pageTab), [load, pageTab]);

  const sync = useCallback(
    async (key: string) => {
      setSyncingKeys((s) => new Set(s).add(key));
      try {
        await syncIssue(key);
        // Sync moves the issue into Synced Issues too — mark it stale so
        // switching there fetches the fresh list instead of showing cache.
        setSyncedLoaded(false);
        await load("atlassian");
      } catch (err: any) {
        setError(err.message || `Failed to sync ${key}`);
      } finally {
        setSyncingKeys((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
      }
    },
    [load, setSyncedLoaded, setSyncingKeys, setError]
  );

  /** "Done" button on the Synced Issues table — removes the row locally rather than refetching the whole list. */
  const markDone = useCallback(
    async (key: string) => {
      setRemovingKeys((s) => new Set(s).add(key));
      try {
        await removeSyncedIssue(key);
        setSynced((prev) => prev.filter((issue) => issue.key !== key));
        // The Atlassian tab's "Synced" column is now stale for this issue.
        setAtlassianLoaded(false);
      } catch (err: any) {
        setError(err.message || `Failed to remove ${key}`);
      } finally {
        setRemovingKeys((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
      }
    },
    [setSynced, setAtlassianLoaded, setRemovingKeys, setError]
  );

  return { refetch, sync, load, markDone, removingKeys };
}

/** Fetches (and caches) GET /api/merge-requests/:mrId/reviews for the ReviewFlyout. */
export function useMrReviews(mrId: string | null) {
  const cache = useAtomValue(mrReviewsAtom);
  const setCache = useSetAtom(mrReviewsAtom);
  const setLoading = useSetAtom(mrReviewsLoadingAtom);
  const setError = useSetAtom(mrReviewsErrorAtom);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchMrReviews(id);
        setCache((prev) => ({ ...prev, [id]: result }));
      } catch (err: any) {
        setError(err.message || "Failed to load review history");
      } finally {
        setLoading(false);
      }
    },
    [setCache, setLoading, setError]
  );

  useEffect(() => {
    if (mrId) load(mrId);
  }, [mrId, load]);

  return { data: mrId ? cache[mrId] : undefined, reload: () => mrId && load(mrId) };
}

/**
 * On-demand GET /api/jira/issues/:key/mrs, for expanding a row in *either*
 * table — MR data is never embedded in the issues lists or persisted
 * server-side, so this is the only source of truth for an issue's MRs.
 * Unlike useMrReviews, this doesn't auto-fetch on mount — call `load(key)`
 * explicitly (e.g. from the row's expand-toggle handler) so unexpanded rows
 * never trigger a GitLab call.
 *
 * `reviewingIds` reflects the real server-side job state (stage 5's async
 * Claude Code review), driven by hooks/useJiraReviewSocket.ts over /ws —
 * not just "the POST request is in flight". Starting a review itself is
 * ReviewWorkspaceModal's job (it needs a workspace choice first), not this
 * hook's.
 */
export function useIssueMrs() {
  const cache = useAtomValue(issueMrsAtom);
  const setCache = useSetAtom(issueMrsAtom);
  const loadingKeys = useAtomValue(issueMrsLoadingKeysAtom);
  const setLoadingKeys = useSetAtom(issueMrsLoadingKeysAtom);
  const errors = useAtomValue(issueMrsErrorsAtom);
  const setErrors = useSetAtom(issueMrsErrorsAtom);
  const reviewingIds = useAtomValue(activeReviewMrIdsAtom);

  const load = useCallback(
    async (key: string, { force = false }: { force?: boolean } = {}) => {
      if (!force && (key in cache || loadingKeys.has(key))) return;
      setLoadingKeys((s) => new Set(s).add(key));
      setErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        const mrs = await fetchIssueMrs(key);
        setCache((prev) => ({ ...prev, [key]: mrs }));
        return mrs;
      } catch (err: any) {
        setErrors((prev) => ({ ...prev, [key]: err.message || `Failed to load merge requests for ${key}` }));
        return null;
      } finally {
        setLoadingKeys((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache, loadingKeys, setCache, setLoadingKeys, setErrors]
  );

  return { cache, loadingKeys, errors, reviewingIds, load };
}

/** Fetches (once) and caches GET /api/workspaces for ReviewWorkspaceModal. */
export function useWorkspaces() {
  const workspaces = useAtomValue(workspacesAtom);
  const setWorkspaces = useSetAtom(workspacesAtom);
  const loaded = useAtomValue(workspacesLoadedAtom);
  const setLoaded = useSetAtom(workspacesLoadedAtom);
  const loading = useAtomValue(workspacesLoadingAtom);
  const setLoading = useSetAtom(workspacesLoadingAtom);
  const error = useAtomValue(workspacesErrorAtom);
  const setError = useSetAtom(workspacesErrorAtom);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchWorkspaces();
      setWorkspaces(list);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, [loaded, loading, setWorkspaces, setLoaded, setLoading, setError]);

  return { workspaces, loading, error, load };
}
