import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as jiraApi from '../components/jiraApi';

// ── Keys ──────────────────────────────────────────────────────────────────────

export const jiraKeys = {
    all: ['jira'] as const,
    projects: () => [...jiraKeys.all, 'projects'] as const,
    issueTypes: (projectKey: string) => [...jiraKeys.all, 'issueTypes', projectKey] as const,
    statuses: (projectKey: string) => [...jiraKeys.all, 'statuses', projectKey] as const,
    epics: (projectKey: string) => [...jiraKeys.all, 'epics', projectKey] as const,
    users: (projectKey: string) => [...jiraKeys.all, 'users', projectKey] as const,
    issues: (projectKey: string, filter: jiraApi.BoardFilter) => [...jiraKeys.all, 'issues', projectKey, filter] as const,
    detail: (issueKey: string) => [...jiraKeys.all, 'detail', issueKey] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useJiraProjects() {
    return useQuery({
        queryKey: jiraKeys.projects(),
        queryFn: jiraApi.getProjects,
        staleTime: 1000 * 60 * 60, // 1 hour (projects don't change often)
    });
}

export function useJiraMetadata(projectKey: string | undefined) {
    const isEnabled = !!projectKey;

    const issueTypes = useQuery({
        queryKey: jiraKeys.issueTypes(projectKey || ''),
        queryFn: () => jiraApi.getIssueTypes(projectKey!),
        enabled: isEnabled,
        staleTime: 1000 * 60 * 60, // 1 hour
        placeholderData: keepPreviousData,
    });

    const statuses = useQuery({
        queryKey: jiraKeys.statuses(projectKey || ''),
        queryFn: () => jiraApi.getProjectStatuses(projectKey!),
        enabled: isEnabled,
        staleTime: 1000 * 60 * 60,
        placeholderData: keepPreviousData,
    });

    const epics = useQuery({
        queryKey: jiraKeys.epics(projectKey || ''),
        queryFn: () => jiraApi.getEpics(projectKey!),
        enabled: isEnabled,
        staleTime: 1000 * 60 * 30,
        placeholderData: keepPreviousData,
    });

    const users = useQuery({
        queryKey: jiraKeys.users(projectKey || ''),
        queryFn: () => jiraApi.getUsers(projectKey!),
        enabled: isEnabled,
        staleTime: 1000 * 60 * 60,
        placeholderData: keepPreviousData,
    });

    return {
        issueTypes,
        statuses,
        epics,
        users,
        isLoading: isEnabled && (issueTypes.isLoading || statuses.isLoading || epics.isLoading || users.isLoading),
    };
}

export function useJiraIssues(projectKey: string | undefined, filter: jiraApi.BoardFilter) {
    return useQuery({
        queryKey: jiraKeys.issues(projectKey || '', filter),
        queryFn: () => jiraApi.getBoardIssues(projectKey!, filter),
        enabled: !!projectKey,
        staleTime: 1000 * 60 * 5, // 5 minutes
        placeholderData: keepPreviousData,
    });
}

export function useJiraIssueDetail(issueKey: string | undefined) {
    return useQuery({
        queryKey: jiraKeys.detail(issueKey || ''),
        queryFn: () => jiraApi.getIssueDetail(issueKey!),
        enabled: !!issueKey,
        staleTime: 1000 * 60 * 5,
    });
}
