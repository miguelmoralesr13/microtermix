# API Gateway Improvements — Design Spec
**Date:** 2026-03-14
**Status:** Approved

---

## Overview

Upgrade the API Gateway panel from a read-only explorer to a full developer tool: integrated test client with SigV4 signing, Lambda deep linking to CloudWatch logs, stage selector for Swagger export, and a unified persistent store. The local proxy feature is explicitly out of scope.

---

## Architecture

### Layers affected

```
Frontend                        Backend (Rust)
───────────────────────         ──────────────────────────
apiGatewayStore.ts (new)        apigateway.rs (extended)
ApiGatewayPanel.tsx (updated)   sigv4.rs (new module)
ApiGatewayList.tsx (updated)    lib.rs (new commands registered)
ApiGatewayDetails.tsx (updated)
ApiTreeItem.tsx (extracted)
ApiGatewayTester.tsx (new)
```

**Credential flow:** All store actions read credentials via `useAwsStore.getState().credentials` — no credential prop drilling through components.

---

## 1. Store — `src/stores/apiGatewayStore.ts`

Replaces `useApiGatewayStore.ts`. All existing state and actions are preserved; new fields are additive.

### State

| Field | Type | Persisted | Description |
|---|---|---|---|
| `restApis` | `RestApiInfo[]` | No | REST (V1) APIs |
| `httpApis` | `HttpApiInfo[]` | No | HTTP/WS (V2) APIs |
| `selectedApi` | `SelectedApi \| null` | No | Currently selected API |
| `restResources` | `Record<string, RestApiResource[]>` | No | Resources per REST API |
| `httpRoutes` | `Record<string, HttpApiRoute[]>` | No | Routes per HTTP API |
| `methodDetails` | `Record<string, RestMethodDetails \| HttpRouteIntegrationDetails>` | No | Per-method details cache |
| `exportedSwagger` | `Record<string, string>` | **Yes** | Swagger JSON cache, keyed by `apiId\|stage` |
| `favoriteApis` | `string[]` | **Yes** | Favorite API IDs (migrated from manual localStorage) |
| `stages` | `Record<string, string[]>` | No | Available stages per API |
| `selectedStage` | `Record<string, string>` | **Yes** | Active stage per API (used for Swagger export) |
| `jsonPresets` | `Record<string, string>` | **Yes** | Last successful JSON body, keyed by `apiId\|METHOD\|/path` |
| `testerOpen` | `boolean` | No | Controls tester drawer visibility |
| `testerEndpoint` | `TesterEndpoint \| null` | No | Endpoint loaded in tester |
| `testerResponse` | `InvokeResponse \| null` | No | Last invocation response (in-memory only) |
| `loadingInvoke` | `boolean` | No | Tester request in-flight |
| `loadingApis` | `boolean` | No | |
| `loadingDetails` | `Record<string, boolean>` | No | |
| `loadingMethodDetails` | `Record<string, boolean>` | No | |
| `error` | `string \| null` | No | |

### New types

```ts
interface TesterEndpoint {
  apiId: string;
  method: string;
  path: string;
  resourceId: string;
  isRest: boolean;
  baseUrl: string;         // api_endpoint from HttpApiInfo, or constructed for REST
  authType: string | null; // from method details, determines SigV4 default
}

interface InvokeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
}
```

### New / changed actions

| Action | Signature | Notes |
|---|---|---|
| `fetchApis` | `() => Promise<void>` | Reads creds from `awsStore`. Calls new `apigw_fetch_all` command (single IPC) |
| `fetchStages` | `(apiId: string, isRest: boolean) => Promise<void>` | Reads creds from `awsStore`. Calls `apigw_get_stages` |
| `openTester` | `(endpoint: TesterEndpoint) => void` | Sets `testerEndpoint` + `testerOpen: true` |
| `closeTester` | `() => void` | Clears `testerOpen`, `testerResponse` |
| `invokeEndpoint` | `(req: FrontendInvokeRequest) => Promise<void>` | Reads creds from `awsStore`. Calls `apigw_invoke_endpoint`. On success saves preset |
| `savePreset` | `(key: string, json: string) => void` | |
| `getPreset` | `(key: string) => string \| null` | |

**Persist middleware** wraps only: `exportedSwagger`, `favoriteApis`, `jsonPresets`, `selectedStage`.

---

## 2. Rust Backend

### 2a. New module `src-tauri/src/sigv4.rs`

Generic SigV4 signing utility, reusable by any future AWS module.

```rust
pub fn sign_request(
    creds: &CwCredentials,
    region: &str,
    service: &str,       // e.g. "execute-api"
    method: &str,
    url: &url::Url,
    headers: &mut reqwest::header::HeaderMap,
    body: &[u8],
) -> Result<(), String>
```

Uses `aws-sigv4` crate (already a transitive dependency of `aws-sdk-*`). Returns signed headers by mutating `headers` in place.

### 2b. Extended `src-tauri/src/apigateway.rs`

**`apigw_fetch_all`** — new command, replaces two separate calls from frontend

```rust
#[derive(Serialize)]
pub struct FetchAllResult {
    pub rest_apis: Vec<RestApiInfo>,
    pub http_apis: Vec<HttpApiInfo>,
}

#[tauri::command]
pub async fn apigw_fetch_all(credentials: CwCredentials) -> Result<FetchAllResult, String>
```

Internally builds both clients and uses `tokio::join!` to fetch in parallel:

```rust
let (rest_result, http_result) = tokio::join!(
    fetch_rest_apis(&v1_client),
    fetch_http_apis(&v2_client)
);
```

**`apigw_get_stages`** — new command

```rust
#[tauri::command]
pub async fn apigw_get_stages(
    credentials: CwCredentials,
    api_id: String,
    is_rest: bool,
) -> Result<Vec<String>, String>
```

For REST: `client.get_stages().rest_api_id(api_id)` → collect `stage_name` values.
For HTTP/V2: `client.get_stages().api_id(api_id)` → collect `stage_name` values.
Replaces hardcoded `'prod'` / `'$default'` in Swagger export flow.

**`apigw_invoke_endpoint`** — new command

```rust
#[derive(Deserialize)]
pub struct InvokeRequest {
    pub url: String,
    pub method: String,                        // GET, POST, etc.
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub service: String,                       // "execute-api"
    pub sign: bool,                            // false = public API
}

#[derive(Serialize)]
pub struct InvokeResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn apigw_invoke_endpoint(
    credentials: CwCredentials,
    request: InvokeRequest,
) -> Result<InvokeResponse, String>
```

Flow:
1. Build `reqwest::Client`
2. If `sign: true`, call `sigv4::sign_request(...)` to add `Authorization`, `x-amz-date`, `x-amz-security-token` headers
3. Execute request, measure duration
4. Return status, response headers, body as string

### 2c. `lib.rs` — register new commands

```rust
apigw_fetch_all,
apigw_get_stages,
apigw_invoke_endpoint,
```

---

## 3. Frontend Components

### 3a. `ApiGatewayPanel.tsx` — updated

- Remove `credentials` prop
- `useEffect` subscribes to `awsStore` credentials change → calls `fetchApis()` (no args)
- Mount `<ApiGatewayTester />` always (drawer controlled by store)
- Pass no credentials to child components

### 3b. `ApiGatewayList.tsx` — updated

- Remove `credentials` prop
- No other logic changes

### 3c. `ApiGatewayDetails.tsx` — updated

**Stage selector:**
- On API selection, call `fetchStages(apiId, isRest)`
- Replace "Preview Contract" button area with: `Select` (shadcn) listing stages + "Preview Contract" button
- Selected stage stored in `apiGatewayStore.selectedStage[apiId]`, used as `stageName` in `exportSwagger`

**Lambda deep linking:**
- In integration URI display (both REST and HTTP paths), detect `lambda:path/functions/arn:aws:lambda:REGION:ACCOUNT:function:FUNCTION_NAME`
- Extract `FUNCTION_NAME` and render:
  ```
  → arn:...FUNCTION_NAME   [Ver Logs ↗]
  ```
- "Ver Logs" click:
  1. `cwStore.setActiveTab('logs')`
  2. Navigate to CloudWatch panel (via `WorkspaceContext.setActiveView('cloudwatch')`)
  3. Pre-filter log group: `/aws/lambda/{FUNCTION_NAME}` (passed via cwStore or navigation state)

**`ApiTreeItem` extraction:**
- Move `ApiTreeItem` component to its own file `src/components/ApiTreeItem.tsx`
- Method badges: when a method is selected (inline details visible), show a small `<Play size={12} />` icon button next to the badge → calls `apiGatewayStore.openTester(endpoint)`

### 3d. `ApiGatewayTester.tsx` — new component

Uses shadcn `Dialog` styled as a right-side drawer panel.

**Layout:**
```
Header:  METHOD /path                          [×]
         {baseUrl}/path
Tabs:    [Body] [Headers] [Params]
─────────────────────────────────────────────
Body tab:
  Monaco Editor (language: json, dark theme)
  [Preset: último enviado ▾]  [☐ Firmar SigV4]  [→ Enviar]

─────────────────────────────────────────────
Response section (appears after first send):
  200 OK • 142ms
  Monaco Editor read-only (formatted response body)
  [Ver Logs Lambda ↗]  (only if integration is Lambda)
```

**Behavior details:**
- On open: load preset from `apiGatewayStore.getPreset(key)` into Monaco editor if exists
- Path params (`{param}`) in Params tab render as `Input` fields; values are interpolated into URL before send
- Query params tab: key/value rows with `Input` + `Button` to add/remove rows (shadcn)
- Custom headers tab: same key/value pattern
- `Firmar SigV4` checkbox: default `true` if `authType === 'AWS_IAM'`, default `false` otherwise
- On successful response (2xx): auto-save body to preset via `savePreset`
- Error responses still shown in response panel (no auto-save)
- `loadingInvoke` drives a spinner on the Send button

---

## 4. Data Flow — Test Client

```
User clicks [Play] on POST /orders
    → apiGatewayStore.openTester({ apiId, method: 'POST', path: '/orders', ... })
    → ApiGatewayTester drawer opens
    → loads preset from store (if any)

User clicks [Enviar]
    → apiGatewayStore.invokeEndpoint({
          url: baseUrl + resolvedPath + queryString,
          method: 'POST',
          headers: customHeaders,
          body: monacoValue,
          sign: sigV4Checked
      })
    → reads credentials from awsStore.getState().credentials
    → invokes Tauri command apigw_invoke_endpoint
    → Rust: optionally signs with SigV4, executes via reqwest
    → returns InvokeResponse
    → store sets testerResponse
    → if 2xx: savePreset(key, body)
    → Drawer shows status + formatted response
```

---

## 5. Out of Scope

- Local development proxy (explicitly excluded)
- Stage variable editing (read-only stage list only)
- Unified `ApiEndpoint` type normalization in Rust (deferred to future iteration)
- WebSocket testing

---

## 6. Files to Create / Modify

| File | Action |
|---|---|
| `src/stores/apiGatewayStore.ts` | Create (replaces `useApiGatewayStore.ts`) |
| `src/stores/useApiGatewayStore.ts` | Delete after migration |
| `src/components/ApiGatewayTester.tsx` | Create |
| `src/components/ApiTreeItem.tsx` | Create (extracted from `ApiGatewayDetails.tsx`) |
| `src/components/ApiGatewayPanel.tsx` | Modify |
| `src/components/ApiGatewayList.tsx` | Modify |
| `src/components/ApiGatewayDetails.tsx` | Modify |
| `src-tauri/src/sigv4.rs` | Create |
| `src-tauri/src/apigateway.rs` | Modify (add 3 commands) |
| `src-tauri/src/lib.rs` | Modify (register new commands) |
| `src-tauri/Cargo.toml` | Modify if `aws-sigv4` needs explicit dep |
