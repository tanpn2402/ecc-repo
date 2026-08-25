import { useCallback, useEffect, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  gitlabActivitiesAtom,
  gitlabActivitiesLoadingAtom,
  gitlabActivitiesErrorAtom,
  gitlabActivitiesMetaAtom,
  gitlabActivitiesMetaLoadedAtom,
  gitlabActivitySelectedUserIdsAtom,
  gitlabActivitySelectedTypesAtom,
  gitlabActivityDateFromAtom,
  gitlabActivityDateToAtom,
} from "@/atoms";
import { fetchGitlabActivitiesMeta, fetchGitlabActivities } from "@/lib/gitlab-activities-api";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-Sunday range containing `now`, as YYYY-MM-DD strings. */
function currentWeekRange(now: Date): { from: string; to: string } {
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toDateStr(monday), to: toDateStr(sunday) };
}

/**
 * Loads GET /api/gitlab-activities/meta once, defaults the date range to the
 * current week on first mount, then re-fetches GET /api/gitlab-activities
 * every time the selected users/types/date-range atoms change. There's no
 * DB behind this page (see backend gitlab-activities.module.ts) — every
 * filter change is a fresh live call to GitLab.
 */
export function useGitlabActivitiesData() {
  const [meta, setMeta] = useAtom(gitlabActivitiesMetaAtom);
  const [metaLoaded, setMetaLoaded] = useAtom(gitlabActivitiesMetaLoadedAtom);
  const setActivities = useSetAtom(gitlabActivitiesAtom);
  const setLoading = useSetAtom(gitlabActivitiesLoadingAtom);
  const setError = useSetAtom(gitlabActivitiesErrorAtom);
  const selectedUserIds = useAtomValue(gitlabActivitySelectedUserIdsAtom);
  const selectedTypes = useAtomValue(gitlabActivitySelectedTypesAtom);
  const [dateFrom, setDateFrom] = useAtom(gitlabActivityDateFromAtom);
  const [dateTo, setDateTo] = useAtom(gitlabActivityDateToAtom);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (metaLoaded) return;
    fetchGitlabActivitiesMeta()
      .then((result) => {
        if (mountedRef.current) {
          setMeta(result);
          setMetaLoaded(true);
        }
      })
      .catch((err: any) => {
        if (mountedRef.current) setError(err.message || "Failed to load GitLab Activities filters");
      });
  }, [metaLoaded, setMeta, setMetaLoaded, setError]);

  useEffect(() => {
    if (dateFrom && dateTo) return;
    const range = currentWeekRange(new Date());
    setDateFrom(range.from);
    setDateTo(range.to);
  }, [dateFrom, dateTo, setDateFrom, setDateTo]);

  const load = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      const activities = await fetchGitlabActivities({
        userIds: [...selectedUserIds],
        types: [...selectedTypes],
        from: dateFrom,
        to: dateTo,
      });
      if (mountedRef.current) setActivities(activities);
    } catch (err: any) {
      if (mountedRef.current) setError(err.message || "Failed to load GitLab activities");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [selectedUserIds, selectedTypes, dateFrom, dateTo, setActivities, setLoading, setError]);

  useEffect(() => {
    load();
  }, [load]);

  return { meta, refetch: load };
}
