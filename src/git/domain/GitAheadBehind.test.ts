import { describe, it, expect } from 'vitest';
import {
  isInSync,
  needsPush,
  needsPull,
  formatAheadBehind,
} from '../domain/GitAheadBehind';
import type { GitAheadBehind } from '../domain/GitAheadBehind';

function makeAB(overrides: Partial<GitAheadBehind> = {}): GitAheadBehind {
  return {
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    ...overrides,
  };
}

describe('GitAheadBehind domain', () => {
  describe('isInSync', () => {
    it('returns true when ahead and behind are 0 with upstream', () => {
      expect(isInSync(makeAB({ ahead: 0, behind: 0 }))).toBe(true);
    });

    it('returns false when ahead > 0', () => {
      expect(isInSync(makeAB({ ahead: 1, behind: 0 }))).toBe(false);
    });

    it('returns false when behind > 0', () => {
      expect(isInSync(makeAB({ ahead: 0, behind: 2 }))).toBe(false);
    });

    it('returns false when no upstream', () => {
      expect(isInSync(makeAB({ hasUpstream: false }))).toBe(false);
    });
  });

  describe('needsPush', () => {
    it('returns true when ahead > 0', () => {
      expect(needsPush(makeAB({ ahead: 3 }))).toBe(true);
    });

    it('returns false when ahead is 0', () => {
      expect(needsPush(makeAB({ ahead: 0 }))).toBe(false);
    });
  });

  describe('needsPull', () => {
    it('returns true when behind > 0', () => {
      expect(needsPull(makeAB({ behind: 5 }))).toBe(true);
    });

    it('returns false when behind is 0', () => {
      expect(needsPull(makeAB({ behind: 0 }))).toBe(false);
    });
  });

  describe('formatAheadBehind', () => {
    it('returns "No upstream" when no upstream', () => {
      expect(formatAheadBehind(makeAB({ hasUpstream: false }))).toBe('No upstream');
    });

    it('returns "Up to date" when in sync', () => {
      expect(formatAheadBehind(makeAB({ ahead: 0, behind: 0 }))).toBe('Up to date');
    });

    it('returns "N ahead" when only ahead', () => {
      expect(formatAheadBehind(makeAB({ ahead: 3, behind: 0 }))).toBe('3 ahead');
    });

    it('returns "N behind" when only behind', () => {
      expect(formatAheadBehind(makeAB({ ahead: 0, behind: 2 }))).toBe('2 behind');
    });

    it('returns "N ahead, M behind" when both', () => {
      expect(formatAheadBehind(makeAB({ ahead: 3, behind: 2 }))).toBe('3 ahead, 2 behind');
    });
  });
});
