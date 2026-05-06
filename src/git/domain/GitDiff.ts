/**
 * Domain entities representing Git diff structures.
 * Pure domain model — no framework dependencies.
 */

/**
 * A single line in a diff hunk.
 */
export interface DiffLine {
  /** Line number in original file (null for added lines) */
  oldLine: number | null;
  /** Line number in modified file (null for deleted lines) */
  newLine: number | null;
  /** Line content (without prefix) */
  content: string;
  /** Line type: '+' added, '-' deleted, ' ' context */
  type: 'add' | 'delete' | 'context';
}

/**
 * A hunk in a unified diff.
 */
export interface DiffHunk {
  /** Hunk header (e.g., '@@ -10,7 +10,8 @@') */
  header: string;
  /** Starting line in original file */
  oldStart: number;
  /** Number of lines in original file */
  oldLines: number;
  /** Starting line in modified file */
  newStart: number;
  /** Number of lines in modified file */
  newLines: number;
  /** Lines in this hunk */
  lines: DiffLine[];
}

/**
 * A complete diff for a single file.
 */
export interface FileDiff {
  /** File path */
  path: string;
  /** Original content */
  original: string;
  /** Modified content */
  modified: string;
  /** Unified diff string */
  diff: string;
  /** Parsed hunks */
  hunks: DiffHunk[];
  /** File status */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

/**
 * Counts lines by type in a hunk.
 */
export function countLinesInHunk(
  hunk: DiffHunk,
): { added: number; deleted: number; context: number } {
  let added = 0;
  let deleted = 0;
  let context = 0;
  for (const line of hunk.lines) {
    if (line.type === 'add') added++;
    else if (line.type === 'delete') deleted++;
    else context++;
  }
  return { added, deleted, context };
}

/**
 * Builds a unified patch string from selected lines.
 */
export function buildPatchFromLines(
  hunks: DiffHunk[],
  selectedLines: Set<string>,
): string {
  const result: string[] = [];

  for (const hunk of hunks) {
    const relevantLines = hunk.lines.filter((line) => {
      const key = `${line.type}:${line.oldLine ?? ''}:${line.newLine ?? ''}`;
      return (
        line.type === 'context' || selectedLines.has(key)
      );
    });

    if (relevantLines.length === 0) continue;

    result.push(hunk.header);
    for (const line of relevantLines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
      result.push(`${prefix}${line.content}`);
    }
  }

  return result.join('\n');
}

/**
 * Parses a unified diff header into hunk metadata.
 */
export function parseHunkHeader(
  header: string,
): { oldStart: number; oldLines: number; newStart: number; newLines: number } {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return { oldStart: 0, oldLines: 0, newStart: 0, newLines: 0 };
  }
  return {
    oldStart: parseInt(match[1], 10),
    oldLines: parseInt(match[2] || '1', 10),
    newStart: parseInt(match[3], 10),
    newLines: parseInt(match[4] || '1', 10),
  };
}
