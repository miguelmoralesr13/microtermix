/**
 * JiraWorklog - Domain entity representing a Tempo worklog entry.
 * Pure domain model — no framework dependencies.
 */
export interface JiraWorklogAuthor {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface JiraWorklog {
  id: string;
  issueKey: string;
  author: JiraWorklogAuthor;
  timeSpent: string;      // e.g., "2h 30m"
  timeSpentSeconds: number;
  started: string;        // ISO date string
  createdAt: string;
  updatedAt: string;
  description?: string;
  attributes?: Record<string, string>;
}

export interface JiraWorklogPeriod {
  startDate: string;
  endDate: string;
  worklogs: JiraWorklog[];
}

/**
 * Calculates total time spent in seconds for a list of worklogs.
 */
export function calculateTotalSeconds(worklogs: JiraWorklog[]): number {
  return worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);
}

/**
 * Formats seconds into a human-readable string like "2h 30m".
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Groups worklogs by date (YYYY-MM-DD).
 */
export function groupWorklogsByDate(worklogs: JiraWorklog[]): Record<string, JiraWorklog[]> {
  const grouped: Record<string, JiraWorklog[]> = {};

  for (const worklog of worklogs) {
    const date = worklog.started.split('T')[0]; // Extract YYYY-MM-DD
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(worklog);
  }

  return grouped;
}

/**
 * Parses a time spent string like "2h 30m" into seconds.
 */
export function parseTimeSpent(timeSpent: string): number {
  const hoursMatch = timeSpent.match(/(\d+)h/);
  const minutesMatch = timeSpent.match(/(\d+)m/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;

  return hours * 3600 + minutes * 60;
}
