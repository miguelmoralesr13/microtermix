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
}

type JenkinsLogListener = (e: JenkinsApiLogEntry) => void;
let _listeners: JenkinsLogListener[] = [];
let _seq = 0;

export const jenkinsApiLog = {
    on(fn: JenkinsLogListener)  { _listeners.push(fn); },
    off(fn: JenkinsLogListener) { _listeners = _listeners.filter(l => l !== fn); },
    emit(e: JenkinsApiLogEntry) { _listeners.forEach(l => l(e)); },
};

// ── localStorage ──────────────────────────────────────────────────────────────

const CFG_KEY = 'nexus-jenkins-cfg';

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

async function jGet<T>(cfg: JenkinsConfig, path: string): Promise<T> {
    const url = `${baseUrl(cfg)}${path}`;
    const id = ++_seq;
    const time = new Date().toLocaleTimeString('en-GB');
    const t0 = Date.now();
    let res: Awaited<ReturnType<typeof tauriFetch>>;
    try {
        res = await tauriFetch(url, {
            method: 'GET',
            headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
        });
    } catch (e: any) {
        jenkinsApiLog.emit({ id, time, method: 'GET', path, url, durationMs: Date.now() - t0, ok: false, error: e?.message });
        throw e;
    }
    const durationMs = Date.now() - t0;
    if (!res.ok) {
        jenkinsApiLog.emit({ id, time, method: 'GET', path, url, status: res.status, durationMs, ok: false, error: `HTTP ${res.status}` });
        throw new Error(`Jenkins ${res.status}: ${path}`);
    }
    jenkinsApiLog.emit({ id, time, method: 'GET', path, url, status: res.status, durationMs, ok: true });
    return res.json() as Promise<T>;
}

async function jPost(cfg: JenkinsConfig, path: string): Promise<void> {
    const url = `${baseUrl(cfg)}${path}`;
    const id = ++_seq;
    const time = new Date().toLocaleTimeString('en-GB');
    const crumbRes = await tauriFetch(`${baseUrl(cfg)}/crumbIssuer/api/json`, {
        method: 'GET',
        headers: { Authorization: authHeader(cfg) },
    });
    const headers: Record<string, string> = { Authorization: authHeader(cfg) };
    if (crumbRes.ok) {
        const crumb = await crumbRes.json() as { crumbRequestField: string; crumb: string };
        headers[crumb.crumbRequestField] = crumb.crumb;
    }
    const t0 = Date.now();
    let res: Awaited<ReturnType<typeof tauriFetch>>;
    try {
        res = await tauriFetch(url, { method: 'POST', headers });
    } catch (e: any) {
        jenkinsApiLog.emit({ id, time, method: 'POST', path, url, durationMs: Date.now() - t0, ok: false, error: e?.message });
        throw e;
    }
    const durationMs = Date.now() - t0;
    if (!res.ok && res.status !== 201 && res.status !== 302) {
        jenkinsApiLog.emit({ id, time, method: 'POST', path, url, status: res.status, durationMs, ok: false, error: `HTTP ${res.status}` });
        throw new Error(`Jenkins POST ${res.status}: ${path}`);
    }
    jenkinsApiLog.emit({ id, time, method: 'POST', path, url, status: res.status, durationMs, ok: true });
}

// ── API functions ─────────────────────────────────────────────────────────────

const JOB_TREE =
    'name,url,color,_class,' +
    'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'jobs[name,url,color,_class,' +
    'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
    'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration]]';

/** Lists all top-level jobs, expanding multibranch children one level. */
export async function jenkinsGetJobs(cfg: JenkinsConfig): Promise<JenkinsJobSummary[]> {
    const data = await jGet<{ jobs: JenkinsJobSummary[] }>(
        cfg,
        `/api/json?tree=jobs[${JOB_TREE}]`,
    );
    return data.jobs ?? [];
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

const FAV_KEY = 'nexus-jenkins-favs';

/** Subset of job data stored in favorites (enough for display). */
export interface JenkinsFavorite {
    url: string;
    name: string;
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
        'name,url,color,_class,' +
        'lastBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
        'lastSuccessfulBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration],' +
        'lastFailedBuild[number,url,result,duration,timestamp,building,displayName,estimatedDuration]';
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
 * Returns true if `job` (or any of its already-fetched children) matches the query.
 * Used for client-side deep search against the 2-level tree loaded on startup.
 */
export function jobMatchesSearch(job: JenkinsJobSummary, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    if (job.name.toLowerCase().includes(q)) return true;
    if (job.jobs?.some(child => jobMatchesSearch(child, q))) return true;
    return false;
}
