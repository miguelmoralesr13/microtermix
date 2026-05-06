import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { parseGitStateCode } from '../../git/domain';
import type { GitStatusEntry, GitCommit, GitAheadBehind } from '../../git/domain';
import { useGitStore } from '../../stores/gitStore';
import { listen } from '@tauri-apps/api/event';
import {
    fetchWorkflowRuns,
    fetchWorkflowRunJobs,
    fetchJobLogs,
    type WorkflowRunStatus,
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
    workflowJobLogs: (path: string, jobId: number) => ['workflow-job-logs', path, jobId] as const,
    fileHistory: (path: string, filePath: string) => [...gitKeys.repo(path), 'file-history', filePath] as const,
    branchDiffFiles: (path: string, base: string, head: string) => [...gitKeys.repo(path), 'branch-diff-files', base, head] as const,
    branchDiffFileContent: (path: string, base: string, head: string, filePath: string) => [...gitKeys.repo(path), 'branch-diff-content', base, head, filePath] as const,
    protectedBranches: (path: string) => [...gitKeys.repo(path), 'protected-branches'] as const,
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
        queryFn: async () => {
            const result = await invoke<{
                files: Array<{
                    file: string;
                    stateCode: string;
                    isStaged: boolean;
                    isUnstaged: boolean;
                    isConflicted: boolean;
                }>;
                currentBranch: string;
                isMergeInProgress: boolean;
                isRebaseInProgress: boolean;
                statusOutput: string;
            }>('git_status_native', { projectPath: path });

            // Transform raw Tauri data into domain types
            const domainFiles: GitStatusEntry[] = result.files.map(f => ({
                file: f.file,
                stateCode: f.stateCode,
                isStaged: f.isStaged,
                isUnstaged: f.isUnstaged,
                isConflicted: f.isConflicted,
                state: parseGitStateCode(f.stateCode),
            }));

            return {
                files: domainFiles,
                currentBranch: result.currentBranch,
                isMergeInProgress: result.isMergeInProgress,
                isRebaseInProgress: result.isRebaseInProgress,
                statusOutput: result.statusOutput,
            };
        },
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
            commits: GitCommit[];
            localHashes: string[];
        }>('git_log_native', { projectPath: path }),
        enabled: !!path,
        staleTime: 60_000,
    });
}

export function useGitAheadBehind(path: string | null) {
    return useQuery({
        queryKey: gitKeys.aheadBehind(path || ''),
        queryFn: () => invoke<GitAheadBehind>('git_ahead_behind_native', { projectPath: path }),
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

interface FileLogResult {
    commits: { hash: string; shortHash: string; author: string; date: string; message: string; refs: string }[];
    localHashes: string[];
}

interface BranchDiffFilesResult {
    files: { status: string; path: string; oldPath?: string | null }[];
    base: string;
    head: string;
}

export function useFileHistory(path: string | null, filePath: string | null) {
    return useQuery({
        queryKey: gitKeys.fileHistory(path || '', filePath || ''),
        queryFn: () => invoke<FileLogResult>('git_file_log_native', { projectPath: path, filePath }),
        enabled: !!path && !!filePath,
        staleTime: 60_000,
    });
}

export function useBranchDiffFiles(path: string | null, base: string, head: string) {
    return useQuery({
        queryKey: gitKeys.branchDiffFiles(path || '', base, head),
        queryFn: () => invoke<BranchDiffFilesResult>('git_branch_diff_files', { projectPath: path, base, head }),
        enabled: !!path && !!base && !!head,
        staleTime: 30_000,
    });
}

export function useProtectedBranches(path: string | null) {
    return useQuery({
        queryKey: gitKeys.protectedBranches(path || ''),
        queryFn: async () => {
            const res: any = await invoke('git_execute', { projectPath: path, args: ['config', 'microtermix.protectedBranches'] });
            if (!res?.success || !res.stdout?.trim()) return [] as string[];
            return res.stdout.trim().split(',').map((b: string) => b.trim()).filter(Boolean) as string[];
        },
        enabled: !!path,
        staleTime: 5 * 60_000,
    });
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
        staleTime: 0, // always refetch on mount so entering the tab shows fresh runs
        // 10s fallback poll in case the watcher fails for any reason.
        // This ensures the main workflow status doesn't get "stuck".
        refetchInterval: enabled ? 10_000 : false,
        refetchOnWindowFocus: false,
        retry: 1,
    });
}

export function useWorkflowRunJobs(path: string | null, runId: number | null, runStatus?: WorkflowRunStatus) {
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const account = path ? getActiveAccount(path) : undefined;
    const token = account?.token || '';
    const apiUrl = account?.url;

    const isActive = runStatus === 'in_progress' || runStatus === 'queued' || runStatus === 'waiting';

    const { data, isLoading, isError, error } = useQuery({
        queryKey: gitKeys.workflowRunJobs(path || '', runId ?? -1),
        queryFn: () => fetchWorkflowRunJobs(path as string, token, runId as number, apiUrl),
        enabled: !!path && runId != null,
        staleTime: isActive ? 0 : 15_000,
        // Adaptive interval: 2s if jobs are running, 5s if run is active but jobs are waiting/stalled.
        refetchInterval: (query) => {
            if (!isActive) return false;
            const jobs = query.state.data as any[];
            const hasActiveJobs = jobs?.some(j => j.status === 'in_progress' || j.status === 'queued' || j.status === 'waiting');
            return hasActiveJobs ? 2_000 : 5_000;
        },
        refetchOnWindowFocus: false,
        retry: 1,
    });

    return { data, isLoading, isError, error };
}

export function useWorkflowJobLogs(path: string | null, jobId: number | null, jobStatus?: WorkflowRunStatus) {
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const account = path ? getActiveAccount(path) : undefined;
    const token = account?.token || '';
    const apiUrl = account?.url;

    // GitHub REST API only delivers logs for completed jobs.
    // In-progress jobs return 404 — live streaming is not supported via this endpoint.
    const isCompleted = jobStatus === 'completed';

    return useQuery({
        queryKey: gitKeys.workflowJobLogs(path || '', jobId ?? -1),
        queryFn: () => fetchJobLogs(path as string, token, jobId as number, apiUrl),
        enabled: !!path && jobId != null && isCompleted,
        staleTime: 10 * 60_000, // logs are immutable once complete
        refetchOnWindowFocus: false,
        retry: false,
    });
}
