import { describe, it, expect } from 'vitest';
import {
  createGitAccount,
  normalizeGitUrl,
  buildGitAuthHeader,
  DEFAULT_API_URLS,
} from '../domain/GitAccount';


describe('GitAccount domain', () => {
  describe('normalizeGitUrl', () => {
    it('returns default GitHub URL for empty string', () => {
      expect(normalizeGitUrl('', 'github')).toBe('https://api.github.com');
    });

    it('returns default GitLab URL for empty string', () => {
      expect(normalizeGitUrl('', 'gitlab')).toBe('https://gitlab.com/api/v4');
    });

    it('adds https:// if no protocol', () => {
      expect(normalizeGitUrl('gitlab.mycompany.com', 'gitlab')).toBe('https://gitlab.mycompany.com');
    });

    it('preserves existing https://', () => {
      expect(normalizeGitUrl('https://api.github.com', 'github')).toBe('https://api.github.com');
    });

    it('trims trailing slashes', () => {
      expect(normalizeGitUrl('https://api.github.com///', 'github')).toBe('https://api.github.com');
    });

    it('trims whitespace', () => {
      expect(normalizeGitUrl('  https://api.github.com  ', 'github')).toBe('https://api.github.com');
    });
  });

  describe('buildGitAuthHeader', () => {
    it('creates Bearer + Accept header for GitHub', () => {
      const headers = buildGitAuthHeader('github', 'mytoken');
      expect(headers.Authorization).toBe('Bearer mytoken');
      expect(headers.Accept).toBe('application/vnd.github.v3+json');
    });

    it('creates PRIVATE-TOKEN header for GitLab', () => {
      const headers = buildGitAuthHeader('gitlab', 'mytoken');
      expect(headers['PRIVATE-TOKEN']).toBe('mytoken');
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('createGitAccount', () => {
    it('creates account with normalized URL', () => {
      const account = createGitAccount('My GitHub', 'github', 'api.github.com///', 'token');
      expect(account.url).toBe('https://api.github.com');
    });

    it('generates a UUID', () => {
      const account = createGitAccount('My GitHub', 'github', 'https://api.github.com', 'token');
      expect(account.id.length).toBeGreaterThan(0);
    });

    it('preserves alias and provider', () => {
      const account = createGitAccount('My GitLab', 'gitlab', 'https://gitlab.com', 'token');
      expect(account.alias).toBe('My GitLab');
      expect(account.provider).toBe('gitlab');
    });
  });

  describe('DEFAULT_API_URLS', () => {
    it('has correct GitHub URL', () => {
      expect(DEFAULT_API_URLS.github).toBe('https://api.github.com');
    });

    it('has correct GitLab URL', () => {
      expect(DEFAULT_API_URLS.gitlab).toBe('https://gitlab.com/api/v4');
    });
  });
});
