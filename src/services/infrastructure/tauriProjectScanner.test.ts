import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriProjectScanner } from './tauriProjectScanner';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('TauriProjectScanner', () => {
  let scanner: TauriProjectScanner;

  beforeEach(() => {
    scanner = new TauriProjectScanner();
    vi.clearAllMocks();
  });

  it('scans projects and maps Rust response to domain model', async () => {
    const mockResponse = [
      {
        name: 'my-app',
        path: '/projects/my-app',
        project_type: 'node',
        framework: null,
        build_system: 'npm',
        package_manager: 'npm',
        scripts: ['npm run dev', 'npm run build'],
      },
    ];

    vi.mocked(invoke).mockResolvedValue(mockResponse);

    const result = await scanner.scan('/projects');

    expect(invoke).toHaveBeenCalledWith('scan_projects', { rootPath: '/projects' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'my-app',
      path: '/projects/my-app',
      projectType: 'node',
      framework: null,
      buildSystem: 'npm',
      packageManager: 'npm',
      scripts: ['npm run dev', 'npm run build'],
    });
  });

  it('returns empty array when no projects found', async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    const result = await scanner.scan('/empty');

    expect(result).toEqual([]);
  });
});
