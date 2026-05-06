/**
 * useJiraWorklogs - Hook for Tempo worklog operations using domain types.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TauriTempoAdapter } from '../../infrastructure/TauriJiraAdapter';
import type { JiraWorklog, JiraAccount } from '../../domain';
import {} from '../../domain/JiraWorklog';

export const tempoKeys = {
  all: ['tempo'] as const,
  myWorklogs: (startDate: string, endDate: string) => [...tempoKeys.all, 'worklogs', startDate, endDate] as const,
  issueWorklogs: (issueKey: string) => [...tempoKeys.all, 'issue-worklogs', issueKey] as const,
  worklog: (worklogId: string) => [...tempoKeys.all, 'worklog', worklogId] as const,
};

/**
 * Hook to get current user's worklogs for a date range.
 */
export function useJiraMyWorklogs(
  account: JiraAccount | null,
  startDate: string | null,
  endDate: string | null,
) {
  return useQuery({
    queryKey: tempoKeys.myWorklogs(startDate || '', endDate || ''),
    queryFn: async (): Promise<JiraWorklog[]> => {
      if (!account || !startDate || !endDate) throw new Error('Missing parameters');
      const adapter = new TauriTempoAdapter(account);
      return adapter.getMyWorklogs(startDate, endDate);
    },
    enabled: !!account && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}

/**
 * Hook to get worklogs for a specific issue.
 */
export function useJiraIssueWorklogs(account: JiraAccount | null, issueKey: string | null) {
  return useQuery({
    queryKey: tempoKeys.issueWorklogs(issueKey || ''),
    queryFn: async (): Promise<JiraWorklog[]> => {
      if (!account || !issueKey) throw new Error('Missing account or issue key');
      const adapter = new TauriTempoAdapter(account);
      return adapter.getIssueWorklogs(issueKey);
    },
    enabled: !!account && !!issueKey,
    staleTime: 30_000,
  });
}

/**
 * Hook to create a worklog.
 */
export function useJiraCreateWorklog(account: JiraAccount | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      issueKey: string;
      timeSpent: string;
      started: string;
      description?: string;
    }) => {
      if (!account) throw new Error('No account');
      const adapter = new TauriTempoAdapter(account);
      return adapter.createWorklog(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tempoKeys.all });
    },
  });
}

/**
 * Hook to delete a worklog.
 */
export function useJiraDeleteWorklog(account: JiraAccount | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (worklogId: string) => {
      if (!account) throw new Error('No account');
      const adapter = new TauriTempoAdapter(account);
      return adapter.deleteWorklog(worklogId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tempoKeys.all });
    },
  });
}

// Re-export domain helpers
export { calculateTotalSeconds, formatDuration, groupWorklogsByDate, parseTimeSpent } from '../../domain';
