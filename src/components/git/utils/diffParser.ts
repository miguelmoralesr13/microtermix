export type LineType = 'added' | 'removed' | 'unchanged' | 'header';

export interface DiffLine {
    type: LineType;
    content: string;
    oldLineNo?: number;
    newLineNo?: number;
    index: number; // Unique index for selection
}

export interface Hunk {
    header: string;
    lines: DiffLine[];
}

/**
 * Parses a unified diff string into structured Hunks and Lines.
 */
export function parseUnifiedDiff(diff: string): Hunk[] {
    const hunks: Hunk[] = [];
    const lines = diff.split('\n');
    let currentHunk: Hunk | null = null;
    let oldLineNo = 0;
    let newLineNo = 0;
    let lineIndex = 0;

    for (const line of lines) {
        // Skip git headers (diff --git, index, ---, +++)
        if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
            continue;
        }

        // Detect hunk header: @@ -1,3 +1,4 @@
        const hunkHeaderMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (hunkHeaderMatch) {
            if (currentHunk) hunks.push(currentHunk);
            
            oldLineNo = parseInt(hunkHeaderMatch[1], 10);
            newLineNo = parseInt(hunkHeaderMatch[3], 10);
            
            currentHunk = {
                header: line,
                lines: []
            };
            continue;
        }

        if (currentHunk) {
            let type: LineType = 'unchanged';
            let content = line;

            if (line.startsWith('+')) {
                type = 'added';
                content = line.substring(1);
                currentHunk.lines.push({ type, content, newLineNo: newLineNo++, index: lineIndex++ });
            } else if (line.startsWith('-')) {
                type = 'removed';
                content = line.substring(1);
                currentHunk.lines.push({ type, content, oldLineNo: oldLineNo++, index: lineIndex++ });
            } else {
                // Line starts with space (unchanged context)
                type = 'unchanged';
                content = line.substring(1);
                currentHunk.lines.push({ type, content, oldLineNo: oldLineNo++, newLineNo: newLineNo++, index: lineIndex++ });
            }
        }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}

/**
 * Reconstructs a unified diff (patch) from selected lines.
 */
export function buildPatch(fileName: string, selectedLines: Set<number>, allHunks: Hunk[]): string {
    let patch = `--- a/${fileName}\n+++ b/${fileName}\n`;
    
    for (const hunk of allHunks) {
        // Filter lines: keep if they are 'unchanged' OR if they are 'added/removed' AND selected
        const filteredLines = hunk.lines.filter(l => 
            l.type === 'unchanged' || selectedLines.has(l.index)
        );

        // Only include hunk if it has changes (selected added/removed lines)
        const hasChanges = filteredLines.some(l => l.type !== 'unchanged');
        if (!hasChanges) continue;

        // Calculate new counts for hunk header
        const oldLines = filteredLines.filter(l => l.type !== 'added').length;
        const newLines = filteredLines.filter(l => l.type !== 'removed').length;
        
        // Use original starts for simplicity (git apply handles offsets)
        // Note: Real git patch would need precise line numbers, but git apply --recount helps
        patch += `${hunk.header}\n`;
        
        for (const line of filteredLines) {
            const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
            patch += `${prefix}${line.content}\n`;
        }
    }

    return patch;
}
