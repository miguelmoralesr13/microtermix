/**
 * Domain entity representing SonarQube quality metrics for a project.
 * Pure domain model — no framework dependencies.
 */
export interface SonarMetrics {
  qualityGate: SonarQualityGate;
  reliability: SonarGrade;
  security: SonarGrade;
  maintainability: SonarGrade;
  bugs: number;
  vulnerabilities: number;
  codeSmells: number;
  coverage: number;
  duplications: number;
}

export type SonarQualityGate = 'OK' | 'ERROR' | 'NONE';
export type SonarGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'N/A';

/**
 * Converts a numeric rating (1-5) to a letter grade (A-E).
 */
export function numericToGrade(value?: string): SonarGrade {
  if (!value) return 'N/A';
  const n = parseFloat(value);
  if (n <= 1) return 'A';
  if (n <= 2) return 'B';
  if (n <= 3) return 'C';
  if (n <= 4) return 'D';
  return 'E';
}

/**
 * Determines if the quality gate passed.
 */
export function isQualityGateOk(metrics: SonarMetrics): boolean {
  return metrics.qualityGate === 'OK';
}

/**
 * Domain entity representing a SonarQube issue/finding.
 */
export interface SonarIssue {
  readonly key: string;
  rule: string;
  severity: SonarSeverity;
  type: string;
  message: string;
  component: string;
  projectKey: string;
  line?: number;
}

export type SonarSeverity = 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

/**
 * Severity ordering from most to least critical.
 */
export const SEVERITY_ORDER: SonarSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

/**
 * Checks if an issue is high severity.
 */
export function isHighSeverity(issue: SonarIssue): boolean {
  return issue.severity === 'BLOCKER' || issue.severity === 'CRITICAL';
}

/**
 * SonarProjectLink: configuration linking a local project to a Sonar project.
 */
export interface SonarProjectLink {
  projectKey: string;
  accountId?: string;
  token?: string;
  customCommand?: string;
  includeProjectKey?: boolean;
  includeHostUrl?: boolean;
  includeToken?: boolean;
  includeOrganization?: boolean;
  includeBranch?: boolean;
  sources?: string;
  extraProps?: string;
  debug?: boolean;
  localAuditMode?: boolean;
  localAuditCommand?: string;
  localReportFile?: string;
  propertiesFileName?: string;
  autoSync?: boolean;
}

/**
 * SonarLocalConfig: parsed from sonar-project.properties file.
 */
export interface SonarLocalConfig {
  isLocal: boolean;
  serverUrl?: string;
  token?: string;
  projectKey?: string;
}
