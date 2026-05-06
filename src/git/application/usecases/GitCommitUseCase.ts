/**
 * Use case: Commit staged changes.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { GitRepositoryPort } from '../ports/GitPorts';

export interface GitCommitInput {
  repoPath: string;
  message: string;
  amend?: boolean;
}

export class GitCommitUseCase {
  constructor(private readonly repoPort: GitRepositoryPort) {}

  async execute(input: GitCommitInput): Promise<void> {
    if (!input.repoPath.trim()) {
      throw new Error('Repository path is required');
    }
    if (!input.message.trim()) {
      throw new Error('Commit message is required');
    }

    const isRepo = await this.repoPort.isRepo(input.repoPath);
    if (!isRepo) {
      throw new Error(`Not a Git repository: ${input.repoPath}`);
    }

    await this.repoPort.commit(input.repoPath, input.message, input.amend);
  }
}
