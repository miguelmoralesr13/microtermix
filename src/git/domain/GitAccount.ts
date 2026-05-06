/**
 * Domain entity representing a Git cloud provider account (GitHub/GitLab).
 * Pure domain model — no framework dependencies.
 */
export type GitProvider = 'github' | 'gitlab';

export interface GitAccount {
  readonly id: string;
  /** Display alias for the account */
  alias: string;
  /** Cloud provider */
  provider: GitProvider;
  /** API base URL (e.g., 'https://api.github.com' or 'https://gitlab.com/api/v4') */
  url: string;
  /** Access token */
  token: string;
}

/**
 * Creates a new GitAccount with validated fields.
 */
export function createGitAccount(
  alias: string,
  provider: GitProvider,
  url: string,
  token: string,
): GitAccount {
  return {
    id: crypto.randomUUID(),
    alias,
    provider,
    url: normalizeGitUrl(url, provider),
    token,
  };
}

/**
 * Normalizes a Git provider URL.
 */
export function normalizeGitUrl(url: string, provider: GitProvider): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return provider === 'github'
      ? 'https://api.github.com'
      : 'https://gitlab.com/api/v4';
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Default API URLs for providers.
 */
export const DEFAULT_API_URLS: Record<GitProvider, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com/api/v4',
};

/**
 * Builds the Authorization header for the given provider.
 */
export function buildGitAuthHeader(
  provider: GitProvider,
  token: string,
): Record<string, string> {
  return provider === 'github'
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    : { 'PRIVATE-TOKEN': token };
}
