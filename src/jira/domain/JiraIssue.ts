/**
 * JiraIssue - Domain entity representing a Jira issue.
 * Pure domain model — no framework dependencies.
 */
export type JiraIssueStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl: string;
}

export interface JiraAssignee {
  accountId: string;
  displayName: string;
  avatarUrls: Record<string, string>;
}

export interface JiraIssueType {
  name: string;
  iconUrl: string;
  subtask?: boolean;
}

export interface JiraStatus {
  name: string;
  statusCategory: {
    colorName: string;
    key: 'new' | 'indeterminate' | 'done';
  };
}

export interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
  issuetype: JiraIssueType;
  priority: JiraPriority;
  assignee: JiraAssignee | null;
  labels: string[];
  updated: string;
  created: string;
  description?: unknown; // ADF format
  [key: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

/**
 * Extracts the issue number from a key like "PROJ-123".
 */
export function extractIssueNumber(key: string): string {
  const match = key.match(/-(\d+)$/);
  return match ? match[1] : key;
}

/**
 * Extracts the project prefix from a key like "PROJ-123".
 */
export function extractProjectPrefix(key: string): string {
  const match = key.match(/^([A-Z]+-\d+)$/);
  return match ? key.replace(/-\d+$/, '') : '';
}

/**
 * Determines if an issue is in a "done" status based on status category.
 */
export function isIssueDone(issue: JiraIssue): boolean {
  return issue.fields.status.statusCategory.key === 'done';
}

/**
 * Determines if an issue is a subtask.
 */
export function isSubtask(issue: JiraIssue): boolean {
  return issue.fields.issuetype.subtask === true;
}

/**
 * Gets a display-friendly status name.
 */
export function getStatusName(issue: JiraIssue): string {
  return issue.fields.status.name;
}

/**
 * Gets the issue type name.
 */
export function getIssueTypeName(issue: JiraIssue): string {
  return issue.fields.issuetype.name;
}
