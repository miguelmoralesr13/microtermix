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

New tab `'step-functions'` registered in `CloudWatchPanel.tsx` alongside the existing tabs (Settings, Logs, Metrics, EC2, API Gateway).

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

New module `src-tauri/src/stepfunctions.rs` reusing `CwCredentials` from `cloudwatch.rs`.

**Tauri commands:**
| Command | Description |
|---|---|
| `sfn_list_state_machines` | Lists all state machines in the account/region (paginated, first 50) |
| `sfn_list_executions` | Lists last 20 executions for a given machine ARN, sorted by startDate desc |
| `sfn_get_execution_history` | Fetches all events and filters/aggregates into `SfnStep[]` |
| `sfn_start_execution` | Starts a new execution with a given JSON input string |

Registered in `lib.rs` following the same pattern as `apigateway`.

---

## Data Flow

```
useAwsStore.credentials (camelCase)
        ↓  mapped to snake_case in sfnStore actions
sfnStore.fetchMachines()  →  invoke('sfn_list_state_machines')
                                      ↓
                             sfnStore.machines: SfnMachine[]

sfnStore.selectMachine(arn) → sfnStore.fetchExecutions(arn)
                                      ↓  invoke('sfn_list_executions', { arn, maxResults: 20 })
                             sfnStore.executions: SfnExecution[]

sfnStore.selectExecution(executionArn) → sfnStore.fetchHistory(executionArn)
        ↓  invoke('sfn_get_execution_history', { executionArn })
        ↓  Rust: filter StateEntered/StateExited/ExecutionFailed events → SfnStep[]
sfnStore.steps: SfnStep[]

SfnStepCard "Ver Logs en CloudWatch" button:
    → extract Lambda log group from lambdaArn: /aws/lambda/<function-name>
    → useCwStore.goToLogs(logGroup)
    → WorkspaceContext.setActiveView('cloudwatch')

"Edit & Restart":
    → user edits input JSON in shadcn Textarea
    → invoke('sfn_start_execution', { machineArn, input: editedJson })
    → sfnStore.fetchExecutions(force=true)
    → toast success/error via sonner
```

---

## Types

### Frontend (`sfnStore.ts`)

```ts
interface SfnMachine {
  arn: string;
  name: string;
  type: 'STANDARD' | 'EXPRESS';
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
  output?: string;      // JSON string
  error?: string;
  cause?: string;
  lambdaArn?: string;   // present if resource is a Lambda ARN
}
```

### Rust (`stepfunctions.rs`)

```rust
#[derive(Serialize)]
pub struct SfnMachine {
    pub arn: String,
    pub name: String,
    pub machine_type: String,
    pub created_at: i64,
}

#[derive(Serialize)]
pub struct SfnExecution {
    pub execution_arn: String,
    pub name: String,
    pub status: String,
    pub start_date: i64,
    pub stop_date: Option<i64>,
}

#[derive(Serialize)]
pub struct SfnStep {
    pub name: String,
    pub status: String,
    pub entered_at: i64,
    pub exited_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub cause: Option<String>,
    pub lambda_arn: Option<String>,
}
```

---

## Component Responsibilities (SOLID)

| Component | Single Responsibility |
|---|---|
| `StepFunctionsTab` | 3-column layout + `NeedConfig` guard. No business logic. |
| `SfnMachineSelector` | Render & select a state machine via shadcn `Select`. Calls `sfnStore.selectMachine`. |
| `SfnExecutionList` | Display 20 executions table. `Badge` for status color. Calls `sfnStore.selectExecution`. |
| `SfnExecutionInspector` | Chronological list of `SfnStepCard` + "Edit & Restart" section with shadcn `Textarea`. |
| `SfnStepCard` | One collapsible step. Shows error block prominently in red. `<pre>` for input/output. "Ver Logs" button if `lambdaArn` present. |
| `sfnStore` | All remote state + async actions. Single source of truth. Components never call `invoke` directly. |
| `stepfunctions.rs` | AWS SDK communication + event aggregation into `SfnStep[]`. No presentation logic. |

---

## Error Handling

| Scenario | Handling |
|---|---|
| AWS credentials not configured | `NeedConfig` component → redirects to `settings` tab |
| Network / AWS API error | `sfnStore.error` per operation, shown as `Badge variant="destructive"` inline |
| Failed step | `SfnStepCard` shows `error` + `cause` in a red block above the JSON `<pre>` |
| `sfn_start_execution` fails | `toast.error(...)` via `sonner` |
| `sfn_start_execution` succeeds | `toast.success(...)` + auto-refresh executions list |

---

## shadcn/ui Components Used

| Need | shadcn Component |
|---|---|
| State machine dropdown | `Select + SelectTrigger + SelectContent + SelectItem` |
| Execution status | `Badge` (variant mapped: SUCCEEDED→default, FAILED→destructive, RUNNING→secondary) |
| Edit input JSON | `Textarea` |
| Refresh / Restart buttons | `Button` (variant ghost / default) |
| Collapsible step | Raw `<details>` or controlled `useState` open — no Radix Collapsible needed |
| Tooltips on icon buttons | `TooltipProvider + Tooltip + TooltipTrigger + TooltipContent` |
| JSON display | `<pre className="...">` with dark background, no Monaco |

---

## Cargo.toml Dependency

```toml
aws-sdk-sfn = { version = "1", features = [] }
```

---

## Constraints & Decisions

- **Credentials:** `useAwsStore(s => s.credentials)` — same source as all other AWS panels.
- **No Monaco:** JSON shown in `<pre>` for performance and simplicity.
- **Edit & Restart:** always relaunches on the same state machine as the selected execution.
- **20 executions:** default `maxResults: 20`, no pagination in v1.
- **"Ver Logs":** only shown when step has a `lambdaArn`; navigates to CloudWatch Logs tab with preloaded log group `/aws/lambda/<fn-name>`.
- **Store:** dedicated `sfnStore.ts` with `persist + devtools` (not a slice in `awsStore` — SFN has enough state to warrant its own store, following the `apiGatewayStore` precedent).
