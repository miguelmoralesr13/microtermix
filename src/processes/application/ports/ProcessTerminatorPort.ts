/**
 * Port interface for terminating system processes.
 * Implemented by infrastructure layer (Tauri adapter).
 */
export interface ProcessTerminatorPort {
  /**
   * Terminates a process by its PID.
   */
  terminate(pid: number): Promise<void>;
}
