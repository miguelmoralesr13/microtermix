/**
 * Port interface for killing running processes.
 * Implemented by infrastructure layer (Tauri adapter).
 */
export interface ProcessKillerPort {
  /**
   * Signals a running service to terminate.
   */
  kill(serviceId: string): Promise<void>;

  /**
   * Signals all running services to terminate.
   */
  killAll(): Promise<void>;
}
