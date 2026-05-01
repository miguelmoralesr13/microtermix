import { invoke } from '@tauri-apps/api/core';
import type { LogReaderPort } from '../application/ports/LogReaderPort';

/**
 * Tauri adapter for reading historical logs.
 * Implements LogReaderPort by invoking Tauri commands.
 */
export class TauriLogReader implements LogReaderPort {
  async read(serviceId: string, limit?: number): Promise<string[]> {
    return invoke<string[]>('get_service_logs', { serviceId, limit });
  }
}
