import { Hunk } from './diffRenderer';

/**
 * Parses a unified diff patch string (as returned by the GitHub API `patch` field)
 * into an array of Hunk objects compatible with ReadOnlyDiff.
 */
export function parseUnifiedPatch(patch: string): Hunk[] {
    if (!patch) return [];
    const lines = patch.split('\n');
    const hunks: Hunk[] = [];
    let current: Hunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const raw of lines) {
        const hunkHeader = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunkHeader) {
            if (current) hunks.push(current);
            oldLine = parseInt(hunkHeader[1], 10);
            newLine = parseInt(hunkHeader[3], 10);
            const oldLines = hunkHeader[2] !== undefined ? parseInt(hunkHeader[2], 10) : 1;
            const newLines = hunkHeader[4] !== undefined ? parseInt(hunkHeader[4], 10) : 1;
            current = {
                content: raw,
                oldStart: oldLine,
                oldLines,
                newStart: newLine,
                newLines,
                changes: [],
            };
            continue;
        }

        if (!current) continue;

        if (raw.startsWith('+') && !raw.startsWith('+++')) {
            current.changes.push({ type: 'insert', content: raw.slice(1), newLineNumber: newLine++ });
        } else if (raw.startsWith('-') && !raw.startsWith('---')) {
            current.changes.push({ type: 'delete', content: raw.slice(1), oldLineNumber: oldLine++ });
        } else if (raw.startsWith(' ') || raw === '') {
            current.changes.push({ type: 'normal', content: raw.slice(1), oldLineNumber: oldLine++, newLineNumber: newLine++ });
        }
    }

    if (current) hunks.push(current);
    return hunks;
}
