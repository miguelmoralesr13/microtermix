/**
 * Tauri adapter implementing GitDiffPort.
 * Bridges the application layer to Tauri's git diff commands.
 */
import { invoke } from '@tauri-apps/api/core';
import type { GitDiffPort } from '../application/ports/GitPorts';
import type { DiffHunk, DiffLine } from '../domain/GitDiff';

// Tauri returns snake_case, domain uses camelCase
interface TauriHunkInfo {
  id: number;
  old_start: number;
  old_count: number;
  new_start: number;
  new_count: number;
}

interface TauriFullDiffResult {
  original: string;
  modified: string;
  unified_diff: string;
  hunks: TauriHunkInfo[];
}

interface TauriDiffHunksResult {
  unified_diff: string;
  hunks: TauriHunkInfo[];
}

/**
 * Transforms Tauri HunkInfo to domain DiffHunk.
 * The Tauri backend uses snake_case, we convert to camelCase.
 */
function transformHunk(hunk: TauriHunkInfo): DiffHunk {
  return {
    header: `@@ -${hunk.old_start},${hunk.old_count} +${hunk.new_start},${hunk.new_count} @@`,
    oldStart: hunk.old_start,
    oldLines: hunk.old_count,
    newStart: hunk.new_start,
    newLines: hunk.new_count,
    lines: [], // Lines are computed separately from unified_diff
  };
}

/**
 * Parses unified diff text into DiffLine array.
 * This complements the structured hunk data from Tauri.
 */
export function parseUnifiedDiffLines(unifiedDiff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const diffLines = unifiedDiff.split('\n');

  for (const line of diffLines) {
    if (line.startsWith('@@')) {
      continue; // Skip hunk headers
    }
    if (line === '' || line === '\\ No newline at end of file') {
      continue;
    }

    const type = line.startsWith('+')
      ? 'add'
      : line.startsWith('-')
        ? 'delete'
        : 'context';

    const content = line.slice(1); // Remove prefix

    lines.push({
      oldLine: null, // Parsed separately if needed
      newLine: null,
      content,
      type,
    });
  }

  return lines;
}

/**
 * Tauri-based implementation of the Git diff port.
 * Uses native git diff via Tauri.
 */
export class TauriGitDiffAdapter implements GitDiffPort {
  async getFullDiff(
    repoPath: string,
    filePath: string,
  ): Promise<{ original: string; modified: string; hunks: DiffHunk[] }> {
    // get_full_diff uses 'unstaged' mode by default in Tauri
    const result = await invoke<TauriFullDiffResult>('get_full_diff', {
      projectPath: repoPath,
      filePath,
      mode: 'unstaged',
    });

    const hunks = result.hunks.map(transformHunk);

    // Parse lines from unified diff
    const lines = parseUnifiedDiffLines(result.unified_diff);

    // Distribute lines to hunks based on their ranges
    let lineIndex = 0;
    for (const hunk of hunks) {
      const hunkLines: DiffLine[] = [];
      const hunkRange = hunk.oldLines + hunk.newLines;

      for (let i = 0; i < hunkRange && lineIndex < lines.length; i++) {
        if (lines[lineIndex].type !== 'context') {
          hunkLines.push(lines[lineIndex]);
        }
        lineIndex++;
      }
      hunk.lines = hunkLines;
    }

    return {
      original: result.original,
      modified: result.modified,
      hunks,
    };
  }

  async getDiffModel(
    repoPath: string,
    filePath: string,
  ): Promise<{ original: string; modified: string }> {
    const result = await invoke<{ original: string; modified: string }>('git_get_diff_model_native', {
      projectPath: repoPath,
      filePath,
      mode: 'unstaged',
    });
    return result;
  }

  async computeUnifiedDiff(
    repoPath: string,
    filePath: string,
  ): Promise<string> {
    // First get the diff model, then compute the unified diff
    const { original, modified } = await this.getDiffModel(repoPath, filePath);
    const result = await invoke<{ unified_diff: string }>('compute_unified_diff', {
      original,
      modified,
      filePath,
    });
    return result.unified_diff;
  }

  async computeDiffHunks(
    repoPath: string,
    filePath: string,
  ): Promise<DiffHunk[]> {
    // First get the diff model, then compute the diff hunks
    const { original, modified } = await this.getDiffModel(repoPath, filePath);
    const result = await invoke<TauriDiffHunksResult>('compute_diff_hunks', {
      original,
      modified,
      filePath,
    });
    return result.hunks.map(transformHunk);
  }

  async applyRejectedHunks(
    repoPath: string,
    filePath: string,
    rejectedHunks: DiffHunk[],
  ): Promise<void> {
    // First get the current diff
    const { original, modified } = await this.getDiffModel(repoPath, filePath);

    // Get hunks info
    const hunksResult = await invoke<{ hunks: TauriHunkInfo[] }>('compute_diff_hunks', {
      original,
      modified,
      filePath,
    });

    // Find indices of rejected hunks
    const rejectedIndices = rejectedHunks.map((rh) =>
      hunksResult.hunks.findIndex(
        (h) =>
          h.old_start === rh.oldStart &&
          h.new_start === rh.newStart,
      ),
    ).filter((i) => i !== -1);

    await invoke('apply_rejected_hunks', {
      original,
      modified,
      hunks: hunksResult.hunks,
      rejectIndices: rejectedIndices,
    });
  }

  async applyPatch(repoPath: string, patch: string): Promise<void> {
    await invoke('git_apply_patch', {
      projectPath: repoPath,
      patch,
    });
  }

  async rewordCommit(
    repoPath: string,
    commitHash: string,
    newMessage: string,
  ): Promise<void> {
    await invoke('git_reword_commit', {
      projectPath: repoPath,
      commitHash,
      newMessage,
    });
  }

  async squashIntoParent(
    repoPath: string,
    commitHash: string,
  ): Promise<void> {
    await invoke('git_squash_commit', {
      projectPath: repoPath,
      commitHash,
    });
  }
}
