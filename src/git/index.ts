/**
 * Git Clean Architecture module.
 *
 * Layers:
 * - domain/      : Pure entities, value objects, domain rules
 * - application/ : Ports (interfaces) and use cases
 * - infrastructure/ : Tauri adapters implementing ports
 * - ui/          : React components (TODO: migrate from src/components/git/)
 */

// Domain
export {
  parseGitStateCode,
  hasConflicts,
  groupByState,
  getBasename,
  getDirectory,
} from './domain';
export type { GitFileState, GitStatusEntry } from './domain';

export {
  getCommitSubject,
  isMergeCommit,
  parseRefs,
  isBranchHead,
} from './domain';
export type { GitCommit } from './domain';

export {
  parseRemoteName,
  parseShortName,
  isTrackingBranch,
  filterByType,
} from './domain';
export type { GitBranchType, GitBranch } from './domain';

export {
  createGitAccount,
  normalizeGitUrl,
  buildGitAuthHeader,
  DEFAULT_API_URLS,
} from './domain';
export type { GitProvider, GitAccount } from './domain';

export {
  countLinesInHunk,
  buildPatchFromLines,
  parseHunkHeader,
} from './domain';
export type { DiffLine, DiffHunk, FileDiff } from './domain';

export {
  isInSync,
  needsPush,
  needsPull,
  formatAheadBehind,
} from './domain';
export type { GitAheadBehind } from './domain';

export type { GitStash, GitCloneFavorite } from './domain';

// Application ports
export type { GitRepositoryPort, GitDiffPort, GitCloudPort } from './application/ports';

// Use cases
export { GetGitStatusUseCase, GetGitTimelineUseCase, GitCommitUseCase } from './application/usecases';
export type { GetGitStatusInput, GetGitTimelineInput, GitCommitInput } from './application/usecases';

// Infrastructure
export {
  TauriGitRepositoryAdapter,
  TauriGitDiffAdapter,
  GithubCloudAdapter,
  GitlabCloudAdapter,
} from './infrastructure';

// UI Layer - re-exports from components (gradual migration target)
export * from './ui';
