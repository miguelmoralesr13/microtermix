# Step Functions Flow Debugger — Design Spec
**Date:** 2026-03-16
**Status:** Approved
**Location:** Tab inside `CloudWatchPanel`, next to API Gateway

---

## Overview

A "Step Functions Flow Debugger" tab that lets developers inspect AWS Step Functions executions directly inside Microtermix. The focus is on the data flowing between states — what JSON entered and exited each step — plus the ability to re-run a failed execution with the same (or edited) input.

---

## Architecture

### Frontend

New tab `'step-functions'` registered in **three** places:
1. `src/stores/cwStore.ts` line 3 — `CwTab` union type: `type CwTab = 'settings' | 'logs' | 'metrics' | 'ec2' | 'api-gateway' | 'step-functions'`
2. `src/components/CloudWatchPanel.tsx` line 14 — local **redeclaration** of `CwTab` (independent of the store's type, must also be extended identically or a TS error occurs on `setTab('step-functions')`)
3. `src/components/CloudWatchPanel.tsx` — add tab entry to the `tabs` array and conditional render in content area

```
CloudWatchPanel
└── tab: 'step-functions'
    └── StepFunctionsTab.tsx          ← layout 3 columns + NeedConfig guard
        ├── SfnMachineSelector.tsx    ← Select of state machines (shadcn Select)
        ├── SfnExecutionList.tsx      ← table of 20 last executions (shadcn Badge for status)
        └── SfnExecutionInspector.tsx ← step timeline + Edit & Restart
            └── SfnStepCard.tsx       ← collapsible step: <pre> input + <pre> output
```

**New files:**
- `src/components/cloudwatch/StepFunctionsTab.tsx`
- `src/components/cloudwatch/SfnMachineSelector.tsx`
- `src/components/cloudwatch/SfnExecutionList.tsx`
- `src/components/cloudwatch/SfnExecutionInspector.tsx`
- `src/components/cloudwatch/SfnStepCard.tsx`
- `src/stores/sfnStore.ts`

### Backend (Rust)

New module `src-tauri/src/stepfunctions.rs`. Reuses `CwCredentials` from `cloudwatch.rs`. All client builders follow the **`apigateway.rs` pattern** (includes `.behavior_version(aws_config::BehaviorVersion::latest())`), not the `cloudwatch.rs` pattern.

**Tauri commands:**
| Command | Parameters | Description |
|---|---|---|
| `sfn_list_state_machines` | `credentials: CwCredentials` | Lists state machines (first 50) |
| `sfn_list_executions` | `credentials: CwCredentials, machine_arn: String` | Last 20 executions for a machine, sorted startDate desc |
| `sfn_get_execution_history` | `credentials: CwCredentials, execution_arn: String` | Full event history aggregated into `SfnStep[]` |
| `sfn_start_execution` | `credentials: CwCredentials, machine_arn: String, input: String` | Starts new execution with given JSON input string |

Registered in `lib.rs` following the same pattern as `apigateway`.

---

## Data Flow

```
useAwsStore.credentials (camelCase)
        ↓  mapped to snake_case via local getRustCreds() helper in sfnStore
sfnStore.fetchMachines()  →  invoke('sfn_list_state_machines', { credentials })
                                      ↓
                             sfnStore.machines: SfnMachine[]

sfnStore.selectMachine(arn) → sfnStore.fetchExecutions(arn)
        ↓  invoke('sfn_list_executions', { credentials, machineArn: arn })
sfnStore.executions: SfnExecution[]

sfnStore.selectExecution(executionArn) → sfnStore.fetchHistory(executionArn)
        ↓  invoke('sfn_get_execution_history', { credentials, executionArn })
        ↓  Rust aggregates events into SfnStep[] (see Aggregation Algorithm below)
sfnStore.steps: SfnStep[]

SfnStepCard "Ver Logs en CloudWatch" button (shown only when step.lambdaArn is present):
    → extract function name: step.lambdaArn.split(':').pop()
    → logGroup = `/aws/lambda/${functionName}`
    → useCwStore.goToLogs(logGroup)        ← preloads log group in CloudWatch tab
    → WorkspaceContext.setActiveView('cloudwatch')

"Edit & Restart":
    → user edits input JSON in shadcn Textarea (pre-filled with step[0].input of selected execution)
    → invoke('sfn_start_execution', { credentials, machineArn, input: editedJson })
    → toast.success / toast.error via sonner
    → sfnStore.fetchExecutions(machineArn, force=true)
```

---

## Types

### Frontend (`sfnStore.ts`)

```ts
interface SfnMachine {
  arn: string;
  name: string;
  machineType: 'STANDARD' | 'EXPRESS';  // camelCase — Rust field: machine_type
  createdAt: number;
}

interface SfnExecution {
  executionArn: string;
  name: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  startDate: number;
  stopDate?: number;
}

interface SfnStep {
  name: string;
  status: 'succeeded' | 'failed' | 'running' | 'caught';
  enteredAt: number;
  exitedAt?: number;
  durationMs?: number;
  input: string;        // JSON string
  output?: string;      // JSON string (absent if step never exited)
  error?: string;
  cause?: string;
  lambdaArn?: string;   // present if resource is a Lambda ARN (arn:aws:lambda:...)
}

// Store state
interface SfnState {
  machines: SfnMachine[];
  executions: SfnExecution[];
  steps: SfnStep[];
  selectedMachineArn: string | null;
  selectedExecutionArn: string | null;
  loadingMachines: boolean;
  loadingExecutions: boolean;
  loadingHistory: boolean;
  errorMachines: string | null;
  errorExecutions: string | null;
  errorHistory: string | null;
}
```

### Rust (`stepfunctions.rs`)

All structs derive `#[serde(rename_all = "camelCase")]` so that Tauri serialization produces camelCase fields matching the TypeScript interfaces.

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SfnMachine {
    pub arn: String,
    pub name: String,
    pub machine_type: String,   // → "machineType" in JSON
    pub created_at: i64,        // → "createdAt" in JSON
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SfnExecution {
    pub execution_arn: String,  // → "executionArn"
    pub name: String,
    pub status: String,
    pub start_date: i64,        // → "startDate"
    pub stop_date: Option<i64>, // → "stopDate"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SfnStep {
    pub name: String,
    pub status: String,
    pub entered_at: i64,             // → "enteredAt"
    pub exited_at: Option<i64>,      // → "exitedAt"
    pub duration_ms: Option<i64>,    // → "durationMs"
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub cause: Option<String>,
    pub lambda_arn: Option<String>,  // → "lambdaArn"
}
```

---

## Rust Aggregation Algorithm (`sfn_get_execution_history`)

The AWS SFN history API returns events in chronological order. Events relevant to step aggregation:

- **`TaskStateEntered`** — emitted when a state starts. Contains `stateEnteredEventDetails.name` (state name) and `stateEnteredEventDetails.input` (input JSON). If the state's resource starts with `arn:aws:lambda:`, populate `lambda_arn`.
- **`TaskStateExited`** — emitted when a state succeeds. Contains `stateExitedEventDetails.name` and `stateExitedEventDetails.output`.
- **`TaskFailed`** — emitted when a state fails. Contains `taskFailedEventDetails.error` and `taskFailedEventDetails.cause`. Use `previousEventId` chain to match back to the corresponding `TaskStateEntered` by name.
- **`ExecutionFailed`** — marks the entire execution as failed (no per-step output in this event).

**Join strategy:** maintain a `HashMap<String, SfnStep>` keyed by state name. On `TaskStateEntered`, insert a new entry with `status = "running"`. On `TaskStateExited`, update `output`, `exited_at`, `duration_ms`, and `status = "succeeded"`. On `TaskFailed`, update `error`, `cause`, and `status = "failed"`. After all events are processed, collect into a `Vec<SfnStep>` sorted by `entered_at`.

**Unfinished states:** if a state has `TaskStateEntered` but no matching `TaskStateExited` or `TaskFailed`, it remains with `status = "running"` and no `output`. This covers in-progress executions or aborted ones.

**`lambdaArn` extraction:** on `TaskStateEntered`, check the `resource` field of the state definition. If it starts with `"arn:aws:lambda:"`, set `lambda_arn = Some(resource)`.

---

## Component Responsibilities (SOLID)

| Component | Single Responsibility | Notes |
|---|---|---|
| `StepFunctionsTab` | 3-column layout + `NeedConfig` guard | Uses the existing shared `NeedConfig` from `src/components/cloudwatch/cwUtils.tsx` as-is (do NOT create a new version). Permitted to call `useCwStore.setActiveTab('settings')` for the `onGo` prop — same pattern as all other CloudWatch tabs. No other store calls. |
| `SfnMachineSelector` | Render & select a state machine via shadcn `Select` | Calls `sfnStore.selectMachine` on change. Shows `loadingMachines` spinner. |
| `SfnExecutionList` | Display 20 executions table with `Badge` for status | Calls `sfnStore.selectExecution` on row click. Shows `loadingExecutions` state. |
| `SfnExecutionInspector` | Chronological list of `SfnStepCard` + "Edit & Restart" section | Owns the `editedInput` local state (shadcn `Textarea`). Calls `sfnStore.startExecution`. Shows `loadingHistory`. |
| `SfnStepCard` | One collapsible step | Shows red error block if `step.error` present. "Ver Logs" button if `step.lambdaArn` present. Uses `useState` for open/closed — no Radix Collapsible needed. |
| `sfnStore` | All remote state + async actions | Single source of truth. Components never call `invoke` directly. |
| `stepfunctions.rs` | AWS SDK communication + event aggregation into `SfnStep[]` | No presentation logic. |

---

## Store: Persistence Contract

`sfnStore.ts` uses `persist + devtools`. The `partialize` function persists only UI preferences, **not** remote data (which is stale on restart):

```ts
partialize: (s) => ({
  selectedMachineArn: s.selectedMachineArn,
  // machines, executions, steps are NOT persisted — always re-fetched
})
```

---

## Error Handling

| Scenario | Handling |
|---|---|
| AWS credentials not configured | `NeedConfig` → `onGo` calls `useCwStore.setActiveTab('settings')` |
| `sfn_list_state_machines` fails | `sfnStore.errorMachines` shown as `Badge variant="destructive"` in `SfnMachineSelector` |
| `sfn_list_executions` fails | `sfnStore.errorExecutions` shown inline in `SfnExecutionList` |
| `sfn_get_execution_history` fails | `sfnStore.errorHistory` shown in `SfnExecutionInspector` |
| Failed step (status = 'failed') | `SfnStepCard` shows `error` + `cause` in red block above `<pre>` |
| `sfn_start_execution` fails | `toast.error(...)` via `sonner` |
| `sfn_start_execution` succeeds | `toast.success(...)` + auto-refresh executions list |
| No state machines found | Empty state message in `SfnMachineSelector` |
| No executions found | Empty state row in `SfnExecutionList` |
| No steps (history empty) | Empty state message in `SfnExecutionInspector` |

---

## shadcn/ui Components Used

| Need | shadcn Component |
|---|---|
| State machine dropdown | `Select + SelectTrigger + SelectContent + SelectItem` |
| Execution status | `Badge` (SUCCEEDED→default, FAILED→destructive, RUNNING→secondary, TIMED_OUT/ABORTED→outline) |
| Edit input JSON | `Textarea` |
| Refresh / Restart buttons | `Button` (variant ghost / default) |
| Collapsible step | `useState` open/closed — no Radix/Base-UI Collapsible |
| Tooltips on icon buttons | `TooltipProvider + Tooltip + TooltipTrigger render={<Button />} + TooltipContent` |
| JSON display | `<pre className="...">` — no Monaco |

---

## Cargo.toml Dependency

```toml
aws-sdk-sfn = "1"
```

(Consistent with existing short-form entries: `aws-sdk-cloudwatchlogs = "1"`, etc.)

---

## Constraints & Decisions

- **Credentials:** `useAwsStore(s => s.credentials)` — same source as all other AWS panels. Mapped to snake_case via a `getRustCreds()` helper inside `sfnStore`.
- **No Monaco:** JSON shown in `<pre>` for performance and simplicity.
- **Edit & Restart:** always relaunches on the same state machine as the selected execution. `machineArn` is derived from `selectedMachineArn` in the store.
- **20 executions:** `maxResults: 20`, no pagination in v1.
- **"Ver Logs":** shown only when `step.lambdaArn` is present. Log group = `/aws/lambda/${lambdaArn.split(':').pop()}`. Navigates via `useCwStore.goToLogs(logGroup)` + `setActiveView('cloudwatch')`.
- **Store:** dedicated `sfnStore.ts` with `persist + devtools` (not a slice of `awsStore`) — follows `apiGatewayStore` precedent.
- **Rust client builder:** follows `apigateway.rs` pattern (includes `BehaviorVersion::latest()`).
