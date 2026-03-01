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
    tempoToken: string;
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
    tempoToken: '',
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

const mediaCache = new Map<string, string>();

export async function getJiraMediaUrl(url: string): Promise<string> {
    if (mediaCache.has(url)) return mediaCache.get(url)!;

    const cfg = loadConfig();
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) throw new Error('Jira not configured.');
    const token = btoa(`${cfg.email}:${cfg.apiToken}`);
    const res = await fetch(url, {
        headers: { 'Authorization': `Basic ${token}` },
    });
    if (!res.ok) throw new Error(`Media fetch failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const type = res.headers.get('content-type') || 'application/octet-stream';
    const blob = new Blob([buffer], { type });
    const objectUrl = URL.createObjectURL(blob);
    mediaCache.set(url, objectUrl);
    return objectUrl;
}

// ── API methods ───────────────────────────────────────────────────────────────

export async function testConnection(): Promise<{ displayName: string; accountId: string; avatarUrls: Record<string, string> }> {
    return jiraFetch('/myself');
}

// ── Tempo REST API v4 helper ──────────────────────────────────────────────

async function tempoFetch(path: string, opts?: RequestInit): Promise<any> {
    const cfg = loadConfig();
    if (!cfg.tempoToken) throw new Error('Tempo token not configured. Go to Jira Settings.');

    const method = (opts?.method ?? 'GET').toUpperCase();
    const fullUrl = `https://api.tempo.io/4${path}`;
    const bodyStr = opts?.body ? String(opts.body) : undefined;

    const curlParts = [
        `curl -s -X ${method}`,
        `'${fullUrl}'`,
        `-H 'Authorization: Bearer <TOKEN>'`,
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
                'Authorization': `Bearer ${cfg.tempoToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...(opts?.headers ?? {}),
            },
        });
        const durationMs = Date.now() - t0;
        const text = await res.text();
        if (!res.ok) {
            jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: false, curl, error: text });
            throw new Error(`Tempo ${res.status}: ${text}`);
        }
        jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: true, curl });
        if (!text) return {};
        try { return JSON.parse(text); } catch { return {}; }
    } catch (e: any) {
        const durationMs = Date.now() - t0;
        if (!String(e?.message).startsWith('Tempo ')) {
            jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, durationMs, ok: false, curl, error: e?.message });
        }
        console.error('[Tempo] Fetch Error:', e);
        throw new Error(e?.message || 'Error de conexión con Tempo.');
    }
}

export async function getProjects(): Promise<{ key: string; name: string; id: string }[]> {
    const data = await jiraFetch('/project/search?maxResults=50&orderBy=name');
    return (data.values ?? []).map((p: any) => ({ key: p.key, name: p.name, id: p.id }));
}

export async function getIssueTypes(projectKey: string): Promise<{ id: string; name: string; iconUrl: string }[]> {
    const data = await jiraFetch(`/project/${projectKey}`);
    return (data.issueTypes ?? []).map((t: any) => ({ id: t.id, name: t.name, iconUrl: t.iconUrl }));
}

export async function getActivityOptions(projectKey: string): Promise<{ id: string; value: string }[]> {
    const cfg = loadConfig();
    if (!cfg.activityFieldId) return [];
    const taskType = encodeURIComponent(cfg.taskType || 'Task');
    const data = await jiraFetch(
        `/issue/createmeta?projectKeys=${projectKey}&issuetypeNames=${taskType}&expand=projects.issuetypes.fields`,
    );
    const fields = data?.projects?.[0]?.issuetypes?.[0]?.fields;
    if (!fields) return [];
    return (fields[cfg.activityFieldId]?.allowedValues ?? []).map((v: any) => ({
        id: String(v.id),
        value: String(v.value),
    }));
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
        assignee: { accountId: string; displayName: string; avatarUrls: Record<string, string> } | null;
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

/** Creates a sub-task under parentKey.
 *  Pass `activity` to set an explicit activity value (e.g. from git flow config).
 *  Without it, the activity is inherited from the parent story. */
export async function createSubTask(
    parentKey: string,
    summary: string,
    description?: string,
    activity?: { id: string; value: string },
): Promise<{ id: string; key: string }> {
    const cfg = loadConfig();
    const fields: Record<string, any> = {
        project: { key: cfg.storiesProject || cfg.defaultProject },
        issuetype: { name: cfg.taskType || 'Task' },
        parent: { key: parentKey },
        summary,
    };
    if (cfg.defaultAssigneeId) fields.assignee = { accountId: cfg.defaultAssigneeId };
    if (cfg.activityFieldId) {
        if (activity?.value) {
            const act: Record<string, string> = { value: activity.value };
            if (activity.id) act.id = activity.id;
            fields[cfg.activityFieldId] = act;
        } else {
            // Inherit from parent story
            try {
                const parent = await jiraFetch(`/issue/${parentKey}?fields=${cfg.activityFieldId}`);
                const parentActivity = parent?.fields?.[cfg.activityFieldId];
                if (parentActivity?.value) {
                    const act: Record<string, string> = { value: parentActivity.value };
                    if (parentActivity.id) act.id = String(parentActivity.id);
                    fields[cfg.activityFieldId] = act;
                }
            } catch {
                // Can't read parent — skip activity field
            }
        }
    }
    if (description?.trim()) {
        fields.description = {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }],
        };
    }
    return createIssue(fields);
}

/** Finds the transition for the given target status name (or transition name) and applies it.
 *  Optionally sends a comment and/or extra fields with the transition. */
export async function transitionIssue(
    issueKey: string,
    targetStatusName: string,
    comment?: string,
    fields?: Record<string, any>
): Promise<void> {
    const data = await jiraFetch(`/issue/${issueKey}/transitions`);
    const all: any[] = data.transitions ?? [];
    const needle = targetStatusName.toLowerCase().trim();

    const transition = all.find((t: any) =>
        t.name?.toLowerCase().trim() === needle ||
        t.to?.name?.toLowerCase().trim() === needle ||
        t.to?.id?.toLowerCase?.()?.trim() === needle
    );

    if (!transition) {
        const available = all.map((t: any) => `"${t.name}" → "${t.to?.name}"`).join(' | ');
        throw new Error(
            `Transición "${targetStatusName}" no encontrada en ${issueKey}. ` +
            `Disponibles: ${available || 'ninguna'}`
        );
    }

    const body: Record<string, any> = { transition: { id: transition.id } };
    if (comment?.trim()) {
        body.update = {
            comment: [{
                add: {
                    body: {
                        type: 'doc', version: 1,
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment.trim() }] }],
                    },
                },
            }],
        };
    }
    if (fields && Object.keys(fields).length > 0) {
        body.fields = fields;
    }

    await jiraFetch(`/issue/${issueKey}/transitions`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export interface JiraTransition {
    id: string;
    name: string;
    toName: string;
    toColor: string;
    /** Required fields for this transition (from expand=transitions.fields) */
    fields?: Record<string, {
        required: boolean;
        name: string;
        schema?: { type: string };
        allowedValues?: { id: string; name: string }[];
    }>;
}

/** Returns the available transitions for an issue (what you can move it to). */
export async function getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const data = await jiraFetch(`/issue/${issueKey}/transitions?expand=transitions.fields`);
    return (data.transitions ?? []).map((t: any) => ({
        id: t.id,
        name: t.name ?? '',
        toName: t.to?.name ?? '',
        toColor: t.to?.statusCategory?.colorName ?? 'default',
        fields: t.fields ?? {},
    }));
}

/** Assigns an issue to a user by accountId. Pass null to unassign. */
export async function assignIssue(issueKey: string, accountId: string | null): Promise<void> {
    await jiraFetch(`/issue/${issueKey}/assignee`, {
        method: 'PUT',
        body: JSON.stringify({ accountId }),
    });
}

// ── Rich Issue Detail ─────────────────────────────────────────────────────────

export interface JiraComment {
    id: string;
    author: { displayName: string; avatarUrls: Record<string, string> };
    body: any; // ADF or string
    created: string;
    updated: string;
}

export interface JiraAttachment {
    id: string;
    filename: string;
    mimeType: string;
    content: string;  // URL
    thumbnail?: string;
    size: number;
}

export interface JiraIssueDetail extends JiraIssue {
    comments: JiraComment[];
    attachments: JiraAttachment[];
}

// ── Tempo types ────────────────────────────────────────────────────────────

export interface TempoWorklogEntry {
    tempoWorklogId: number;
    issue: { id: number; key?: string };
    timeSpentSeconds: number;
    startDate: string;   // "YYYY-MM-DD"
    startTime: string;   // "HH:MM:SS"
    description?: string;
    author: { accountId: string };
}

export async function getIssueDetail(issueKey: string): Promise<JiraIssueDetail> {
    const data = await jiraFetch(
        `/issue/${issueKey}?fields=summary,status,issuetype,priority,assignee,labels,description,comment,attachment,updated,created`
    );
    const fields = data.fields ?? {};
    return {
        ...data,
        fields,
        comments: (fields.comment?.comments ?? []).map((c: any) => ({
            id: c.id,
            author: c.author,
            body: c.body,
            created: c.created,
            updated: c.updated,
        })),
        attachments: (fields.attachment ?? []).map((a: any) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            content: a.content,
            thumbnail: a.thumbnail,
            size: a.size,
        })),
    };
}

/** Enhanced board search: supports assignee, issueType, and multi-status filters */
export interface BoardFilter {
    assignee?: 'me' | 'unassigned' | '';   // '' = any
    issueType?: string;
    statuses?: string[];                    // multi-select; empty = all
    text?: string;
}

export async function getBoardIssues(projectKey: string, filter: BoardFilter = {}): Promise<JiraIssue[]> {
    const parts: string[] = [`project = "${projectKey}"`];

    if (filter.assignee === 'me') parts.push('assignee = currentUser()');
    else if (filter.assignee === 'unassigned') parts.push('assignee is EMPTY');

    if (filter.issueType) parts.push(`issuetype = "${filter.issueType}"`);

    if (filter.statuses && filter.statuses.length > 0) {
        const list = filter.statuses.map(s => `"${s}"`).join(', ');
        parts.push(`status in (${list})`);
    }

    if (filter.text?.trim()) {
        const t = filter.text.trim();
        if (/^[A-Z]+-\d+$/i.test(t)) parts.push(`(summary ~ "${t}" OR key = "${t.toUpperCase()}")`);
        else parts.push(`summary ~ "${t}"`);
    }

    return searchIssues(parts.join(' AND ') + ' ORDER BY updated DESC', 100);
}

// ── Tempo API methods ─────────────────────────────────────────────────────

/**
 * Fetch all worklogs for a given date range and author.
 * from/to format: "YYYY-MM-DD"
 */
export async function getTempoWorklogs(
    from: string,
    to: string,
    authorAccountId?: string,
    issueId?: number,
): Promise<TempoWorklogEntry[]> {
    const params = new URLSearchParams({ from, to, limit: '200' });
    if (authorAccountId) params.set('authorAccountId', authorAccountId);
    if (issueId) params.set('issueId', String(issueId));
    const data = await tempoFetch(`/worklogs?${params.toString()}`);
    return (data.results ?? []).map((r: any): TempoWorklogEntry => ({
        tempoWorklogId: r.tempoWorklogId,
        issue: { id: r.issue?.id ?? 0, key: r.issue?.key },
        timeSpentSeconds: r.timeSpentSeconds ?? 0,
        startDate: r.startDate ?? '',
        startTime: r.startTime ?? '00:00:00',
        description: r.description,
        author: { accountId: r.author?.accountId ?? '' },
    }));
}

/**
 * Create a new Tempo worklog.
 * startDate: "YYYY-MM-DD", startTime: "HH:MM:SS"
 */
export async function logTempoWorklog(
    issueId: number,
    authorAccountId: string,
    timeSpentSeconds: number,
    startDate: string,
    startTime: string,
    description?: string,
): Promise<void> {
    const body: Record<string, any> = {
        issueId,
        authorAccountId,
        timeSpentSeconds,
        startDate,
        startTime,
    };
    if (description?.trim()) body.description = description.trim();
    await tempoFetch('/worklogs', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
