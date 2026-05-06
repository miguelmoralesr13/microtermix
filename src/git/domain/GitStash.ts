/**
 * Domain entity representing a Git stash entry.
 * Pure domain model — no framework dependencies.
 */
export interface GitStash {
  /** Stash reference (e.g., 'stash@{0}') */
  ref: string;
  /** Stash index */
  index: number;
  /** Stash message */
  message: string;
  /** Branch the stash was created on */
  branch?: string;
}

/**
 * Domain entity representing a clone favorite.
 */
export interface GitCloneFavorite {
  /** Unique ID (full_name or path_with_namespace) */
  readonly id: string;
  /** Repository name */
  name: string;
  /** Full name (owner/repo) */
  fullName: string;
  /** Clone URL */
  cloneUrl: string;
  /** HTML URL */
  htmlUrl: string;
  /** Provider */
  provider: 'github' | 'gitlab';
  /** Whether the repo is private */
  isPrivate: boolean;
}
