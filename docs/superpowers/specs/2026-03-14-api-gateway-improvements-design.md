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
ApiGatewayDetails.tsx (updated) Cargo.toml (new explicit dep)
ApiTreeItem.tsx (extracted)
ApiGatewayTester.tsx (new)
cwStore.ts (updated — goToLogs)
```

**Credential flow:** All store actions read credentials via `useAwsStore.getState().credentials` — no credential prop drilling through components. `apiGatewayStore.ts` imports `CwCredentials` from `../services/cloudwatchApi` (same type used by `awsStore`). The old `AwsCredentials` interface in `useApiGatewayStore.ts` is deleted. Each action remaps camelCase `CwCredentials` to snake_case for Tauri IPC:

```ts
// pattern used in every action that calls a Tauri command
const c = useAwsStore.getState().credentials;
if (!c) { set({ error: 'No credentials configured' }); return; }
const rustCreds = {
  access_key_id: c.accessKeyId,
  secret_access_key: c.secretAccessKey,
  region: c.region,
  session_token: c.sessionToken ?? null,
};
```

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
| `methodDetails` | `Record<string, RestMethodDetails \| HttpRouteIntegrationDetails>` | No | Per-method details cache. Key format: `"${apiId}\|${resourceId}\|${method}"` |
| `exportedSwagger` | `Record<string, string>` | No | Swagger JSON cache, keyed by `apiId\|stage`. Not persisted — re-fetchable on demand, persisting risks localStorage quota exhaustion for accounts with many APIs |
| `favoriteApis` | `string[]` | **Yes** | Favorite API IDs (migrated from manual localStorage) |
| `stages` | `Record<string, string[]>` | No | Available stages per API |
| `selectedStage` | `Record<string, string>` | **Yes** | Active stage per API (used for Swagger export) |
| `jsonPresets` | `Record<string, string>` | **Yes** | Last successful JSON body, keyed by `"${apiId}\|${METHOD}\|${path}"` |
| `testerOpen` | `boolean` | No | Controls tester drawer visibility |
| `testerEndpoint` | `TesterEndpoint \| null` | No | Endpoint loaded in tester |
| `testerResponse` | `InvokeResponse \| null` | No | Last invocation response (in-memory only) |
| `loadingInvoke` | `boolean` | No | Tester request in-flight |
| `loadingApis` | `boolean` | No | |
| `loadingDetails` | `Record<string, boolean>` | No | |
| `loadingMethodDetails` | `Record<string, boolean>` | No | |
| `error` | `string \| null` | No | |

**Persist middleware** wraps only: `favoriteApis`, `jsonPresets`, `selectedStage`.

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

// Frontend shape sent to invokeEndpoint action (maps to Rust InvokeRequest via snake_case tauri invoke)
interface FrontendInvokeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  service: string;   // always "execute-api"
  sign: boolean;     // true = add SigV4 Authorization header
}
```

### New / changed actions

| Action | Signature | Notes |
|---|---|---|
| `fetchApis` | `() => Promise<void>` | Reads creds from `awsStore`. Calls `apigw_fetch_all` (single IPC, parallel Rust) |
| `fetchStages` | `(apiId: string, isRest: boolean) => Promise<void>` | Reads creds from `awsStore`. Calls `apigw_get_stages` |
| `openTester` | `(endpoint: TesterEndpoint) => void` | Sets `testerEndpoint` + `testerOpen: true` |
| `closeTester` | `() => void` | Clears `testerOpen`, `testerResponse` |
| `invokeEndpoint` | `(req: FrontendInvokeRequest) => Promise<void>` | Reads creds from `awsStore`. Calls `apigw_invoke_endpoint`. On 2xx: calls `savePreset` |
| `savePreset` | `(key: string, json: string) => void` | |
| `getPreset` | `(key: string) => string \| null` | |

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

**Cargo.toml:** Add explicit dependency — transitive deps cannot be used directly:

```toml
aws-sigv4 = { version = "1", features = ["sign-http"] }
```

Verify the exact version matches what `aws-sdk-apigateway` pulls (run `cargo tree | grep aws-sigv4` to confirm). The feature flag `sign-http` exposes the HTTP request signing API.

### 2b. Extended `src-tauri/src/apigateway.rs`

**`apigw_fetch_all`** — new command, replaces two separate IPC calls from frontend

```rust
#[derive(Serialize)]
pub struct FetchAllResult {
    pub rest_apis: Vec<RestApiInfo>,
    pub http_apis: Vec<HttpApiInfo>,
}

#[tauri::command]
pub async fn apigw_fetch_all(credentials: CwCredentials) -> Result<FetchAllResult, String>
```

Internally builds both clients then uses `tokio::join!`:

```rust
let (rest_result, http_result) = tokio::join!(
    fetch_rest_apis_internal(&v1_client),
    fetch_http_apis_internal(&v2_client)
);
```

The existing `apigw_get_rest_apis` and `apigw_get_http_apis` are refactored into private `_internal` helpers; the public commands remain for backwards compatibility.

**`apigw_get_stages`** — new command

```rust
#[tauri::command]
pub async fn apigw_get_stages(
    credentials: CwCredentials,
    api_id: String,
    is_rest: bool,
) -> Result<Vec<String>, String>
```

- REST (V1): `client.get_stages().rest_api_id(&api_id).send()` → output uses `.item()` (no 's') to get the stage slice
- HTTP/V2: `client.get_stages().api_id(&api_id).send()` → output uses `.items()` (with 's')

This asymmetry in the AWS SDK is intentional: V1 SDK uses `.item()`, V2 uses `.items()`. In both cases `stage_name()` returns `Option<&str>` — filter out `None` entries, return only non-empty strings.

Replaces hardcoded `'prod'` / `'$default'` in Swagger export flow.

**`apigw_invoke_endpoint`** — new command

```rust
#[derive(Deserialize)]
pub struct InvokeRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub service: String,   // "execute-api"
    pub sign: bool,
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
2. Build `reqwest::RequestBuilder` from `method`, `url`, `headers`, `body`
3. If `sign: true`, call `sigv4::sign_request(...)` — adds `Authorization`, `x-amz-date`, optionally `x-amz-security-token` headers
4. Record start time, execute request, compute `duration_ms`
5. Return `InvokeResponse` with status, headers (as `HashMap<String,String>`), body as UTF-8 string

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
- "No credentials" overlay: `const isConfigured = !!useAwsStore(s => s.credentials?.accessKeyId)` (replaces prop-based check)
- Mount `<ApiGatewayTester />` always (drawer controlled by `testerOpen` in store)
- Pass no credentials to child components

### 3a-bis. `CloudWatchPanel.tsx` — updated

- Remove `credentials={cfg}` prop from `<ApiGatewayPanel>` call site
- `ApiGatewayPanel` no longer accepts a `credentials` prop

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
  1. `cwStore.goToLogs('/aws/lambda/{FUNCTION_NAME}')` — see cwStore update below
  2. Navigate to CloudWatch panel via `WorkspaceContext.setActiveView('cloudwatch')`

**`ApiTreeItem` extraction:**
- Move `ApiTreeItem` to its own file `src/components/ApiTreeItem.tsx`
- Remove `credentials` prop from `ApiTreeItem` — `fetchMethodDetails` reads credentials from `awsStore` internally
- Method badges: when a method is selected (inline details visible), show a small `<Play size={12} />` icon button next to the badge → calls `apiGatewayStore.openTester(endpoint)`

### 3d. `ApiGatewayTester.tsx` — new component

Uses shadcn `Dialog`. Since `@base-ui/react` Dialog has no built-in drawer variant, the drawer effect requires CSS overrides. Before implementing, verify whether base-ui's `DialogContent` applies a centering transform (`translate(-50%, -50%)`) via CSS variables in `src/App.css`. If so, use `!translate-x-0 !translate-y-0` (Tailwind important prefix) to override it. The target CSS:

```tsx
<DialogContent className="fixed right-0 top-0 h-full w-[520px] max-w-full
                           !translate-x-0 !translate-y-0 rounded-none
                           border-l border-slate-800 flex flex-col p-0 overflow-hidden">
```

If the Dialog centering cannot be overridden cleanly, use a Tailwind-positioned `div` with a backdrop overlay (controlled by `testerOpen`) as fallback — this avoids creating a raw modal since there is no native shadcn Sheet/Drawer in this base-ui build.

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
- On open: load preset via `apiGatewayStore.getPreset("${apiId}|${METHOD}|${path}")` into Monaco editor
- Path params (`{param}`) in Params tab render as `Input` fields; interpolated into URL before send
- Query params tab: key/value rows with `Input` + `Button` add/remove (shadcn)
- Custom headers tab: same key/value pattern
- `Firmar SigV4` checkbox: default `true` if `authType === 'AWS_IAM'`, `false` otherwise
- On 2xx response: auto-save body to preset via `savePreset`
- `loadingInvoke` drives spinner on Send button

---

## 4. `cwStore.ts` — updated

Add `goToLogs` action and `preloadedLogGroup` field, mirroring existing `goToMetrics` pattern:

```ts
interface CwState {
  // ...existing...
  preloadedLogGroup: string | null;   // NEW
}

interface CwActions {
  // ...existing...
  goToLogs: (logGroup: string) => void;        // NEW
  clearPreloadedLogGroup: () => void;           // NEW
}

// implementation:
goToLogs: (logGroup) => set({ activeTab: 'logs', preloadedLogGroup: logGroup }),
clearPreloadedLogGroup: () => set({ preloadedLogGroup: null }),
```

The CloudWatch logs panel reads `preloadedLogGroup` on mount/tab-switch and pre-fills its log group filter input.

---

## 5. Data Flow — Test Client

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
          service: 'execute-api',
          sign: sigV4Checked
      })
    → reads credentials from awsStore.getState().credentials
    → remaps to snake_case rustCreds
    → invokes Tauri command apigw_invoke_endpoint
    → Rust: optionally signs with SigV4, executes via reqwest
    → returns InvokeResponse
    → store sets testerResponse
    → if 2xx: savePreset("${apiId}|POST|/orders", body)
    → Drawer shows status + formatted response
```

---

## 6. Out of Scope

- Local development proxy (explicitly excluded)
- Stage variable editing (read-only stage list only)
- Unified `ApiEndpoint` type normalization in Rust (deferred to future iteration)
- WebSocket testing

---

## 7. Files to Create / Modify

| File | Action |
|---|---|
| `src/stores/apiGatewayStore.ts` | Create (replaces `useApiGatewayStore.ts`) |
| `src/stores/useApiGatewayStore.ts` | Delete after migration |
| `src/stores/cwStore.ts` | Modify (add `goToLogs`, `preloadedLogGroup`, `clearPreloadedLogGroup`) |
| `src/components/cloudwatch/LogsTab.tsx` | Modify (consume `preloadedLogGroup` on mount — same pattern as `MetricsTab` consumes `preloadedMetric`) |
| `src/components/CloudWatchPanel.tsx` | Modify (remove `credentials={cfg}` prop from `<ApiGatewayPanel>`) |
| `src/components/ApiGatewayTester.tsx` | Create |
| `src/components/ApiTreeItem.tsx` | Create (extracted from `ApiGatewayDetails.tsx`) |
| `src/components/ApiGatewayPanel.tsx` | Modify |
| `src/components/ApiGatewayList.tsx` | Modify |
| `src/components/ApiGatewayDetails.tsx` | Modify |
| `src-tauri/src/sigv4.rs` | Create |
| `src-tauri/src/apigateway.rs` | Modify (add 3 commands, refactor to internal helpers) |
| `src-tauri/src/lib.rs` | Modify (register 3 new commands) |
| `src-tauri/Cargo.toml` | Modify (add `aws-sigv4 = { version = "1", features = ["sign-http"] }`) |
