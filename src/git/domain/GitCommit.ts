/**
 * Domain entity representing a Git commit.
 * Pure domain model — no framework dependencies.
 */
export interface GitCommit {
  /** Full SHA hash */
  hash: string;
  /** Short hash (7 chars) */
  shortHash: string;
  /** Parent commit hashes */
  parents: string[];
  /** Author name + email */
  author: string;
  /** Commit date (ISO string) */
  date: string;
  /** Commit message (first line + body) */
  message: string;
  /** Refs (branches, tags) pointing to this commit */
  refs: string;
}

/**
 * Extracts the first line (subject) of a commit message.
 */
export function getCommitSubject(commit: GitCommit): string {
  return commit.message.split('\n')[0] || '';
}

/**
 * Checks if a commit is a merge commit.
 */
export function isMergeCommit(commit: GitCommit): boolean {
  return commit.parents.length > 1;
}

/**
 * Parses refs string into an array of ref names.
 */
export function parseRefs(refs: string): string[] {
  if (!refs.trim()) return [];
  return refs
    .split(', ')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Checks if a commit is the HEAD of a branch.
 */
export function isBranchHead(commit: GitCommit, branchName: string): boolean {
  const refsList = parseRefs(commit.refs);
  return refsList.some(
    (r) =>
      r === branchName ||
      r === `HEAD -> ${branchName}` ||
      r.endsWith(`/${branchName}`),
  );
}
