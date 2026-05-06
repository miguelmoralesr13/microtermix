/**
 * Use case: Run a Semgrep security scan.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { SemgrepScannerPort } from '../ports/SemgrepPorts';
import type { SemgrepScanConfig, SemgrepScanResult } from '../../domain/SemgrepScanConfig';

export interface RunSemgrepScanInput {
  config: SemgrepScanConfig;
  onProgress: (action: string) => void;
}

export class RunSemgrepScanUseCase {
  constructor(private readonly scannerPort: SemgrepScannerPort) {}

  async execute(input: RunSemgrepScanInput): Promise<SemgrepScanResult> {
    if (!input.config.projectPath.trim()) {
      throw new Error('Project path is required');
    }

    return this.scannerPort.runScan(input.config, input.onProgress);
  }
}
