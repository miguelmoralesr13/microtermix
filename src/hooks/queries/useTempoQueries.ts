import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyWorklogs, getIssueWorklogs, deleteWorklog, type TempoWorklog } from '../../services/tempoApi';
import { useTempoStore, periodRange } from '../../stores/tempoStore';
import { fetch } from '@tauri-apps/plugin-http';
import { toast } from 'sonner';

const issueCache = new Map<string, { key: string; summary: string }>();

async function enrichWorklogs(
  worklogs: TempoWorklog[],
  jiraBaseUrl: string,
  jiraEmail: string,
  jiraToken: string,
): Promise<TempoWorklog[]> {
  const unknownIds = [...new Set(
    worklogs.map(w => String(w.issue.id)).filter(id => !issueCache.has(id)),
  )];
  if (unknownIds.length > 0) {
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < unknownIds.length; i += 100) chunks.push(unknownIds.slice(i, i + 100));
      for (const chunk of chunks) {
        const jql = `id in (${chunk.join(',')})`;
        const res = await fetch(
          `${jiraBaseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=100`,
          { headers: { Authorization: `Basic ${btoa(`${jiraEmail}:${jiraToken}`)}`, Accept: 'application/json' } },
        );
        if (res.ok) {
          const data = await res.json();
          for (const issue of data.issues ?? []) {
            issueCache.set(String(issue.id), { key: issue.key, summary: issue.fields?.summary ?? '' });
          }
        }
      }
    } catch { /* silently skip */ }
  }
  return worklogs.map(w => {
    const info = issueCache.get(String(w.issue.id));
    return info ? { ...w, issueKey: info.key, issueSummary: info.summary } : w;
  });
}

export const tempoKeys = {
    all: ['tempo'] as const,
    worklogs: (periodFrom: string, periodTo: string, accountId: string) => [...tempoKeys.all, 'worklogs', periodFrom, periodTo, accountId] as const,
    issueWorklogs: (issueId: number, accountId?: string) => [...tempoKeys.all, 'issue-worklogs', issueId, accountId || 'all'] as const,
};

export function useTempoWorklogs(config: any, resolvedAccountId: string | null) {
    const { period } = useTempoStore();
    const { from, to } = periodRange(period);

    return useQuery({
        queryKey: tempoKeys.worklogs(from, to, resolvedAccountId || 'none'),
        queryFn: async () => {
            if (!config.tempoToken || !resolvedAccountId) throw new Error('Missing config');
            const raw = await getMyWorklogs(config.tempoToken, resolvedAccountId, from, to);
            return await enrichWorklogs(raw, config.baseUrl, config.email, config.apiToken);
        },
        enabled: !!config.tempoToken && !!resolvedAccountId,
        staleTime: 2 * 60 * 1000,
    });
}

export function useTempoIssueWorklogs(config: any, issueId: number | null, resolvedAccountId: string | null) {
    return useQuery({
        queryKey: tempoKeys.issueWorklogs(issueId || 0, resolvedAccountId || undefined),
        queryFn: async () => {
            if (!config.tempoToken || !issueId) throw new Error('Missing config');
            const raw = await getIssueWorklogs(config.tempoToken, issueId, resolvedAccountId || undefined);
            return await enrichWorklogs(raw, config.baseUrl, config.email, config.apiToken);
        },
        enabled: !!config.tempoToken && !!issueId,
    });
}

export function useTempoDeleteWorklog(tempoToken: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (tempoWorklogId: number) => deleteWorklog(tempoToken, tempoWorklogId),
        onSuccess: () => {
            toast.success('Worklog eliminado');
            queryClient.invalidateQueries({ queryKey: tempoKeys.all });
        },
        onError: (e: any) => {
            toast.error('Error al eliminar', { description: e.message });
        }
    });
}
