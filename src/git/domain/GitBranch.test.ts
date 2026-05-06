import { describe, it, expect } from 'vitest';
import {
  parseRemoteName,
  parseShortName,
  isTrackingBranch,
  filterByType,
} from '../domain/GitBranch';
import type { GitBranch } from '../domain/GitBranch';

function makeBranch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'main',
    shortName: 'main',
    type: 'local',
    isActive: true,
    ...overrides,
  };
}

describe('GitBranch domain', () => {
  describe('parseRemoteName', () => {
    it('extracts remote from full name', () => {
      expect(parseRemoteName('origin/main')).toBe('origin');
    });

    it('returns undefined for local branch', () => {
      expect(parseRemoteName('main')).toBeUndefined();
    });

    it('handles nested remote names', () => {
      expect(parseRemoteName('upstream/feature/test')).toBe('upstream');
    });
  });

  describe('parseShortName', () => {
    it('extracts short name from remote branch', () => {
      expect(parseShortName('origin/main')).toBe('main');
    });

    it('returns same name for local branch', () => {
      expect(parseShortName('main')).toBe('main');
    });
  });

  describe('isTrackingBranch', () => {
    it('returns true for remote branches', () => {
      const branch = makeBranch({ type: 'remote', remote: 'origin' });
      expect(isTrackingBranch(branch)).toBe(true);
    });

    it('returns true when remote is set', () => {
      const branch = makeBranch({ type: 'local', remote: 'upstream' });
      expect(isTrackingBranch(branch)).toBe(true);
    });

    it('returns false for local branches without remote', () => {
      const branch = makeBranch({ type: 'local' });
      expect(isTrackingBranch(branch)).toBe(false);
    });
  });

  describe('filterByType', () => {
    it('filters to local branches only', () => {
      const branches = [
        makeBranch({ name: 'main', type: 'local' }),
        makeBranch({ name: 'origin/main', type: 'remote' }),
        makeBranch({ name: 'feature', type: 'local' }),
      ];

      const result = filterByType(branches, 'local');

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.type === 'local')).toBe(true);
    });

    it('filters to remote branches only', () => {
      const branches = [
        makeBranch({ name: 'main', type: 'local' }),
        makeBranch({ name: 'origin/main', type: 'remote' }),
      ];

      const result = filterByType(branches, 'remote');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('origin/main');
    });
  });
});
