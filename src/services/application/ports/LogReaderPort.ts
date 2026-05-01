/**
 * Port interface for reading historical logs.
 * Implemented by infrastructure layer (Tauri adapter).
 */
export interface LogReaderPort {
  /**
   * Reads historical logs for a service from the log file.
   * @param serviceId The service identifier
   * @param limit Maximum number of lines to return (from the end)
   */
  read(serviceId: string, limit?: number): Promise<string[]>;
}
