/**
 * Domain entity representing a Semgrep security finding.
 * Pure domain model — no framework dependencies.
 */
export type SemgrepSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface SemgrepFinding {
  readonly id: string;
  path: string;
  line: number;
  message: string;
  severity: SemgrepSeverity;
  ruleId: string;
  extra: SemgrepFindingExtra;
}

export interface SemgrepFindingExtra {
  message?: string;
  severity?: SemgrepSeverity;
  fix?: string;
  metadata?: SemgrepMetadata;
  lines?: string;
  [key: string]: unknown;
}

export interface SemgrepMetadata {
  cwe?: string[];
  owasp?: string[];
  category?: string;
  technology?: string[];
  [key: string]: unknown;
}

/**
 * Severity ordering from most to least critical.
 */
export const SEMGREP_SEVERITY_ORDER: SemgrepSeverity[] = ['ERROR', 'WARNING', 'INFO'];

/**
 * Checks if a finding is critical (ERROR severity).
 */
export function isCriticalFinding(finding: SemgrepFinding): boolean {
  return finding.severity === 'ERROR';
}

/**
 * Counts findings by severity.
 */
export function countBySeverity(
  findings: SemgrepFinding[],
): Record<SemgrepSeverity, number> {
  const counts: Record<SemgrepSeverity, number> = {
    ERROR: 0,
    WARNING: 0,
    INFO: 0,
  };
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  return counts;
}

/**
 * Extracts the filename from a finding path.
 */
export function getFilename(finding: SemgrepFinding): string {
  const parts = finding.path.split('/');
  return parts[parts.length - 1] || finding.path;
}

/**
 * Gets the language hint from a finding's file extension.
 */
export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', java: 'java', go: 'go',
    rb: 'ruby', rs: 'rust',
  };
  return map[ext || ''] || 'plaintext';
}
