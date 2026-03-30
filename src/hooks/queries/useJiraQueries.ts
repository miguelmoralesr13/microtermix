import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../../components//jira/jiraApi';
import { useJiraStore } from '../../stores/jiraStore';
import { toast } from 'sonner';
import { useMemo } from 'react';

export const jiraKeys = {
    all: ['jira'] as const,
    issues: (jql: string) => [...jiraKeys.all, 'issues', jql] as const,
    issue: (key: string) => [...jiraKeys.all, 'issue', key] as const,
    projects: () => [...jiraKeys.all, 'projects'] as const,
    transitions: (key: string) => [...jiraKeys.all, 'transitions', key] as const,
    comments: (key: string) => [...jiraKeys.all, 'comments', key] as const,
    worklogs: (key: string) => [...jiraKeys.all, 'worklogs', key] as const,
    createmeta: (projectKey: string) => [...jiraKeys.all, 'createmeta', projectKey] as const,
};

/**
 * Helper hook to get stable Jira config from store
 */
function useActiveJiraConfig() {
    const activeAccountId = useJiraStore(s => s.activeAccountId);
    const accounts = useJiraStore(s => s.accounts);
    
    return useMemo(() => {
        const acc = accounts.find(a => a.id === activeAccountId) ?? accounts[0];
        return acc?.config;
    }, [activeAccountId, accounts]);
}

export function useJiraIssues(jql: string, enabled: boolean = true) {
    const config = useActiveJiraConfig();
    return useQuery({
        queryKey: [...jiraKeys.issues(jql), config?.baseUrl],
        queryFn: () => api.searchIssues(jql),
        enabled: enabled && !!config?.baseUrl,
        staleTime: 2 * 60 * 1000,
    });
}

export function useJiraIssue(key: string | null, enabled: boolean = true) {
    const config = useActiveJiraConfig();
    return useQuery({
        queryKey: [...jiraKeys.issue(key || ''), config?.baseUrl],
        queryFn: () => api.getIssue(key!),
        enabled: enabled && !!key && !!config?.baseUrl,
        staleTime: 5 * 60 * 1000,
    });
}

export function useJiraProjects() {
    const config = useActiveJiraConfig();
    return useQuery({
        queryKey: [...jiraKeys.projects(), config?.baseUrl],
        queryFn: () => api.getProjects(),
        enabled: !!config?.baseUrl,
        staleTime: 10 * 60 * 1000,
    });
}

export function useJiraTransitions(key: string | null) {
    const config = useActiveJiraConfig();
    return useQuery({
        queryKey: [...jiraKeys.transitions(key || ''), config?.baseUrl],
        queryFn: () => api.getTransitions(key!),
        enabled: !!key && !!config?.baseUrl,
    });
}

export function useJiraTransitionMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ key, transitionId, fields }: { key: string, transitionId: string, fields?: any }) => 
            api.transitionIssue(key, transitionId, undefined, fields),
        onSuccess: (_, variables) => {
            toast.success(`Issue ${variables.key} actualizado`);
            queryClient.invalidateQueries({ queryKey: jiraKeys.issue(variables.key) });
            queryClient.invalidateQueries({ queryKey: jiraKeys.all });
        },
        onError: (e: any) => {
            toast.error(`Error al transicionar: ${e.message}`);
        }
    });
}

export function useJiraAddComment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ key, body }: { key: string, body: string }) => api.addComment(key, body),
        onSuccess: (_, variables) => {
            toast.success(`Comentario añadido a ${variables.key}`);
            queryClient.invalidateQueries({ queryKey: jiraKeys.comments(variables.key) });
        }
    });
}
