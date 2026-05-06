/**
 * useGitDiff - Hook for fetching and managing Git diff data using domain types.
 *
 * Uses TauriGitDiffAdapter to fetch diff data and transforms it to domain types.
 */
import { useQuery } from '@tanstack/react-query';
import { TauriGitDiffAdapter } from '../../git/infrastructure';

const diffAdapter = new TauriGitDiffAdapter();

export const gitDiffKeys = {
  all: ['git-diff'] as const,
  fullDiff: (path: string, file: string, mode: 'staged' | 'unstaged') =>
    [...gitDiffKeys.all, 'full-diff', path, file, mode] as const,
  diffModel: (path: string, file: string) =>
    [...gitDiffKeys.all, 'diff-model', path, file] as const,
  diffHunks: (path: string, file: string) =>
    [...gitDiffKeys.all, 'diff-hunks', path, file] as const,
};

/**
 * Hook to get full diff with original/modified content and hunks.
 */
export function useGitFullDiff(
  path: string | null,
  file: string | null,
) {
  return useQuery({
    queryKey: gitDiffKeys.fullDiff(path || '', file || '', 'unstaged'),
    queryFn: () => {
      if (!path || !file) throw new Error('Path and file are required');
      return diffAdapter.getFullDiff(path, file);
    },
    enabled: !!path && !!file,
    staleTime: 30_000,
  });
}

/**
 * Hook to get diff model (original + modified content only).
 */
export function useGitDiffModel(
  path: string | null,
  file: string | null,
) {
  return useQuery({
    queryKey: gitDiffKeys.diffModel(path || '', file || ''),
    queryFn: () => {
      if (!path || !file) throw new Error('Path and file are required');
      return diffAdapter.getDiffModel(path, file);
    },
    enabled: !!path && !!file,
    staleTime: 30_000,
  });
}

/**
 * Hook to compute diff hunks (structured).
 */
export function useGitDiffHunks(
  path: string | null,
  file: string | null,
) {
  return useQuery({
    queryKey: gitDiffKeys.diffHunks(path || '', file || ''),
    queryFn: () => {
      if (!path || !file) throw new Error('Path and file are required');
      return diffAdapter.computeDiffHunks(path, file);
    },
    enabled: !!path && !!file,
    staleTime: 30_000,
  });
}
