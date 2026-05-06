import { describe, it, expect } from 'vitest';
import {
  countLinesInHunk,
  buildPatchFromLines,
  parseHunkHeader,
} from '../domain/GitDiff';
import type { DiffHunk } from '../domain/GitDiff';

function makeHunk(overrides: Partial<DiffHunk> = {}): DiffHunk {
  return {
    header: '@@ -1,3 +1,4 @@',
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 4,
    lines: [
      { oldLine: 1, newLine: 1, content: 'line 1', type: 'context' },
      { oldLine: 2, newLine: null, content: 'deleted line', type: 'delete' },
      { oldLine: null, newLine: 2, content: 'added line', type: 'add' },
      { oldLine: 3, newLine: 3, content: 'line 3', type: 'context' },
    ],
    ...overrides,
  };
}

describe('GitDiff domain', () => {
  describe('countLinesInHunk', () => {
    it('counts added, deleted, and context lines', () => {
      const hunk = makeHunk();
      const counts = countLinesInHunk(hunk);
      expect(counts.added).toBe(1);
      expect(counts.deleted).toBe(1);
      expect(counts.context).toBe(2);
    });

    it('handles empty hunk', () => {
      const hunk = makeHunk({ lines: [] });
      const counts = countLinesInHunk(hunk);
      expect(counts.added).toBe(0);
      expect(counts.deleted).toBe(0);
      expect(counts.context).toBe(0);
    });
  });

  describe('parseHunkHeader', () => {
    it('parses standard hunk header', () => {
      const result = parseHunkHeader('@@ -10,7 +10,8 @@');
      expect(result.oldStart).toBe(10);
      expect(result.oldLines).toBe(7);
      expect(result.newStart).toBe(10);
      expect(result.newLines).toBe(8);
    });

    it('parses hunk header with single line counts', () => {
      const result = parseHunkHeader('@@ -5 +6 @@');
      expect(result.oldStart).toBe(5);
      expect(result.oldLines).toBe(1);
      expect(result.newStart).toBe(6);
      expect(result.newLines).toBe(1);
    });

    it('returns zeros for invalid header', () => {
      const result = parseHunkHeader('invalid header');
      expect(result.oldStart).toBe(0);
      expect(result.oldLines).toBe(0);
      expect(result.newStart).toBe(0);
      expect(result.newLines).toBe(0);
    });
  });

  describe('buildPatchFromLines', () => {
    it('builds patch with context and selected lines', () => {
      const hunk = makeHunk();
      const selectedLines = new Set<string>([
        'add::2',
      ]);

      const patch = buildPatchFromLines([hunk], selectedLines);

      expect(patch).toContain('@@ -1,3 +1,4 @@');
      expect(patch).toContain(' line 1');
      expect(patch).toContain('+added line');
      expect(patch).toContain(' line 3');
    });

    it('includes all context lines by default', () => {
      const hunk = makeHunk();
      const patch = buildPatchFromLines([hunk], new Set());

      expect(patch).toContain(' line 1');
      expect(patch).toContain(' line 3');
    });

    it('returns empty string for no relevant lines', () => {
      const hunk = makeHunk({ lines: [] });
      const patch = buildPatchFromLines([hunk], new Set());
      expect(patch).toBe('');
    });
  });
});
