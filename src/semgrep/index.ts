/**
 * Semgrep Clean Architecture module.
 *
 * Layers:
 * - domain/      : Pure entities, value objects, domain rules
 * - application/ : Ports (interfaces) and use cases
 * - infrastructure/ : Tauri adapters implementing ports
 * - ui/          : React components (migrated from src/components/semgrep/)
 */

// Domain
export {
  SEMGREP_SEVERITY_ORDER,
  isCriticalFinding,
  countBySeverity,
  getFilename,
  getLanguageFromPath,
} from './domain';
export type {
  SemgrepSeverity,
  SemgrepFinding,
  SemgrepFindingExtra,
  SemgrepMetadata,
} from './domain';

export {
  createScanConfig,
  resolveEffectiveConfig,
  DEFAULT_SEMGREP_CONFIG,
} from './domain';
export type {
  SemgrepScanConfig,
  SemgrepScanResult,
  SemgrepInstallStatus,
} from './domain';

// Application ports
export type { SemgrepScannerPort, SemgrepFilePort, SemgrepEventPort } from './application/ports';

// Use cases
export { CheckSemgrepInstalledUseCase, RunSemgrepScanUseCase } from './application/usecases';
export type { RunSemgrepScanInput } from './application/usecases';

// Infrastructure
export { TauriSemgrepScannerAdapter, TauriSemgrepEventAdapter, TauriSemgrepFileAdapter } from './infrastructure';
