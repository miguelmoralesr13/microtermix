import { describe, it, expect } from 'vitest';
import {
  createSonarAccount,
  normalizeSonarUrl,
  buildAuthHeader,
  DEFAULT_SONAR_ACCOUNT,
} from '../domain/SonarAccount';


describe('SonarAccount domain', () => {
  describe('normalizeSonarUrl', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeSonarUrl('')).toBe('');
    });

    it('trims trailing slashes', () => {
      expect(normalizeSonarUrl('https://sonarcloud.io///')).toBe('https://sonarcloud.io');
    });

    it('adds http:// if no protocol specified', () => {
      expect(normalizeSonarUrl('sonar.mycompany.com')).toBe('http://sonar.mycompany.com');
    });

    it('preserves https:// protocol', () => {
      expect(normalizeSonarUrl('https://sonarcloud.io')).toBe('https://sonarcloud.io');
    });

    it('preserves http:// protocol', () => {
      expect(normalizeSonarUrl('http://localhost:9000')).toBe('http://localhost:9000');
    });

    it('trims whitespace', () => {
      expect(normalizeSonarUrl('  https://sonarcloud.io  ')).toBe('https://sonarcloud.io');
    });
  });

  describe('buildAuthHeader', () => {
    it('creates Basic auth header for basic type', () => {
      const header = buildAuthHeader('basic', 'mytoken');
      expect(header).toBe(`Basic ${btoa('mytoken:')}`);
    });

    it('creates Bearer auth header for bearer type', () => {
      const header = buildAuthHeader('bearer', 'mytoken');
      expect(header).toBe('Bearer mytoken');
    });
  });

  describe('createSonarAccount', () => {
    it('creates account with normalized URL', () => {
      const account = createSonarAccount('Test', 'sonarcloud.io///', 'token123');
      expect(account.serverUrl).toBe('http://sonarcloud.io');
    });

    it('generates a UUID', () => {
      const account = createSonarAccount('Test', 'https://sonarcloud.io', 'token123');
      expect(account.id).toBeDefined();
      expect(account.id.length).toBeGreaterThan(0);
    });

    it('uses basic auth by default', () => {
      const account = createSonarAccount('Test', 'https://sonarcloud.io', 'token123');
      expect(account.authType).toBe('basic');
    });

    it('accepts explicit auth type', () => {
      const account = createSonarAccount('Test', 'https://sonarcloud.io', 'token123', 'bearer');
      expect(account.authType).toBe('bearer');
    });

    it('includes organization when provided', () => {
      const account = createSonarAccount('Test', 'https://sonarcloud.io', 'token123', 'basic', 'myorg');
      expect(account.organization).toBe('myorg');
    });
  });

  describe('DEFAULT_SONAR_ACCOUNT', () => {
    it('has correct default values', () => {
      expect(DEFAULT_SONAR_ACCOUNT.id).toBe('default');
      expect(DEFAULT_SONAR_ACCOUNT.name).toBe('SonarQube Cloud');
      expect(DEFAULT_SONAR_ACCOUNT.serverUrl).toBe('https://sonarcloud.io');
      expect(DEFAULT_SONAR_ACCOUNT.token).toBe('');
      expect(DEFAULT_SONAR_ACCOUNT.authType).toBe('basic');
    });
  });
});
