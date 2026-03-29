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
    next_backward_token: string | null;
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

export interface S3Bucket {
    name: string;
    creation_date: number | null;
}

export interface S3Object {
    key: string;
    size: number;
    last_modified: number | null;
    storage_class: string;
    is_folder: boolean;
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

export function cwFilterLogEvents(
    cfg: CwCredentials,
    logGroup: string,
    filterPattern?: string | null,
    nextToken?: string | null,
    startMs?: number | null,
): Promise<CwLogEventsResult> {
    return invoke('cw_filter_log_events', {
        credentials: toRust(cfg),
        logGroup,
        filterPattern: filterPattern ?? null,
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

        export function cwStartTail(
        cfg: CwCredentials,
        logGroup: string,
        filterPattern: string | null,
        workerId: string,
        ): Promise<void> {
        return invoke('cw_start_tail', {
            credentials: toRust(cfg),
            logGroup,
            filterPattern,
            workerId,
        });
        }

        export function cwStopTail(workerId: string): Promise<void> {
            return invoke('cw_stop_tail', { workerId });
        }

        export function s3ListBuckets(cfg: CwCredentials): Promise<S3Bucket[]> {
            return invoke('s3_list_buckets', { credentials: toRust(cfg) });
        }

        export function s3ListObjects(cfg: CwCredentials, bucket: string, prefix?: string, delimiter?: string): Promise<S3Object[]> {
            return invoke('s3_list_objects', {
                credentials: toRust(cfg),
                bucket,
                prefix: prefix ?? null,
                delimiter: delimiter ?? null,
            });
        }

        export function s3DownloadObject(cfg: CwCredentials, bucket: string, key: string, localPath: string): Promise<void> {
            return invoke('s3_download_object', {
                credentials: toRust(cfg),
                bucket,
                key,
                localPath,
            });
        }
