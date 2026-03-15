# CloudWatch Improvements — Design Spec

**Date:** 2026-03-14
**Status:** Approved
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

Add a single field to `AppState`:

```rust
pub cw_tail_handle: Mutex<Option<AbortHandle>>
```

Only one worker is active at a time. Starting a new worker aborts the previous one automatically.

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
1. Abort any existing `AbortHandle` from `AppState`.
2. Spawn a new `tokio::task::spawn` with an `AbortHandle`.
3. Store the new handle in `AppState.cw_tail_handle`.

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
- Maintain a `HashSet<String>` of the last 100 `eventId` values.
- AWS CloudWatch guarantees unique `eventId` per event.
- Skip events whose `eventId` is already in the set.
- Evict oldest entries when set exceeds 100 items.

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

### 2.4 Cleanup on App Shutdown

`AbortHandle` is aborted automatically when `AppState` is dropped on Tauri shutdown. No additional cleanup needed.

### 2.5 `LogEvent` struct update

Add `event_id: Option<String>` to `LogEvent` in `cloudwatch.rs` to expose the AWS `eventId` field needed for deduplication.

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
  events: LogEvent[]        // capped at 5000, ephemeral (not persisted)
  pendingEvents: LogEvent[] // incoming buffer, flushed every ~200ms

  // Schema cache (persisted)
  recentNamespaces: string[]
  recentDimensions: Record<string, string[][]> // namespace → list of dimension-sets

  // Deep link from EC2 (ephemeral)
  pendingLogGroup: string | null

  // Pre-loaded metrics target for Lambda dashboard (ephemeral)
  pendingMetrics: { namespace: string; dimensions: Record<string, string> } | null

  // Actions
  startTail(target: TailTarget): void
  stopTail(): void
  addPendingEvents(events: LogEvent[]): void
  flushPending(): void
  addRecentDimension(namespace: string, dimensions: Record<string, string>): void
  setPendingLogGroup(logGroup: string | null): void
  setPendingMetrics(metrics: { namespace: string; dimensions: Record<string, string> } | null): void
  clearEvents(): void
}
```

**Persistence:** Only `recentNamespaces` and `recentDimensions` are persisted to localStorage via the `partialize` option. All other fields are ephemeral.

### 3.2 Batching Strategy

`LogsTab` listens to `cw-new-logs` Tauri events via `listen()` and calls `addPendingEvents(events)`.

A `useEffect` runs `setInterval(flushPending, 200)` while tailing is active. `flushPending` moves `pendingEvents` into `events` (deduplicating by `eventId` on the frontend as a second safety layer), caps at 5000, and clears the buffer.

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

**Log group resolution (priority order):**
1. Search instance tags for keys: `cloudwatch:log-group`, `CloudWatchLogGroup`, `log-group`.
2. If found, use the tag value directly.
3. If not found, use `/aws/ec2/${instanceId}`.

**On click:**
```typescript
cwStore.setPendingLogGroup(resolvedLogGroup)
workspaceContext.setActiveView('cloudwatch')
```

### 6.2 `CloudWatchPanel.tsx`

Add `useEffect` watching `cwStore.pendingLogGroup`:

```typescript
useEffect(() => {
  if (!pendingLogGroup) return
  setTab('logs')
  // LogsTab reads pendingLogGroup from cwStore on mount and auto-selects the group
  cwStore.setPendingLogGroup(null) // consumed
}, [pendingLogGroup])
```

`LogsTab` checks `pendingLogGroup` on mount: if set, pre-selects the log group in the sidebar and calls `startTail` automatically.

---

## 7. Zero-Config Lambda Dashboard

### 7.1 Lambda Detection Banner (`LogsTab.tsx`)

When the selected log group starts with `/aws/lambda/`, render a banner between the stream selector and the log viewer:

```
⚡ Lambda detectada — [Abrir métricas clave →]
```

Styled as a subtle `bg-amber-900/20 border border-amber-700/30` strip.

### 7.2 On "Abrir métricas clave" click:

```typescript
const functionName = selectedGroup.replace('/aws/lambda/', '')
cwStore.setPendingMetrics({
  namespace: 'AWS/Lambda',
  dimensions: { FunctionName: functionName }
})
setTab('metrics') // navigate to MetricsTab
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
| `src-tauri/src/state.rs` | Add `cw_tail_handle: Mutex<Option<AbortHandle>>` |
| `src-tauri/src/cloudwatch.rs` | Add `event_id` to `LogEvent`; implement `cw_start_tail`, `cw_stop_tail` |
| `src-tauri/src/lib.rs` | Register `cw_start_tail`, `cw_stop_tail` |
| `src/stores/cwStore.ts` | New file |
| `src/services/cloudwatchApi.ts` | Add `startTail()`, `stopTail()` wrappers |
| `src/components/CloudWatchPanel.tsx` | Deep-link effect; pass cwStore to tabs |
| `src/components/cloudwatch/LogsTab.tsx` | Virtuoso, LogLine, panic button, UUID filter, lambda banner, cwStore integration |
| `src/components/cloudwatch/MetricsTab.tsx` | Schema cache reads/writes, pending metrics auto-load |
| `src/components/cloudwatch/Ec2InstanceRow.tsx` | Add "Logs" deep-link button |

---

## 10. Out of Scope

- API Gateway tab changes.
- SSM terminal changes.
- Multi-window CloudWatch support.
- CloudWatch Insights query UI.
