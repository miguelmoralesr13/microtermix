import { describe, it, expect } from 'vitest';
import {
  createScanConfig,
  resolveEffectiveConfig,
  DEFAULT_SEMGREP_CONFIG,
} from '../domain/SemgrepScanConfig';

describe('SemgrepScanConfig domain', () => {
  describe('DEFAULT_SEMGREP_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_SEMGREP_CONFIG.projectPath).toBe('');
      expect(DEFAULT_SEMGREP_CONFIG.configPath).toBe('p/default');
      expect(DEFAULT_SEMGREP_CONFIG.isDefaultConfig).toBe(true);
    });
  });

  describe('createScanConfig', () => {
    it('creates config with default rules', () => {
      const config = createScanConfig('/path/to/project');
      expect(config.projectPath).toBe('/path/to/project');
      expect(config.configPath).toBe('p/default');
      expect(config.isDefaultConfig).toBe(true);
    });

    it('creates config with custom rules', () => {
      const config = createScanConfig('/path/to/project', 'p/security-audit');
      expect(config.projectPath).toBe('/path/to/project');
      expect(config.configPath).toBe('p/security-audit');
      expect(config.isDefaultConfig).toBe(false);
    });

    it('creates config with file path', () => {
      const config = createScanConfig('/path/to/project', '/custom/rules.yml');
      expect(config.configPath).toBe('/custom/rules.yml');
      expect(config.isDefaultConfig).toBe(false);
    });
  });

  describe('resolveEffectiveConfig', () => {
    it('returns null for default config', () => {
      expect(resolveEffectiveConfig('p/default')).toBeNull();
    });

    it('returns the config for custom rules', () => {
      expect(resolveEffectiveConfig('p/security-audit')).toBe('p/security-audit');
    });

    it('returns the config for file paths', () => {
      expect(resolveEffectiveConfig('/custom/rules.yml')).toBe('/custom/rules.yml');
    });
  });
});
