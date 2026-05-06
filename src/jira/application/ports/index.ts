/**
 * Application ports — interfaces that define what the Jira domain needs.
 * Infrastructure layer implements these.
 */
import type { JiraIssue, JiraAccount } from '../../domain';
import type { JiraWorklog } from '../../domain/JiraWorklog';

/**
 * Port for interacting with Jira REST API v3.
 */
export interface JiraApiPort {
  /** Test connection to Jira */
  testConnection(account: JiraAccount): Promise<{ displayName: string; accountId: string }>;

  /** Get user's assigned issues */
  getMyIssues(): Promise<JiraIssue[]>;

  /** Search issues by JQL */
  searchIssues(jql: string, maxResults?: number): Promise<JiraIssue[]>;

  /** Get a single issue by key */
  getIssue(key: string): Promise<JiraIssue>;

  /** Get issues for a project */
  getProjectIssues(projectKey: string, statusFilter?: string): Promise<JiraIssue[]>;

  /** Get epics for a project */
  getEpics(projectKey: string, search?: string): Promise<JiraIssue[]>;

  /** Get stories for an epic */
  getStoriesForEpic(epicKey: string, search?: string): Promise<JiraIssue[]>;

  /** Get tasks for a story */
  getTasksForStory(storyKey: string): Promise<JiraIssue[]>;

  /** Create a new issue */
  createIssue(fields: Record<string, unknown>): Promise<{ id: string; key: string }>;

  /** Update an existing issue */
  updateIssue(key: string, fields: Record<string, unknown>): Promise<void>;

  /** Get available priorities */
  getPriorities(): Promise<Array<{ id: string; name: string }>>;

  /** Get project users/assignees */
  getUsers(projectKey: string): Promise<Array<{ accountId: string; displayName: string }>>;

  /** Get activity options for a project */
  getActivityOptions(projectKey: string): Promise<Array<{ id: string; value: string }>>;

  /** Get projects */
  getProjects(): Promise<Array<{ key: string; name: string; id: string }>>;

  /** Get issue types for a project */
  getIssueTypes(projectKey: string): Promise<Array<{ id: string; name: string; subtask: boolean }>>;

  /** Transition an issue to a new status */
  transitionIssue(key: string, transitionId: string): Promise<void>;

  /** Get available transitions for an issue */
  getTransitions(key: string): Promise<Array<{ id: string; name: string }>>;

  /** Add comment to issue */
  addComment(key: string, comment: unknown): Promise<void>;

  /** Get comments for issue */
  getComments(key: string): Promise<unknown[]>;
}

/**
 * Port for interacting with Tempo REST API v4.
 */
export interface TempoApiPort {
  /** Get worklogs for current user in a date range */
  getMyWorklogs(startDate: string, endDate: string): Promise<JiraWorklog[]>;

  /** Get worklogs for a specific issue */
  getIssueWorklogs(issueKey: string): Promise<JiraWorklog[]>;

  /** Create a worklog entry */
  createWorklog(worklog: TempoWorklogInput): Promise<JiraWorklog>;

  /** Update a worklog entry */
  updateWorklog(worklogId: string, worklog: TempoWorklogInput): Promise<void>;

  /** Delete a worklog entry */
  deleteWorklog(worklogId: string): Promise<void>;

  /** Get worklog by ID */
  getWorklog(worklogId: string): Promise<JiraWorklog>;
}

export interface TempoWorklogInput {
  issueKey: string;
  timeSpent: string;
  started: string;
  description?: string;
  authorAccountId?: string;
}

// Re-export domain types for convenience
export type { JiraIssue, JiraConfig, JiraAccount } from '../../domain';
export type { JiraWorklog, JiraWorklogPeriod } from '../../domain';
