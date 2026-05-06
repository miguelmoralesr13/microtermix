/**
 * Jira Clean Architecture module.
 *
 * Layers:
 * - domain/      : Pure entities, value objects, domain rules
 * - application/  : Ports (interfaces) and use cases
 * - infrastructure/ : Adapters implementing ports
 * - ui/          : React components and hooks
 */

// Domain
export type {
  JiraConfig,
  JiraAccount,
  JiraIssue,
  JiraIssueFields,
  JiraIssueType,
  JiraIssueStatus,
  JiraStatus,
  JiraPriority,
  JiraAssignee,
} from './domain';
export type {
  JiraWorklog,
  JiraWorklogAuthor,
  JiraWorklogPeriod,
} from './domain';

export {
  createEmptyConfig,
  extractIssueNumber,
  extractProjectPrefix,
  isIssueDone,
  isSubtask,
  getStatusName,
  getIssueTypeName,
  calculateTotalSeconds,
  formatDuration,
  groupWorklogsByDate,
  parseTimeSpent,
} from './domain';

// Application ports
export type {
  JiraApiPort,
  TempoApiPort,
  TempoWorklogInput,
} from './application/ports';

// Infrastructure
export {
  TauriJiraAdapter,
  TauriTempoAdapter,
} from './infrastructure/TauriJiraAdapter';

// UI Layer
export * from './ui';
