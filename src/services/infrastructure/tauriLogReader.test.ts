import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriLogReader } from './tauriLogReader';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('TauriLogReader', () => {
  let reader: TauriLogReader;

  beforeEach(() => {
    reader = new TauriLogReader();
    vi.clearAllMocks();
  });

  it('reads logs without limit', async () => {
    vi.mocked(invoke).mockResolvedValue(['line1', 'line2', 'line3']);

    const result = await reader.read('test-service');

    expect(invoke).toHaveBeenCalledWith('get_service_logs', { serviceId: 'test-service', limit: undefined });
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  it('reads logs with limit', async () => {
    vi.mocked(invoke).mockResolvedValue(['line99', 'line100']);

    const result = await reader.read('test-service', 2);

    expect(invoke).toHaveBeenCalledWith('get_service_logs', { serviceId: 'test-service', limit: 2 });
    expect(result).toEqual(['line99', 'line100']);
  });

  it('returns empty array for non-existent service', async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    const result = await reader.read('non-existent');

    expect(result).toEqual([]);
  });
});
