export type LineType = 'added' | 'removed' | 'unchanged' | 'header';

export interface DiffLine {
    type: LineType;
    content: string;
    oldLineNo?: number;
    newLineNo?: number;
    index: number;
}

export interface Hunk {
    header: string;
    lines: DiffLine[];
}

export function parseUnifiedDiff(diff: string): Hunk[] {
    const hunks: Hunk[] = [];
    // Split and clean every line
    const rawLines = diff.split(/\r?\n/);
    let currentHunk: Hunk | null = null;
    let oldLineNo = 0;
    let newLineNo = 0;
    let lineIndex = 0;

    for (const line of rawLines) {
        // Skip git file headers
        if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
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
            // Very strict prefix checking
            if (line.startsWith('+')) {
                currentHunk.lines.push({ type: 'added', content: line.substring(1), newLineNo: newLineNo++, index: lineIndex++ });
            } else if (line.startsWith('-')) {
                currentHunk.lines.push({ type: 'removed', content: line.substring(1), oldLineNo: oldLineNo++, index: lineIndex++ });
            } else if (line.startsWith(' ') || line === '') {
                // Context line: if line is empty string, it's actually an empty context line
                const content = line.startsWith(' ') ? line.substring(1) : line;
                currentHunk.lines.push({ type: 'unchanged', content, oldLineNo: oldLineNo++, newLineNo: newLineNo++, index: lineIndex++ });
            }
        }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}

export function buildPatch(fileName: string, selectedLines: Set<number>, allHunks: Hunk[]): string {
    // We use \n explicitly for git compatibility
    let patch = `--- a/${fileName}\n+++ b/${fileName}\n`;

    for (const hunk of allHunks) {
        const activeLines = hunk.lines.map(l => {
            if (l.type === 'unchanged') return { ...l, mode: 'context' };
            if (l.type === 'added') {
                return selectedLines.has(l.index) ? { ...l, mode: 'added' } : null;
            }
            if (l.type === 'removed') {
                return selectedLines.has(l.index) ? { ...l, mode: 'removed' } : { ...l, mode: 'context' };
            }
            return null;
        }).filter((l): l is (DiffLine & { mode: string }) => l !== null);

        const hasActualChanges = activeLines.some(l => l.mode === 'added' || l.mode === 'removed');
        if (!hasActualChanges) continue;

        const oldLen = activeLines.filter(l => l.mode !== 'added').length;
        const newLen = activeLines.filter(l => l.mode !== 'removed').length;

        const match = hunk.header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        const oldStart = match ? match[1] : '1';
        const newStart = match ? match[3] : '1';

        patch += `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@\n`;

        for (const line of activeLines) {
            const prefix = line.mode === 'added' ? '+' : (line.mode === 'removed' ? '-' : ' ');
            patch += `${prefix}${line.content}\n`;
        }
    }

    return patch;
}
