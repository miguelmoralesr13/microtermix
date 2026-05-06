/**
 * Tauri Jira Adapter implementing JiraApiPort and TempoApiPort.
 * Bridges the application layer to Jira REST API v3 and Tempo REST API v4.
 */
import { fetch } from '@tauri-apps/plugin-http';
import type { JiraApiPort, TempoApiPort, TempoWorklogInput } from '../application/ports';
import type { JiraIssue, JiraAccount } from '../domain';
import type { JiraWorklog } from '../domain/JiraWorklog';

// Re-export domain types
export type { JiraIssue, JiraAccount } from '../domain';
export type { JiraWorklog, TempoWorklogInput } from '../application/ports';

/**
 * Makes a Jira API request using Basic Auth.
 */
async function jiraFetch(
  account: JiraAccount,
  path: string,
  options?: RequestInit,
): Promise<unknown> {
  const { config } = account;
  const token = btoa(`${config.email}:${config.apiToken}`);
  const fullUrl = `${config.baseUrl.replace(/\/$/, '')}/rest/api/3${path}`;

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Authorization': `Basic ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Tauri-based implementation of the Jira API port.
 */
export class TauriJiraAdapter implements JiraApiPort {
  constructor(private account: JiraAccount) {}

  async testConnection(): Promise<{ displayName: string; accountId: string }> {
    const data = await jiraFetch(this.account, '/myself');
    return {
      displayName: (data as { displayName?: string }).displayName || '',
      accountId: (data as { accountId?: string }).accountId || '',
    };
  }

  async getMyIssues(): Promise<JiraIssue[]> {
    const jql = 'assignee = currentUser() ORDER BY updated DESC';
    return this.searchIssues(jql);
  }

  async searchIssues(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    const data = await jiraFetch(this.account, '/search/jql', {
      method: 'POST',
      body: JSON.stringify({ jql, maxResults, fields: ['summary', 'status', 'issuetype', 'priority', 'assignee', 'labels', 'updated', 'created', 'description'] }),
    });
    return ((data as { issues?: JiraIssue[] }).issues ?? []) as JiraIssue[];
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const data = await jiraFetch(this.account, `/issue/${key}`);
    return data as JiraIssue;
  }

  async getProjectIssues(projectKey: string, statusFilter?: string): Promise<JiraIssue[]> {
    let jql = `project = "${projectKey}" ORDER BY updated DESC`;
    if (statusFilter) {
      jql = `project = "${projectKey}" AND status = "${statusFilter}" ORDER BY updated DESC`;
    }
    return this.searchIssues(jql);
  }

  async getEpics(projectKey: string, search?: string): Promise<JiraIssue[]> {
    const { config } = this.account;
    const epicType = config.epicType || 'Epic';
    let jql = `project = "${projectKey}" AND issuetype = "${epicType}" ORDER BY updated DESC`;
    if (search) {
      const keyPattern = /^[A-Z]+-\d+$/i.test(search.trim());
      if (keyPattern) {
        jql = `project = "${projectKey}" AND issuetype = "${epicType}" AND (summary ~ "${search}" OR key = "${search.toUpperCase()}") ORDER BY updated DESC`;
      } else {
        jql = `project = "${projectKey}" AND issuetype = "${epicType}" AND summary ~ "${search}" ORDER BY updated DESC`;
      }
    }
    return this.searchIssues(jql);
  }

  async getStoriesForEpic(epicKey: string, search?: string): Promise<JiraIssue[]> {
    const { config } = this.account;
    const storyType = config.storyType || 'Story';
    let jql = `parent = "${epicKey}" AND issuetype = "${storyType}" ORDER BY updated DESC`;
    if (search) {
      jql = `parent = "${epicKey}" AND issuetype = "${storyType}" AND summary ~ "${search}" ORDER BY updated DESC`;
    }
    return this.searchIssues(jql);
  }

  async getTasksForStory(storyKey: string): Promise<JiraIssue[]> {
    const { config } = this.account;
    const taskType = config.taskType || 'Task';
    const jql = `parent = "${storyKey}" AND issuetype = "${taskType}" ORDER BY updated DESC`;
    return this.searchIssues(jql);
  }

  async createIssue(fields: Record<string, unknown>): Promise<{ id: string; key: string }> {
    const data = await jiraFetch(this.account, '/issue', {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
    return data as { id: string; key: string };
  }

  async updateIssue(key: string, fields: Record<string, unknown>): Promise<void> {
    await jiraFetch(this.account, `/issue/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
  }

  async getPriorities(): Promise<Array<{ id: string; name: string }>> {
    const data = await jiraFetch(this.account, '/priority');
    return (data as Array<{ id: string; name: string }>) ?? [];
  }

  async getUsers(projectKey: string): Promise<Array<{ accountId: string; displayName: string }>> {
    const data = await jiraFetch(this.account, `/user/assignable/search?project=${projectKey}&maxResults=50`);
    return (data as Array<{ accountId: string; displayName: string }>) ?? [];
  }

  async getActivityOptions(_projectKey: string): Promise<Array<{ id: string; value: string }>> {
    // Simplified - full implementation would call getIssueTypes and createmeta
    return [];
  }

  async getProjects(): Promise<Array<{ key: string; name: string; id: string }>> {
    const data = await jiraFetch(this.account, '/project/search?maxResults=50&orderBy=name');
    const values = (data as { values?: Array<{ key: string; name: string; id: string }> }).values ?? [];
    return values.map((p) => ({ key: p.key, name: p.name, id: p.id }));
  }

  async getIssueTypes(projectKey: string): Promise<Array<{ id: string; name: string; subtask: boolean }>> {
    const data = await jiraFetch(this.account, `/project/${projectKey}`);
    const types = (data as { issueTypes?: Array<{ id: string; name: string; subtask: boolean }> }).issueTypes ?? [];
    return types.map((t) => ({ id: t.id, name: t.name, subtask: !!t.subtask }));
  }

  async transitionIssue(key: string, transitionId: string): Promise<void> {
    await jiraFetch(this.account, `/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  async getTransitions(key: string): Promise<Array<{ id: string; name: string }>> {
    const data = await jiraFetch(this.account, `/issue/${key}/transitions`);
    return ((data as { transitions?: Array<{ id: string; name: string }> }).transitions ?? []) as Array<{ id: string; name: string }>;
  }

  async addComment(key: string, comment: unknown): Promise<void> {
    await jiraFetch(this.account, `/issue/${key}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body: comment }),
    });
  }

  async getComments(key: string): Promise<unknown[]> {
    const data = await jiraFetch(this.account, `/issue/${key}/comment`);
    return (data as { comments?: unknown[] }).comments ?? [];
  }
}

/**
 * Tauri-based implementation of the Tempo API port.
 */
export class TauriTempoAdapter implements TempoApiPort {
  constructor(private account: JiraAccount) {}

  private async tempoFetch(path: string, options?: RequestInit): Promise<unknown> {
    const { config } = this.account;
    if (!config.tempoToken) {
      throw new Error('Tempo token not configured');
    }

    const fullUrl = `https://api.tempo.io/4${path}`;
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'Authorization': `Bearer ${config.tempoToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tempo ${res.status}: ${text}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async getMyWorklogs(startDate: string, endDate: string): Promise<JiraWorklog[]> {
    const data = await this.tempoFetch(`/worklogs?from=${startDate}&to=${endDate}`);
    return this.transformWorklogs(data);
  }

  async getIssueWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    const data = await this.tempoFetch(`/worklogs?issue=${issueKey}`);
    return this.transformWorklogs(data);
  }

  async createWorklog(input: TempoWorklogInput): Promise<JiraWorklog> {
    const data = await this.tempoFetch('/worklogs', {
      method: 'POST',
      body: JSON.stringify({
        issueKey: input.issueKey,
        timeSpent: input.timeSpent,
        started: input.started,
        description: input.description || '',
      }),
    });
    return this.transformSingleWorklog(data);
  }

  async updateWorklog(worklogId: string, input: TempoWorklogInput): Promise<void> {
    await this.tempoFetch(`/worklogs/${worklogId}`, {
      method: 'PUT',
      body: JSON.stringify({
        issueKey: input.issueKey,
        timeSpent: input.timeSpent,
        started: input.started,
        description: input.description || '',
      }),
    });
  }

  async deleteWorklog(worklogId: string): Promise<void> {
    await this.tempoFetch(`/worklogs/${worklogId}`, {
      method: 'DELETE',
    });
  }

  async getWorklog(worklogId: string): Promise<JiraWorklog> {
    const data = await this.tempoFetch(`/worklogs/${worklogId}`);
    return this.transformSingleWorklog(data);
  }

  private transformWorklogs(data: unknown): JiraWorklog[] {
    const results = (data as { results?: unknown[] }).results ?? [];
    return results.map((w) => this.transformSingleWorklog(w));
  }

  private transformSingleWorklog(w: unknown): JiraWorklog {
    const w2 = w as Record<string, unknown>;
    const issue = w2.issue as Record<string, unknown> | undefined;
    const author = w2.author as Record<string, unknown> | undefined;
    return {
      id: String(w2.id ?? ''),
      issueKey: String(issue?.key ?? ''),
      author: {
        accountId: String(author?.accountId ?? ''),
        displayName: String(author?.displayName ?? ''),
        avatarUrl: String(author?.avatarUrl ?? ''),
      },
      timeSpent: String(w2.timeSpent ?? '0m'),
      timeSpentSeconds: Number(w2.timeSpentSeconds ?? 0),
      started: String(w2.started ?? ''),
      createdAt: String(w2.createdAt ?? ''),
      updatedAt: String(w2.updatedAt ?? ''),
      description: w2.description ? String(w2.description) : undefined,
    };
  }
}
