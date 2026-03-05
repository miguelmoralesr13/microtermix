import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CwCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string;
    ssmPluginPath?: string;
}

export interface CwLogGroup {
    name: string;
    stored_bytes: number;
}

export interface CwLogStream {
    name: string;
    last_event_ms: number | null;
}

export interface CwLogEvent {
    timestamp: number;
    message: string;
}

export interface CwLogEventsResult {
    events: CwLogEvent[];
    next_forward_token: string | null;
}

export interface CwDimension {
    name: string;
    value: string;
}

export interface CwMetricItem {
    namespace: string;
    metric_name: string;
    dimensions: CwDimension[];
}

export interface CwDatapoint {
    timestamp: number;
    value: number;
}

// ── localStorage ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nexus-cloudwatch-cfg';

export function loadCwConfig(): CwCredentials {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' };
}

export function saveCwConfig(cfg: CwCredentials): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ── Credential serialisation (camelCase → snake_case for Rust) ────────────────

function toRust(cfg: CwCredentials) {
    return {
        access_key_id: cfg.accessKeyId,
        secret_access_key: cfg.secretAccessKey,
        region: cfg.region,
        session_token: cfg.sessionToken ?? null,
    };
}

// ── API functions ─────────────────────────────────────────────────────────────

export function ssmCheckPlugin(pluginPath?: string): Promise<string> {
    return invoke('ssm_check_plugin', { pluginPath: pluginPath ?? null });
}

export function cwGetLogGroups(cfg: CwCredentials, pattern?: string): Promise<CwLogGroup[]> {
    return invoke('cw_get_log_groups', { credentials: toRust(cfg), pattern: pattern ?? null });
}

export function cwGetLogStreams(cfg: CwCredentials, logGroup: string, prefix?: string): Promise<CwLogStream[]> {
    return invoke('cw_get_log_streams', { credentials: toRust(cfg), logGroup, prefix: prefix ?? null });
}

export function cwGetLogEvents(
    cfg: CwCredentials,
    logGroup: string,
    stream: string,
    nextToken?: string | null,
    startMs?: number | null,
): Promise<CwLogEventsResult> {
    return invoke('cw_get_log_events', {
        credentials: toRust(cfg),
        logGroup,
        stream,
        nextToken: nextToken ?? null,
        startMs: startMs ?? null,
    });
}

export function cwListMetrics(cfg: CwCredentials, namespace?: string, metricName?: string): Promise<CwMetricItem[]> {
    return invoke('cw_list_metrics', {
        credentials: toRust(cfg),
        namespace: namespace ?? null,
        metricName: metricName ?? null,
    });
}

export function cwGetMetricData(
    cfg: CwCredentials,
    namespace: string,
    metricName: string,
    dimensions: CwDimension[],
    stat: string,
    periodSecs: number,
    startMs: number,
    endMs: number,
): Promise<CwDatapoint[]> {
    return invoke('cw_get_metric_data', {
        credentials: toRust(cfg),
        namespace,
        metricName,
        dimensions,
        stat,
        periodSecs,
        startMs,
        endMs,
    });
}
