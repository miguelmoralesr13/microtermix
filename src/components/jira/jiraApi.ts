// ── Jira REST API v3 helper ────────────────────────────────────────────────────

export const JIRA_CONFIG_KEY = 'microtermix-jira-config';
export const JIRA_ACCOUNTS_KEY = 'microtermix-jira-accounts';
export const JIRA_ACTIVE_KEY = 'microtermix-jira-active';

// ── Multi-account types (JiraConfig declared below — TS resolves at compile time) ──

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
let _logSeq = Date.now(); // Use timestamp as base to avoid duplicate keys after hot-reload

export const jiraApiLog = {
    on(fn: LogListener) { _logListeners.push(fn); },
    off(fn: LogListener) { _logListeners = _logListeners.filter(l => l !== fn); },
    emit(entry: JiraApiLogEntry) { _logListeners.forEach(l => l(entry)); },
};

export interface JiraConfig {
    baseUrl: string;         // https://company.atlassian.net
    email: string;
    apiToken: string;
    defaultProject: string;  // Default for creating issues
    defaultIssueType: string;
    defaultAssigneeId: string;
    defaultPriority: string;
    defaultLabels: string[];
    customFields: Record<string, any>;

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

export const emptyConfig = (): JiraConfig => ({
    baseUrl: '', email: '', apiToken: '',
    defaultProject: '', defaultIssueType: 'Story', defaultAssigneeId: '', defaultPriority: 'Medium', defaultLabels: [],
    customFields: {},
    level1Project: '', level1Type: 'Epic', level1Label: 'Portfolio',
    level2Project: '', level2Type: 'Business Story', level2Label: 'Business',
    level3Project: '', level3Type: 'Story', level3Label: 'Technical',
    level4Project: '', level4Type: 'Task', level4Label: 'Tasks',
    activityFieldId: '', activityId: '', activityValue: 'Development',
    releasedStatuses: ['Released', 'Discarded'],
    tempoToken: '',
});

// ── Account management ────────────────────────────────────────────────────────

export function loadAccounts(): JiraAccount[] {
    try {
        const raw = localStorage.getItem(JIRA_ACCOUNTS_KEY);
        if (raw) return JSON.parse(raw) as JiraAccount[];
        // Migrate from old single-config format
        const oldRaw = localStorage.getItem(JIRA_CONFIG_KEY);
        if (oldRaw) {
            const cfg = { ...emptyConfig(), ...JSON.parse(oldRaw) };
            if (cfg.baseUrl) {
                const accounts: JiraAccount[] = [{ id: crypto.randomUUID(), name: 'Default', config: cfg }];
                localStorage.setItem(JIRA_ACCOUNTS_KEY, JSON.stringify(accounts));
                return accounts;
            }
        }
        return [];
    } catch {
        return [];
    }
}

export function saveAccounts(accounts: JiraAccount[]): void {
    localStorage.setItem(JIRA_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getActiveAccountId(): string | null {
    return localStorage.getItem(JIRA_ACTIVE_KEY);
}

export function setActiveAccountId(id: string | null): void {
    if (id) localStorage.setItem(JIRA_ACTIVE_KEY, id);
    else localStorage.removeItem(JIRA_ACTIVE_KEY);
}

export function addJiraAccount(name: string, config: JiraConfig): JiraAccount {
    const accounts = loadAccounts();
    const newAcc: JiraAccount = { id: crypto.randomUUID(), name, config };
    accounts.push(newAcc);
    saveAccounts(accounts);
    setActiveAccountId(newAcc.id);
    return newAcc;
}

export function updateJiraAccount(id: string, patch: Partial<Pick<JiraAccount, 'name' | 'config'>>): void {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
        accounts[idx] = { ...accounts[idx], ...patch };
        saveAccounts(accounts);
    }
}

export function removeJiraAccount(id: string): void {
    let accounts = loadAccounts();
    accounts = accounts.filter(a => a.id !== id);
    saveAccounts(accounts);
    // If we removed the active account, switch to first remaining
    if (getActiveAccountId() === id) {
        setActiveAccountId(accounts[0]?.id ?? null);
    }
}

export function loadConfig(): JiraConfig {
    const accounts = loadAccounts();
    const activeId = getActiveAccountId();
    const account = accounts.find(a => a.id === activeId) ?? accounts[0];
    return account ? { ...emptyConfig(), ...account.config } : emptyConfig();
}

export function saveConfig(cfg: JiraConfig): void {
    const accounts = loadAccounts();
    const activeId = getActiveAccountId();
    const idx = accounts.findIndex(a => a.id === activeId);
    if (idx >= 0) {
        accounts[idx] = { ...accounts[idx], config: cfg };
        saveAccounts(accounts);
    } else {
        const newAcc: JiraAccount = { id: crypto.randomUUID(), name: 'Default', config: cfg };
        accounts.push(newAcc);
        saveAccounts(accounts);
        setActiveAccountId(newAcc.id);
    }
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

/** Test connection using the provided config directly (without requiring a prior save). */
export async function testConnectionWith(cfg: JiraConfig): Promise<{ displayName: string; accountId: string; avatarUrls: Record<string, string> }> {
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) {
        throw new Error('Completa la URL base, email y API token antes de probar.');
    }
    const token = btoa(`${cfg.email}:${cfg.apiToken}`);
    const fullUrl = `${cfg.baseUrl.replace(/\/$/, '')}/rest/api/3/myself`;
    const res = await fetch(fullUrl, {
        headers: {
            'Authorization': `Basic ${token}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        let text = '';
        try { text = await res.text(); } catch { }
        throw new Error(`Jira ${res.status}: ${text || res.statusText}`);
    }
    const text = await res.text();
    return JSON.parse(text);
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

export async function getIssueTypes(projectKey: string): Promise<{ id: string; name: string; iconUrl: string; subtask: boolean }[]> {
    const data = await jiraFetch(`/project/${projectKey}`);
    return (data.issueTypes ?? []).map((t: any) => ({ id: t.id, name: t.name, iconUrl: t.iconUrl, subtask: !!t.subtask }));
}

export async function getActivityOptions(projectKey: string): Promise<{ id: string; value: string }[]> {
    const cfg = loadConfig();
    if (!cfg.activityFieldId) return [];

    try {
        // First find the best issue type to use for createmeta
        const types = await getIssueTypes(projectKey);
        const targetType = cfg.level4Type || cfg.taskType || 'Task';

        // Find by exact name, or fallback to first sub-task if our target isn't found
        let bestType = types.find(t => t.name.toLowerCase() === targetType.toLowerCase());
        if (!bestType) bestType = types.find(t => t.subtask); // Try any sub-task type
        if (!bestType) bestType = types[0]; // Desperation fallback

        if (!bestType) return [];

        const taskTypeName = encodeURIComponent(bestType.name);
        const data = await jiraFetch(
            `/issue/createmeta?projectKeys=${projectKey}&issuetypeNames=${taskTypeName}&expand=projects.issuetypes.fields`,
        );
        const fields = data?.projects?.[0]?.issuetypes?.[0]?.fields;
        if (!fields) return [];

        const val = fields[cfg.activityFieldId]?.allowedValues ?? [];
        return val.map((v: any) => ({
            id: String(v.id),
            value: String(v.value),
        }));
    } catch (e) {
        console.error('[getActivityOptions] Error:', e);
        return [];
    }
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
        issuetype: { name: string; iconUrl: string; subtask?: boolean };
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

export async function getLastWorkingIssue(parentKey?: string): Promise<JiraIssue | null> {
    let jql = 'assignee = currentUser() AND status = "Working"';
    if (parentKey) {
        jql += ` AND parent = "${parentKey}"`;
    }
    jql += ' ORDER BY updated DESC';
    const issues = await searchIssues(jql, 1);
    return issues.length > 0 ? issues[0] : null;
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
    const storyType = cfg.level3Type || cfg.storyType || 'Story';
    const proj = cfg.level3Project || cfg.storiesProject || cfg.defaultProject;
    const jql = `project = "${proj}" AND issuetype = "${storyType}" AND (parent = "${epicKey}" OR "Epic Link" = "${epicKey}" OR issue in linkedIssues("${epicKey}")) ORDER BY updated DESC`;
    return searchIssues(jql, 100);
}

export async function getBusinessStoriesByEpic(epicKey: string): Promise<JiraIssue[]> {
    const cfg = loadConfig();
    const businessStoryType = cfg.businessStoryType || 'Business Story';
    const proj = cfg.storiesProject || cfg.defaultProject;
    const jql = `project = "${proj}" AND issuetype = "${businessStoryType}" AND (parent = "${epicKey}" OR "Epic Link" = "${epicKey}") ORDER BY updated DESC`;
    return searchIssues(jql, 100);
}

export async function getTechnicalStoriesByBusinessStory(businessKey: string): Promise<JiraIssue[]> {
    const cfg = loadConfig();
    const storyType = cfg.storyType || 'Story';
    const proj = cfg.storiesProject || cfg.defaultProject;
    // Use linkedIssues because Technical Stories are linked to Business Stories via issue links, not standard hierarchy
    const jql = `project = "${proj}" AND issuetype = "${storyType}" AND issue in linkedIssues("${businessKey}") ORDER BY updated DESC`;
    console.log(`[getTechnicalStoriesByBusinessStory] JQL: ${jql}`);
    return searchIssues(jql, 100);
}

export async function getLinkedDefects(parentKey: string): Promise<JiraIssue[]> {
    const cfg = loadConfig();
    const projects = (cfg.defectProjects ?? []).map(p => p.trim().toUpperCase()).filter(Boolean);
    const defectType = (cfg.defectType ?? '').trim();

    let jql = `issue in linkedIssues("${parentKey}")`;

    if (projects.length > 0) {
        jql += ` AND project in (${projects.join(',')})`;
    }

    if (defectType) {
        jql += ` AND issuetype = "${defectType}"`;
    }

    jql += ` ORDER BY updated DESC`;

    console.log(`[getLinkedDefects] JQL: ${jql}`);

    try {
        const result = await searchIssues(jql, 100);
        console.log(`[getLinkedDefects] result: ${result.length} issues`, result.map(i => i.key));
        return result;
    } catch (e: any) {
        // If linkedIssues() JQL function is not supported, fall back to issuelinks approach
        console.warn(`[getLinkedDefects] JQL error (linkedIssues may not be supported): ${e?.message}`);
        // Fallback: search for defects in configured projects that ARE linked to the parent
        const fallbackJql = projects.length > 0
            ? `project in (${projects.join(',')}) ${defectType ? `AND issuetype = "${defectType}"` : ''} AND issuekey in linkedIssues("${parentKey}") ORDER BY updated DESC`
            : '';
        if (fallbackJql) {
            console.log(`[getLinkedDefects] Fallback JQL: ${fallbackJql}`);
            return searchIssues(fallbackJql, 100).catch(() => []);
        }
        return [];
    }
}

export function isReleased(issue: JiraIssue): boolean {
    const cfg = loadConfig();
    const statuses = (cfg.releasedStatuses ?? ['Released', 'Discarded']).map(s => s.toLowerCase().trim());
    return statuses.includes(issue.fields.status.name.toLowerCase());
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
    const parentProj = parentKey.split('-')[0];
    const fields: Record<string, any> = {
        project: { key: parentProj },
        issuetype: { name: cfg.level4Type || cfg.taskType || 'Task' },
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
    assignees?: string[];    // 'me' | 'unassigned' | accountId
    issueTypes?: string[];
    statuses?: string[];
    priorities?: string[];
    labels?: string[];
    epicKeys?: string[];
    text?: string;
}

export async function getBoardIssues(projectKey: string, filter: BoardFilter = {}): Promise<JiraIssue[]> {
    const parts: string[] = [`project = "${projectKey}"`];

    if (filter.assignees?.length) {
        const clauses: string[] = [];
        if (filter.assignees.includes('me')) clauses.push('assignee = currentUser()');
        if (filter.assignees.includes('unassigned')) clauses.push('assignee is EMPTY');
        const ids = filter.assignees.filter(a => a !== 'me' && a !== 'unassigned');
        if (ids.length) clauses.push(`assignee in (${ids.map(id => `"${id}"`).join(',')})`);
        if (clauses.length) parts.push(`(${clauses.join(' OR ')})`);
    }
    if (filter.issueTypes?.length)
        parts.push(`issuetype in (${filter.issueTypes.map(t => `"${t}"`).join(',')})`);
    if (filter.statuses?.length)
        parts.push(`status in (${filter.statuses.map(s => `"${s}"`).join(',')})`);
    if (filter.priorities?.length)
        parts.push(`priority in (${filter.priorities.map(p => `"${p}"`).join(',')})`);
    if (filter.labels?.length)
        parts.push(`labels in (${filter.labels.map(l => `"${l}"`).join(',')})`);
    if (filter.epicKeys?.length)
        parts.push(`(parent in (${filter.epicKeys.map(k => `"${k}"`).join(',')}) OR "Epic Link" in (${filter.epicKeys.map(k => `"${k}"`).join(',')}))`);
    if (filter.text?.trim()) {
        const t = filter.text.trim();
        parts.push(/^[A-Z]+-\d+$/i.test(t) ? `(summary ~ "${t}" OR key = "${t.toUpperCase()}")` : `summary ~ "${t}"`);
    }

    return searchIssues(parts.join(' AND ') + ' ORDER BY updated DESC', 100);
}

export async function getProjectStatuses(projectKey: string): Promise<string[]> {
    const data = await jiraFetch(`/project/${projectKey}/statuses`);
    const set = new Set<string>();
    for (const type of data ?? []) for (const s of type.statuses ?? []) set.add(s.name);
    return [...set].sort();
}

export async function addComment(issueKey: string, text: string): Promise<void> {
    const paragraphs = text.split('\n').map(line => ({
        type: 'paragraph',
        content: line.trim() ? [{ type: 'text', text: line }] : [],
    }));
    await jiraFetch(`/issue/${issueKey}/comment`, {
        method: 'POST',
        body: JSON.stringify({ body: { type: 'doc', version: 1, content: paragraphs } }),
    });
}

export async function uploadAttachment(issueKey: string, files: File[]): Promise<void> {
    const cfg = loadConfig();
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) throw new Error('Jira not configured.');
    const token = btoa(`${cfg.email}:${cfg.apiToken}`);
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${issueKey}/attachments`;
    for (const file of files) {
        const form = new FormData();
        form.append('file', file, file.name);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${token}`, 'X-Atlassian-Token': 'no-check' },
            body: form,
        });
        if (!res.ok) {
            const msg = await res.text().catch(() => '');
            throw new Error(`Error subiendo ${file.name}: ${msg}`);
        }
    }
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
    let results = data.results ?? [];
    if (authorAccountId) {
        results = results.filter((r: any) => r.author?.accountId === authorAccountId);
    }
    return results.map((r: any): TempoWorklogEntry => ({
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
