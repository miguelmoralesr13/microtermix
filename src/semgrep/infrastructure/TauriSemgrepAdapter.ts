/**
 * Tauri adapter implementing SemgrepScannerPort.
 * Bridges the application layer to Tauri's Semgrep commands.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SemgrepScannerPort, SemgrepEventPort } from '../application/ports/SemgrepPorts';
import type { SemgrepFinding } from '../domain/SemgrepFinding';
import type { SemgrepScanConfig, SemgrepScanResult, SemgrepInstallStatus } from '../domain/SemgrepScanConfig';
import { resolveEffectiveConfig } from '../domain/SemgrepScanConfig';

/**
 * Tauri-based implementation of the Semgrep scanner port.
 * Uses `invoke('check_semgrep_installed')` and `invoke('run_semgrep_scan')`.
 */
export class TauriSemgrepScannerAdapter implements SemgrepScannerPort {
  async checkInstalled(): Promise<SemgrepInstallStatus> {
    try {
      const installed = await invoke<boolean>('check_semgrep_installed');
      return { isInstalled: installed };
    } catch {
      return { isInstalled: false };
    }
  }

  async runScan(
    config: SemgrepScanConfig,
    onProgress: (action: string) => void,
  ): Promise<SemgrepScanResult> {
    const effectiveConfig = resolveEffectiveConfig(config.configPath);

    // Listen for progress events
    const unlisten = await listen<string>('semgrep-log', (event) => {
      const line = String(event.payload);
      if (line.startsWith('PROG:')) {
        const cleanLine = line.replace('PROG:', '').trim();
        if (cleanLine) onProgress(cleanLine.substring(0, 40).toUpperCase());
      }
    });

    try {
      const resultStr = await invoke<string>('run_semgrep_scan', {
        projectPath: config.projectPath,
        configPath: effectiveConfig,
      });

      const data = JSON.parse(resultStr) as { results?: Array<Record<string, unknown>> };
      const findings = this.mapResultsToFindings(data.results || []);

      return {
        findings,
        scannedAt: new Date().toISOString(),
        projectPath: config.projectPath,
      };
    } finally {
      unlisten();
    }
  }

  private mapResultsToFindings(results: Array<Record<string, unknown>>): SemgrepFinding[] {
    return results.map((r) => {
      const extra = r.extra as Record<string, unknown> | undefined;
      const start = r.start as Record<string, unknown> | undefined;

      return {
        id: crypto.randomUUID(),
        path: (r.path as string) || '',
        line: (start?.line as number) || 0,
        message: (extra?.message as string) || '',
        severity: (extra?.severity as SemgrepFinding['severity']) || 'INFO',
        ruleId: (r.check_id as string) || '',
        extra: {
          ...(extra || {}),
          message: extra?.message as string | undefined,
          severity: extra?.severity as SemgrepFinding['severity'] | undefined,
          fix: extra?.fix as string | undefined,
          metadata: extra?.metadata as SemgrepFinding['extra']['metadata'] | undefined,
        },
      };
    });
  }
}

/**
 * Tauri adapter for listening to Semgrep scan logs.
 * Implements SemgrepEventPort.
 */
export class TauriSemgrepEventAdapter implements SemgrepEventPort {
  async listenToScanLogs(onLog: (line: string) => void): Promise<() => void> {
    const unlisten = await listen<string>('semgrep-log', (event) => {
      const line = String(event.payload);
      onLog(line);
    });
    return unlisten;
  }
}

/**
 * Tauri adapter for file operations.
 * Implements SemgrepFilePort.
 */
export class TauriSemgrepFileAdapter {
  async readTextFile(path: string): Promise<string> {
    return invoke('read_text_file', { path }) as Promise<string>;
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await invoke('write_file_content', { path, content });
  }
}
