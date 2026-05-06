// GitStatusEntry
export {
  parseGitStateCode,
  hasConflicts,
  groupByState,
  getBasename,
  getDirectory,
} from './GitStatusEntry';
export type { GitFileState, GitStatusEntry } from './GitStatusEntry';

// GitCommit
export {
  getCommitSubject,
  isMergeCommit,
  parseRefs,
  isBranchHead,
} from './GitCommit';
export type { GitCommit } from './GitCommit';

// GitBranch
export {
  parseRemoteName,
  parseShortName,
  isTrackingBranch,
  filterByType,
} from './GitBranch';
export type { GitBranchType, GitBranch } from './GitBranch';

// GitAccount
export {
  createGitAccount,
  normalizeGitUrl,
  buildGitAuthHeader,
  DEFAULT_API_URLS,
} from './GitAccount';
export type { GitProvider, GitAccount } from './GitAccount';

// GitDiff
export {
  countLinesInHunk,
  buildPatchFromLines,
  parseHunkHeader,
} from './GitDiff';
export type { DiffLine, DiffHunk, FileDiff } from './GitDiff';

// GitAheadBehind
export {
  isInSync,
  needsPush,
  needsPull,
  formatAheadBehind,
} from './GitAheadBehind';
export type { GitAheadBehind } from './GitAheadBehind';

// GitStash / GitCloneFavorite
export type { GitStash, GitCloneFavorite } from './GitStash';

// Diff parsing utilities (moved from components)
export {
  parseUnifiedDiff,
  buildPatchFromSelectedLines,
} from './diffUtils';
export type { DiffParserLineType, DiffParserLine, DiffParserHunk } from './diffUtils';