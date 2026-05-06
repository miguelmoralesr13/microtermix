/**
 * useJiraIssues - Hook for Jira issue operations using domain types.
 */
import { useQuery } from '@tanstack/react-query';
import { TauriJiraAdapter } from '../../infrastructure/TauriJiraAdapter';
import type { JiraIssue } from '../../domain';
import type { JiraAccount } from '../../domain/JiraAccount';

export const jiraKeys = {
  all: ['jira'] as const,
  myIssues: () => [...jiraKeys.all, 'my-issues'] as const,
  issue: (key: string) => [...jiraKeys.all, 'issue', key] as const,
  projectIssues: (projectKey: string) => [...jiraKeys.all, 'project', projectKey] as const,
  epics: (projectKey: string) => [...jiraKeys.all, 'epics', projectKey] as const,
  stories: (epicKey: string) => [...jiraKeys.all, 'stories', epicKey] as const,
  tasks: (storyKey: string) => [...jiraKeys.all, 'tasks', storyKey] as const,
};

/**
 * Hook to get user's assigned issues.
 */
export function useJiraMyIssues(account: JiraAccount | null) {
  return useQuery({
    queryKey: jiraKeys.myIssues(),
    queryFn: async (): Promise<JiraIssue[]> => {
      if (!account) throw new Error('No account');
      const adapter = new TauriJiraAdapter(account);
      return adapter.getMyIssues();
    },
    enabled: !!account,
    staleTime: 60_000,
  });
}

/**
 * Hook to get a single issue.
 */
export function useJiraIssue(account: JiraAccount | null, key: string | null) {
  return useQuery({
    queryKey: jiraKeys.issue(key || ''),
    queryFn: async (): Promise<JiraIssue> => {
      if (!account || !key) throw new Error('Missing account or key');
      const adapter = new TauriJiraAdapter(account);
      return adapter.getIssue(key);
    },
    enabled: !!account && !!key,
    staleTime: 60_000,
  });
}

/**
 * Hook to get project issues.
 */
export function useJiraProjectIssues(account: JiraAccount | null, projectKey: string | null, statusFilter?: string) {
  return useQuery({
    queryKey: [...jiraKeys.projectIssues(projectKey || ''), statusFilter],
    queryFn: async (): Promise<JiraIssue[]> => {
      if (!account || !projectKey) throw new Error('Missing account or project');
      const adapter = new TauriJiraAdapter(account);
      return adapter.getProjectIssues(projectKey, statusFilter);
    },
    enabled: !!account && !!projectKey,
    staleTime: 60_000,
  });
}

/**
 * Hook to get epics for a project.
 */
export function useJiraEpics(account: JiraAccount | null, projectKey: string | null, search?: string) {
  return useQuery({
    queryKey: [...jiraKeys.epics(projectKey || ''), search],
    queryFn: async (): Promise<JiraIssue[]> => {
      if (!account || !projectKey) throw new Error('Missing account or project');
      const adapter = new TauriJiraAdapter(account);
      return adapter.getEpics(projectKey, search);
    },
    enabled: !!account && !!projectKey,
    staleTime: 60_000,
  });
}

/**
 * Hook to get stories for an epic.
 */
export function useJiraStories(account: JiraAccount | null, epicKey: string | null, search?: string) {
  return useQuery({
    queryKey: [...jiraKeys.stories(epicKey || ''), search],
    queryFn: async (): Promise<JiraIssue[]> => {
      if (!account || !epicKey) throw new Error('Missing account or epic');
      const adapter = new TauriJiraAdapter(account);
      return adapter.getStoriesForEpic(epicKey, search);
    },
    enabled: !!account && !!epicKey,
    staleTime: 60_000,
  });
}

/**
 * Hook to search issues by JQL.
 */
export function useJiraSearch(account: JiraAccount | null, jql: string) {
  return useQuery({
    queryKey: [...jiraKeys.all, 'search', jql],
    queryFn: async (): Promise<JiraIssue[]> => {
      if (!account || !jql) throw new Error('Missing account or JQL');
      const adapter = new TauriJiraAdapter(account);
      return adapter.searchIssues(jql);
    },
    enabled: !!account && !!jql,
    staleTime: 60_000,
  });
}

// Re-export domain helpers
export { extractIssueNumber, extractProjectPrefix, isIssueDone, isSubtask } from '../../domain';
