/**
 * Application ports — interfaces that define what the Semgrep domain needs.
 * Infrastructure layer implements these.
 */
import type { SemgrepScanConfig, SemgrepScanResult, SemgrepInstallStatus } from '../../domain/SemgrepScanConfig';

/**
 * Port for interacting with the Semgrep CLI.
 */
export interface SemgrepScannerPort {
  /** Checks if Semgrep is installed on the system */
  checkInstalled(): Promise<SemgrepInstallStatus>;

  /** Runs a Semgrep scan on the given project */
  runScan(
    config: SemgrepScanConfig,
    onProgress: (action: string) => void,
  ): Promise<SemgrepScanResult>;
}

/**
 * Port for file operations needed by the Semgrep module.
 */
export interface SemgrepFilePort {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

/**
 * Port for Tauri event listening (scan logs).
 */
export interface SemgrepEventPort {
  listenToScanLogs(
    onLog: (line: string) => void,
  ): Promise<() => void>; // returns unlisten function
}
