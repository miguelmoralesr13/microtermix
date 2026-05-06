/**
 * Domain entity representing ahead/behind count relative to upstream.
 * Pure domain model — no framework dependencies.
 */
export interface GitAheadBehind {
  /** Commits ahead of upstream */
  ahead: number;
  /** Commits behind upstream */
  behind: number;
  /** Whether the current branch has an upstream tracking branch */
  hasUpstream: boolean;
}

/**
 * Checks if the branch is in sync with upstream.
 */
export function isInSync(ab: GitAheadBehind): boolean {
  return ab.hasUpstream && ab.ahead === 0 && ab.behind === 0;
}

/**
 * Checks if the branch needs to be pushed.
 */
export function needsPush(ab: GitAheadBehind): boolean {
  return ab.ahead > 0;
}

/**
 * Checks if the branch needs to be pulled.
 */
export function needsPull(ab: GitAheadBehind): boolean {
  return ab.behind > 0;
}

/**
 * Creates a human-readable status string.
 */
export function formatAheadBehind(ab: GitAheadBehind): string {
  if (!ab.hasUpstream) return 'No upstream';
  if (ab.ahead === 0 && ab.behind === 0) return 'Up to date';
  const parts: string[] = [];
  if (ab.ahead > 0) parts.push(`${ab.ahead} ahead`);
  if (ab.behind > 0) parts.push(`${ab.behind} behind`);
  return parts.join(', ');
}
