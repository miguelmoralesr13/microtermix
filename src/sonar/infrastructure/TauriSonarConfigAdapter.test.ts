import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriSonarConfigAdapter } from './TauriSonarAdapter';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const { invoke } = await import('@tauri-apps/api/core');

describe('TauriSonarConfigAdapter', () => {
  let adapter: TauriSonarConfigAdapter;

  beforeEach(() => {
    adapter = new TauriSonarConfigAdapter();
    vi.clearAllMocks();
  });

  describe('readProjectSonarConfig', () => {
    it('parses sonar-project.properties correctly', async () => {
      const fileContent = `sonar.host.url=https://sonarcloud.io
sonar.token=mytoken123
sonar.projectKey=my-project-key
sonar.sources=src`;

      vi.mocked(invoke).mockResolvedValue(fileContent);

      const result = await adapter.readProjectSonarConfig('/path/to/project');

      expect(result.isLocal).toBe(true);
      expect(result.serverUrl).toBe('https://sonarcloud.io');
      expect(result.token).toBe('mytoken123');
      expect(result.projectKey).toBe('my-project-key');
    });

    it('returns isLocal: false when file does not exist', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('File not found'));

      const result = await adapter.readProjectSonarConfig('/path/to/project');

      expect(result.isLocal).toBe(false);
      expect(result.serverUrl).toBeUndefined();
      expect(result.token).toBeUndefined();
      expect(result.projectKey).toBeUndefined();
    });

    it('uses custom properties file name when provided', async () => {
      vi.mocked(invoke).mockResolvedValue('sonar.projectKey=custom-key');

      await adapter.readProjectSonarConfig('/path/to/project', 'custom.properties');

      expect(invoke).toHaveBeenCalledWith('read_text_file', {
        path: '/path/to/project/custom.properties',
      });
    });

    it('recognizes sonar.login as token', async () => {
      const fileContent = `sonar.login=oldtoken
sonar.projectKey=my-project`;

      vi.mocked(invoke).mockResolvedValue(fileContent);

      const result = await adapter.readProjectSonarConfig('/path/to/project');

      expect(result.token).toBe('oldtoken');
    });

    it('ignores comments and empty lines', async () => {
      const fileContent = `# This is a comment
sonar.projectKey=my-project

! Another comment
sonar.host.url=https://sonarcloud.io`;

      vi.mocked(invoke).mockResolvedValue(fileContent);

      const result = await adapter.readProjectSonarConfig('/path/to/project');

      expect(result.projectKey).toBe('my-project');
      expect(result.serverUrl).toBe('https://sonarcloud.io');
    });

    it('handles values with equals signs', async () => {
      const fileContent = `sonar.projectKey=my-project=key=value`;

      vi.mocked(invoke).mockResolvedValue(fileContent);

      const result = await adapter.readProjectSonarConfig('/path/to/project');

      expect(result.projectKey).toBe('my-project=key=value');
    });
  });
});
