/**
 * Domain entity representing a file's status in the Git working directory/index.
 * Pure domain model — no framework dependencies.
 */
export type GitFileState =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unmodified'
  | 'conflicted'
  | 'ignored';

export interface GitStatusEntry {
  /** Relative file path */
  file: string;
  /** Git state code (e.g., 'M ', ' M', 'MM', '??', 'UU') */
  stateCode: string;
  /** File is staged in the index */
  isStaged: boolean;
  /** File is modified in working directory but not staged */
  isUnstaged: boolean;
  /** File has merge conflicts */
  isConflicted: boolean;
  /** Parsed state from stateCode */
  state: GitFileState;
}

/**
 * Parses a git state code into a GitFileState.
 * Based on git status porcelain format: XY where X=index, Y=workdir
 */
export function parseGitStateCode(code: string): GitFileState {
  if (!code || code.length < 2) return 'unmodified';

  // Conflicted states
  if (code === 'UU' || code === 'AA' || code === 'DD' || code === 'AU' || code === 'UA') {
    return 'conflicted';
  }

  const index = code[0];
  const workdir = code[1];

  // Untracked
  if (code === '??') return 'untracked';
  // Ignored
  if (code === '!!') return 'ignored';

  // Added
  if (index === 'A' || workdir === 'A') return 'added';
  // Deleted
  if (index === 'D' || workdir === 'D') return 'deleted';
  // Renamed
  if (index === 'R' || workdir === 'R') return 'renamed';
  // Copied
  if (index === 'C' || workdir === 'C') return 'copied';
  // Modified
  if (index === 'M' || workdir === 'M') return 'modified';

  return 'unmodified';
}

/**
 * Checks if a status entry has conflicts.
 */
export function hasConflicts(entries: GitStatusEntry[]): boolean {
  return entries.some((e) => e.isConflicted);
}

/**
 * Groups status entries by their state.
 */
export function groupByState(
  entries: GitStatusEntry[],
): Record<GitFileState, GitStatusEntry[]> {
  const groups: Record<string, GitStatusEntry[]> = {};
  for (const entry of entries) {
    const state = entry.state;
    if (!groups[state]) groups[state] = [];
    groups[state].push(entry);
  }
  return groups as Record<GitFileState, GitStatusEntry[]>;
}

/**
 * Extracts the filename from a file path.
 */
export function getBasename(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Extracts the directory from a file path.
 */
export function getDirectory(filePath: string): string {
  const parts = filePath.split('/');
  return parts.slice(0, -1).join('/');
}
