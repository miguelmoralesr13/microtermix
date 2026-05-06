/**
 * GitLab Cloud Adapter implementing GitCloudPort.
 * Uses direct HTTP calls to GitLab API v4.
 */
import { fetch } from '@tauri-apps/plugin-http';
import type { GitCloudPort } from '../application/ports/GitPorts';
import type { GitAccount } from '../domain/GitAccount';

const GITLAB_API_BASE = 'https://gitlab.com';

export class GitlabCloudAdapter implements GitCloudPort {
  private getBaseUrl(account: GitAccount): string {
    return account.url || GITLAB_API_BASE;
  }

  private getHeaders(account: GitAccount): Record<string, string> {
    return { 'PRIVATE-TOKEN': account.token };
  }

  private encodeProjectPath(owner: string, repo: string): string {
    return encodeURIComponent(`${owner}/${repo}`);
  }

  async fetchPullRequests(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}/merge_requests?state=all&per_page=50`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchIssues(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    // GitLab doesn't have separate issues endpoint for repo issues
    // Return MRs which serve similar purposes in GitLab workflow
    return this.fetchPullRequests(account, owner, repo);
  }

  async createPullRequest(
    account: GitAccount,
    owner: string,
    repo: string,
    title: string,
    body: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<Record<string, unknown>> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}/merge_requests`,
      {
        method: 'POST',
        headers: {
          ...this.getHeaders(account),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: body,
          source_branch: sourceBranch,
          target_branch: targetBranch,
        }),
      }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }

  async mergePullRequest(
    account: GitAccount,
    owner: string,
    repo: string,
    mrIid: number,
  ): Promise<void> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}/merge_requests/${mrIid}/merge`,
      {
        method: 'PUT',
        headers: {
          ...this.getHeaders(account),
          'Content-Type': 'application/json',
        },
      }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
  }

  async fetchWorkflowRuns(
    _account: GitAccount,
    _owner: string,
    _repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    // GitLab uses Pipelines, not Workflow Runs
    // Return empty - would need separate implementation
    return [];
  }

  async fetchRemoteBranches(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<string[]> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}/repository/branches`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data.map((b: { name: string }) => b.name) : [];
  }

  async searchRepos(
    account: GitAccount,
    query: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/api/v4/projects?membership=true&search=${encodeURIComponent(query)}&per_page=30`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async getRepoInfo(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Record<string, unknown>> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }

  // Helper methods
  async fetchUserRepos(account: GitAccount): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/api/v4/projects?membership=true&order_by=last_activity_at&per_page=100`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchUserOrgs(_account: GitAccount): Promise<Array<Record<string, unknown>>> {
    // GitLab uses Groups instead of Orgs
    return [];
  }

  async fetchOrgRepos(
    account: GitAccount,
    group: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/api/v4/groups/${encodeURIComponent(group)}/projects`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchWorkflowRunJobs(
    _account: GitAccount,
    _owner: string,
    _repo: string,
    _runId: number,
  ): Promise<Array<Record<string, unknown>>> {
    // GitLab pipelines/jobs would need separate implementation
    return [];
  }

  async fetchJobLogs(
    _account: GitAccount,
    _owner: string,
    _repo: string,
    _jobId: number,
  ): Promise<string> {
    return '';
  }

  // GitLab-specific helpers
  async fetchProjectPipelines(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}/pipelines`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchPipelineJobs(
    account: GitAccount,
    owner: string,
    repo: string,
    pipelineId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const projectId = this.encodeProjectPath(owner, repo);
    const response = await fetch(
      `${base}/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }
}
