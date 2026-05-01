import { describe, it, expect } from 'vitest';
import { createScriptCommand, isSavedCommandAlias } from './ScriptCommand';

describe('ScriptCommand domain', () => {
  describe('createScriptCommand', () => {
    it('creates a script command with hasEnvsPlaceholder detection', () => {
      const cmd = createScriptCommand('{{ENVS}} npm run dev', 'node');

      expect(cmd.raw).toBe('{{ENVS}} npm run dev');
      expect(cmd.hasEnvsPlaceholder).toBe(true);
      expect(cmd.projectType).toBe('node');
    });

    it('detects when there is no ENVS placeholder', () => {
      const cmd = createScriptCommand('npm run dev', 'node');
      expect(cmd.hasEnvsPlaceholder).toBe(false);
    });
  });

  describe('isSavedCommandAlias', () => {
    it('returns true for simple command aliases', () => {
      expect(isSavedCommandAlias('deploy')).toBe(true);
      expect(isSavedCommandAlias('build-all')).toBe(true);
      expect(isSavedCommandAlias('test')).toBe(true);
    });

    it('returns false for actual scripts with spaces', () => {
      expect(isSavedCommandAlias('npm run dev')).toBe(false);
      expect(isSavedCommandAlias('mvn clean install')).toBe(false);
    });

    it('returns false for scripts starting with package managers', () => {
      expect(isSavedCommandAlias('npm run build')).toBe(false);
      expect(isSavedCommandAlias('yarn start')).toBe(false);
      expect(isSavedCommandAlias('bun dev')).toBe(false);
      expect(isSavedCommandAlias('npx vite')).toBe(false);
    });
  });
});
