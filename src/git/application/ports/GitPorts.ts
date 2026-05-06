/**
 * Application ports — interfaces that define what the Git domain needs.
 * Infrastructure layer implements these.
 */
import type { GitStatusEntry } from '../../domain/GitStatusEntry';
import type { GitCommit } from '../../domain/GitCommit';
import type { GitBranch } from '../../domain/GitBranch';
import type { GitAheadBehind } from '../../domain/GitAheadBehind';
import type { FileDiff, DiffHunk } from '../../domain/GitDiff';

/**
 * Port for interacting with the local Git repository.
 * Implemented by Tauri adapter calling native git2/gix commands.
 */
export interface GitRepositoryPort {
  /** Check if path is a valid Git repository */
  isRepo(repoPath: string): Promise<boolean>;

  /** Get file status (staged, unstaged, conflicted) */
  getStatus(repoPath: string): Promise<GitStatusEntry[]>;

  /** List branches (local, remote, stashes) */
  getBranches(repoPath: string): Promise<GitBranch[]>;

  /** Get commit timeline (log) */
  getTimeline(repoPath: string, limit?: number): Promise<GitCommit[]>;

  /** Get ahead/behind count relative to upstream */
  getAheadBehind(repoPath: string): Promise<GitAheadBehind>;

  /** Get file history (git log --follow) */
  getFileHistory(repoPath: string, filePath: string): Promise<GitCommit[]>;

  /** Get files changed between two refs */
  getBranchDiffFiles(
    repoPath: string,
    baseRef: string,
    headRef: string,
  ): Promise<Array<{ path: string; status: string }>>;

  /** Get file content at a specific ref */
  getFileContentAtRef(
    repoPath: string,
    ref: string,
    filePath: string,
  ): Promise<string>;

  /** Execute a git command (generic fallback) */
  executeCommand(
    repoPath: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  /** Stage a file */
  addFile(repoPath: string, filePath: string): Promise<void>;

  /** Unstage a file */
  unstageFile(repoPath: string, filePath: string): Promise<void>;

  /** Restore a file to HEAD */
  restoreFile(repoPath: string, filePath: string): Promise<void>;

  /** Commit staged changes */
  commit(repoPath: string, message: string, amend?: boolean): Promise<void>;

  /** Push to remote */
  push(repoPath: string, remote?: string, branch?: string): Promise<void>;

  /** Pull from remote */
  pull(repoPath: string, remote?: string, branch?: string): Promise<void>;

  /** Checkout a branch */
  checkout(repoPath: string, branchName: string): Promise<void>;

  /** Create a new branch */
  createBranch(
    repoPath: string,
    branchName: string,
    fromRef?: string,
  ): Promise<void>;

  /** Delete a branch */
  deleteBranch(repoPath: string, branchName: string, force?: boolean): Promise<void>;

  /** Stash current changes */
  stashSave(repoPath: string, message?: string): Promise<void>;

  /** Pop stash */
  stashPop(repoPath: string): Promise<void>;

  /** Drop stash */
  stashDrop(repoPath: string, index: number): Promise<void>;

  /** Get stash diff */
  getStashDiff(repoPath: string, index: number): Promise<FileDiff[]>;
}

/**
 * Port for diff computation operations.
 */
export interface GitDiffPort {
  /** Get full diff for a file (original + modified content + hunks) */
  getFullDiff(
    repoPath: string,
    filePath: string,
  ): Promise<{ original: string; modified: string; hunks: DiffHunk[] }>;

  /** Get diff model (original + modified content only) */
  getDiffModel(
    repoPath: string,
    filePath: string,
  ): Promise<{ original: string; modified: string }>;

  /** Compute unified diff string */
  computeUnifiedDiff(
    repoPath: string,
    filePath: string,
  ): Promise<string>;

  /** Compute diff with structured hunks */
  computeDiffHunks(
    repoPath: string,
    filePath: string,
  ): Promise<DiffHunk[]>;

  /** Apply rejected hunks (partial staging) */
  applyRejectedHunks(
    repoPath: string,
    filePath: string,
    rejectedHunks: DiffHunk[],
  ): Promise<void>;

  /** Apply a patch */
  applyPatch(repoPath: string, patch: string): Promise<void>;

  /** Reword a commit */
  rewordCommit(
    repoPath: string,
    commitHash: string,
    newMessage: string,
  ): Promise<void>;

  /** Squash a commit into its parent */
  squashIntoParent(
    repoPath: string,
    commitHash: string,
  ): Promise<void>;
}

/**
 * Port for cloud provider operations (GitHub/GitLab).
 */
export interface GitCloudPort {
  /** Fetch PRs/MRs from a repository */
  fetchPullRequests(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>>;

  /** Fetch issues from a repository */
  fetchIssues(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>>;

  /** Create a PR/MR */
  createPullRequest(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
    title: string,
    body: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<Record<string, unknown>>;

  /** Merge a PR/MR */
  mergePullRequest(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<void>;

  /** Fetch workflow runs (GitHub Actions) */
  fetchWorkflowRuns(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>>;

  /** Fetch repository branches from remote */
  fetchRemoteBranches(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
  ): Promise<string[]>;

  /** Search repositories */
  searchRepos(
    account: import('../../domain/GitAccount').GitAccount,
    query: string,
  ): Promise<Array<Record<string, unknown>>>;

  /** Get repository info */
  getRepoInfo(
    account: import('../../domain/GitAccount').GitAccount,
    owner: string,
    repo: string,
  ): Promise<Record<string, unknown>>;
}
