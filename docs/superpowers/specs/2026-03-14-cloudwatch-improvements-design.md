# CloudWatch Improvements — Design Spec

**Date:** 2026-03-14
**Status:** Revised (post-review)
**Scope:** Adaptive polling worker (Rust), UI virtualization, cwStore, lazy JSON, correlation filter, panic button, EC2 deep linking, zero-config Lambda dashboard.

---

## 1. Overview

Eight coordinated improvements to the CloudWatch panel across three layers:

| Layer | Changes |
|---|---|
| Rust backend | Adaptive polling worker with burst/rest modes and EventId deduplication |
| Frontend state | New `cwStore` Zustand store (schema cache, log buffer, deep-link state) |
| UI | Virtualized log list, lazy JSON expand, UUID correlation filter, panic button, EC2 → CW deep link, Lambda auto-dashboard |

---

## 2. Rust Backend — Adaptive Polling Worker

### 2.1 AppState Extension (`state.rs`)

Add a single field to `AppState`. Unlike `proxy_abort`/`file_server_abort` (which use `ServerHandle` for Axum graceful shutdown), the tail worker is a plain Tokio task and only needs its `JoinHandle`:

```rust
pub cw_tail_handle: Arc<AsyncMutex<Option<tokio::task::JoinHandle<()>>>>
```

No new imports needed — `tokio::task::JoinHandle` is already in scope via `tokio`. Only one worker is active at a time. Starting a new worker aborts the previous one by calling `.abort()` on its `JoinHandle`.

### 2.2 New Command: `cw_start_tail`

**Signature:**
```rust
cw_start_tail(
  creds: CwCredentials,
  log_group: String,
  stream: Option<String>,
  filter_pattern: Option<String>,
  state: State<AppState>,
  app: AppHandle,
)
```

**Behavior:**
1. Lock `AppState.cw_tail_handle`, call `.abort()` on any existing `JoinHandle`, then release the lock.
2. Spawn the new worker and store its `JoinHandle` directly.

```rust
{
    let mut guard = state.cw_tail_handle.lock().await;
    if let Some(old) = guard.take() { old.abort(); }
}
let handle = tokio::task::spawn(async move { /* worker loop */ });
*state.cw_tail_handle.lock().await = Some(handle);
```

**Interval logic inside the worker:**

```
burst_interval  = 1s
rest_intervals  = [5s, 10s, 30s]
idle_threshold  = 2 minutes without new events
```

- If new events arrive → reset to burst mode (1s).
- If no events for `idle_threshold` → step through rest intervals.
- Each poll uses `cw_filter_log_events` or `cw_get_log_events` with `startMs` set to the last seen timestamp.

**Deduplication:**
- Maintain two companion structures inside the worker:
  - `seen_ids: HashSet<String>` — O(1) lookup.
  - `id_queue: VecDeque<String>` — tracks insertion order for eviction.
- AWS CloudWatch guarantees unique `eventId` per event.
- Skip events whose `eventId` is already in `seen_ids`.
- On insert: push to `id_queue` and insert into `seen_ids`. When `id_queue.len() > 100`, pop front and remove from `seen_ids`.

**Tauri event emitted:**
```json
{ "type": "cw-new-logs", "payload": { "events": [...], "log_group": "...", "stream": "..." } }
```
Only emitted when there are real (non-duplicate) events to deliver.

### 2.3 New Command: `cw_stop_tail`

```rust
cw_stop_tail(state: State<AppState>)
```

Aborts the active handle. Called by the frontend on panel unmount.

### 2.4 Initialization and Cleanup

**`AppState::new()`:** Add the field initializer alongside the existing ones:
```rust
cw_tail_handle: Arc::new(AsyncMutex::new(None)),
```

**Cleanup on workspace close / app shutdown:** `JoinHandle::drop()` does NOT abort the task — it must be called explicitly. Extend `stop_background_work()` in `state.rs` (alongside the existing `proxy_abort`, `file_server_abort`, `coverage_server_abort` blocks):
```rust
{
    let mut guard = state.cw_tail_handle.lock().await;
    if let Some(h) = guard.take() { h.abort(); }
}
```
This ensures the worker is killed when the user switches workspaces or closes the app.

### 2.5 `LogEvent` struct update

Add `event_id: Option<String>` to `LogEvent` in `cloudwatch.rs` to expose the AWS `eventId` field needed for deduplication.

Also update the TypeScript counterpart in `src/services/cloudwatchApi.ts`:
```typescript
export interface CwLogEvent {
  timestamp: number
  message: string
  event_id?: string   // ← new field
}
```
The `cwStore` and `LogsTab` use `CwLogEvent` for frontend deduplication by `event_id`.

---

## 3. Frontend State — `cwStore` (Zustand)

### 3.1 File: `src/stores/cwStore.ts`

Pattern mirrors `gitStore.ts`: `create` with `persist` + `devtools` middleware.

```typescript
interface TailTarget {
  logGroup: string
  stream?: string
  filterPattern?: string
}

interface CwStore {
  // Worker state
  isTailing: boolean
  tailTarget: TailTarget | null

  // Log buffer
  events: CwLogEvent[]        // capped at 5000, ephemeral (not persisted)
  pendingEvents: CwLogEvent[] // incoming buffer, flushed every ~200ms

  // Schema cache (persisted)
  recentNamespaces: string[]
  recentDimensions: Record<string, Array<Record<string, string>>> // namespace → list of dimension objects

  // Deep link from EC2 (ephemeral)
  pendingLogGroup: string | null

  // Pre-loaded metrics target for Lambda dashboard (ephemeral)
  pendingMetrics: { namespace: string; dimensions: Record<string, string> } | null

  // Actions
  // startTail: updates store state AND calls invoke('cw_start_tail', ...) via cloudwatchApi.startTail()
  // stopTail: updates store state AND calls invoke('cw_stop_tail') via cloudwatchApi.stopTail()
  startTail(target: TailTarget): Promise<void>
  stopTail(): Promise<void>
  addPendingEvents(events: CwLogEvent[]): void
  flushPending(): void
  addRecentDimension(namespace: string, dimensions: Record<string, string>): void  // appends to recentDimensions[namespace]
  setPendingLogGroup(logGroup: string | null): void
  setPendingMetrics(metrics: { namespace: string; dimensions: Record<string, string> } | null): void
  clearEvents(): void
}
```

**Persistence:** Only `recentNamespaces` and `recentDimensions` are persisted to localStorage via the `partialize` option. All other fields are ephemeral.

**Tauri invocation layer:** `cwStore.startTail()` and `cwStore.stopTail()` are responsible for both updating the store state (`isTailing`, `tailTarget`) AND calling the Tauri commands via `cloudwatchApi.startTail()` / `cloudwatchApi.stopTail()`. The store is the single call site — `LogsTab` and other components call `cwStore.startTail()` only, never `invoke()` directly. `cloudwatchApi.ts` provides the typed wrappers around `invoke('cw_start_tail', ...)` and `invoke('cw_stop_tail')`.

**Credentials:** `cwStore.startTail()` reads credentials internally via `loadCwConfig()` (which reads from localStorage `microtermix-cloudwatch-cfg`). Callers do not need to pass credentials — `TailTarget` only contains the log targeting parameters.

### 3.2 Batching Strategy

`LogsTab` listens to `cw-new-logs` Tauri events via `listen()` and calls `addPendingEvents(events)`.

A `useEffect` runs `setInterval(flushPending, 200)` while tailing is active. `flushPending` moves `pendingEvents` into `events` (deduplicating by `event_id` on the frontend as a second safety layer — note: snake_case, matching the Tauri response convention), caps at 5000, and clears the buffer.

This ensures React re-renders happen at most 5 times per second regardless of log volume.

---

## 4. UI Changes — `LogsTab.tsx`

### 4.1 Virtualization (`react-virtuoso`)

Add dependency: `react-virtuoso`.

Replace the current `<div>` map over events with:

```tsx
<Virtuoso
  data={filteredEvents}
  itemContent={(index, event) => <LogLine event={event} onUuidClick={handleUuidFilter} />}
  followOutput="smooth"
  style={{ flex: 1 }}
/>
```

`followOutput="smooth"` auto-scrolls to new entries when tailing, but freezes scroll position when the user scrolls up to review history.

### 4.2 `LogLine` Component (internal, memoized)

Extracted as `const LogLine = React.memo(...)` inside `LogsTab.tsx` (not a separate file, per the chosen approach).

**Lazy JSON detection:**
```
if (event.message.trimStart().startsWith('{'))  → JSON candidate
```
- Collapsed state: renders `{ ... }` with an expand chevron icon.
- On click: attempts `JSON.parse()`.
  - Success → renders with `react-json-view-lite` (or existing equivalent).
  - Failure → renders raw text (graceful fallback).
- Expand state is local `useState` per line instance.

**UUID/Correlation detection:**
Applied via regex: `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi`
- Matching segments rendered as `<span class="underline cursor-pointer text-blue-400">`.
- Click calls `onUuidClick(uuid)` prop.

### 4.3 Panic Button

Floating `Button` (variant `destructive`, size `icon`) fixed at bottom-right of the log viewer area.

- **Inactive:** shows `AlertTriangle` icon, tooltip "Solo errores".
- **Active (panic mode):** highlighted border, shows `X` icon to clear.
- On click (inactive): calls `startTail({ ...tailTarget, filterPattern: '?ERROR ?Exception ?Fail ?"500"' })`.
- On click (active): calls `startTail({ ...tailTarget, filterPattern: undefined })`.

**Important:** The panic button injects a **server-side CloudWatch filter pattern** passed to `cw_start_tail` (the `filterPattern` field in `TailTarget`). This is distinct from the local chip-based `logFilters` array that performs client-side `String.includes()` filtering. While panic mode is active, the local filter chips must be hidden/disabled to avoid confusing the user with two simultaneous filter systems. Panic mode is identified by `tailTarget.filterPattern` matching the error preset string.

### 4.4 UUID Filter Handler

```typescript
const handleUuidFilter = (uuid: string) => {
  if (!tailTarget) return
  startTail({ ...tailTarget, filterPattern: uuid })
}
```

Restarts the Rust worker with the UUID as `filterPattern`. The UI shows a dismissible chip above the log viewer indicating the active correlation filter.

---

## 5. Schema Cache — `MetricsTab.tsx`

`MetricsTab` reads `recentNamespaces` and `recentDimensions` from `cwStore` to populate namespace suggestions instantly on mount.

On successful metric query, calls `addRecentDimension(namespace, dimensions)` to persist the combination.

**Pre-loaded metrics (Lambda dashboard):** If `cwStore.pendingMetrics` is set on mount, `MetricsTab` auto-populates and queries all three metrics:
- `{ namespace: 'AWS/Lambda', metricName: 'Invocations', dimensions: { FunctionName: '...' } }`
- `{ namespace: 'AWS/Lambda', metricName: 'Errors', dimensions: { FunctionName: '...' } }`
- `{ namespace: 'AWS/Lambda', metricName: 'Duration', stat: 'p99', dimensions: { FunctionName: '...' } }`

Then calls `setPendingMetrics(null)` to consume the signal.

---

## 6. EC2 Deep Linking

### 6.1 `Ec2InstanceRow.tsx`

Add a "Logs" button (`ScrollText` icon) to the instance action row.

**Prerequisite:** Verify that `Ec2Instance` type in `ec2Types.ts` exposes `tags: Ec2Tag[]` (where `Ec2Tag` is `{ key: string; value: string }`). If not, add it to both `ec2Types.ts` and the Rust `Ec2Instance` struct in `ec2.rs`. Add `Ec2Instance` to the files-changed table if so.

**Log group resolution (priority order):**
1. Search instance `tags` array for keys: `cloudwatch:log-group`, `CloudWatchLogGroup`, `log-group`.
2. If found, use the tag value directly.
3. If not found, use `/aws/ec2/${instanceId}`.

**On click:**
```typescript
cwStore.setPendingLogGroup(resolvedLogGroup)
workspaceContext.setActiveView('cloudwatch')
```

### 6.2 `CloudWatchPanel.tsx`

`setTab` lives in `CloudWatchPanel` as local `usePersistedState`. Pass it as a prop to child tabs.

**Updated prop interfaces:**
```typescript
// LogsTab.tsx
interface LogsTabProps {
  cfg: CwCredentials
  onNavigate: (tab: string) => void
}

// MetricsTab.tsx
interface MetricsTabProps {
  cfg: CwCredentials
  onNavigate: (tab: string) => void
}
```

Usage in `CloudWatchPanel`:
```tsx
<LogsTab cfg={cfg} onNavigate={setTab} />
<MetricsTab cfg={cfg} onNavigate={setTab} />
```

Add `useEffect` in `CloudWatchPanel` watching `cwStore.pendingLogGroup` — only to switch the active tab:

```typescript
useEffect(() => {
  if (!pendingLogGroup) return
  setTab('logs')
  // Do NOT consume pendingLogGroup here — LogsTab owns the consume
}, [pendingLogGroup])
```

`LogsTab` checks `pendingLogGroup` on its own mount `useEffect`. If set, pre-selects the log group in the sidebar, calls `startTail` automatically, then calls `setPendingLogGroup(null)` to consume the signal. This avoids the race condition where `pendingLogGroup` is cleared before `LogsTab` mounts.

`MetricsTab` similarly receives `onNavigate` as a prop (used for Lambda dashboard, Section 7.2). The Lambda banner in `LogsTab` calls `onNavigate('metrics')` instead of a direct `setTab`.

---

## 7. Zero-Config Lambda Dashboard

### 7.1 Lambda Detection Banner (`LogsTab.tsx`)

When the selected log group starts with `/aws/lambda/`, render a banner between the stream selector and the log viewer:

```
⚡ Lambda detectada — [Abrir métricas clave →]
```

Styled as a subtle `bg-amber-900/20 border border-amber-700/30` strip.

### 7.2 On "Abrir métricas clave" click:

`LogsTab` receives `onNavigate: (tab: string) => void` prop from `CloudWatchPanel`.

```typescript
const functionName = selectedGroup.replace('/aws/lambda/', '')
cwStore.setPendingMetrics({
  namespace: 'AWS/Lambda',
  dimensions: { FunctionName: functionName }
})
onNavigate('metrics') // calls setTab in CloudWatchPanel
```

`MetricsTab` handles the rest (see Section 5).

---

## 8. New Dependencies

| Package | Purpose | Where |
|---|---|---|
| `react-virtuoso` | Virtual list for log viewer | Frontend |
| `react-json-view-lite` | JSON tree expand (only if no equivalent found in project) | Frontend |

---

## 9. Files Changed

| File | Change |
|---|---|
| `src-tauri/src/state.rs` | Add `cw_tail_handle: Arc<AsyncMutex<Option<JoinHandle<()>>>>` to struct, `new()`, and `stop_background_work()` |
| `src-tauri/src/cloudwatch.rs` | Add `event_id` to `LogEvent`; implement `cw_start_tail`, `cw_stop_tail` |
| `src-tauri/src/lib.rs` | Register `cw_start_tail`, `cw_stop_tail` |
| `src/stores/cwStore.ts` | New file |
| `src/services/cloudwatchApi.ts` | Add `startTail()`, `stopTail()` wrappers |
| `src/components/CloudWatchPanel.tsx` | Deep-link effect; pass cwStore to tabs |
| `src/components/cloudwatch/LogsTab.tsx` | Virtuoso, LogLine, panic button, UUID filter, lambda banner, cwStore integration |
| `src/components/cloudwatch/MetricsTab.tsx` | Schema cache reads/writes, pending metrics auto-load |
| `src/components/cloudwatch/Ec2InstanceRow.tsx` | Add "Logs" deep-link button |
| `src/components/cloudwatch/ec2Types.ts` | Add `tags: Ec2Tag[]` to `Ec2Instance` if not already present |
| `src-tauri/src/ec2.rs` | Add `tags` field to Rust `Ec2Instance` struct if not already present |

---

## 10. Out of Scope

- API Gateway tab changes.
- SSM terminal changes.
- Multi-window CloudWatch support.
- CloudWatch Insights query UI.
