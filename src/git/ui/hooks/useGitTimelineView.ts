/**
 * useGitTimelineView - Hook for Git timeline/commits using domain types.
 *
 * This hook wraps Git log operations and returns domain-typed data.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { GitCommit } from '../../../git/domain';
import { getCommitSubject, isMergeCommit, parseRefs } from '../../../git/domain';
import { gitKeys } from '../../../hooks/queries/useGitQueries';

/**
 * Hook to get parsed Git timeline with domain types.
 */
export function useGitTimelineView(path: string | null, limit = 100) {
  return useQuery({
    queryKey: gitKeys.timeline(path || ''),
    queryFn: async (): Promise<{
      commits: GitCommit[];
      localHashes: string[];
    }> => {
      const result = await invoke<{
        commits: Array<{
          hash: string;
          shortHash: string;
          parents: string[];
          author: string;
          date: string;
          message: string;
          refs: string;
        }>;
        localHashes: string[];
      }>('git_log_native', { projectPath: path, limit });

      return {
        commits: result.commits,
        localHashes: result.localHashes,
      };
    },
    enabled: !!path,
    staleTime: 60_000,
  });
}

/**
 * Hook to reword a commit.
 */
export function useGitRewordCommit(path: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash, message }: { hash: string; message: string }) => {
      await invoke('git_reword_commit', {
        projectPath: path,
        commitHash: hash,
        newMessage: message,
      });
    },
    onSuccess: () => {
      if (path) {
        queryClient.invalidateQueries({ queryKey: gitKeys.timeline(path) });
      }
    },
  });
}

/**
 * Hook to squash a commit into its parent.
 */
export function useGitSquashCommit(path: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash }: { hash: string }) => {
      await invoke('git_squash_commit', {
        projectPath: path,
        commitHash: hash,
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
export { getCommitSubject, isMergeCommit, parseRefs };

// Re-export types
export type { GitCommit } from '../../../git/domain';
