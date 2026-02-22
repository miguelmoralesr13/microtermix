// ── Jira REST API v3 helper ────────────────────────────────────────────────────

export const JIRA_CONFIG_KEY = 'nexus-jira-config';

export interface JiraConfig {
    baseUrl: string;         // https://company.atlassian.net
    email: string;
    apiToken: string;
    defaultProject: string;  // project key, e.g. "NCPPPMC"
    defaultIssueType: string; // "Story" | "Bug" | "Task"
    defaultAssigneeId: string; // account id
    defaultPriority: string;   // "Medium"
    defaultLabels: string[];
    defaultSprint?: string;    // sprint id
    // Arbitrary extra custom fields to always send: { customfield_XXXXX: value }
    customFields: Record<string, any>;
}

export const emptyConfig = (): JiraConfig => ({
    baseUrl: '',
    email: '',
    apiToken: '',
    defaultProject: '',
    defaultIssueType: 'Story',
    defaultAssigneeId: '',
    defaultPriority: 'Medium',
    defaultLabels: [],
    customFields: {},
});

export function loadConfig(): JiraConfig {
    try {
        const raw = localStorage.getItem(JIRA_CONFIG_KEY);
        if (!raw) return emptyConfig();
        return { ...emptyConfig(), ...JSON.parse(raw) };
    } catch {
        return emptyConfig();
    }
}

export function saveConfig(cfg: JiraConfig): void {
    localStorage.setItem(JIRA_CONFIG_KEY, JSON.stringify(cfg));
}

// ── Base fetch ────────────────────────────────────────────────────────────────

async function jiraFetch(path: string, opts?: RequestInit): Promise<any> {
    const cfg = loadConfig();
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) {
        throw new Error('Jira not configured. Go to Settings.');
    }
    const token = btoa(`${cfg.email}:${cfg.apiToken}`);
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/rest/api/3${path}`, {
        ...opts,
        headers: {
            'Authorization': `Basic ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(opts?.headers ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Jira ${res.status}: ${text}`);
    }
    return res.json();
}

// ── API methods ───────────────────────────────────────────────────────────────

export async function testConnection(): Promise<{ displayName: string; accountId: string; avatarUrls: Record<string, string> }> {
    return jiraFetch('/myself');
}

export async function getProjects(): Promise<{ key: string; name: string; id: string }[]> {
    const data = await jiraFetch('/project/search?maxResults=50&orderBy=name');
    return (data.values ?? []).map((p: any) => ({ key: p.key, name: p.name, id: p.id }));
}

export async function getIssueTypes(projectKey: string): Promise<{ id: string; name: string; iconUrl: string }[]> {
    const data = await jiraFetch(`/project/${projectKey}`);
    return (data.issueTypes ?? []).map((t: any) => ({ id: t.id, name: t.name, iconUrl: t.iconUrl }));
}

export async function getPriorities(): Promise<{ id: string; name: string; iconUrl: string }[]> {
    return jiraFetch('/priority');
}

export async function getUsers(projectKey: string): Promise<{ accountId: string; displayName: string; avatarUrls: Record<string, string> }[]> {
    return jiraFetch(`/user/assignable/search?project=${projectKey}&maxResults=50`);
}

export interface JiraIssue {
    id: string;
    key: string;
    fields: {
        summary: string;
        status: { name: string; statusCategory: { colorName: string } };
        issuetype: { name: string; iconUrl: string };
        priority: { name: string; iconUrl: string };
        assignee: { displayName: string; avatarUrls: Record<string, string> } | null;
        labels: string[];
        updated: string;
        created: string;
        description?: any;
        [key: string]: any;
    };
}

export async function searchIssues(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    const data = await jiraFetch('/search', {
        method: 'POST',
        body: JSON.stringify({
            jql,
            maxResults,
            fields: ['summary', 'status', 'issuetype', 'priority', 'assignee', 'labels', 'updated', 'created', 'description'],
        }),
    });
    return data.issues ?? [];
}

export async function getMyIssues(): Promise<JiraIssue[]> {
    return searchIssues('assignee = currentUser() ORDER BY updated DESC');
}

export async function getProjectIssues(projectKey: string, statusFilter?: string): Promise<JiraIssue[]> {
    let jql = `project = ${projectKey} ORDER BY updated DESC`;
    if (statusFilter) jql = `project = ${projectKey} AND status = "${statusFilter}" ORDER BY updated DESC`;
    return searchIssues(jql);
}

export async function createIssue(fields: Record<string, any>): Promise<{ id: string; key: string }> {
    return jiraFetch('/issue', { method: 'POST', body: JSON.stringify({ fields }) });
}

export async function getIssue(key: string): Promise<JiraIssue> {
    return jiraFetch(`/issue/${key}`);
}

// Color helper for Jira status categories
export function statusColor(colorName: string): string {
    const map: Record<string, string> = {
        'blue-grey': '#64748b',
        'yellow': '#eab308',
        'green': '#22c55e',
        'red': '#ef4444',
        'medium-gray': '#6b7280',
    };
    return map[colorName] ?? '#64748b';
}
