import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JenkinsConfig {
    id?: string;
    name?: string;
    baseUrl: string;
    user: string;
    token: string;
}

export type JenkinsJobColor =
    | 'blue'        // SUCCESS last build
    | 'blue_anime'  // SUCCESS + currently building
    | 'red'         // FAILURE last build
    | 'red_anime'   // FAILURE + currently building
    | 'yellow'      // UNSTABLE last build
    | 'yellow_anime'
    | 'grey'        // DISABLED / ABORTED
    | 'grey_anime'
    | 'disabled'
    | 'notbuilt'
    | 'notbuilt_anime'
    | 'aborted'
    | 'aborted_anime'
    | string;

export type JenkinsJobClass =
    | 'hudson.model.FreeStyleProject'
    | 'org.jenkinsci.plugins.workflow.job.WorkflowJob'
    | 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject'
    | 'com.cloudbees.hudson.plugins.folder.Folder'
    | string;

export type BuildResult = 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED' | null;

export interface JenkinsBuildSummary {
    number: number;
    url: string;
    result: BuildResult;
    duration: number;
    timestamp: number;
    building: boolean;
    displayName: string;
    estimatedDuration: number;
}

export interface JenkinsJobSummary {
    name: string;
    displayName?: string;
    fullName?: string;
    fullDisplayName?: string;
    url: string;
    color: JenkinsJobColor;
    _class: JenkinsJobClass;
    /** Present in multi-branch: child branch jobs */
    jobs?: JenkinsJobSummary[];
    lastBuild: JenkinsBuildSummary | null;
    lastSuccessfulBuild: JenkinsBuildSummary | null;
    lastFailedBuild: JenkinsBuildSummary | null;
}

export interface JenkinsBuildDetail extends JenkinsBuildSummary {
    fullDisplayName: string;
    description: string | null;
    causes: Array<{ shortDescription: string }>;
    changeSet: {
        items: Array<{
            commitId: string;
            author: { fullName: string };
            msg: string;
            timestamp: number;
        }>;
    };
}

// ── Pipeline Stage View (wfapi) ───────────────────────────────────────────────

export type StageStatus =
    | 'SUCCESS'
    | 'FAILED'
    | 'IN_PROGRESS'
    | 'PAUSED'
    | 'NOT_EXECUTED'
    | 'UNSTABLE'
    | 'ABORTED';

export interface PipelineStage {
    id: string;
    name: string;
    status: StageStatus;
    startTimeMillis: number;
    durationMillis: number;
    pauseDurationMillis: number;
    /** Nested stages (parallel branches) */
    stages?: PipelineStage[];
}

export interface PipelineRun {
    id: string;
    name: string;
    status: StageStatus;
    startTimeMillis: number;
    endTimeMillis: number;
    durationMillis: number;
    queueDurationMillis: number;
    pauseDurationMillis: number;
    stages: PipelineStage[];
}

export interface JenkinsProgressiveLog {
    text: string;
    /** Header X-Text-Size — offset to pass on next poll */
    textSize: number;
    moreData: boolean;
}

// ── API Request Logger ────────────────────────────────────────────────────────

export interface JenkinsApiLogEntry {
    id: number;
    time: string;
    method: string;
    path: string;
    url: string;
    status?: number;
    durationMs?: number;
    ok: boolean;
    error?: string;
    requestHeaders?: Record<string, string>;
    requestBody?: any;
    responseHeaders?: Record<string, string>;
    responseBody?: any;
    curl?: string;
}

type JenkinsLogListener = (e: JenkinsApiLogEntry) => void;
let _listeners: JenkinsLogListener[] = [];
let _seq = 0;

export const jenkinsApiLog = {
    on(fn: JenkinsLogListener) { _listeners.push(fn); },
    off(fn: JenkinsLogListener) { _listeners = _listeners.filter(l => l !== fn); },
    emit(e: JenkinsApiLogEntry) { _listeners.forEach(l => l(e)); },
};

// ── localStorage ──────────────────────────────────────────────────────────────

const CFG_KEY = 'microtermix-jenkins-cfg';

export function loadJenkinsConfig(): JenkinsConfig {
    try {
        const raw = localStorage.getItem(CFG_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { baseUrl: '', user: '', token: '' };
}

export function saveJenkinsConfig(cfg: JenkinsConfig): void {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(cfg: JenkinsConfig): string {
    return 'Basic ' + btoa(`${cfg.user}:${cfg.token}`);
}

function baseUrl(cfg: JenkinsConfig): string {
    return cfg.baseUrl.replace(/\/$/, '');
}

function toCurl(method: string, url: string, headers: Record<string, string>, body?: any): string {
    let curl = `curl -X ${method} "${url}"`;
    Object.entries(headers).forEach(([k, v]) => {
        curl += ` -H "${k}: ${v}"`;
    });
    if (body) {
        const d = typeof body === 'string' ? body : JSON.stringify(body);
        curl += ` -d '${d.replace(/'/g, "'\\''")}'`;
    }
    return curl;
}

async function jGet<T>(cfg: JenkinsConfig, path: string): Promise<T> {
    const url = `${baseUrl(cfg)}${path}`;
    const id = ++_seq;
    const time = new Date().toLocaleTimeString('en-GB');
    const t0 = Date.now();
    const reqHeaders = { Authorization: authHeader(cfg), 'Content-Type': 'application/json' };
    const curl = toCurl('GET', url, reqHeaders);

    let res: Awaited<ReturnType<typeof tauriFetch>>;
    try {
        res = await tauriFetch(url, {
            method: 'GET',
            headers: reqHeaders,
        });
    } catch (e: any) {
        jenkinsApiLog.emit({ id, time, method: 'GET', path, url, durationMs: Date.now() - t0, ok: false, error: e?.message, requestHeaders: reqHeaders, curl });
        throw e;
    }

    const durationMs = Date.now() - t0;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    let data: any;
    try {
        data = await res.json();
    } catch (e) {
        data = { error: 'Failed to parse JSON response' };
    }

    if (!res.ok) {
        jenkinsApiLog.emit({
            id, time, method: 'GET', path, url, status: res.status, durationMs, ok: false,
            error: `HTTP ${res.status}`,
            requestHeaders: reqHeaders,
            responseHeaders: resHeaders,
            responseBody: data,
            curl
        });
        throw new Error(`Jenkins ${res.status}: ${path}`);
    }

    jenkinsApiLog.emit({
        id, time, method: 'GET', path, url, status: res.status, durationMs, ok: true,
        requestHeaders: reqHeaders,
        responseHeaders: resHeaders,
        responseBody: data,
        curl
    });
    return data as T;
}

async function jPost(cfg: JenkinsConfig, path: string): Promise<void> {
    const url = `${baseUrl(cfg)}${path}`;
    const id = ++_seq;
    const time = new Date().toLocaleTimeString('en-GB');

    // Attempt to get crumb
    const crumbRes = await tauriFetch(`${baseUrl(cfg)}/crumbIssuer/api/json`, {
        method: 'GET',
        headers: { Authorization: authHeader(cfg) },
    });

    const headers: Record<string, string> = { Authorization: authHeader(cfg) };
    if (crumbRes.ok) {
        const crumb = await crumbRes.json() as { crumbRequestField: string; crumb: string };
        headers[crumb.crumbRequestField] = crumb.crumb;
    }

    const curl = toCurl('POST', url, headers);
    const t0 = Date.now();
    let res: Awaited<ReturnType<typeof tauriFetch>>;
    try {
        res = await tauriFetch(url, { method: 'POST', headers });
    } catch (e: any) {
        jenkinsApiLog.emit({ id, time, method: 'POST', path, url, durationMs: Date.now() - t0, ok: false, error: e?.message, requestHeaders: headers, curl });
        throw e;
    }

    const durationMs = Date.now() - t0;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    if (!res.ok && res.status !== 201 && res.status !== 302) {
        jenkinsApiLog.emit({
            id, time, method: 'POST', path, url, status: res.status, durationMs, ok: false,
            error: `HTTP ${res.status}`,
            requestHeaders: headers,
            responseHeaders: resHeaders,
            curl
        });
        throw new Error(`Jenkins POST ${res.status}: ${path}`);
    }

    jenkinsApiLog.emit({
        id, time, method: 'POST', path, url, status: res.status, durationMs, ok: true,
        requestHeaders: headers,
        responseHeaders: resHeaders,
        curl
    });
}

// ── API functions ─────────────────────────────────────────────────────────────

const JOB_TREE =
    'name,displayName,fullName,fullDisplayName,url,color,_class,' +
    'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'jobs[name,displayName,fullName,fullDisplayName,url,color,_class,' +
    'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'jobs[name,displayName,fullName,fullDisplayName,url,color,_class,' +
    'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'jobs[name,displayName,fullName,fullDisplayName,url,color,_class,' +
    'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration]]]]';

/** Lists all top-level jobs, expanding multibranch children one level. */
export async function jenkinsGetJobs(cfg: JenkinsConfig): Promise<JenkinsJobSummary[]> {
    const data = await jGet<{ jobs: JenkinsJobSummary[] }>(
        cfg,
        `/api/json?tree=jobs[${JOB_TREE}]`,
    );
    return data.jobs ?? [];
}

/** 
 * Searches across the entire Jenkins instance using the native search engine.
 * This is the ONLY reliable way to find jobs nested deep in folders.
 */
export async function jenkinsGlobalSearch(cfg: JenkinsConfig, query: string): Promise<JenkinsJobSummary[]> {
    if (!query?.trim()) return jenkinsGetJobs(cfg);

    console.log(`[JenkinsSearch] Query: "${query}"`);

    try {
        // First try the standard search suggestions API
        const data = await jGet<{ suggestions: Array<{ name: string; url: string }> }>(
            cfg,
            `/search/api/json?q=${encodeURIComponent(query.trim())}`
        ).catch(err => {
            if (err.message?.includes('404')) {
                console.warn('[JenkinsSearch] Native search API (404) not available. Falling back to recursive tree search.');
                return null;
            }
            throw err;
        });

        // ── FALLBACK: Recursive Tree Search ──────────────────────────
        // Used when /search/api/json is missing (common in CloudBees/Restricted setups)
        if (!data) {
            console.log('[JenkinsSearch] Recursive falling back...');
            return await jenkinsRecursiveSearch(cfg, query);
        }

        // ── Standard logic if suggestions API exists ──────────────────
        if (!data?.suggestions || !Array.isArray(data.suggestions)) return [];
        const jobSuggestions = data.suggestions.filter(s => s.url.includes('/job/'));
        const topSuggestions = jobSuggestions.slice(0, 30);
        const results: JenkinsJobSummary[] = [];
        const SEARCH_DETAILS_TREE = 'name,displayName,fullName,fullDisplayName,url,color,_class,lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],jobs[name,url,color,_class]';

        for (let i = 0; i < topSuggestions.length; i += 5) {
            const chunk = topSuggestions.slice(i, i + 5);
            const chunkResults = await Promise.all(
                chunk.map(async (s) => {
                    try {
                        const base = baseUrl(cfg).replace(/\/$/, '');
                        const fullUrl = s.url.startsWith('http') ? s.url : `${base}${s.url}`;
                        const apiURL = `${fullUrl.replace(/\/?$/, '')}/api/json?tree=${SEARCH_DETAILS_TREE}`;
                        const res = await tauriFetch(apiURL, {
                            method: 'GET',
                            headers: { Authorization: authHeader(cfg), 'Accept': 'application/json' },
                        });
                        if (!res.ok) return null;
                        const job = await res.json() as JenkinsJobSummary;
                        if (isFolder(job)) return null;
                        return job;
                    } catch { return null; }
                })
            );
            results.push(...chunkResults.filter((r): r is JenkinsJobSummary => r !== null));
        }
        return results;

    } catch (err) {
        console.error('[JenkinsSearch] Global search error:', err);
        return [];
    }
}

/** 
 * Fallback search that asks Jenkins for a deep nested tree of job names/URLs 
 * and filters them locally. Slower but more reliable if /search is 404.
 */
async function jenkinsRecursiveSearch(cfg: JenkinsConfig, query: string): Promise<JenkinsJobSummary[]> {
    const q = query.toLowerCase();
    // Build a deep tree request (up to 10 folders deep)
    let jobsTree = 'name,displayName,fullName,fullDisplayName,url,color,_class,lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration]';
    for (let i = 0; i < 10; i++) {
        jobsTree = `name,displayName,fullName,fullDisplayName,url,color,_class,lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],jobs[${jobsTree}]`;
    }

    const data = await jGet<{ jobs: JenkinsJobSummary[] }>(
        cfg,
        `/api/json?tree=jobs[${jobsTree}]`
    );

    const matches: JenkinsJobSummary[] = [];
    const walk = (items: JenkinsJobSummary[]) => {
        items?.forEach(j => {
            const isMBranch = j._class?.toLowerCase().includes('multibranch');
            
            if (jobMatchesSearch(j, q)) {
                if (!isFolder(j)) {
                    matches.push(j);
                }
            }
            
            // If it's a generic folder, always recurse.
            // If it's a Multibranch job, we've already added it if it matched, 
            // so we STOP recursing here because we don't want to show branch/environment results separately.
            if (Array.isArray(j.jobs)) {
                 const isGenericFolder = j._class?.toLowerCase().includes('folder') && !isMBranch;
                 if (isGenericFolder) {
                     walk(j.jobs);
                 }
            }
        });
    };

    walk(data.jobs ?? []);
    console.log(`[JenkinsSearch] Recursive found ${matches.length} matches.`);
    return matches.slice(0, 50); // Limit to 50 found items
}

/**
 * Lists child jobs at an arbitrary URL path.
 * Works for: Folders, Multibranch pipelines, or any container job.
 * `urlPath` is the path segment, e.g. "/job/my-folder/job/my-pipeline/"
 */
export async function jenkinsGetChildren(cfg: JenkinsConfig, urlPath: string): Promise<JenkinsJobSummary[]> {
    // Ensure trailing slash and no double slashes
    const path = urlPath.replace(/\/?$/, '/');
    const data = await jGet<{ jobs: JenkinsJobSummary[] }>(
        cfg,
        `${path}api/json?tree=jobs[${JOB_TREE}]`,
    );
    return data.jobs ?? [];
}

/** @deprecated Use jenkinsGetChildren with the job's URL path instead */
export async function jenkinsGetBranches(cfg: JenkinsConfig, jobName: string): Promise<JenkinsJobSummary[]> {
    const encodedName = encodeURIComponent(jobName);
    const data = await jGet<{ jobs: JenkinsJobSummary[] }>(
        cfg,
        `/job/${encodedName}/api/json?tree=jobs[${JOB_TREE}]`,
    );
    return data.jobs ?? [];
}

const BUILD_TREE =
    'number,url,result,duration,timestamp,building,displayName,estimatedDuration';

/** Last N builds for a job (or branch inside multibranch). */
export async function jenkinsGetBuilds(
    cfg: JenkinsConfig,
    jobPath: string,
    limit = 20,
): Promise<JenkinsBuildSummary[]> {
    const data = await jGet<{ builds: JenkinsBuildSummary[] }>(
        cfg,
        `${jobPath}api/json?tree=builds[${BUILD_TREE}]{0,${limit}}`,
    );
    return data.builds ?? [];
}

/** Full detail of a single build (changeSet, causes, etc.). */
export async function jenkinsGetBuildDetail(
    cfg: JenkinsConfig,
    jobPath: string,
    buildNumber: number,
): Promise<JenkinsBuildDetail> {
    const tree =
        'number,url,result,duration,timestamp,building,displayName,estimatedDuration,' +
        'fullDisplayName,description,causes[shortDescription],' +
        'changeSet[items[commitId,author[fullName],msg,timestamp]]';
    return jGet<JenkinsBuildDetail>(
        cfg,
        `${jobPath}${buildNumber}/api/json?tree=${tree}`,
    );
}

/** Trigger a build (Build Now). */
export async function jenkinsTriggerBuild(cfg: JenkinsConfig, jobPath: string): Promise<void> {
    return jPost(cfg, `${jobPath}build`);
}

/** Abort a running build. */
export async function jenkinsAbortBuild(
    cfg: JenkinsConfig,
    jobPath: string,
    buildNumber: number,
): Promise<void> {
    return jPost(cfg, `${jobPath}${buildNumber}/stop`);
}

/**
 * Fetches a chunk of console log starting at `start` bytes.
 * Returns the text chunk, the new offset (X-Text-Size header),
 * and whether more data is expected (X-More-Data header).
 */
export async function jenkinsGetProgressiveLog(
    cfg: JenkinsConfig,
    jobPath: string,
    buildNumber: number,
    start: number,
): Promise<JenkinsProgressiveLog> {
    const url = `${baseUrl(cfg)}${jobPath}${buildNumber}/logText/progressiveText?start=${start}`;
    const res = await tauriFetch(url, {
        method: 'GET',
        headers: { Authorization: authHeader(cfg) },
    });
    const text = await res.text();
    const textSizeRaw = res.headers.get('x-text-size') ?? res.headers.get('X-Text-Size') ?? String(start + text.length);
    const moreDataRaw = res.headers.get('x-more-data') ?? res.headers.get('X-More-Data') ?? 'false';
    return {
        text,
        textSize: parseInt(textSizeRaw, 10),
        moreData: moreDataRaw === 'true',
    };
}

// ── Favourites ────────────────────────────────────────────────────────────────

const FAV_KEY = 'microtermix-jenkins-favs';

/** Subset of job data stored in favorites (enough for display). */
export interface JenkinsFavorite {
    url: string;
    name: string;
    displayName?: string;
    fullName?: string;
    fullDisplayName?: string;
    color: string;
    _class: string;
    lastBuild: JenkinsBuildSummary | null;
    lastSuccessfulBuild: JenkinsBuildSummary | null;
    lastFailedBuild: JenkinsBuildSummary | null;
}

export function jobToFavorite(job: JenkinsJobSummary): JenkinsFavorite {
    return {
        url: normalizeUrl(job.url),
        name: job.name,
        displayName: job.displayName,
        fullName: job.fullName,
        fullDisplayName: job.fullDisplayName,
        color: job.color,
        _class: job._class,
        lastBuild: job.lastBuild,
        lastSuccessfulBuild: job.lastSuccessfulBuild,
        lastFailedBuild: job.lastFailedBuild,
    };
}

/** Normalize URL for consistent comparison (ensure trailing slash). */
export function normalizeUrl(url: string): string {
    return url.endsWith('/') ? url : url + '/';
}

export function loadFavorites(): Map<string, JenkinsFavorite> {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        if (raw) {
            const arr: JenkinsFavorite[] = JSON.parse(raw);
            return new Map(arr.map(f => [normalizeUrl(f.url), f]));
        }
    } catch { /* ignore */ }
    return new Map();
}

export function saveFavorites(favs: Map<string, JenkinsFavorite>): void {
    localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs.values())));
}

/**
 * Lightweight status fetch for a single job.
 * Used by expanded JobRow instances to poll only what's visible.
 */
export async function jenkinsGetJobStatus(
    cfg: JenkinsConfig,
    jobPath: string,
): Promise<JenkinsJobSummary | null> {
    const tree =
        'name,displayName,fullName,fullDisplayName,url,color,_class,' +
        'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
        'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
        'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
        'jobs[name,displayName,url,color,_class,lastBuild[number,result,timestamp]]';
    try {
        return await jGet<JenkinsJobSummary>(cfg, `${jobPath}api/json?tree=${tree}`);
    } catch {
        return null;
    }
}

/**
 * Fetches Pipeline Stage View data (wfapi/describe).
 * Returns null if the build is not a Pipeline or the plugin is not installed.
 */
export async function jenkinsGetPipelineStages(
    cfg: JenkinsConfig,
    jobPath: string,
    buildNumber: number,
): Promise<PipelineRun | null> {
    try {
        return await jGet<PipelineRun>(cfg, `${jobPath}${buildNumber}/wfapi/describe`);
    } catch {
        return null;
    }
}

export interface StageNode {
    id: string;
    name: string;
    status: StageStatus;
    durationMillis: number;
    logUrl?: string;
}

/** Fetches nodes (steps) for a specific stage. */
export async function jenkinsGetStageNodes(
    cfg: JenkinsConfig,
    jobPath: string,
    buildNumber: number,
    stageId: string,
): Promise<StageNode[]> {
    try {
        const res = await jGet<any>(cfg, `${jobPath}${buildNumber}/execution/node/${stageId}/wfapi/describe`);
        return res.stageFlowNodes ?? [];
    } catch {
        return [];
    }
}

/** Fetches the log text for a specific stage node. */
export async function jenkinsGetStageLog(
    cfg: JenkinsConfig,
    jobPath: string,
    buildNumber: number,
    nodeId: string,
): Promise<string> {
    try {
        const res = await jGet<{ text: string }>(cfg, `${jobPath}${buildNumber}/execution/node/${nodeId}/wfapi/log`);
        return res.text;
    } catch {
        return 'No log available for this stage.';
    }
}

/** Test connection — returns Jenkins version string or throws. */
export async function jenkinsTestConnection(cfg: JenkinsConfig): Promise<string> {
    const url = `${baseUrl(cfg)}/api/json?tree=nodeName`;
    const res = await tauriFetch(url, {
        method: 'GET',
        headers: { Authorization: authHeader(cfg) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const version = res.headers.get('x-jenkins') ?? res.headers.get('X-Jenkins') ?? '?';
    return version;
}

// ── Derived helpers ───────────────────────────────────────────────────────────

export function isMultibranch(job: JenkinsJobSummary): boolean {
    return (
        job._class === 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject' ||
        (Array.isArray(job.jobs) && job.jobs.length > 0)
    );
}

export function isFolder(job: JenkinsJobSummary): boolean {
    return job._class === 'com.cloudbees.hudson.plugins.folder.Folder';
}

export function isBuilding(job: JenkinsJobSummary): boolean {
    if (!job) return false;
    return (
        job.color?.endsWith('_anime') === true ||
        job.lastBuild?.building === true
    );
}

export function colorFromResult(result: BuildResult, building: boolean): string {
    if (building) return '#38bdf8';      // blue – in progress
    switch (result) {
        case 'SUCCESS': return '#22c55e';
        case 'FAILURE': return '#ef4444';
        case 'UNSTABLE': return '#f59e0b';
        case 'ABORTED': return '#6b7280';
        default: return '#475569';
    }
}

export function colorFromJobColor(color: JenkinsJobColor): string {
    if (color?.endsWith('_anime')) return '#38bdf8';
    if (color?.startsWith('blue')) return '#22c55e';
    if (color?.startsWith('red')) return '#ef4444';
    if (color?.startsWith('yellow')) return '#f59e0b';
    return '#475569';
}

export function formatDuration(ms: number): string {
    if (!ms) return '–';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

export function formatAgo(timestamp: number): string {
    if (!timestamp) return '–';
    const diff = Date.now() - timestamp;
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'just now';
}

/** Extracts the URL path segment for API calls (e.g. "/job/my-pipeline/job/main/"). */
export function jobApiPath(url: string, baseUrl: string): string {
    const base = baseUrl.replace(/\/$/, '');
    return url.startsWith(base) ? url.slice(base.length) : url;
}

/** 
 * Flat list of leaf jobs (excludes folder/multibranch containers).
 * User says: "solo deve buscar en los jobs no en las carpetas".
 */
export function flattenJobs(list: JenkinsJobSummary[]): JenkinsJobSummary[] {
    const flat: JenkinsJobSummary[] = [];
    if (!Array.isArray(list)) return flat;

    list.forEach(j => {
        const isMBranch = j._class?.toLowerCase().includes('multibranch');
        const isFold = j._class?.toLowerCase().includes('folder') && !isMBranch;

        if (!isFold) {
            flat.push(j);
        }

        if (Array.isArray(j.jobs)) {
            // Solo recurrimos para aplanar carpetas genéricas. 
            // Para proyectos Multibranch, el usuario quiere ver el padre (el nivel arriba).
            if (isFold) {
                flat.push(...flattenJobs(j.jobs));
            }
        }
    });
    return flat;
}

/**
 * Basic name/URL matcher for jobs.
 */
export function jobMatchesSearch(job: JenkinsJobSummary, query: string): boolean {
    const q = (query || '').trim().toLowerCase();
    if (!q) return true;
    if (!job) return false;

    return (
        (job.name?.toLowerCase().includes(q)) ||
        (job.displayName?.toLowerCase().includes(q)) ||
        (job.fullName?.toLowerCase().includes(q)) ||
        (job.fullDisplayName?.toLowerCase().includes(q)) ||
        (job.url?.toLowerCase().includes(q))
    );
}
