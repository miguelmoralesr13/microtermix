import { describe, it, expect } from 'vitest';
import { parseUnifiedDiffLines } from './TauriGitDiffAdapter';

describe('TauriGitDiffAdapter', () => {
  describe('parseUnifiedDiffLines', () => {
    it('parses added lines correctly', () => {
      const diff = `+line 1\n+line 2\n+line 3`;
      const lines = parseUnifiedDiffLines(diff);

      expect(lines).toHaveLength(3);
      expect(lines[0]).toEqual({ oldLine: null, newLine: null, content: 'line 1', type: 'add' });
      expect(lines[1]).toEqual({ oldLine: null, newLine: null, content: 'line 2', type: 'add' });
      expect(lines[2]).toEqual({ oldLine: null, newLine: null, content: 'line 3', type: 'add' });
    });

    it('parses deleted lines correctly', () => {
      const diff = `-line 1\n-line 2`;
      const lines = parseUnifiedDiffLines(diff);

      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({ oldLine: null, newLine: null, content: 'line 1', type: 'delete' });
      expect(lines[1]).toEqual({ oldLine: null, newLine: null, content: 'line 2', type: 'delete' });
    });

    it('parses context lines correctly', () => {
      const diff = ` line 1\n line 2`;
      const lines = parseUnifiedDiffLines(diff);

      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({ oldLine: null, newLine: null, content: 'line 1', type: 'context' });
      expect(lines[1]).toEqual({ oldLine: null, newLine: null, content: 'line 2', type: 'context' });
    });

    it('skips hunk headers', () => {
      const diff = `@@ -1,3 +1,4 @@\n+added line\n context line\n-deleted line`;
      const lines = parseUnifiedDiffLines(diff);

      expect(lines).toHaveLength(3);
      expect(lines[0].type).toBe('add');
      expect(lines[1].type).toBe('context');
      expect(lines[2].type).toBe('delete');
    });

    it('skips empty lines and "no newline" markers', () => {
      const diff = `+line 1\n\n line 2\n\\ No newline at end of file`;
      const lines = parseUnifiedDiffLines(diff);

      expect(lines).toHaveLength(2);
    });

    it('handles mixed diff content', () => {
      const diff = `@@ -10,5 +10,6 @@\n context line 1\n-deleted line\n+added line 1\n+added line 2\n context line 2`;
      const lines = parseUnifiedDiffLines(diff);

      expect(lines).toHaveLength(5);
      expect(lines[0]).toEqual({ oldLine: null, newLine: null, content: 'context line 1', type: 'context' });
      expect(lines[1]).toEqual({ oldLine: null, newLine: null, content: 'deleted line', type: 'delete' });
      expect(lines[2]).toEqual({ oldLine: null, newLine: null, content: 'added line 1', type: 'add' });
      expect(lines[3]).toEqual({ oldLine: null, newLine: null, content: 'added line 2', type: 'add' });
      expect(lines[4]).toEqual({ oldLine: null, newLine: null, content: 'context line 2', type: 'context' });
    });

    it('handles empty diff', () => {
      const lines = parseUnifiedDiffLines('');
      expect(lines).toHaveLength(0);
    });

    it('handles only hunk headers', () => {
      const diff = `@@ -1,0 +1,0 @@`;
      const lines = parseUnifiedDiffLines(diff);
      expect(lines).toHaveLength(0);
    });
  });
});
