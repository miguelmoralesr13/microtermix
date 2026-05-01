import { invoke } from '@tauri-apps/api/core';
import type { ProcessTerminatorPort } from '../application/ports/ProcessTerminatorPort';

/**
 * Tauri adapter for process termination.
 * Implements ProcessTerminatorPort by invoking Tauri commands.
 */
export class TauriProcessTerminator implements ProcessTerminatorPort {
  async terminate(pid: number): Promise<void> {
    await invoke('kill_process_by_pid', { pid });
  }
}
