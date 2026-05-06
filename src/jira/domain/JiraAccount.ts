/**
 * JiraConfig - Domain entity representing Jira configuration.
 * Pure domain model — no framework dependencies.
 */
export interface JiraConfig {
  baseUrl: string;         // https://company.atlassian.net
  email: string;
  apiToken: string;
  defaultProject: string;  // Default for creating issues
  defaultIssueType: string;
  defaultAssigneeId: string;
  defaultPriority: string;
  defaultLabels: string[];
  customFields: Record<string, unknown>;

  // Extensible Hierarchy Config
  level1Project: string; level1Type: string; level1Label: string;
  level2Project: string; level2Type: string; level2Label: string;
  level3Project: string; level3Type: string; level3Label: string;
  level4Project: string; level4Type: string; level4Label: string;

  defectType?: string;
  defectProjects?: string[];
  activityFieldId: string;
  activityId: string;
  activityValue: string;
  releasedStatuses: string[];
  tempoToken: string;

  // Legacy/Fallback fields
  taskType?: string;
  epicType?: string;
  storyType?: string;
  businessStoryType?: string;
  storiesProject?: string;
}

export interface JiraAccount {
  id: string;
  name: string;
  config: JiraConfig;
}

export function createEmptyConfig(): JiraConfig {
  return {
    baseUrl: '',
    email: '',
    apiToken: '',
    defaultProject: '',
    defaultIssueType: 'Story',
    defaultAssigneeId: '',
    defaultPriority: 'Medium',
    defaultLabels: [],
    customFields: {},
    level1Project: '',
    level1Type: 'Epic',
    level1Label: 'Portfolio',
    level2Project: '',
    level2Type: 'Business Story',
    level2Label: 'Business',
    level3Project: '',
    level3Type: 'Story',
    level3Label: 'Technical',
    level4Project: '',
    level4Type: 'Task',
    level4Label: 'Tasks',
    activityFieldId: '',
    activityId: '',
    activityValue: 'Development',
    releasedStatuses: ['Released', 'Discarded'],
    tempoToken: '',
  };
}
