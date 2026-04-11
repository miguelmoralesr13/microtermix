import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { GitStatusEntry, RawCommit, AheadBehind } from '../../stores/gitStore';
import { useGitStore } from '../../stores/gitStore';
import { listen } from '@tauri-apps/api/event';
import {
    fetchWorkflowRuns,
    fetchWorkflowRunJobs,
} from '../../services/githubApi';
export type { WorkflowRun, WorkflowJob } from '../../services/githubApi';

export const gitKeys = {
    all: ['git'] as const,
    repo: (path: string) => [...gitKeys.all, 'repo', path] as const,
    status: (path: string) => [...gitKeys.repo(path), 'status'] as const,
    branches: (path: string) => [...gitKeys.repo(path), 'branches'] as const,
    timeline: (path: string) => [...gitKeys.repo(path), 'timeline'] as const,
    aheadBehind: (path: string) => [...gitKeys.repo(path), 'aheadBehind'] as const,
    workflowRuns: (path: string) => [...gitKeys.repo(path), 'workflow-runs'] as const,
    workflowRunJobs: (path: string, runId: number) => [...gitKeys.repo(path), 'workflow-run-jobs', runId] as const,
};

export function useGitRepoCheck(path: string | null) {
    return useQuery({
        queryKey: [...gitKeys.repo(path || ''), 'check'],
        queryFn: async () => {
            const res: { isGitRepo: boolean; hasCommits: boolean } =
                await invoke('git_is_repo_native', { projectPath: path });
            if (res.isGitRepo) {
                return res.hasCommits ? 'initialized' : 'empty_repo';
            }
            return 'not_initialized';
        },
        enabled: !!path,
        staleTime: 10 * 60 * 1000,
    });
}

export function useGitStatus(path: string | null) {
    return useQuery({
        queryKey: gitKeys.status(path || ''),
        queryFn: () => invoke<{
            files: GitStatusEntry[];
            currentBranch: string;
            isMergeInProgress: boolean;
            isRebaseInProgress: boolean;
            statusOutput: string;
        }>('git_status_native', { projectPath: path }),
        enabled: !!path,
        staleTime: 30_000,
    });
}

export function useGitBranches(path: string | null) {
    return useQuery({
        queryKey: gitKeys.branches(path || ''),
        queryFn: () => invoke<{
            local: { name: string; active: boolean }[];
            remote: string[];
            stashes: string[];
        }>('git_branches_native', { projectPath: path }),
        enabled: !!path,
        staleTime: 60_000,
    });
}

export function useGitTimeline(path: string | null) {
    return useQuery({
        queryKey: gitKeys.timeline(path || ''),
        queryFn: () => invoke<{
            commits: RawCommit[];
            localHashes: string[];
        }>('git_log_native', { projectPath: path }),
        enabled: !!path,
        staleTime: 60_000,
    });
}

export function useGitAheadBehind(path: string | null) {
    return useQuery({
        queryKey: gitKeys.aheadBehind(path || ''),
        queryFn: () => invoke<AheadBehind>('git_ahead_behind_native', { projectPath: path }),
        enabled: !!path,
        staleTime: 30_000,
        retry: false, // Don't spam if no remote
    });
}

/**
 * Global Git Watcher: Invalidates React Query cache when backend detects changes.
 */
export function useGitWatcher(projectPaths: string[]) {
    const queryClient = useQueryClient();
    const timersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        let unlisten: (() => void) | null = null;

        const setup = async () => {
            unlisten = await listen<string>('git-changed', (event) => {
                const changedPath = event.payload;
                
                if (timersRef.current[changedPath]) {
                    clearTimeout(timersRef.current[changedPath]);
                }

                timersRef.current[changedPath] = setTimeout(() => {
                    console.log(`⚡ React Query Git Watcher: ${changedPath} changed (debounced)`);
                    queryClient.invalidateQueries({ queryKey: gitKeys.repo(changedPath) });
                    delete timersRef.current[changedPath];
                }, 500);
            });
        };

        setup();

        return () => {
            if (unlisten) unlisten();
            Object.values(timersRef.current).forEach(clearTimeout);
            projectPaths.forEach(path => {
                invoke('stop_watching_repo', { projectPath: path }).catch(() => { });
            });
        };
    }, [projectPaths, queryClient]);
}

export function useWorkflowRuns(path: string | null, enabled: boolean) {
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const account = path ? getActiveAccount(path) : undefined;
    const token = account?.token || '';
    const apiUrl = account?.url;

    return useQuery({
        queryKey: gitKeys.workflowRuns(path || ''),
        queryFn: () => fetchWorkflowRuns(path as string, token, apiUrl),
        enabled: !!path && enabled,
        staleTime: 30_000,
        // Adaptive interval: 15s while runs are active, 2min when all done.
        // `enabled ? fn : false` ensures observers with enabled=false never set an interval.
        refetchInterval: enabled ? (query) => {
            const runs = query.state.data as typeof query.state.data;
            const hasActive = runs?.some(
                r => r.status === 'in_progress' || r.status === 'queued' || r.status === 'waiting'
            );
            return hasActive ? 15_000 : 120_000;
        } : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
    });
}

export function useWorkflowRunJobs(path: string | null, runId: number | null) {
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const account = path ? getActiveAccount(path) : undefined;
    const token = account?.token || '';
    const apiUrl = account?.url;

    return useQuery({
        queryKey: gitKeys.workflowRunJobs(path || '', runId ?? -1),
        queryFn: () => fetchWorkflowRunJobs(path as string, token, runId as number, apiUrl),
        enabled: !!path && runId != null,
        staleTime: 15_000,
        retry: 1,
    });
}
