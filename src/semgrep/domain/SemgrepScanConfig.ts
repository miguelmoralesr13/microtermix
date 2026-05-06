/**
 * Domain entity representing Semgrep scan configuration.
 * Pure domain model — no framework dependencies.
 */
export interface SemgrepScanConfig {
  /** Path to the project to scan */
  projectPath: string;
  /** Semgrep rule config: 'p/default', 'p/security-audit', or custom file path */
  configPath: string;
  /** Whether to use default rules (p/default) */
  isDefaultConfig: boolean;
}

/**
 * Default Semgrep configuration.
 */
export const DEFAULT_SEMGREP_CONFIG: SemgrepScanConfig = {
  projectPath: '',
  configPath: 'p/default',
  isDefaultConfig: true,
};

/**
 * Creates a validated SemgrepScanConfig.
 */
export function createScanConfig(
  projectPath: string,
  configPath: string = 'p/default',
): SemgrepScanConfig {
  return {
    projectPath,
    configPath,
    isDefaultConfig: configPath === 'p/default',
  };
}

/**
 * Resolves the effective config path for the Semgrep CLI.
 * Returns null for default config (Semgrep uses p/default implicitly).
 */
export function resolveEffectiveConfig(
  configPath: string,
): string | null {
  return configPath === 'p/default' ? null : configPath;
}

/**
 * Represents the result of a Semgrep scan.
 */
export interface SemgrepScanResult {
  findings: import('./SemgrepFinding').SemgrepFinding[];
  scannedAt: string;
  projectPath: string;
}

/**
 * Installation status of Semgrep on the system.
 */
export interface SemgrepInstallStatus {
  isInstalled: boolean;
  version?: string;
}
