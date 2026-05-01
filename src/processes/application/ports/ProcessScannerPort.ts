import type { ListeningProcess } from '../../domain';

/**
 * Port interface for scanning system listening processes.
 * Implemented by infrastructure layer (Tauri adapter).
 */
export interface ProcessScannerPort {
  /**
   * Scans for all TCP listening processes on the system.
   */
  scan(): Promise<ListeningProcess[]>;
}
