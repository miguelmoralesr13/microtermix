/**
 * Sonar Clean Architecture module.
 *
 * Layers:
 * - domain/      : Pure entities, value objects, domain rules
 * - application/ : Ports (interfaces) and use cases
 * - infrastructure/ : Tauri adapters implementing ports
 * - ui/          : React components (migrated from src/components/sonar/)
 */

// Domain
export {
  createSonarAccount,
  normalizeSonarUrl,
  buildAuthHeader,
  DEFAULT_SONAR_ACCOUNT,
  numericToGrade,
  isQualityGateOk,
  isHighSeverity,
  SEVERITY_ORDER,
} from './domain';
export type {
  SonarAccount,
  SonarAuthType,
  SonarMetrics,
  SonarQualityGate,
  SonarGrade,
  SonarIssue,
  SonarSeverity,
  SonarProjectLink,
  SonarLocalConfig,
  SonarRule,
} from './domain';

// Application ports
export type { SonarApiPort, SonarConfigPort, SonarScannerPort } from './application/ports';

// Use cases
export { FetchMetricsUseCase, FetchIssuesUseCase } from './application/usecases';
export type { FetchMetricsInput, FetchIssuesInput } from './application/usecases';

// Infrastructure
export { TauriSonarApiAdapter, TauriSonarConfigAdapter } from './infrastructure';
