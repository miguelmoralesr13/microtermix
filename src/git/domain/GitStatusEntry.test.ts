import { describe, it, expect } from 'vitest';
import {
  parseGitStateCode,
  hasConflicts,
  groupByState,
  getBasename,
  getDirectory,
} from '../domain/GitStatusEntry';
import type { GitStatusEntry } from '../domain/GitStatusEntry';

function makeEntry(overrides: Partial<GitStatusEntry> = {}): GitStatusEntry {
  return {
    file: 'src/app.ts',
    stateCode: 'M ',
    isStaged: true,
    isUnstaged: false,
    isConflicted: false,
    state: 'modified',
    ...overrides,
  };
}

describe('GitStatusEntry domain', () => {
  describe('parseGitStateCode', () => {
    it('returns conflicted for UU', () => {
      expect(parseGitStateCode('UU')).toBe('conflicted');
    });

    it('returns conflicted for AA', () => {
      expect(parseGitStateCode('AA')).toBe('conflicted');
    });

    it('returns conflicted for DD', () => {
      expect(parseGitStateCode('DD')).toBe('conflicted');
    });

    it('returns untracked for ??', () => {
      expect(parseGitStateCode('??')).toBe('untracked');
    });

    it('returns ignored for !!', () => {
      expect(parseGitStateCode('!!')).toBe('ignored');
    });

    it('returns added for A ', () => {
      expect(parseGitStateCode('A ')).toBe('added');
    });

    it('returns added for  A', () => {
      expect(parseGitStateCode(' A')).toBe('added');
    });

    it('returns deleted for D ', () => {
      expect(parseGitStateCode('D ')).toBe('deleted');
    });

    it('returns renamed for R ', () => {
      expect(parseGitStateCode('R ')).toBe('renamed');
    });

    it('returns copied for C ', () => {
      expect(parseGitStateCode('C ')).toBe('copied');
    });

    it('returns modified for M ', () => {
      expect(parseGitStateCode('M ')).toBe('modified');
    });

    it('returns modified for  M', () => {
      expect(parseGitStateCode(' M')).toBe('modified');
    });

    it('returns modified for MM', () => {
      expect(parseGitStateCode('MM')).toBe('modified');
    });

    it('returns unmodified for empty string', () => {
      expect(parseGitStateCode('')).toBe('unmodified');
    });

    it('returns unmodified for single char', () => {
      expect(parseGitStateCode('M')).toBe('unmodified');
    });

    it('returns unmodified for unknown code', () => {
      expect(parseGitStateCode('XX')).toBe('unmodified');
    });
  });

  describe('hasConflicts', () => {
    it('returns true when any entry is conflicted', () => {
      const entries = [
        makeEntry({ isConflicted: false }),
        makeEntry({ file: 'src/conflict.ts', isConflicted: true, state: 'conflicted' }),
      ];
      expect(hasConflicts(entries)).toBe(true);
    });

    it('returns false when no entries are conflicted', () => {
      const entries = [
        makeEntry({ isConflicted: false }),
        makeEntry({ file: 'src/ok.ts', isConflicted: false }),
      ];
      expect(hasConflicts(entries)).toBe(false);
    });
  });

  describe('groupByState', () => {
    it('groups entries by their state', () => {
      const entries = [
        makeEntry({ file: 'a.ts', state: 'modified' }),
        makeEntry({ file: 'b.ts', state: 'added' }),
        makeEntry({ file: 'c.ts', state: 'modified' }),
      ];

      const groups = groupByState(entries);

      expect(groups.modified).toHaveLength(2);
      expect(groups.added).toHaveLength(1);
    });

    it('handles empty array', () => {
      const groups = groupByState([]);
      expect(Object.keys(groups)).toHaveLength(0);
    });
  });

  describe('getBasename', () => {
    it('extracts filename from path', () => {
      expect(getBasename('src/components/App.tsx')).toBe('App.tsx');
    });

    it('handles root-level files', () => {
      expect(getBasename('package.json')).toBe('package.json');
    });

    it('handles deep paths', () => {
      expect(getBasename('src/deep/nested/file.ts')).toBe('file.ts');
    });
  });

  describe('getDirectory', () => {
    it('extracts directory from path', () => {
      expect(getDirectory('src/components/App.tsx')).toBe('src/components');
    });

    it('returns empty string for root-level files', () => {
      expect(getDirectory('package.json')).toBe('');
    });
  });
});
