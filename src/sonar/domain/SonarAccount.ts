/**
 * Domain entity representing a SonarQube/SonarCloud account.
 * Pure domain model — no framework dependencies.
 */
export interface SonarAccount {
  readonly id: string;
  name: string;
  serverUrl: string;
  token: string;
  authType: SonarAuthType;
  organization?: string;
}

export type SonarAuthType = 'basic' | 'bearer';

export const DEFAULT_SONAR_ACCOUNT: SonarAccount = {
  id: 'default',
  name: 'SonarQube Cloud',
  serverUrl: 'https://sonarcloud.io',
  token: '',
  authType: 'basic',
  organization: '',
};

/**
 * Creates a new SonarAccount with validated fields.
 */
export function createSonarAccount(
  name: string,
  serverUrl: string,
  token: string,
  authType: SonarAuthType = 'basic',
  organization?: string,
): SonarAccount {
  return {
    id: crypto.randomUUID(),
    name,
    serverUrl: normalizeSonarUrl(serverUrl),
    token,
    authType,
    organization,
  };
}

/**
 * Normalizes a Sonar server URL.
 */
export function normalizeSonarUrl(url: string): string {
  if (!url) return '';
  let normalized = url.trim().replace(/\/+$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `http://${normalized}`;
  }
  return normalized;
}

/**
 * Builds the Authorization header value for Sonar API requests.
 */
export function buildAuthHeader(authType: SonarAuthType, token: string): string {
  return authType === 'bearer'
    ? `Bearer ${token}`
    : `Basic ${btoa(token + ':')}`;
}
