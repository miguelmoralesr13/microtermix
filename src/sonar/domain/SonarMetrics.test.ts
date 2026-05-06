import { describe, it, expect } from 'vitest';
import {
  numericToGrade,
  isQualityGateOk,
  isHighSeverity,
  SEVERITY_ORDER,
} from '../domain/SonarMetrics';
import type { SonarMetrics, SonarIssue } from '../domain/SonarMetrics';

describe('SonarMetrics domain', () => {
  describe('numericToGrade', () => {
    it('returns N/A for undefined', () => {
      expect(numericToGrade(undefined)).toBe('N/A');
    });

    it('returns N/A for empty string', () => {
      expect(numericToGrade('')).toBe('N/A');
    });

    it('returns A for value 1', () => {
      expect(numericToGrade('1')).toBe('A');
    });

    it('returns A for value less than 1', () => {
      expect(numericToGrade('0.5')).toBe('A');
    });

    it('returns B for value 2', () => {
      expect(numericToGrade('2')).toBe('B');
    });

    it('returns C for value 3', () => {
      expect(numericToGrade('3')).toBe('C');
    });

    it('returns D for value 4', () => {
      expect(numericToGrade('4')).toBe('D');
    });

    it('returns E for value 5', () => {
      expect(numericToGrade('5')).toBe('E');
    });

    it('returns E for value greater than 4', () => {
      expect(numericToGrade('4.5')).toBe('E');
    });
  });

  describe('isQualityGateOk', () => {
    it('returns true for OK', () => {
      const metrics: SonarMetrics = {
        qualityGate: 'OK',
        reliability: 'A',
        security: 'A',
        maintainability: 'A',
        bugs: 0,
        vulnerabilities: 0,
        codeSmells: 0,
        coverage: 80,
        duplications: 5,
      };
      expect(isQualityGateOk(metrics)).toBe(true);
    });

    it('returns false for ERROR', () => {
      const metrics: SonarMetrics = {
        qualityGate: 'ERROR',
        reliability: 'A',
        security: 'A',
        maintainability: 'A',
        bugs: 0,
        vulnerabilities: 0,
        codeSmells: 0,
        coverage: 80,
        duplications: 5,
      };
      expect(isQualityGateOk(metrics)).toBe(false);
    });

    it('returns false for NONE', () => {
      const metrics: SonarMetrics = {
        qualityGate: 'NONE',
        reliability: 'A',
        security: 'A',
        maintainability: 'A',
        bugs: 0,
        vulnerabilities: 0,
        codeSmells: 0,
        coverage: 80,
        duplications: 5,
      };
      expect(isQualityGateOk(metrics)).toBe(false);
    });
  });

  describe('isHighSeverity', () => {
    it('returns true for BLOCKER', () => {
      const issue: SonarIssue = {
        key: '1',
        rule: 'java:S123',
        severity: 'BLOCKER',
        type: 'BUG',
        message: 'Test',
        component: 'src/Test.java',
        projectKey: 'myproject',
      };
      expect(isHighSeverity(issue)).toBe(true);
    });

    it('returns true for CRITICAL', () => {
      const issue: SonarIssue = {
        key: '1',
        rule: 'java:S123',
        severity: 'CRITICAL',
        type: 'BUG',
        message: 'Test',
        component: 'src/Test.java',
        projectKey: 'myproject',
      };
      expect(isHighSeverity(issue)).toBe(true);
    });

    it('returns false for MAJOR', () => {
      const issue: SonarIssue = {
        key: '1',
        rule: 'java:S123',
        severity: 'MAJOR',
        type: 'BUG',
        message: 'Test',
        component: 'src/Test.java',
        projectKey: 'myproject',
      };
      expect(isHighSeverity(issue)).toBe(false);
    });

    it('returns false for MINOR', () => {
      const issue: SonarIssue = {
        key: '1',
        rule: 'java:S123',
        severity: 'MINOR',
        type: 'CODE_SMELL',
        message: 'Test',
        component: 'src/Test.java',
        projectKey: 'myproject',
      };
      expect(isHighSeverity(issue)).toBe(false);
    });

    it('returns false for INFO', () => {
      const issue: SonarIssue = {
        key: '1',
        rule: 'java:S123',
        severity: 'INFO',
        type: 'CODE_SMELL',
        message: 'Test',
        component: 'src/Test.java',
        projectKey: 'myproject',
      };
      expect(isHighSeverity(issue)).toBe(false);
    });
  });

  describe('SEVERITY_ORDER', () => {
    it('has correct order from most to least critical', () => {
      expect(SEVERITY_ORDER).toEqual(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']);
    });

    it('has 5 elements', () => {
      expect(SEVERITY_ORDER).toHaveLength(5);
    });
  });
});
