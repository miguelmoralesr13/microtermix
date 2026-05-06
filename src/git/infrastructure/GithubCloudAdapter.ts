/**
 * GitHub Cloud Adapter implementing GitCloudPort.
 * Uses direct HTTP calls to GitHub API v3.
 */
import { fetch } from '@tauri-apps/plugin-http';
import type { GitCloudPort } from '../application/ports/GitPorts';
import type { GitAccount } from '../domain/GitAccount';

const GITHUB_API_BASE = 'https://api.github.com';

export class GithubCloudAdapter implements GitCloudPort {
  private getBaseUrl(account: GitAccount): string {
    return account.url || GITHUB_API_BASE;
  }

  private getHeaders(account: GitAccount): Record<string, string> {
    return {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${account.token}`,
    };
  }

  async fetchPullRequests(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/pulls?state=all&per_page=50`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchIssues(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/issues?state=all&per_page=50`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
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
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers: {
          ...this.getHeaders(account),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, head: sourceBranch, base: targetBranch }),
      }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }

  async mergePullRequest(
    account: GitAccount,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<void> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          ...this.getHeaders(account),
          'Content-Type': 'application/json',
        },
      }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
  }

  async fetchWorkflowRuns(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/actions/runs?per_page=50`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return data.workflow_runs as Array<Record<string, unknown>> || [];
  }

  async fetchRemoteBranches(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<string[]> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/branches`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data.map((b: { name: string }) => b.name) : [];
  }

  async searchRepos(
    account: GitAccount,
    query: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/search/repositories?q=${encodeURIComponent(query)}&per_page=30`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return data.items as Array<Record<string, unknown>> || [];
  }

  async getRepoInfo(
    account: GitAccount,
    owner: string,
    repo: string,
  ): Promise<Record<string, unknown>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }

  // Helper methods for clone operations
  async fetchUserRepos(account: GitAccount): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/user/repos?sort=pushed&per_page=100`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchUserOrgs(account: GitAccount): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/user/orgs`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchOrgRepos(
    account: GitAccount,
    org: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/orgs/${org}/repos?sort=pushed&per_page=100`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  }

  async fetchWorkflowRunJobs(
    account: GitAccount,
    owner: string,
    repo: string,
    runId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    const data = await response.json();
    return data.jobs as Array<Record<string, unknown>> || [];
  }

  async fetchJobLogs(
    account: GitAccount,
    owner: string,
    repo: string,
    jobId: number,
  ): Promise<string> {
    const base = this.getBaseUrl(account);
    const response = await fetch(
      `${base}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
      { headers: this.getHeaders(account) }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);
    return await response.text();
  }
}
