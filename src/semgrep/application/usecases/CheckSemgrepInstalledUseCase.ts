/**
 * Use case: Check if Semgrep is installed.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { SemgrepScannerPort } from '../ports/SemgrepPorts';
import type { SemgrepInstallStatus } from '../../domain/SemgrepScanConfig';

export class CheckSemgrepInstalledUseCase {
  constructor(private readonly scannerPort: SemgrepScannerPort) {}

  async execute(): Promise<SemgrepInstallStatus> {
    return this.scannerPort.checkInstalled();
  }
}
