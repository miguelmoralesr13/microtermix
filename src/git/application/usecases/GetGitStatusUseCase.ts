/**
 * Use case: Get Git repository status.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { GitRepositoryPort } from '../ports/GitPorts';
import type { GitStatusEntry } from '../../domain/GitStatusEntry';

export interface GetGitStatusInput {
  repoPath: string;
}

export class GetGitStatusUseCase {
  constructor(private readonly repoPort: GitRepositoryPort) {}

  async execute(input: GetGitStatusInput): Promise<GitStatusEntry[]> {
    if (!input.repoPath.trim()) {
      throw new Error('Repository path is required');
    }

    const isRepo = await this.repoPort.isRepo(input.repoPath);
    if (!isRepo) {
      throw new Error(`Not a Git repository: ${input.repoPath}`);
    }

    return this.repoPort.getStatus(input.repoPath);
  }
}
