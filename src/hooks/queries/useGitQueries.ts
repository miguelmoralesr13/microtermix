import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { GitStatusEntry, RawCommit, AheadBehind } from '../../stores/gitStore';
import { listen } from '@tauri-apps/api/event';

export const gitKeys = {
    all: ['git'] as const,
    repo: (path: string) => [...gitKeys.all, 'repo', path] as const,
    status: (path: string) => [...gitKeys.repo(path), 'status'] as const,
    branches: (path: string) => [...gitKeys.repo(path), 'branches'] as const,
    timeline: (path: string) => [...gitKeys.repo(path), 'timeline'] as const,
    aheadBehind: (path: string) => [...gitKeys.repo(path), 'aheadBehind'] as const,
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
