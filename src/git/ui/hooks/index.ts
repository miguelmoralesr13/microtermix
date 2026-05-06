/**
 * Git UI hooks - domain-aware hooks for Git operations.
 */

export { useGitStaging, useGitStageFiles, useGitUnstageFiles, useGitDiscardFiles, useGitCommit, hasConflicts, groupByState } from './useGitStaging';
export type { GitStatusEntry, GitStatusResult } from './useGitStaging';

export { useGitTimelineView, useGitRewordCommit, useGitSquashCommit, getCommitSubject, isMergeCommit, parseRefs } from './useGitTimelineView';
export type { GitCommit } from './useGitTimelineView';
