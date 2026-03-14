# CloudWatch Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AWS CloudWatch panel to Microtermix that lets the user view live log streams (tail every 5 s) and query metrics (with SVG chart) using manually-entered credentials stored in localStorage.

**Architecture:** New `cloudwatch` view wired into the existing `AppView` / Sidebar / ServiceManager pattern. Five Tauri commands in a new `src-tauri/src/cloudwatch.rs` module use `aws-sdk-cloudwatchlogs` + `aws-sdk-cloudwatch` (Rust SDKs) — credentials are passed per-call so the backend stays stateless. The React panel (`CloudWatchPanel.tsx`) has three tabs: Settings, Logs, Metrics.

**Tech Stack:** Rust (aws-sdk-cloudwatchlogs v1, aws-sdk-cloudwatch v1, aws-config v1), React 19, TypeScript, TailwindCSS v4, Tauri v2 `invoke()`.

---

## Task 1 — Add Cargo dependencies + module skeleton

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/cloudwatch.rs` (skeleton only)
- Modify: `src-tauri/src/lib.rs`

### Step 1 — Add crates to Cargo.toml

Open `src-tauri/Cargo.toml`. After the `reqwest` line, add:

```toml
aws-sdk-cloudwatchlogs = "1"
aws-sdk-cloudwatch = "1"
aws-config = { version = "1", features = ["behavior-version-latest"] }
aws-credential-types = "1"
```

### Step 2 — Create cloudwatch.rs skeleton

Create `src-tauri/src/cloudwatch.rs` with only a placeholder command so the build succeeds:

```rust
use serde::{Deserialize, Serialize};

// ── Credentials ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct CwCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

// ── Client helpers ────────────────────────────────────────────────────────────

async fn logs_client(c: &CwCredentials) -> aws_sdk_cloudwatchlogs::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        c.session_token.clone(),
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_cloudwatchlogs::Client::new(&cfg)
}

async fn metrics_client(c: &CwCredentials) -> aws_sdk_cloudwatch::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        c.session_token.clone(),
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_cloudwatch::Client::new(&cfg)
}

// ── Placeholder command (replaced in Task 2) ─────────────────────────────────

#[tauri::command]
pub async fn cw_ping() -> &'static str {
    "ok"
}
```

### Step 3 — Register module and command in lib.rs

In `src-tauri/src/lib.rs`, add after the other `mod` declarations (around line 7):

```rust
mod cloudwatch;
```

Add after the other `pub use` blocks:

```rust
pub use crate::cloudwatch::cw_ping;
```

Add `cw_ping` inside `tauri::generate_handler![...]` (the list near the bottom of `run()`).

### Step 4 — Verify build

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: compiles (first build may take 2–5 min downloading AWS crates). Fix any version conflicts if Cargo complains.

### Step 5 — Commit

```bash
git add src-tauri/Cargo.toml src-tauri/src/cloudwatch.rs src-tauri/src/lib.rs
git commit -m "feat: add cloudwatch module skeleton + AWS SDK deps"
```

---

## Task 2 — Implement the five Tauri commands

**Files:**
- Modify: `src-tauri/src/cloudwatch.rs` (replace skeleton with full implementation)
- Modify: `src-tauri/src/lib.rs` (register 5 real commands, remove cw_ping)

### Step 1 — Replace cloudwatch.rs with full implementation

```rust
use serde::{Deserialize, Serialize};

// ── Credentials ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct CwCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

async fn logs_client(c: &CwCredentials) -> aws_sdk_cloudwatchlogs::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        c.session_token.clone(), None, "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load().await;
    aws_sdk_cloudwatchlogs::Client::new(&cfg)
}

async fn metrics_client(c: &CwCredentials) -> aws_sdk_cloudwatch::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        c.session_token.clone(), None, "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load().await;
    aws_sdk_cloudwatch::Client::new(&cfg)
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct LogGroup {
    pub name: String,
    pub stored_bytes: i64,
}

#[derive(Debug, Serialize)]
pub struct LogStream {
    pub name: String,
    pub last_event_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct LogEvent {
    pub timestamp: i64,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct LogEventsResult {
    pub events: Vec<LogEvent>,
    pub next_forward_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DimensionItem {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct MetricItem {
    pub namespace: String,
    pub metric_name: String,
    pub dimensions: Vec<DimensionItem>,
}

#[derive(Debug, Serialize)]
pub struct MetricDatapoint {
    pub timestamp: i64,
    pub value: f64,
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cw_get_log_groups(
    credentials: CwCredentials,
    prefix: Option<String>,
) -> Result<Vec<LogGroup>, String> {
    let client = logs_client(&credentials).await;
    let mut req = client.describe_log_groups().limit(50);
    if let Some(p) = prefix.filter(|s| !s.is_empty()) {
        req = req.log_group_name_prefix(p);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    Ok(resp.log_groups().iter()
        .filter_map(|g| g.log_group_name().map(|n| LogGroup {
            name: n.to_string(),
            stored_bytes: g.stored_bytes().unwrap_or(0),
        }))
        .collect())
}

#[tauri::command]
pub async fn cw_get_log_streams(
    credentials: CwCredentials,
    log_group: String,
    prefix: Option<String>,
) -> Result<Vec<LogStream>, String> {
    use aws_sdk_cloudwatchlogs::types::OrderBy;
    let client = logs_client(&credentials).await;
    let mut req = client.describe_log_streams()
        .log_group_name(&log_group)
        .order_by(OrderBy::LastEventTime)
        .descending(true)
        .limit(50);
    if let Some(p) = prefix.filter(|s| !s.is_empty()) {
        req = req.log_stream_name_prefix(p);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    Ok(resp.log_streams().iter()
        .filter_map(|s| s.log_stream_name().map(|n| LogStream {
            name: n.to_string(),
            last_event_ms: s.last_event_timestamp(),
        }))
        .collect())
}

#[tauri::command]
pub async fn cw_get_log_events(
    credentials: CwCredentials,
    log_group: String,
    stream: String,
    next_token: Option<String>,
    start_ms: Option<i64>,
) -> Result<LogEventsResult, String> {
    let client = logs_client(&credentials).await;
    let mut req = client.get_log_events()
        .log_group_name(&log_group)
        .log_stream_name(&stream)
        .start_from_head(false)
        .limit(200);
    if let Some(t) = next_token {
        req = req.next_token(t);
    } else if let Some(ms) = start_ms {
        req = req.start_time(ms);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let events = resp.events().iter()
        .filter_map(|e| e.message().map(|m| LogEvent {
            timestamp: e.timestamp().unwrap_or(0),
            message: m.trim_end_matches('\n').to_string(),
        }))
        .collect();
    Ok(LogEventsResult {
        events,
        next_forward_token: resp.next_forward_token().map(|t| t.to_string()),
    })
}

#[tauri::command]
pub async fn cw_list_metrics(
    credentials: CwCredentials,
    namespace: Option<String>,
    metric_name: Option<String>,
) -> Result<Vec<MetricItem>, String> {
    let client = metrics_client(&credentials).await;
    let mut req = client.list_metrics();
    if let Some(ns) = namespace.filter(|s| !s.is_empty()) {
        req = req.namespace(ns);
    }
    if let Some(mn) = metric_name.filter(|s| !s.is_empty()) {
        req = req.metric_name(mn);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    Ok(resp.metrics().iter()
        .filter_map(|m| {
            let ns = m.namespace()?.to_string();
            let name = m.metric_name()?.to_string();
            let dims = m.dimensions().iter()
                .map(|d| DimensionItem {
                    name: d.name().to_string(),
                    value: d.value().to_string(),
                })
                .collect();
            Some(MetricItem { namespace: ns, metric_name: name, dimensions: dims })
        })
        .collect())
}

#[tauri::command]
pub async fn cw_get_metric_data(
    credentials: CwCredentials,
    namespace: String,
    metric_name: String,
    dimensions: Vec<DimensionItem>,
    stat: String,
    period_secs: i32,
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<MetricDatapoint>, String> {
    use aws_sdk_cloudwatch::types::{Dimension, Metric, MetricDataQuery, MetricStat};
    use aws_sdk_cloudwatch::primitives::DateTime;

    let client = metrics_client(&credentials).await;

    let dims: Vec<Dimension> = dimensions.iter()
        .map(|d| Dimension::builder().name(&d.name).value(&d.value).build().unwrap())
        .collect();

    let metric = Metric::builder()
        .namespace(&namespace)
        .metric_name(&metric_name)
        .set_dimensions(Some(dims))
        .build();

    let metric_stat = MetricStat::builder()
        .metric(metric)
        .period(period_secs)
        .stat(&stat)
        .build()
        .map_err(|e| e.to_string())?;

    let query = MetricDataQuery::builder()
        .id("m1")
        .metric_stat(metric_stat)
        .return_data(true)
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get_metric_data()
        .start_time(DateTime::from_millis(start_ms))
        .end_time(DateTime::from_millis(end_ms))
        .metric_data_queries(query)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let points = resp.metric_data_results()
        .first()
        .map(|r| {
            let mut pairs: Vec<_> = r.timestamps().iter()
                .zip(r.values().iter())
                .map(|(t, v)| MetricDatapoint {
                    timestamp: t.to_millis().unwrap_or(0),
                    value: *v,
                })
                .collect();
            pairs.sort_by_key(|p| p.timestamp);
            pairs
        })
        .unwrap_or_default();

    Ok(points)
}
```

### Step 2 — Update lib.rs

Replace `pub use crate::cloudwatch::cw_ping;` with:

```rust
pub use crate::cloudwatch::{
    cw_get_log_groups, cw_get_log_streams, cw_get_log_events,
    cw_list_metrics, cw_get_metric_data,
};
```

In `tauri::generate_handler![...]`, remove `cw_ping` and add:

```rust
cw_get_log_groups,
cw_get_log_streams,
cw_get_log_events,
cw_list_metrics,
cw_get_metric_data,
```

### Step 3 — Verify build

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: `Finished dev profile`. If `DateTime::from_millis` is not found, try `aws_smithy_types::DateTime::from_millis` and add `aws-smithy-types = "1"` to Cargo.toml.

### Step 4 — Commit

```bash
git add src-tauri/src/cloudwatch.rs src-tauri/src/lib.rs
git commit -m "feat: implement 5 CloudWatch Tauri commands"
```

---

## Task 3 — Create cloudwatchApi.ts (TypeScript types + helpers)

**Files:**
- Create: `src/services/cloudwatchApi.ts`

### Step 1 — Create the file

```typescript
import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CwCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string;
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

const STORAGE_KEY = 'microtermix-cloudwatch-cfg';

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

export function cwGetLogGroups(cfg: CwCredentials, prefix?: string): Promise<CwLogGroup[]> {
    return invoke('cw_get_log_groups', { credentials: toRust(cfg), prefix: prefix ?? null });
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
```

### Step 2 — Verify TypeScript build

```bash
npm run build
```

Expected: `✓ built` with no TypeScript errors.

### Step 3 — Commit

```bash
git add src/services/cloudwatchApi.ts
git commit -m "feat: add cloudwatchApi.ts types and invoke helpers"
```

---

## Task 4 — Wire AppView, Sidebar, ServiceManager

**Files:**
- Modify: `src/context/WorkspaceContext.tsx` (line 19 — AppView type)
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/ServiceManager.tsx`

### Step 1 — Add 'cloudwatch' to AppView

In `src/context/WorkspaceContext.tsx`, find line 19:

```typescript
export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'commands' | 'tests' | 'sonar';
```

Change to:

```typescript
export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'commands' | 'tests' | 'sonar' | 'cloudwatch';
```

### Step 2 — Add icon to Sidebar

In `src/components/layout/Sidebar.tsx`, update the import line:

```tsx
import { GitBranch, Trello, Server, Activity, Globe, FolderOpen, TerminalSquare, FlaskConical, BarChart3, Cloud } from 'lucide-react';
```

Add the icon inside the `return` JSX, after the `fileServer` icon:

```tsx
{renderNavIcon('cloudwatch', Cloud, "AWS CloudWatch")}
```

### Step 3 — Add panel to ServiceManager

In `src/components/ServiceManager.tsx`, add import after the SonarPanel import line:

```tsx
import { CloudWatchPanel } from './CloudWatchPanel';
```

Inside the main content `<div>`, after the sonar block, add:

```tsx
{state.activeView === 'cloudwatch' && (
    <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
        <CloudWatchPanel />
    </div>
)}
```

### Step 4 — Create placeholder CloudWatchPanel so the build passes

Create `src/components/CloudWatchPanel.tsx` with just:

```tsx
import React from 'react';

export const CloudWatchPanel: React.FC = () => (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        CloudWatch — coming soon
    </div>
);
```

### Step 5 — Verify build

```bash
npm run build
```

Expected: `✓ built`. The Cloud icon should now appear in the sidebar.

### Step 6 — Commit

```bash
git add src/context/WorkspaceContext.tsx src/components/layout/Sidebar.tsx src/components/ServiceManager.tsx src/components/CloudWatchPanel.tsx
git commit -m "feat: wire CloudWatch view into sidebar and ServiceManager"
```

---

## Task 5 — CloudWatchPanel — Settings tab

**Files:**
- Modify: `src/components/CloudWatchPanel.tsx` (replace placeholder with full panel + Settings tab)

### Step 1 — Replace CloudWatchPanel.tsx

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, Settings, RefreshCw, CheckCircle, AlertCircle, X, ChevronRight } from 'lucide-react';
import {
    CwCredentials, CwLogGroup, CwLogStream, CwLogEvent, CwLogEventsResult,
    CwMetricItem, CwDimension, CwDatapoint,
    loadCwConfig, saveCwConfig,
    cwGetLogGroups, cwGetLogStreams, cwGetLogEvents,
    cwListMetrics, cwGetMetricData,
} from '../services/cloudwatchApi';

type CwTab = 'settings' | 'logs' | 'metrics';

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ onSaved }: { onSaved: () => void }) {
    const [draft, setDraft] = useState<CwCredentials>(() => loadCwConfig());
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');

    const handleSave = () => {
        saveCwConfig(draft);
        onSaved();
    };

    const handleTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(draft, '');
            setResult('ok');
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? String(e));
        } finally {
            setTesting(false);
        }
    };

    const field = (label: string, key: keyof CwCredentials, placeholder: string, secret = false) => (
        <div key={key}>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <input
                type={secret ? 'password' : 'text'}
                value={draft[key] ?? ''}
                onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-microtermix-accent placeholder:text-slate-700"
            />
        </div>
    );

    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Settings size={15} /> Credenciales AWS CloudWatch
            </h2>
            {field('Región', 'region', 'us-east-1')}
            {field('Access Key ID', 'accessKeyId', 'AKIAIOSFODNN7EXAMPLE')}
            {field('Secret Access Key', 'secretAccessKey', '••••••••••••••••••••', true)}
            {field('Session Token (opcional)', 'sessionToken', 'dejar vacío si no usas STS')}

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-microtermix-accent/20 text-microtermix-accent border border-microtermix-accent/40 hover:bg-microtermix-accent/30 rounded-lg text-xs font-bold transition-colors"
                >
                    Guardar
                </button>
                <button
                    onClick={handleTest}
                    disabled={testing || !draft.accessKeyId || !draft.secretAccessKey}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                    {testing ? <RefreshCw size={12} className="animate-spin" /> : null}
                    {testing ? 'Probando…' : 'Probar conexión'}
                </button>
                {result === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={13} /> Conectado</span>}
                {result === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-red-400" title={errMsg}>
                        <AlertCircle size={13} /> Error
                    </span>
                )}
            </div>
            {result === 'error' && errMsg && (
                <p className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded p-2 leading-snug break-all">{errMsg}</p>
            )}
        </div>
    );
}

// ── Main panel shell (Logs and Metrics tabs are stubs for now) ─────────────────

export const CloudWatchPanel: React.FC = () => {
    const [tab, setTab] = useState<CwTab>('settings');
    const [savedMsg, setSavedMsg] = useState(false);
    const cfg = loadCwConfig();
    const isConfigured = !!(cfg.accessKeyId && cfg.secretAccessKey && cfg.region);

    const tabs: { id: CwTab; label: string }[] = [
        { id: 'settings', label: 'Configuración' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Métricas' },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <Cloud size={15} className="text-microtermix-neon mr-2 shrink-0" />
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-microtermix-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}>
                        {t.label}
                    </button>
                ))}
                {savedMsg && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle size={12} /> Guardado
                        <button onClick={() => setSavedMsg(false)} className="ml-1 text-slate-600 hover:text-slate-400"><X size={10} /></button>
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto">
                {tab === 'settings' && (
                    <SettingsTab onSaved={() => { setSavedMsg(true); if (isConfigured) setTab('logs'); }} />
                )}
                {tab === 'logs' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'logs' && isConfigured && <LogsTab cfg={loadCwConfig()} />}
                {tab === 'metrics' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'metrics' && isConfigured && <MetricsTab cfg={loadCwConfig()} />}
            </div>
        </div>
    );
};

function NeedConfig({ onGo }: { onGo: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 p-12">
            <AlertCircle size={36} />
            <p className="text-sm text-center">Primero configura tus credenciales AWS.</p>
            <button onClick={onGo} className="text-xs text-microtermix-accent hover:underline">Ir a Configuración →</button>
        </div>
    );
}

// Stubs replaced in Tasks 6 and 7
function LogsTab({ cfg }: { cfg: CwCredentials }) {
    return <div className="p-6 text-slate-500 text-sm">Logs — implementación pendiente (Task 6)</div>;
}

function MetricsTab({ cfg }: { cfg: CwCredentials }) {
    return <div className="p-6 text-slate-500 text-sm">Métricas — implementación pendiente (Task 7)</div>;
}
```

### Step 2 — Verify build

```bash
npm run build
```

Expected: `✓ built`.

### Step 3 — Commit

```bash
git add src/components/CloudWatchPanel.tsx
git commit -m "feat: CloudWatch panel with Settings tab and navigation shell"
```

---

## Task 6 — Logs tab (log groups → streams → live tail)

**Files:**
- Modify: `src/components/CloudWatchPanel.tsx` (replace `LogsTab` stub)

### Step 1 — Replace the `LogsTab` stub with the full implementation

Add this function **before** the `CloudWatchPanel` export, replacing the stub at the end of the file:

```tsx
function LogsTab({ cfg }: { cfg: CwCredentials }) {
    // ── Log groups ──
    const [groups, setGroups] = useState<CwLogGroup[]>([]);
    const [groupSearch, setGroupSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);

    // ── Log streams ──
    const [streams, setStreams] = useState<CwLogStream[]>([]);
    const [streamSearch, setStreamSearch] = useState('');
    const [selectedStream, setSelectedStream] = useState<string | null>(null);
    const [loadingStreams, setLoadingStreams] = useState(false);

    // ── Events ──
    const [events, setEvents] = useState<CwLogEvent[]>([]);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [tailing, setTailing] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const tailRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Load groups on mount
    useEffect(() => {
        setLoadingGroups(true);
        setGroupError(null);
        cwGetLogGroups(cfg)
            .then(setGroups)
            .catch(e => setGroupError(e?.message ?? String(e)))
            .finally(() => setLoadingGroups(false));
    }, []);

    // Load streams when group changes
    useEffect(() => {
        if (!selectedGroup) { setStreams([]); setSelectedStream(null); return; }
        setLoadingStreams(true);
        cwGetLogStreams(cfg, selectedGroup)
            .then(setStreams)
            .catch(() => setStreams([]))
            .finally(() => setLoadingStreams(false));
        setSelectedStream(null);
        setEvents([]);
        setNextToken(null);
        setTailing(false);
    }, [selectedGroup]);

    // Initial load when stream selected
    useEffect(() => {
        if (!selectedGroup || !selectedStream) return;
        setEvents([]);
        setNextToken(null);
        setLoadingEvents(true);
        // Start from 10 minutes ago
        const startMs = Date.now() - 10 * 60 * 1000;
        cwGetLogEvents(cfg, selectedGroup, selectedStream, null, startMs)
            .then(res => {
                setEvents(res.events);
                setNextToken(res.next_forward_token);
                setTailing(true);
            })
            .catch(() => {})
            .finally(() => setLoadingEvents(false));
    }, [selectedStream]);

    // Auto-scroll to bottom on new events
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    // Live tail interval
    useEffect(() => {
        if (!tailing || !selectedGroup || !selectedStream) {
            if (tailRef.current) clearInterval(tailRef.current);
            tailRef.current = null;
            return;
        }
        tailRef.current = setInterval(async () => {
            if (!nextToken) return;
            try {
                const res = await cwGetLogEvents(cfg, selectedGroup, selectedStream, nextToken);
                if (res.events.length > 0) {
                    setEvents(prev => [...prev.slice(-1000), ...res.events]);
                }
                if (res.next_forward_token && res.next_forward_token !== nextToken) {
                    setNextToken(res.next_forward_token);
                }
            } catch { /* ignore tail errors silently */ }
        }, 5000);
        return () => { if (tailRef.current) clearInterval(tailRef.current); };
    }, [tailing, selectedGroup, selectedStream, nextToken]);

    const filteredGroups = groupSearch
        ? groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
        : groups;

    const filteredStreams = streamSearch
        ? streams.filter(s => s.name.toLowerCase().includes(streamSearch.toLowerCase()))
        : streams;

    return (
        <div className="flex h-full min-h-0">
            {/* Left: groups + streams */}
            <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col min-h-0">
                {/* Group search */}
                <div className="p-2 border-b border-slate-800">
                    <div className="relative">
                        <input
                            value={groupSearch}
                            onChange={e => setGroupSearch(e.target.value)}
                            placeholder="Buscar grupo…"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
                        />
                        {loadingGroups && <RefreshCw size={10} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />}
                    </div>
                </div>
                {groupError && <p className="px-2 py-1 text-[10px] text-red-400">{groupError}</p>}

                <div className="flex-1 overflow-y-auto py-1">
                    {filteredGroups.map(g => (
                        <button key={g.name} onClick={() => setSelectedGroup(g.name)}
                            className={`w-full text-left px-3 py-2 text-xs font-mono truncate transition-colors ${selectedGroup === g.name
                                ? 'bg-microtermix-neon/10 text-microtermix-neon'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`} title={g.name}>
                            {g.name}
                        </button>
                    ))}
                </div>

                {/* Streams */}
                {selectedGroup && (
                    <>
                        <div className="border-t border-slate-800 p-2">
                            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5 px-1">Streams</div>
                            <input
                                value={streamSearch}
                                onChange={e => setStreamSearch(e.target.value)}
                                placeholder="Buscar stream…"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
                            />
                            {loadingStreams && <RefreshCw size={10} className="animate-spin mt-1 text-slate-500" />}
                        </div>
                        <div className="overflow-y-auto max-h-48 py-1 border-t border-slate-800">
                            {filteredStreams.map(s => (
                                <button key={s.name} onClick={() => setSelectedStream(s.name)}
                                    className={`w-full text-left px-3 py-1.5 text-[11px] font-mono truncate transition-colors ${selectedStream === s.name
                                        ? 'bg-microtermix-accent/10 text-microtermix-accent'
                                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`} title={s.name}>
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Right: event viewer */}
            <div className="flex-1 flex flex-col min-h-0">
                {!selectedStream ? (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                        Selecciona un grupo y un stream
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 shrink-0 bg-slate-900/40">
                            <span className="text-[10px] text-slate-500 font-mono truncate flex-1">{selectedGroup} › {selectedStream}</span>
                            {loadingEvents && <RefreshCw size={11} className="animate-spin text-slate-500" />}
                            <button
                                onClick={() => setTailing(v => !v)}
                                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded border transition-colors ${tailing
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${tailing ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                {tailing ? 'Live' : 'Pausado'}
                            </button>
                            <button onClick={() => setEvents([])} className="text-[10px] text-slate-600 hover:text-slate-400">Limpiar</button>
                        </div>

                        {/* Log lines */}
                        <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-300 space-y-px">
                            {events.length === 0 && !loadingEvents && (
                                <p className="text-slate-600 italic">Sin eventos recientes.</p>
                            )}
                            {events.map((e, i) => (
                                <div key={i} className="flex gap-3 leading-relaxed hover:bg-slate-900 px-1 rounded">
                                    <span className="text-slate-600 shrink-0 select-none">
                                        {new Date(e.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span className="break-all">{e.message}</span>
                                </div>
                            ))}
                            <div ref={bottomRef} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
```

### Step 2 — Verify build

```bash
npm run build
```

Expected: `✓ built`.

### Step 3 — Manual smoke test

1. Run `npm run tauri dev`
2. Click the ☁️ icon in sidebar → go to Configuración → enter real AWS credentials → click Guardar
3. Switch to Logs tab → log groups should load
4. Click a group → streams appear
5. Click a stream → events appear and tail starts (green "Live" indicator blinking)
6. Click "Pausado" to stop tail

### Step 4 — Commit

```bash
git add src/components/CloudWatchPanel.tsx
git commit -m "feat: CloudWatch Logs tab with live tail"
```

---

## Task 7 — Metrics tab (namespace/metric selector + SVG chart)

**Files:**
- Modify: `src/components/CloudWatchPanel.tsx` (replace `MetricsTab` stub + add `LineChart`)

### Step 1 — Add LineChart component before MetricsTab

Insert this before the `MetricsTab` stub:

```tsx
// ── SVG Line Chart ────────────────────────────────────────────────────────────

function LineChart({ points }: { points: CwDatapoint[] }) {
    if (points.length === 0) return (
        <div className="flex items-center justify-center h-32 text-slate-600 text-xs italic">Sin datos</div>
    );

    const W = 560, H = 160, PX = 48, PY = 16;
    const xs = points.map(p => p.timestamp);
    const ys = points.map(p => p.value);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeY = maxY - minY || 1;

    const px = (x: number) => PX + ((x - minX) / (maxX - minX || 1)) * (W - PX - 8);
    const py = (y: number) => H - PY - ((y - minY) / rangeY) * (H - PY - PY);

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.timestamp).toFixed(1)} ${py(p.value).toFixed(1)}`).join(' ');

    // Y grid lines
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
        y: py(minY + t * rangeY),
        label: (minY + t * rangeY).toFixed(1),
    }));

    // X axis: first and last label
    const xLabels = [
        { x: px(minX), label: new Date(minX).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
        { x: px(maxX), label: new Date(maxX).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ];

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            {/* Grid */}
            {yTicks.map((t, i) => (
                <g key={i}>
                    <line x1={PX} y1={t.y} x2={W - 8} y2={t.y} stroke="#1e293b" strokeDasharray="4 2" />
                    <text x={PX - 4} y={t.y + 3} textAnchor="end" fill="#475569" fontSize="9">{t.label}</text>
                </g>
            ))}
            {/* Axes */}
            <line x1={PX} y1={PY} x2={PX} y2={H - PY} stroke="#334155" />
            <line x1={PX} y1={H - PY} x2={W - 8} y2={H - PY} stroke="#334155" />
            {/* X labels */}
            {xLabels.map((l, i) => (
                <text key={i} x={l.x} y={H - 2} textAnchor="middle" fill="#475569" fontSize="9">{l.label}</text>
            ))}
            {/* Area fill */}
            <path d={`${d} L ${px(maxX).toFixed(1)} ${H - PY} L ${px(minX).toFixed(1)} ${H - PY} Z`}
                fill="url(#cwGrad)" opacity="0.3" />
            <defs>
                <linearGradient id="cwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Line */}
            <path d={d} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Dots (only if few points) */}
            {points.length <= 30 && points.map((p, i) => (
                <circle key={i} cx={px(p.timestamp)} cy={py(p.value)} r="2.5" fill="#22d3ee" />
            ))}
        </svg>
    );
}
```

### Step 2 — Replace MetricsTab stub

```tsx
const NAMESPACE_SUGGESTIONS = [
    'AWS/Lambda', 'AWS/EC2', 'AWS/ECS', 'AWS/RDS', 'AWS/S3',
    'AWS/ApiGateway', 'AWS/DynamoDB', 'AWS/SQS', 'AWS/SNS',
    '/aws/lambda', 'AWS/ApplicationELB', 'AWS/CloudFront',
];

const STAT_OPTIONS = ['Average', 'Sum', 'Maximum', 'Minimum', 'SampleCount'];
const PERIOD_OPTIONS = [
    { label: '1 min', value: 60 },
    { label: '5 min', value: 300 },
    { label: '15 min', value: 900 },
    { label: '1 hora', value: 3600 },
];
const RANGE_OPTIONS = [
    { label: 'Última 1h', value: 3600_000 },
    { label: 'Últimas 6h', value: 21600_000 },
    { label: 'Últimas 24h', value: 86400_000 },
    { label: 'Últimos 7d', value: 604800_000 },
];

function MetricsTab({ cfg }: { cfg: CwCredentials }) {
    const [namespace, setNamespace] = useState('');
    const [metricSearch, setMetricSearch] = useState('');
    const [metrics, setMetrics] = useState<CwMetricItem[]>([]);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState<CwMetricItem | null>(null);
    const [dimensions, setDimensions] = useState<CwDimension[]>([]);
    const [stat, setStat] = useState('Average');
    const [period, setPeriod] = useState(300);
    const [range, setRange] = useState(3600_000);
    const [datapoints, setDatapoints] = useState<CwDatapoint[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);

    const searchMetrics = useCallback(async () => {
        setLoadingMetrics(true);
        setMetrics([]);
        try {
            const result = await cwListMetrics(cfg, namespace || undefined, metricSearch || undefined);
            setMetrics(result.slice(0, 100));
        } catch { setMetrics([]); }
        finally { setLoadingMetrics(false); }
    }, [cfg, namespace, metricSearch]);

    const handleSelectMetric = (m: CwMetricItem) => {
        setSelectedMetric(m);
        setDimensions(m.dimensions.map(d => ({ ...d })));
    };

    const loadData = async () => {
        if (!selectedMetric) return;
        setLoadingData(true);
        setDataError(null);
        try {
            const endMs = Date.now();
            const startMs = endMs - range;
            const pts = await cwGetMetricData(
                cfg, selectedMetric.namespace, selectedMetric.metric_name,
                dimensions, stat, period, startMs, endMs,
            );
            setDatapoints(pts);
        } catch (e: any) {
            setDataError(e?.message ?? String(e));
        } finally {
            setLoadingData(false);
        }
    };

    const selectLabel = selectedMetric
        ? `${selectedMetric.namespace} / ${selectedMetric.metric_name}`
        : null;

    return (
        <div className="flex flex-col h-full min-h-0 p-4 gap-4">
            {/* Search row */}
            <div className="flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">Namespace</label>
                    <input
                        list="ns-suggestions"
                        value={namespace}
                        onChange={e => setNamespace(e.target.value)}
                        placeholder="AWS/Lambda"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 w-44 focus:outline-none focus:border-microtermix-neon placeholder:text-slate-600"
                    />
                    <datalist id="ns-suggestions">
                        {NAMESPACE_SUGGESTIONS.map(n => <option key={n} value={n} />)}
                    </datalist>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">Métrica</label>
                    <input
                        value={metricSearch}
                        onChange={e => setMetricSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchMetrics()}
                        placeholder="Errors ↵"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 w-36 focus:outline-none focus:border-microtermix-neon placeholder:text-slate-600"
                    />
                </div>
                <button onClick={searchMetrics} disabled={loadingMetrics}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                    {loadingMetrics ? <RefreshCw size={11} className="animate-spin" /> : null}
                    Buscar
                </button>
            </div>

            {/* Metric list */}
            {metrics.length > 0 && !selectedMetric && (
                <div className="border border-slate-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto shrink-0">
                    {metrics.map((m, i) => (
                        <button key={i} onClick={() => handleSelectMetric(m)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 border-b border-slate-800 last:border-0 transition-colors">
                            <span className="text-microtermix-neon font-mono">{m.namespace}</span>
                            <span className="text-slate-400 mx-1">/</span>
                            <span className="text-slate-200">{m.metric_name}</span>
                            {m.dimensions.length > 0 && (
                                <span className="text-slate-600 ml-2 text-[10px]">
                                    {m.dimensions.map(d => `${d.name}=${d.value}`).join(', ')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Selected metric config */}
            {selectedMetric && (
                <div className="shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 font-mono">{selectLabel}</span>
                        <button onClick={() => { setSelectedMetric(null); setDatapoints([]); }}
                            className="text-slate-600 hover:text-slate-300"><X size={13} /></button>
                    </div>

                    {/* Dimensions */}
                    {dimensions.length > 0 && (
                        <div className="space-y-1.5">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Dimensiones</span>
                            {dimensions.map((d, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <span className="text-[11px] text-slate-400 font-mono w-28 shrink-0">{d.name}</span>
                                    <input value={d.value}
                                        onChange={e => setDimensions(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-microtermix-neon"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Stat / Period / Range */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Estadística</label>
                            <select value={stat} onChange={e => setStat(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon">
                                {STAT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Período</label>
                            <select value={period} onChange={e => setPeriod(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon">
                                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Rango</label>
                            <select value={range} onChange={e => setRange(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon">
                                {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col justify-end">
                            <button onClick={loadData} disabled={loadingData}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-microtermix-accent/20 text-microtermix-accent border border-microtermix-accent/40 hover:bg-microtermix-accent/30 disabled:opacity-40 rounded-lg transition-colors">
                                {loadingData ? <RefreshCw size={11} className="animate-spin" /> : null}
                                {loadingData ? 'Cargando…' : 'Cargar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart */}
            {dataError && <p className="text-xs text-red-400 shrink-0">{dataError}</p>}
            {datapoints.length > 0 && (
                <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-auto">
                    <LineChart points={datapoints} />
                    <p className="text-[10px] text-slate-600 mt-2 text-right">
                        {datapoints.length} datapoints · {stat} · cada {period / 60} min
                    </p>
                </div>
            )}
            {!selectedMetric && metrics.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-sm italic">
                    Busca un namespace / métrica para comenzar
                </div>
            )}
        </div>
    );
}
```

### Step 3 — Verify build

```bash
npm run build
```

Expected: `✓ built` with no TypeScript errors.

### Step 4 — Manual smoke test

1. `npm run tauri dev` → CloudWatch panel → Métricas tab
2. Type `AWS/Lambda` in Namespace → Search
3. Select a metric → configure dimensions, stat, range → click Cargar
4. Chart renders with datapoints

### Step 5 — Final commit

```bash
git add src/components/CloudWatchPanel.tsx
git commit -m "feat: CloudWatch Metrics tab with SVG line chart"
```

---

## Resumption note (if session was interrupted)

Check which tasks are done:
- Task 1: `git log --oneline` — look for "add cloudwatch module skeleton"
- Task 2: look for "implement 5 CloudWatch Tauri commands"
- Task 3: look for "add cloudwatchApi.ts"
- Task 4: look for "wire CloudWatch view into sidebar"
- Task 5: look for "Settings tab"
- Task 6: look for "Logs tab"
- Task 7: look for "Metrics tab"

Pick up from the first missing commit.

**Known potential issues:**
- `DateTime::from_millis` → if compiler error, try `aws_sdk_cloudwatch::primitives::DateTime::from_millis`
- `Dimension::builder().build()` → if it returns `Result`, add `.map_err(|e| e.to_string())?`
- `MetricStat` / `MetricDataQuery` builder errors → ensure `.metric()`, `.period()`, `.stat()`, `.id()` are all set before `.build()`
- AWS SDK v1 minor version bumps may rename some builder methods — check `cargo doc` if a method is not found
