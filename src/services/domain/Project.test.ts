import { describe, it, expect } from 'vitest';
import { isJavaProject, isNodeProject } from './Project';
import type { Project } from './Project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    name: 'test-project',
    path: '/test/path',
    projectType: 'node',
    scripts: [],
    ...overrides,
  };
}

describe('Project domain', () => {
  describe('isJavaProject', () => {
    it('returns true for java project type', () => {
      const project = makeProject({ projectType: 'java' });
      expect(isJavaProject(project)).toBe(true);
    });

    it('returns false for non-java project types', () => {
      expect(isJavaProject(makeProject({ projectType: 'node' }))).toBe(false);
      expect(isJavaProject(makeProject({ projectType: 'bun' }))).toBe(false);
      expect(isJavaProject(makeProject({ projectType: 'go' }))).toBe(false);
      expect(isJavaProject(makeProject({ projectType: 'python' }))).toBe(false);
      expect(isJavaProject(makeProject({ projectType: 'rust' }))).toBe(false);
    });
  });

  describe('isNodeProject', () => {
    it('returns true for node project type', () => {
      expect(isNodeProject(makeProject({ projectType: 'node' }))).toBe(true);
    });

    it('returns true for bun project type', () => {
      expect(isNodeProject(makeProject({ projectType: 'bun' }))).toBe(true);
    });

    it('returns false for non-node project types', () => {
      expect(isNodeProject(makeProject({ projectType: 'java' }))).toBe(false);
      expect(isNodeProject(makeProject({ projectType: 'go' }))).toBe(false);
      expect(isNodeProject(makeProject({ projectType: 'python' }))).toBe(false);
    });
  });
});
