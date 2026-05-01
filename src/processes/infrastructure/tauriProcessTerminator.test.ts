import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriProcessTerminator } from './tauriProcessTerminator';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('TauriProcessTerminator', () => {
  let terminator: TauriProcessTerminator;

  beforeEach(() => {
    terminator = new TauriProcessTerminator();
    vi.clearAllMocks();
  });

  it('terminates a process by PID', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await terminator.terminate(1234);

    expect(invoke).toHaveBeenCalledWith('kill_process_by_pid', { pid: 1234 });
  });

  it('throws when invoke fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Permission denied'));

    await expect(terminator.terminate(1)).rejects.toThrow('Permission denied');
  });
});
