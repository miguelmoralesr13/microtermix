import { invoke } from '@tauri-apps/api/core';
import type { ProcessKillerPort } from '../application/ports/ProcessKillerPort';

/**
 * Tauri adapter for process killing.
 * Implements ProcessKillerPort by invoking Tauri commands.
 */
export class TauriProcessKiller implements ProcessKillerPort {
  async kill(serviceId: string): Promise<void> {
    await invoke('kill_service', { serviceId });
  }

  async killAll(): Promise<void> {
    await invoke('kill_all_services');
  }
}
