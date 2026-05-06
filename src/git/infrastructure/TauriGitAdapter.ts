/**
 * Tauri adapter implementing GitRepositoryPort.
 * Bridges the application layer to Tauri's native git commands.
 */
import { invoke } from '@tauri-apps/api/core';
import type { GitRepositoryPort } from '../application/ports/GitPorts';
import type { GitStatusEntry } from '../domain/GitStatusEntry';
import type { GitCommit } from '../domain/GitCommit';
import type { GitBranch } from '../domain/GitBranch';
import type { GitAheadBehind } from '../domain/GitAheadBehind';
import type { FileDiff } from '../domain/GitDiff';
import { parseGitStateCode } from '../domain/GitStatusEntry';
import { parseShortName, parseRemoteName } from '../domain/GitBranch';

/**
 * Tauri-based implementation of the Git repository port.
 * Uses native git2/gix commands via Tauri.
 */
export class TauriGitRepositoryAdapter implements GitRepositoryPort {
  async isRepo(repoPath: string): Promise<boolean> {
    try {
      const result = await invoke<boolean>('git_is_repo_native', {
        path: repoPath,
      });
      return result;
    } catch {
      return false;
    }
  }

  async getStatus(repoPath: string): Promise<GitStatusEntry[]> {
    const result = await invoke<Array<Record<string, unknown>>>('git_status_native', {
      path: repoPath,
    });

    return result.map((entry) => {
      const stateCode = (entry.state_code as string) || (entry.stateCode as string) || '';
      return {
        file: (entry.file as string) || '',
        stateCode,
        isStaged: (entry.is_staged as boolean) ?? (stateCode[0] !== ' ' && stateCode[0] !== '?'),
        isUnstaged: (entry.is_unstaged as boolean) ?? (stateCode[1] !== ' ' && stateCode[1] !== '?'),
        isConflicted: stateCode === 'UU' || stateCode === 'AA' || stateCode === 'DD',
        state: parseGitStateCode(stateCode),
      };
    });
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    const result = await invoke<Record<string, unknown>>('git_branches_native', {
      path: repoPath,
    });

    const branches: GitBranch[] = [];

    // Local branches
    const localBranches = (result.local as Array<Record<string, unknown>>) || [];
    const currentBranch = (result.current as string) || '';

    for (const b of localBranches) {
      branches.push({
        name: (b.name as string) || '',
        shortName: (b.name as string) || '',
        remote: undefined,
        type: 'local',
        isActive: (b.name as string) === currentBranch,
        latestCommit: (b.commit as string) || (b.latest_commit as string),
        latestSubject: (b.subject as string) || (b.latest_subject as string),
      });
    }

    // Remote branches
    const remoteBranches = (result.remote as Array<Record<string, unknown>>) || [];
    for (const b of remoteBranches) {
      const fullName = (b.name as string) || '';
      branches.push({
        name: fullName,
        shortName: parseShortName(fullName),
        remote: parseRemoteName(fullName),
        type: 'remote',
        isActive: false,
        latestCommit: (b.commit as string) || (b.latest_commit as string),
        latestSubject: (b.subject as string) || (b.latest_subject as string),
      });
    }

    // Stashes
    const stashes = (result.stashes as Array<Record<string, unknown>>) || [];
    for (const s of stashes) {
      branches.push({
        name: (s.ref as string) || '',
        shortName: (s.ref as string) || '',
        remote: undefined,
        type: 'stash',
        isActive: false,
        latestSubject: (s.message as string) || '',
      });
    }

    return branches;
  }

  async getTimeline(repoPath: string, limit = 100): Promise<GitCommit[]> {
    const result = await invoke<Record<string, unknown>>('git_log_native', {
      path: repoPath,
      limit,
    });

    const commits = (result.commits as Array<Record<string, unknown>>) || [];
    return commits.map((c) => ({
      hash: (c.hash as string) || '',
      shortHash: (c.short_hash as string) || (c.shortHash as string) || '',
      parents: (c.parents as string[]) || [],
      author: (c.author as string) || '',
      date: (c.date as string) || '',
      message: (c.message as string) || '',
      refs: (c.refs as string) || '',
    }));
  }

  async getAheadBehind(repoPath: string): Promise<GitAheadBehind> {
    const result = await invoke<Record<string, unknown>>('git_ahead_behind_native', {
      path: repoPath,
    });

    return {
      ahead: (result.ahead as number) || 0,
      behind: (result.behind as number) || 0,
      hasUpstream: (result.has_upstream as boolean) ?? (result.hasUpstream as boolean) ?? false,
    };
  }

  async getFileHistory(repoPath: string, filePath: string): Promise<GitCommit[]> {
    const result = await invoke<Record<string, unknown>>('git_file_log_native', {
      path: repoPath,
      filePath,
    });

    const commits = (result.commits as Array<Record<string, unknown>>) || [];
    return commits.map((c) => ({
      hash: (c.hash as string) || '',
      shortHash: (c.short_hash as string) || (c.shortHash as string) || '',
      parents: (c.parents as string[]) || [],
      author: (c.author as string) || '',
      date: (c.date as string) || '',
      message: (c.message as string) || '',
      refs: (c.refs as string) || '',
    }));
  }

  async getBranchDiffFiles(
    repoPath: string,
    baseRef: string,
    headRef: string,
  ): Promise<Array<{ path: string; status: string }>> {
    const result = await invoke<Record<string, unknown>>('git_branch_diff_files', {
      path: repoPath,
      baseRef,
      headRef,
    });

    const files = (result.files as Array<Record<string, unknown>>) || [];
    return files.map((f) => ({
      path: (f.path as string) || '',
      status: (f.status as string) || 'modified',
    }));
  }

  async getFileContentAtRef(
    repoPath: string,
    ref: string,
    filePath: string,
  ): Promise<string> {
    const result = await invoke<Record<string, unknown>>('git_branch_diff_file_content', {
      path: repoPath,
      baseRef: ref,
      headRef: ref,
      filePath,
    });

    return (result.content as string) || (result.base as string) || '';
  }

  async executeCommand(
    repoPath: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await invoke<Record<string, unknown>>('git_execute', {
      path: repoPath,
      args,
    });

    return {
      stdout: (result.stdout as string) || '',
      stderr: (result.stderr as string) || '',
      exitCode: (result.exit_code as number) ?? (result.exitCode as number) ?? 0,
    };
  }

  async addFile(repoPath: string, filePath: string): Promise<void> {
    await this.executeCommand(repoPath, ['add', filePath]);
  }

  async unstageFile(repoPath: string, filePath: string): Promise<void> {
    await this.executeCommand(repoPath, ['restore', '--staged', filePath]);
  }

  async restoreFile(repoPath: string, filePath: string): Promise<void> {
    await this.executeCommand(repoPath, ['restore', filePath]);
  }

  async commit(repoPath: string, message: string, amend = false): Promise<void> {
    const args = amend ? ['commit', '--amend', '-m', message] : ['commit', '-m', message];
    await this.executeCommand(repoPath, args);
  }

  async push(repoPath: string, remote?: string, branch?: string): Promise<void> {
    const args = ['push'];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    await this.executeCommand(repoPath, args);
  }

  async pull(repoPath: string, remote?: string, branch?: string): Promise<void> {
    const args = ['pull'];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    await this.executeCommand(repoPath, args);
  }

  async checkout(repoPath: string, branchName: string): Promise<void> {
    await this.executeCommand(repoPath, ['checkout', branchName]);
  }

  async createBranch(repoPath: string, branchName: string, fromRef?: string): Promise<void> {
    const args = ['branch', branchName];
    if (fromRef) args.push(fromRef);
    await this.executeCommand(repoPath, args);
  }

  async deleteBranch(repoPath: string, branchName: string, force = false): Promise<void> {
    const args = force ? ['branch', '-D', branchName] : ['branch', '-d', branchName];
    await this.executeCommand(repoPath, args);
  }

  async stashSave(repoPath: string, message?: string): Promise<void> {
    const args = ['stash', 'push'];
    if (message) args.push('-m', message);
    await this.executeCommand(repoPath, args);
  }

  async stashPop(repoPath: string): Promise<void> {
    await this.executeCommand(repoPath, ['stash', 'pop']);
  }

  async stashDrop(repoPath: string, index: number): Promise<void> {
    await this.executeCommand(repoPath, ['stash', 'drop', `stash@{${index}}`]);
  }

  async getStashDiff(repoPath: string, index: number): Promise<FileDiff[]> {
    const result = await invoke<Record<string, unknown>>('git_get_stash_diff', {
      path: repoPath,
      stashIndex: index,
    });

    const diffs = (result.diffs as Array<Record<string, unknown>>) || [];
    return diffs.map((d) => ({
      path: (d.path as string) || '',
      original: (d.original as string) || '',
      modified: (d.modified as string) || '',
      diff: (d.diff as string) || '',
      hunks: (d.hunks as any[]) || [],
      status: (d.status as FileDiff['status']) || 'modified',
    }));
  }
}
