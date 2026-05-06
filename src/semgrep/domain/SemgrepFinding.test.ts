import { describe, it, expect } from 'vitest';
import {
  SEMGREP_SEVERITY_ORDER,
  isCriticalFinding,
  countBySeverity,
  getFilename,
  getLanguageFromPath,
} from '../domain/SemgrepFinding';
import type { SemgrepFinding } from '../domain/SemgrepFinding';

function makeFinding(overrides: Partial<SemgrepFinding> = {}): SemgrepFinding {
  return {
    id: 'test-1',
    path: 'src/app.ts',
    line: 42,
    message: 'Test finding',
    severity: 'WARNING',
    ruleId: 'test-rule',
    extra: {},
    ...overrides,
  };
}

describe('SemgrepFinding domain', () => {
  describe('SEMGREP_SEVERITY_ORDER', () => {
    it('has correct order from most to least critical', () => {
      expect(SEMGREP_SEVERITY_ORDER).toEqual(['ERROR', 'WARNING', 'INFO']);
    });

    it('has 3 elements', () => {
      expect(SEMGREP_SEVERITY_ORDER).toHaveLength(3);
    });
  });

  describe('isCriticalFinding', () => {
    it('returns true for ERROR severity', () => {
      const finding = makeFinding({ severity: 'ERROR' });
      expect(isCriticalFinding(finding)).toBe(true);
    });

    it('returns false for WARNING severity', () => {
      const finding = makeFinding({ severity: 'WARNING' });
      expect(isCriticalFinding(finding)).toBe(false);
    });

    it('returns false for INFO severity', () => {
      const finding = makeFinding({ severity: 'INFO' });
      expect(isCriticalFinding(finding)).toBe(false);
    });
  });

  describe('countBySeverity', () => {
    it('counts findings by severity correctly', () => {
      const findings = [
        makeFinding({ id: '1', severity: 'ERROR' }),
        makeFinding({ id: '2', severity: 'ERROR' }),
        makeFinding({ id: '3', severity: 'WARNING' }),
        makeFinding({ id: '4', severity: 'INFO' }),
      ];

      const counts = countBySeverity(findings);

      expect(counts.ERROR).toBe(2);
      expect(counts.WARNING).toBe(1);
      expect(counts.INFO).toBe(1);
    });

    it('returns zeros for empty array', () => {
      const counts = countBySeverity([]);
      expect(counts.ERROR).toBe(0);
      expect(counts.WARNING).toBe(0);
      expect(counts.INFO).toBe(0);
    });
  });

  describe('getFilename', () => {
    it('extracts filename from path', () => {
      const finding = makeFinding({ path: 'src/components/App.tsx' });
      expect(getFilename(finding)).toBe('App.tsx');
    });

    it('handles root-level files', () => {
      const finding = makeFinding({ path: 'package.json' });
      expect(getFilename(finding)).toBe('package.json');
    });
  });

  describe('getLanguageFromPath', () => {
    it('returns typescript for .ts files', () => {
      expect(getLanguageFromPath('src/app.ts')).toBe('typescript');
    });

    it('returns typescript for .tsx files', () => {
      expect(getLanguageFromPath('src/App.tsx')).toBe('typescript');
    });

    it('returns javascript for .js files', () => {
      expect(getLanguageFromPath('src/app.js')).toBe('javascript');
    });

    it('returns python for .py files', () => {
      expect(getLanguageFromPath('src/app.py')).toBe('python');
    });

    it('returns java for .java files', () => {
      expect(getLanguageFromPath('src/App.java')).toBe('java');
    });

    it('returns go for .go files', () => {
      expect(getLanguageFromPath('src/app.go')).toBe('go');
    });

    it('returns ruby for .rb files', () => {
      expect(getLanguageFromPath('src/app.rb')).toBe('ruby');
    });

    it('returns rust for .rs files', () => {
      expect(getLanguageFromPath('src/app.rs')).toBe('rust');
    });

    it('returns plaintext for unknown extensions', () => {
      expect(getLanguageFromPath('src/app.unknown')).toBe('plaintext');
    });

    it('returns plaintext for no extension', () => {
      expect(getLanguageFromPath('Makefile')).toBe('plaintext');
    });
  });
});
