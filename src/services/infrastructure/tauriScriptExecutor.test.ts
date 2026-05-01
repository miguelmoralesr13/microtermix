import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriScriptExecutor } from './tauriScriptExecutor';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('TauriScriptExecutor', () => {
  let executor: TauriScriptExecutor;

  beforeEach(() => {
    executor = new TauriScriptExecutor();
    vi.clearAllMocks();
  });

  it('executes a script with minimal config', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await executor.execute({
      serviceId: '/path::npm run dev ',
      projectPath: '/path',
      script: 'npm run dev',
      envVarsJson: '{}',
    });

    expect(invoke).toHaveBeenCalledWith('execute_service_script', {
      serviceId: '/path::npm run dev ',
      projectPath: '/path',
      script: 'npm run dev',
      envVarsJson: '{}',
      scriptDisplay: undefined,
      useViteWrapper: undefined,
      viteWrapperRemotes: undefined,
      viteWrapperBase: undefined,
      viteWrapperSourcemap: undefined,
      viteWrapperHost: undefined,
      customJavaHome: undefined,
    });
  });

  it('executes a script with full config', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await executor.execute({
      serviceId: '/path::npm run dev ',
      projectPath: '/path',
      script: 'npm run dev',
      envVarsJson: '{"PORT":"3000"}',
      useViteWrapper: true,
      viteWrapperRemotes: { auth: 'http://localhost:3001' },
      customJavaHome: '/usr/lib/jvm/java-17',
    });

    expect(invoke).toHaveBeenCalledWith('execute_service_script', expect.objectContaining({
      useViteWrapper: true,
      customJavaHome: '/usr/lib/jvm/java-17',
    }));
  });
});
