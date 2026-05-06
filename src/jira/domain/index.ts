/**
 * Jira Domain - Pure domain entities and business logic.
 *
 * This module contains the core business entities for the Jira integration.
 * No framework dependencies.
 */

// Jira Account & Config
export {
  createEmptyConfig,
} from './JiraAccount';
export type {
  JiraConfig,
  JiraAccount,
} from './JiraAccount';

// Jira Issues
export {
  extractIssueNumber,
  extractProjectPrefix,
  isIssueDone,
  isSubtask,
  getStatusName,
  getIssueTypeName,
} from './JiraIssue';
export type {
  JiraIssue,
  JiraIssueFields,
  JiraIssueType,
  JiraIssueStatus,
  JiraStatus,
  JiraPriority,
  JiraAssignee,
} from './JiraIssue';

// Jira Worklogs (Tempo)
export {
  calculateTotalSeconds,
  formatDuration,
  groupWorklogsByDate,
  parseTimeSpent,
} from './JiraWorklog';
export type {
  JiraWorklog,
  JiraWorklogAuthor,
  JiraWorklogPeriod,
} from './JiraWorklog';
