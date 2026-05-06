/**
 * Use case: Fetch SonarQube project metrics.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { SonarApiPort } from '../ports/SonarPorts';
import type { SonarAccount } from '../../domain/SonarAccount';
import type { SonarMetrics } from '../../domain/SonarMetrics';

export interface FetchMetricsInput {
  projectKey: string;
  account: SonarAccount;
  token: string;
}

export class FetchMetricsUseCase {
  constructor(private readonly apiPort: SonarApiPort) {}

  async execute(input: FetchMetricsInput): Promise<SonarMetrics> {
    if (!input.projectKey.trim()) {
      throw new Error('Project key is required');
    }
    if (!input.token) {
      throw new Error('Token is required');
    }
    if (!input.account.serverUrl) {
      throw new Error('Server URL is required');
    }

    return this.apiPort.fetchMetrics(
      input.projectKey,
      input.account,
      input.token,
    );
  }
}
