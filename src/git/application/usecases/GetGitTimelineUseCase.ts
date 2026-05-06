/**
 * Use case: Get Git commit timeline.
 * Pure business logic — depends only on ports, not infrastructure.
 */
import type { GitRepositoryPort } from '../ports/GitPorts';
import type { GitCommit } from '../../domain/GitCommit';

export interface GetGitTimelineInput {
  repoPath: string;
  limit?: number;
}

export class GetGitTimelineUseCase {
  constructor(private readonly repoPort: GitRepositoryPort) {}

  async execute(input: GetGitTimelineInput): Promise<GitCommit[]> {
    if (!input.repoPath.trim()) {
      throw new Error('Repository path is required');
    }

    const isRepo = await this.repoPort.isRepo(input.repoPath);
    if (!isRepo) {
      throw new Error(`Not a Git repository: ${input.repoPath}`);
    }

    return this.repoPort.getTimeline(input.repoPath, input.limit);
  }
}
