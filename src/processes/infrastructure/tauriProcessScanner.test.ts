import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriProcessScanner } from './tauriProcessScanner';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('TauriProcessScanner', () => {
  let scanner: TauriProcessScanner;

  beforeEach(() => {
    scanner = new TauriProcessScanner();
    vi.clearAllMocks();
  });

  it('scans listening processes and maps Rust response', async () => {
    const mockResponse = [
      {
        proto: 'tcp',
        local_address: '0.0.0.0:3000',
        foreign_address: '*:*',
        state: 'LISTEN',
        pid: 1234,
        name: 'node',
        path: '/usr/bin/node',
        service_id: '/path::npm run dev ',
      },
    ];

    vi.mocked(invoke).mockResolvedValue(mockResponse);

    const result = await scanner.scan();

    expect(invoke).toHaveBeenCalledWith('get_listening_processes');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      proto: 'tcp',
      localAddress: '0.0.0.0:3000',
      foreignAddress: '*:*',
      state: 'LISTEN',
      pid: 1234,
      name: 'node',
      path: '/usr/bin/node',
      serviceId: '/path::npm run dev ',
    });
  });

  it('returns empty array when no processes found', async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    const result = await scanner.scan();

    expect(result).toEqual([]);
  });
});
