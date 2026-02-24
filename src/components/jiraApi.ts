// ── Jira REST API v3 helper ────────────────────────────────────────────────────

export const JIRA_CONFIG_KEY = 'nexus-jira-config';

// ── API Request Logger (event bus) ───────────────────────────────────────────
export interface JiraApiLogEntry {
    id: number;
    time: string;           // HH:MM:SS
    method: string;         // GET | POST | PUT …
    path: string;           // /rest/api/3/…
    url: string;            // full URL
    body?: string;          // JSON body if present
    status?: number;        // HTTP response status
    durationMs?: number;    // round-trip ms
    ok: boolean;
    curl: string;           // ready-to-copy curl command
    error?: string;
}

type LogListener = (entry: JiraApiLogEntry) => void;
let _logListeners: LogListener[] = [];
let _logSeq = 0;

export const jiraApiLog = {
    on(fn: LogListener) { _logListeners.push(fn); },
    off(fn: LogListener) { _logListeners = _logListeners.filter(l => l !== fn); },
    emit(entry: JiraApiLogEntry) { _logListeners.forEach(l => l(entry)); },
};

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
    // Hierarchy config for the 3-column Stories view
    storiesProject: string;      // project key to filter epics/stories/tasks
    epicType: string;            // issue type name for Business Stories (default: "Epic")
    storyType: string;           // issue type name for Technical Stories (default: "Story")
    taskType: string;            // issue type name for Tasks (default: "Task")
    activityFieldId: string;     // custom field ID for Type of Activity (e.g. "customfield_10115")
    activityId: string;          // option ID of the activity value (e.g. "10301")
    activityValue: string;       // label of the activity value (e.g. "Development")
    releasedStatuses: string[];  // statuses that trigger special color (e.g. ["Released", "Discarded"])
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
    storiesProject: '',
    epicType: 'Epic',
    storyType: 'Story',
    taskType: 'Task',
    activityFieldId: '',
    activityId: '',
    activityValue: 'Development',
    releasedStatuses: ['Released', 'Discarded'],
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

// ── Base fetch (Tauri Native Plugin to bypass CORS) ──────────────────────────
import { fetch } from '@tauri-apps/plugin-http';

async function jiraFetch(path: string, opts?: RequestInit): Promise<any> {
    const cfg = loadConfig();
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) {
        throw new Error('Jira not configured. Go to Settings.');
    }
    const token = btoa(`${cfg.email}:${cfg.apiToken}`);
    const method = (opts?.method ?? 'GET').toUpperCase();
    const fullUrl = `${cfg.baseUrl.replace(/\/$/, '')}/rest/api/3${path}`;
    const bodyStr = opts?.body ? String(opts.body) : undefined;

    // Build curl string (token redacted for safety)
    const curlParts = [
        `curl -s -X ${method}`,
        `'${fullUrl}'`,
        `-H 'Authorization: Basic <TOKEN>'`,
        `-H 'Accept: application/json'`,
        `-H 'Content-Type: application/json'`,
    ];
    if (bodyStr) curlParts.push(`-d '${bodyStr}'`);
    const curl = curlParts.join(' \\');

    const t0 = Date.now();
    const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = ++_logSeq;

    try {
        const res = await fetch(fullUrl, {
            ...opts,
            headers: {
                'Authorization': `Basic ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...(opts?.headers ?? {}),
            },
        });
        const durationMs = Date.now() - t0;
        if (!res.ok) {
            console.error('[Jira] Response not OK:', res.status);
            let text = '';
            try { text = await res.text(); } catch { }
            jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: false, curl, error: text });
            throw new Error(`Jira ${res.status}: ${text}`);
        }

        // Tauri's plugin-http JSON parsing sometimes lacks deep fallback types on errors
        const text = await res.text();
        jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: true, curl });
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch {
            return {};
        }
    } catch (e: any) {
        const durationMs = Date.now() - t0;
        if (!String(e?.message).startsWith('Jira ')) {
            // Only emit if not already emitted above
            jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, durationMs, ok: false, curl, error: e?.message });
        }
        console.error('[Jira] Fetch Error:', e);
        throw new Error(e?.message || (typeof e === 'string' ? e : 'Error desconocido de conexión.'));
    }
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
    const data = await jiraFetch('/search/jql', {
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

// ── Hierarchy API (Stories View) ───────────────────────────────────────────────

export async function getEpics(projectKey: string, search?: string): Promise<JiraIssue[]> {
    const cfg = loadConfig();
    const epicType = cfg.epicType || 'Epic';
    let jql = `project = "${projectKey}" AND issuetype = "${epicType}" ORDER BY updated DESC`;
    if (search) {
        const trimmed = search.trim();
        // If it matches a key pattern like PROJ-123, search by key too
        const keyPattern = /^[A-Z]+-\d+$/i.test(trimmed);
        if (keyPattern) {
            jql = `project = "${projectKey}" AND issuetype = "${epicType}" AND (summary ~ "${trimmed}" OR key = "${trimmed.toUpperCase()}") ORDER BY updated DESC`;
        } else {
            jql = `project = "${projectKey}" AND issuetype = "${epicType}" AND summary ~ "${trimmed}" ORDER BY updated DESC`;
        }
    }
    return searchIssues(jql, 50);
}

export async function getStoriesByEpic(epicKey: string): Promise<JiraIssue[]> {
    const cfg = loadConfig();
    const storyType = cfg.storyType || 'Story';
    const proj = cfg.storiesProject || cfg.defaultProject;
    const jql = `project = "${proj}" AND issuetype = "${storyType}" AND parent = "${epicKey}" ORDER BY updated DESC`;
    return searchIssues(jql, 100);
}

export async function getTasksByStory(storyKey: string): Promise<JiraIssue[]> {
    const cfg = loadConfig();
    const taskType = cfg.taskType || 'Task';
    const proj = cfg.storiesProject || cfg.defaultProject;
    const jql = `project = "${proj}" AND issuetype = "${taskType}" AND parent = "${storyKey}" ORDER BY created DESC`;
    return searchIssues(jql, 100);
}

/** Creates a sub-task under parentKey with auto-filled activity and assignee */
export async function createSubTask(parentKey: string, summary: string, description?: string): Promise<{ id: string; key: string }> {
    const cfg = loadConfig();
    const fields: Record<string, any> = {
        project: { key: cfg.storiesProject || cfg.defaultProject },
        issuetype: { name: cfg.taskType || 'Task' },
        parent: { key: parentKey },
        summary,
    };
    if (cfg.defaultAssigneeId) fields.assignee = { id: cfg.defaultAssigneeId };
    if (cfg.activityFieldId && cfg.activityValue) {
        const activity: Record<string, string> = { value: cfg.activityValue };
        if (cfg.activityId) activity.id = cfg.activityId;
        fields[cfg.activityFieldId] = activity;
    }
    if (description?.trim()) {
        fields.description = {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }],
        };
    }
    return createIssue(fields);
}

/** Finds the transition ID for the given status name and applies it */
export async function transitionIssue(issueKey: string, targetStatusName: string): Promise<void> {
    const transitions = await jiraFetch(`/issue/${issueKey}/transitions`);
    const transition = (transitions.transitions ?? []).find(
        (t: any) => t.name?.toLowerCase() === targetStatusName.toLowerCase() ||
            t.to?.name?.toLowerCase() === targetStatusName.toLowerCase()
    );
    if (!transition) {
        throw new Error(`Transición "${targetStatusName}" no encontrada en ${issueKey}. Verifica el nombre exacto del estado en Jira.`);
    }
    await jiraFetch(`/issue/${issueKey}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transition.id } }),
    });
}
