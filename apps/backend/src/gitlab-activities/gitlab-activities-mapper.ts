import type { GitlabRawEvent } from '../mr/gitlab-client';

export type ActivityTypeKey = 'commit' | 'merge_request' | 'issue' | 'comment' | 'other';

export interface GitlabActivityDto {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  datetime: string; // raw created_at
  userId: number;
  userName: string;
  type: ActivityTypeKey;
  typeLabel: string;
  title: string;
}

/**
 * Buckets one raw GitLab event into a small, stable set of types. GitLab's
 * Events API has no single field that means "kind of activity" — pushes
 * carry a `push_data` blob instead of a target, MRs/Issues are identified by
 * `target_type`, and comments only reveal themselves via `action_name`/a
 * `note` body. This is the single place that mapping lives so the service's
 * per-type filtering and the `.env`-configured type labels both stay in sync.
 */
export function classifyEvent(raw: GitlabRawEvent): { type: ActivityTypeKey; title: string } {
  if (raw.push_data) {
    const pd = raw.push_data;
    const title = pd.commit_title || `${pd.action || ''} ${pd.ref_type || ''} ${pd.ref || ''}`.trim();
    return { type: 'commit', title };
  }

  const targetType = raw.target_type;
  const actionName = String(raw.action_name || '');

  if (targetType === 'MergeRequest') {
    return { type: 'merge_request', title: raw.target_title || actionName };
  }
  if (targetType === 'Issue') {
    return { type: 'issue', title: raw.target_title || actionName };
  }
  if (actionName.toLowerCase().includes('commented') || raw.note) {
    return { type: 'comment', title: raw.target_title || raw.note?.body || actionName };
  }
  return { type: 'other', title: raw.target_title || actionName };
}

export function toActivityDto(raw: GitlabRawEvent, userId: number, userName: string, typeLabels: Map<string, string>): GitlabActivityDto {
  const { type, title } = classifyEvent(raw);
  const createdAt = String(raw.created_at || '');
  const [date = '', timePart = ''] = createdAt.split('T');
  const time = timePart.replace('Z', '').slice(0, 8);

  return {
    id: `${raw.project_id}-${raw.id}`,
    date,
    time,
    datetime: createdAt,
    userId,
    userName,
    type,
    typeLabel: typeLabels.get(type) || type,
    title,
  };
}
