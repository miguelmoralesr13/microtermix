# Workspace Config Persistence Implementation Plan (No Commits)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover las credenciales/cuentas de Jira, Git (`repoAccounts`) y Sonar fuera del `persist` de Zustand (localStorage) y consolidarlas en `nexus-workspace.json`, siguiendo el patrón ya establecido para `gitAccounts`.

**Architecture:** Extender `NexusWorkspaceConfig` con los nuevos campos, actualizar `buildWorkspaceConfigFromCurrentState` para leer de los stores, actualizar `applyWorkspaceConfig` en WorkspaceContext para hidratar los stores al cargar, y crear `sonarStore.ts` sin middleware `persist`. Los stores siguen siendo la fuente de verdad en memoria; el archivo JSON es la única persistencia para estas configs.

**Tech Stack:** TypeScript, Zustand (create sin persist para sonarStore), Tauri invoke (`write_workspace_config_in_folder`), React 19.

---

## Archivos a modificar / crear

| Archivo | Acción | Qué cambia |
|---------|--------|------------|
| `src/types/workspaceConfig.ts` | Modificar | Añadir `jiraAccounts`, `jiraActiveAccountId`, `sonarConfig` a `NexusWorkspaceConfig`; actualizar `buildWorkspaceConfigFromCurrentState` para leer jira y sonar |
| `src/context/WorkspaceContext.tsx` | Modificar | `applyWorkspaceConfig`: hidratar jiraStore y sonarStore al cargar workspace |
| `src/stores/jiraStore.ts` | Modificar | Quitar `accounts` y `activeAccountId` del `partialize`; añadir acción `hydrate` |
| `src/stores/gitStore.ts` | Modificar | Quitar `repoAccounts` del `partialize` (ya se persiste en workspace JSON) |
| `src/stores/sonarStore.ts` | Crear | Store Zustand sin persist para `{ serverUrl, token, authType }` |
| `src/components/SonarPanel.tsx` | Modificar | Usar `useSonarStore` en lugar de `useState` + localStorage para globalConfig |
| `src/components/ServiceManager.tsx` | Modificar | Añadir `jiraAccounts`, `jiraActiveAccountId`, `sonarConfig` al auto-save y `handleSaveWorkspaceConfig` |

---

## Chunk 1: sonarStore + tipos + buildWorkspaceConfig

### Task 1: Crear `sonarStore.ts`

**Files:**
- Create: `src/stores/sonarStore.ts`

- [ ] **Step 1: Crear el store sin persist**

```typescript
// src/stores/sonarStore.ts
import { create } from 'zustand';

export interface SonarConfig {
    serverUrl: string;
    token: string;
    authType: 'basic' | 'bearer';
}

export const DEFAULT_SONAR_CONFIG: SonarConfig = {
    serverUrl: 'https://sonarcloud.io',
    token: '',
    authType: 'basic',
};

interface SonarStore {
    config: SonarConfig;
    setConfig: (patch: Partial<SonarConfig>) => void;
    hydrate: (cfg: SonarConfig) => void;
}

export const useSonarStore = create<SonarStore>()((set) => ({
    config: { ...DEFAULT_SONAR_CONFIG },

    setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),

    hydrate: (cfg) =>
        set({ config: { ...DEFAULT_SONAR_CONFIG, ...cfg } }),
}));
```

- [ ] **Step 2: Verificar que no hay errores de TypeScript**

```bash
cd /mnt/datos/projects/microtermix && npx tsc --noEmit 2>&1 | head -30
```

---

### Task 2: Extender `NexusWorkspaceConfig` con los nuevos campos

**Files:**
- Modify: `src/types/workspaceConfig.ts`

- [ ] **Step 1: Añadir imports y campos al interface**

En `src/types/workspaceConfig.ts`, añadir import de `JiraAccount` desde `'../stores/jiraStore'` y el import de `SonarConfig` desde `'../stores/sonarStore'`.

Añadir al interface `NexusWorkspaceConfig`:
```typescript
jiraAccounts?: JiraAccount[];
jiraActiveAccountId?: string | null;
sonarConfig?: SonarConfig;
```

- [ ] **Step 2: Actualizar `buildWorkspaceConfigFromCurrentState` para leer jira y sonar**

Añadir lecturas de jira y sonar:
```typescript
jiraAccounts: useJiraStore.getState().accounts,
jiraActiveAccountId: useJiraStore.getState().activeAccountId,
sonarConfig: useSonarStore.getState().config,
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd /mnt/datos/projects/microtermix && npx tsc --noEmit 2>&1 | head -30
```

---

## Chunk 2: Hidratación al cargar workspace + limpieza de persist

### Task 3: Hidratar jiraStore y sonarStore en `applyWorkspaceConfig`

**Files:**
- Modify: `src/context/WorkspaceContext.tsx`

- [ ] **Step 1: Añadir imports en WorkspaceContext.tsx**

```typescript
import { useJiraStore } from '../stores/jiraStore';
import { useSonarStore } from '../stores/sonarStore';
```

- [ ] **Step 2: Añadir hidratación en `applyWorkspaceConfig`**

Después del bloque `if (config.repoAccounts)`, añadir:
```typescript
if (config.jiraAccounts != null) {
    useJiraStore.getState().hydrate(
        config.jiraAccounts,
        config.jiraActiveAccountId ?? null,
    );
}

if (config.sonarConfig != null) {
    useSonarStore.getState().hydrate(config.sonarConfig);
}
```

- [ ] **Step 3: Verificar TypeScript**

---

### Task 4: Añadir acción `hydrate` a `jiraStore` y limpiar persist

**Files:**
- Modify: `src/stores/jiraStore.ts`

- [ ] **Step 1: Añadir `hydrate` al interface y al store**

```typescript
hydrate: (accounts, activeAccountId) => {
    const resolvedId = activeAccountId && accounts.some(a => a.id === activeAccountId)
        ? activeAccountId
        : accounts[0]?.id ?? null;
    syncLegacyKeys(accounts, resolvedId);
    set({ accounts, activeAccountId: resolvedId });
},
```

- [ ] **Step 2: Quitar `accounts` y `activeAccountId` del `partialize`**

- [ ] **Step 3: Verificar TypeScript**

---

### Task 5: Quitar `repoAccounts` del `partialize` de `gitStore`

**Files:**
- Modify: `src/stores/gitStore.ts`

- [ ] **Step 1: Quitar `repoAccounts` del `partialize`**

- [ ] **Step 2: Verificar TypeScript**

---

## Chunk 3: SonarPanel + auto-save

### Task 6: Migrar `SonarPanel` para usar `useSonarStore`

**Files:**
- Modify: `src/components/SonarPanel.tsx`

- [ ] **Step 1: Reemplazar el `useState` de globalConfig con `useSonarStore`**

- [ ] **Step 2: Eliminar funciones `loadGlobalConfig` y `saveGlobalConfig` manuales**

- [ ] **Step 3: Verificar TypeScript**

---

### Task 7: Incluir jira y sonar en el auto-save de `ServiceManager`

**Files:**
- Modify: `src/components/ServiceManager.tsx`

- [ ] **Step 1: Suscribirse a los stores en ServiceManager**

- [ ] **Step 2: Añadir `jiraAccounts`, `jiraActiveAccountId` y `sonarConfig` al array de dependencias del auto-save `useEffect`**

- [ ] **Step 3: Verificar TypeScript**

---

## Chunk 4: Verificación final

### Task 8: Prueba manual del flujo completo

- [ ] **Step 1: Limpiar localStorage (nexus-jira-store, nexus-sonar-global-config, nexus-git-store:repoAccounts)**

- [ ] **Step 2: Ejecutar la app y verificar que los datos se guardan en `nexus-workspace.json`**

- [ ] **Step 3: Reiniciar la app y confirmar que se cargan correctamente desde el JSON**
