/**
 * Use case: Fetch SonarQube project issues.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { SonarApiPort } from '../ports/SonarPorts';
import type { SonarAccount } from '../../domain/SonarAccount';
import type { SonarIssue } from '../../domain/SonarMetrics';

export interface FetchIssuesInput {
  projectKey: string;
  account: SonarAccount;
  token: string;
}

export class FetchIssuesUseCase {
  constructor(private readonly apiPort: SonarApiPort) {}

  async execute(input: FetchIssuesInput): Promise<SonarIssue[]> {
    if (!input.projectKey.trim()) {
      throw new Error('Project key is required');
    }
    if (!input.token) {
      throw new Error('Token is required');
    }
    if (!input.account.serverUrl) {
      throw new Error('Server URL is required');
    }

    return this.apiPort.fetchIssues(
      input.projectKey,
      input.account,
      input.token,
    );
  }
}
