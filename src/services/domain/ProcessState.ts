/**
 * Domain entity representing the state of a running or stopped process.
 * Pure domain model — no framework dependencies.
 */
export type ProcessStatus = 'idle' | 'running' | 'error' | 'stopped';

export type ProcessSource =
  | 'services'
  | 'sonar'
  | 'semgrep'
  | 'git'
  | 'jenkins'
  | 'tests'
  | 'proxy'
  | string;

export interface ProcessState {
  readonly id: string;
  status: ProcessStatus;
  source: ProcessSource;
  script?: string;
  envJson?: string;
  logs: readonly string[];
  restarts: number;
}

/**
 * Creates a new ProcessState entity.
 */
export function createProcessState(
  id: string,
  status: ProcessStatus,
  source: ProcessSource = 'services',
  script?: string,
  envJson?: string,
): ProcessState {
  return {
    id,
    status,
    source,
    script,
    envJson,
    logs: [],
    restarts: 0,
  };
}

/**
 * Appends logs to a ProcessState, capped at maxLines.
 */
export function appendLogsToProcess(
  process: ProcessState,
  newLines: string[],
  maxLines = 1000,
): ProcessState {
  return {
    ...process,
    logs: [...process.logs, ...newLines].slice(-maxLines),
  };
}
