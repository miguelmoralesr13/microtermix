/**
 * useGitStaging - Hook for Git staging operations using domain types.
 *
 * This hook wraps Git staging operations and returns domain-typed data.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { GitStatusEntry } from '../../../git/domain';
import { parseGitStateCode, hasConflicts, groupByState } from '../../../git/domain';
import { gitKeys } from '../../../hooks/queries/useGitQueries';

export interface GitStatusResult {
  files: GitStatusEntry[];
  currentBranch: string;
  isMergeInProgress: boolean;
  isRebaseInProgress: boolean;
  statusOutput: string;
}

/**
 * Hook to get parsed Git status with domain types.
 */
export function useGitStaging(path: string | null) {
  return useQuery({
    queryKey: gitKeys.status(path || ''),
    queryFn: async (): Promise<GitStatusResult> => {
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

      const files: GitStatusEntry[] = result.files.map(f => ({
        file: f.file,
        stateCode: f.stateCode,
        isStaged: f.isStaged,
        isUnstaged: f.isUnstaged,
        isConflicted: f.isConflicted,
        state: parseGitStateCode(f.stateCode),
      }));

      return {
        files,
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

/**
 * Hook to stage files.
 */
export function useGitStageFiles(path: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: string[]) => {
      for (const file of files) {
        await invoke('git_execute', {
          projectPath: path,
          args: ['add', file],
        });
      }
    },
    onSuccess: () => {
      if (path) {
        queryClient.invalidateQueries({ queryKey: gitKeys.status(path) });
      }
    },
  });
}

/**
 * Hook to unstage files.
 */
export function useGitUnstageFiles(path: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: string[]) => {
      for (const file of files) {
        await invoke('git_execute', {
          projectPath: path,
          args: ['reset', 'HEAD', '--', file],
        });
      }
    },
    onSuccess: () => {
      if (path) {
        queryClient.invalidateQueries({ queryKey: gitKeys.status(path) });
      }
    },
  });
}

/**
 * Hook to discard changes to files.
 */
export function useGitDiscardFiles(path: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: string[]) => {
      for (const file of files) {
        await invoke('git_execute', {
          projectPath: path,
          args: ['checkout', '--', file],
        });
      }
    },
    onSuccess: () => {
      if (path) {
        queryClient.invalidateQueries({ queryKey: gitKeys.status(path) });
      }
    },
  });
}

/**
 * Hook to commit staged changes.
 */
export function useGitCommit(path: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ message, amend = false }: { message: string; amend?: boolean }) => {
      const args = amend ? ['commit', '--amend', '-m', message] : ['commit', '-m', message];
      await invoke('git_execute', {
        projectPath: path,
        args,
      });
    },
    onSuccess: () => {
      if (path) {
        queryClient.invalidateQueries({ queryKey: gitKeys.repo(path) });
      }
    },
  });
}

// Re-export domain helpers for convenience
export { hasConflicts, groupByState };

// Re-export types
export type { GitStatusEntry } from '../../../git/domain';
