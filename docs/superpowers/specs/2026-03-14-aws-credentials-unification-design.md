# AWS Credentials Unification — Design Spec
**Date:** 2026-03-14
**Status:** Approved

---

## Overview

Consolidate all AWS credential management into a single source of truth: `awsStore`. Currently, CloudWatch/Logs/Metrics/EC2 tabs use a parallel `loadCwConfig`/`saveCwConfig` localStorage pattern, creating two independent credential stores. This spec eliminates the old pattern entirely.

---

## Problem

| Location | Current pattern | Problem |
|---|---|---|
| `SettingsTab.tsx` | `saveCwConfig(draft)` → `localStorage['microtermix-cloudwatch-cfg']` | Writes to a different key than `awsStore` |
| `CloudWatchPanel.tsx` | `useState(() => loadCwConfig())` → passes `cfg` as prop | Local state, not reactive to `awsStore` changes |
| `LogsTab`, `MetricsTab`, `Ec2Tab` | Receive `cfg: CwCredentials` prop | Prop drilling, can't access credentials independently |
| `EC2Panel.tsx`, `ApiGatewayPanel.tsx` | Already use `useAwsStore` | Inconsistent — two patterns in same codebase |

---

## Design

### 1. `src/stores/awsStore.ts` — one-time migration

Add `onRehydrateStorage` to the `persist` config. After Zustand rehydrates, if `credentials` is still `null`, attempt to load from the old key:

```ts
onRehydrateStorage: () => (state) => {
    if (state && !state.credentials) {
        try {
            const raw = localStorage.getItem('microtermix-cloudwatch-cfg');
            if (raw) {
                const old = JSON.parse(raw);
                if (old?.accessKeyId) {
                    state.credentials = old;
                    localStorage.removeItem('microtermix-cloudwatch-cfg');
                }
            }
        } catch { /* ignore */ }
    }
}
```

This runs once on startup. Deletes the old key after migration so it doesn't run again.

No other changes to `awsStore.ts`.

---

### 2. `src/components/cloudwatch/SettingsTab.tsx`

**Remove:** imports of `loadCwConfig`, `saveCwConfig` from `cloudwatchApi`

**Add:** import `useAwsStore` from `../../stores/awsStore`

**Draft initial state** — replace `loadCwConfig()` with:
```ts
const [draft, setDraft] = useState<CwCredentials>(
    () => useAwsStore.getState().credentials ?? { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' }
);
```

**`handleSave`** — replace `saveCwConfig(draft)` with:
```ts
useAwsStore.getState().setCredentials(draft);
onSaved();
```

Everything else (test connection, paste block, SSM path field) stays unchanged.

---

### 3. `src/components/CloudWatchPanel.tsx`

**Remove:**
- `import { CwCredentials, loadCwConfig } from '../services/cloudwatchApi'`
- `const [cfg, setCfg] = useState<CwCredentials>(() => loadCwConfig())`
- The `handleSaved` reload logic: `const updated = loadCwConfig(); setCfg(updated);`
- `cfg={cfg}` props on all child tabs

**Add:**
```ts
import { useAwsStore } from '../stores/awsStore';
const credentials = useAwsStore(s => s.credentials);
const isConfigured = !!(credentials?.accessKeyId && credentials?.secretAccessKey && credentials?.region);
```

**`handleSaved`** becomes just:
```ts
const handleSaved = () => {
    setSavedMsg(true);
    if (useAwsStore.getState().credentials?.accessKeyId) setTab('logs');
};
```

Tab rendering — remove `cfg={cfg}`:
```tsx
{tab === 'logs' && isConfigured && <LogsTab />}
{tab === 'metrics' && isConfigured && <MetricsTab />}
{tab === 'ec2' && isConfigured && <Ec2Tab />}
```

---

### 4. `src/components/cloudwatch/LogsTab.tsx`

**Remove:** `cfg: CwCredentials` from props interface and all usages as prop

**Add internally:**
```ts
import { useAwsStore } from '../../stores/awsStore';
const credentials = useAwsStore(s => s.credentials);
```

Replace every reference to `cfg` → `credentials` throughout the component. Since `credentials` can be `null` (while `cfg` was always defined), add a null guard at the top:
```ts
if (!credentials) return null;
```

---

### 5. `src/components/cloudwatch/MetricsTab.tsx`

Same pattern as `LogsTab`:
- Remove `cfg: CwCredentials` prop
- Add `useAwsStore` import and `const credentials = useAwsStore(s => s.credentials)`
- Replace all `cfg` → `credentials`
- Add null guard

---

### 6. `src/components/cloudwatch/Ec2Tab.tsx`

Same pattern as `LogsTab`:
- Remove `cfg: CwCredentials` prop
- Add `useAwsStore` import and `const credentials = useAwsStore(s => s.credentials)`
- Replace all `cfg` → `credentials`
- Add null guard

Note: `Ec2Tab` uses `toEc2Rust(cfg)` from `ec2Types.ts`. This helper accepts `CwCredentials` — since `credentials` is `CwCredentials | null` and the null guard runs before this call, it will typecheck correctly.

---

### 7. `src/services/cloudwatchApi.ts`

**Remove:** `loadCwConfig` and `saveCwConfig` functions and the `STORAGE_KEY` constant.

**Keep:** `CwCredentials` type, all API functions (`cwGetLogGroups`, `cwGetLogStreams`, `cwGetLogEvents`, `cwGetMetrics`, `cwGetDatapoints`, `ssmCheckPlugin`, etc.) — these accept `CwCredentials` as a parameter and are unaffected.

---

## Data Flow After Migration

```
User types credentials in SettingsTab
    → handleSave → awsStore.setCredentials(draft)
    → Zustand persist writes to 'microtermix-aws-store' in localStorage
    → All subscribers (CloudWatchPanel, LogsTab, MetricsTab, Ec2Tab,
       Ec2Panel, ApiGatewayPanel, apiGatewayStore) react automatically
```

On next app start:
```
Zustand rehydrates → credentials loaded from 'microtermix-aws-store'
    → if null: checks 'microtermix-cloudwatch-cfg' (old key), migrates, deletes old key
```

---

## Files to Modify

| File | Change |
|---|---|
| `src/stores/awsStore.ts` | Add `onRehydrateStorage` migration |
| `src/components/cloudwatch/SettingsTab.tsx` | Write to `awsStore`, read from `awsStore` |
| `src/components/CloudWatchPanel.tsx` | Read from `awsStore`, remove prop drilling |
| `src/components/cloudwatch/LogsTab.tsx` | Remove `cfg` prop, read from `awsStore` |
| `src/components/cloudwatch/MetricsTab.tsx` | Remove `cfg` prop, read from `awsStore` |
| `src/components/cloudwatch/Ec2Tab.tsx` | Remove `cfg` prop, read from `awsStore` |
| `src/services/cloudwatchApi.ts` | Remove `loadCwConfig`, `saveCwConfig`, `STORAGE_KEY` |

## Files NOT changed

- `EC2Panel.tsx` — already uses `awsStore` correctly
- `ApiGatewayPanel.tsx` — already uses `awsStore` correctly
- `apiGatewayStore.ts` — already uses `awsStore.getState().credentials`
- All Rust backend files — unaffected
