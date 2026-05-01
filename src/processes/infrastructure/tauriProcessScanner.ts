import { invoke } from '@tauri-apps/api/core';
import type { ProcessScannerPort } from '../application/ports/ProcessScannerPort';
import type { ListeningProcess } from '../domain';

interface RustListeningProcess {
  proto: string;
  local_address: string;
  foreign_address: string;
  state: string;
  pid: number;
  name: string;
  path: string;
  service_id: string | null;
}

function mapRustProcess(r: RustListeningProcess): ListeningProcess {
  return {
    proto: r.proto,
    localAddress: r.local_address,
    foreignAddress: r.foreign_address,
    state: r.state,
    pid: r.pid,
    name: r.name,
    path: r.path,
    serviceId: r.service_id,
  };
}

/**
 * Tauri adapter for process scanning.
 * Implements ProcessScannerPort by invoking Tauri commands.
 */
export class TauriProcessScanner implements ProcessScannerPort {
  async scan(): Promise<ListeningProcess[]> {
    const processes = await invoke<RustListeningProcess[]>('get_listening_processes');
    return processes.map(mapRustProcess);
  }
}
