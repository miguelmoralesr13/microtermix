import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriProcessKiller } from './tauriProcessKiller';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('TauriProcessKiller', () => {
  let killer: TauriProcessKiller;

  beforeEach(() => {
    killer = new TauriProcessKiller();
    vi.clearAllMocks();
  });

  it('kills a single service', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await killer.kill('test-service-id');

    expect(invoke).toHaveBeenCalledWith('kill_service', { serviceId: 'test-service-id' });
  });

  it('kills all services', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await killer.killAll();

    expect(invoke).toHaveBeenCalledWith('kill_all_services');
  });
});
