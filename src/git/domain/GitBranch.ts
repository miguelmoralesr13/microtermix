/**
 * Domain entity representing a Git branch.
 * Pure domain model — no framework dependencies.
 */
export type GitBranchType = 'local' | 'remote' | 'stash';

export interface GitBranch {
  /** Branch name (e.g., 'main', 'origin/main') */
  name: string;
  /** Short name without remote prefix */
  shortName: string;
  /** Remote name (e.g., 'origin') or undefined for local */
  remote?: string;
  /** Whether this is a local, remote, or stash entry */
  type: GitBranchType;
  /** Whether this is the currently checked out branch */
  isActive: boolean;
  /** Latest commit hash on this branch */
  latestCommit?: string;
  /** Latest commit subject on this branch */
  latestSubject?: string;
}

/**
 * Extracts the remote name from a full branch name.
 */
export function parseRemoteName(fullName: string): string | undefined {
  const slashIndex = fullName.indexOf('/');
  if (slashIndex === -1) return undefined;
  return fullName.substring(0, slashIndex);
}

/**
 * Extracts the short branch name without remote prefix.
 */
export function parseShortName(fullName: string): string {
  const slashIndex = fullName.indexOf('/');
  if (slashIndex === -1) return fullName;
  return fullName.substring(slashIndex + 1);
}

/**
 * Checks if a branch is a tracking branch (has upstream).
 */
export function isTrackingBranch(branch: GitBranch): boolean {
  return branch.type === 'remote' || branch.remote !== undefined;
}

/**
 * Filters branches by type.
 */
export function filterByType(
  branches: GitBranch[],
  type: GitBranchType,
): GitBranch[] {
  return branches.filter((b) => b.type === type);
}
