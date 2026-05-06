import { describe, it, expect } from 'vitest';
import {
  getCommitSubject,
  isMergeCommit,
  parseRefs,
  isBranchHead,
} from '../domain/GitCommit';
import type { GitCommit } from '../domain/GitCommit';

function makeCommit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    hash: 'abc123def456',
    shortHash: 'abc123d',
    parents: ['parent1'],
    author: 'Test User <test@example.com>',
    date: '2024-01-01T00:00:00Z',
    message: 'Fix bug in login',
    refs: '',
    ...overrides,
  };
}

describe('GitCommit domain', () => {
  describe('getCommitSubject', () => {
    it('returns first line of message', () => {
      const commit = makeCommit({ message: 'Subject line\n\nBody text' });
      expect(getCommitSubject(commit)).toBe('Subject line');
    });

    it('returns full message if single line', () => {
      const commit = makeCommit({ message: 'Single line message' });
      expect(getCommitSubject(commit)).toBe('Single line message');
    });

    it('returns empty string for empty message', () => {
      const commit = makeCommit({ message: '' });
      expect(getCommitSubject(commit)).toBe('');
    });
  });

  describe('isMergeCommit', () => {
    it('returns true for multiple parents', () => {
      const commit = makeCommit({ parents: ['parent1', 'parent2'] });
      expect(isMergeCommit(commit)).toBe(true);
    });

    it('returns false for single parent', () => {
      const commit = makeCommit({ parents: ['parent1'] });
      expect(isMergeCommit(commit)).toBe(false);
    });
  });

  describe('parseRefs', () => {
    it('parses comma-separated refs', () => {
      expect(parseRefs('HEAD -> main, origin/main')).toEqual(['HEAD -> main', 'origin/main']);
    });

    it('returns empty array for empty string', () => {
      expect(parseRefs('')).toEqual([]);
    });

    it('returns empty array for whitespace', () => {
      expect(parseRefs('   ')).toEqual([]);
    });

    it('trims individual refs', () => {
      expect(parseRefs('tag: v1.0,  HEAD -> main ')).toEqual(['tag: v1.0', 'HEAD -> main']);
    });
  });

  describe('isBranchHead', () => {
    it('returns true when branch name matches ref', () => {
      const commit = makeCommit({ refs: 'HEAD -> main, origin/main' });
      expect(isBranchHead(commit, 'main')).toBe(true);
    });

    it('returns true when branch is in remote ref', () => {
      const commit = makeCommit({ refs: 'origin/main' });
      expect(isBranchHead(commit, 'main')).toBe(true);
    });

    it('returns false when branch not in refs', () => {
      const commit = makeCommit({ refs: 'HEAD -> develop' });
      expect(isBranchHead(commit, 'main')).toBe(false);
    });

    it('returns false for empty refs', () => {
      const commit = makeCommit({ refs: '' });
      expect(isBranchHead(commit, 'main')).toBe(false);
    });
  });
});
