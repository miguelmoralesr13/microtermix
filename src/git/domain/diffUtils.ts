/**
 * Pure functions for parsing unified diffs and building patches.
 * Moved from src/components/git/utils/diffParser.ts
 */
export type DiffParserLineType = 'added' | 'removed' | 'unchanged' | 'header';

export interface DiffParserLine {
  type: DiffParserLineType;
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
  index: number;
}

export interface DiffParserHunk {
  header: string;
  lines: DiffParserLine[];
}

/**
 * Parses a unified diff string into structured hunks.
 * Skips git file headers (diff --git, index, ---, +++) and processes hunk headers.
 */
export function parseUnifiedDiff(diff: string): DiffParserHunk[] {
  const hunks: DiffParserHunk[] = [];
  const rawLines = diff.split(/\r?\n/);
  let currentHunk: DiffParserHunk | null = null;
  let oldLineNo = 0;
  let newLineNo = 0;
  let lineIndex = 0;

  for (const line of rawLines) {
    // Skip git file headers
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    // Detect hunk header: @@ -1,9 +1,74 @@
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (match) {
      if (currentHunk) hunks.push(currentHunk);
      oldLineNo = parseInt(match[1], 10);
      newLineNo = parseInt(match[3], 10);
      currentHunk = { header: line, lines: [] };
      continue;
    }

    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'added',
          content: line.substring(1),
          newLineNo: newLineNo++,
          index: lineIndex++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'removed',
          content: line.substring(1),
          oldLineNo: oldLineNo++,
          index: lineIndex++,
        });
      } else if (line.startsWith(' ') || line === '') {
        const content = line.startsWith(' ') ? line.substring(1) : line;
        currentHunk.lines.push({
          type: 'unchanged',
          content,
          oldLineNo: oldLineNo++,
          newLineNo: newLineNo++,
          index: lineIndex++,
        });
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

/**
 * Builds a git patch string from selected lines.
 * Uses the index from the parsed lines to identify which lines were selected by the user.
 */
export function buildPatchFromSelectedLines(
  fileName: string,
  selectedLines: Set<number>,
  allHunks: DiffParserHunk[],
): string {
  let patch = `--- a/${fileName}\n+++ b/${fileName}\n`;

  for (const hunk of allHunks) {
    const activeLines = hunk.lines
      .map((l) => {
        if (l.type === 'unchanged') return { ...l, mode: 'context' as const };
        if (l.type === 'added') {
          return selectedLines.has(l.index)
            ? { ...l, mode: 'added' as const }
            : null;
        }
        if (l.type === 'removed') {
          return selectedLines.has(l.index)
            ? { ...l, mode: 'removed' as const }
            : { ...l, mode: 'context' as const };
        }
        return null;
      })
      .filter((l): l is DiffParserLine & { mode: 'context' | 'added' | 'removed' } => l !== null);

    const hasActualChanges = activeLines.some(
      (l) => l.mode === 'added' || l.mode === 'removed',
    );
    if (!hasActualChanges) continue;

    const oldLen = activeLines.filter((l) => l.mode !== 'added').length;
    const newLen = activeLines.filter((l) => l.mode !== 'removed').length;

    const match = hunk.header.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
    );
    const oldStart = match ? match[1] : '1';
    const newStart = match ? match[3] : '1';

    patch += `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@\n`;

    for (const line of activeLines) {
      const prefix =
        line.mode === 'added' ? '+' : line.mode === 'removed' ? '-' : ' ';
      patch += `${prefix}${line.content}\n`;
    }
  }

  return patch;
}