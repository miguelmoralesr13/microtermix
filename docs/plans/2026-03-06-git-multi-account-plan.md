# Git Multi-Account Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Añadir soporte de múltiples cuentas GitHub/GitLab al panel Git, con asignación por repo persistida en nexus-workspace.json, eliminando el panel remoto (GithubPanel).

**Architecture:** Las cuentas viven en `gitStore` solo en memoria (excluidas del `partialize` de Zustand). `nexus-workspace.json` es la única fuente de verdad via los mecanismos de save/load ya existentes. `WorkspaceContext` pierde `gitConfig` por completo. `GitConfigModal` se reemplaza con `AccountManagerModal`.

**Tech Stack:** React 19, TypeScript, Zustand (persist/devtools), TailwindCSS v4, Tauri v2 (`invoke`), `crypto.randomUUID()` (sin dependencias nuevas).

---

## Task 1: Extender `gitStore` — tipos + estado + acciones

**Files:**
- Modify: `src/stores/gitStore.ts`

**Step 1: Añadir `GitAccount` y actualizar `GitUi`**

En `gitStore.ts`, después de las interfaces existentes, añadir:

```ts
export interface GitAccount {
    id: string;
    alias: string;
    provider: 'github' | 'gitlab';
    url: string;
    token: string;
}
```

Modificar `GitUi` — eliminar `activeSubTab` y añadir nada más (queda más limpia):

```ts
export interface GitUi {
    activeTab: string | null;
    // ELIMINADO: activeSubTab: 'git' | 'remote';
    sidebarWidth: number;
    stagingWidth: number;
    branchFilter: BranchFilter;
}
```

**Step 2: Ampliar `GitStore` interface**

Añadir al interface `GitStore`, después del campo `ui`:

```ts
// Cuentas en memoria — NO persisten en Zustand, solo en nexus-workspace.json
accounts: GitAccount[];
repoAccounts: Record<string, string>; // repoPath → accountId

addAccount:       (a: Omit<GitAccount, 'id'>) => string;
updateAccount:    (id: string, patch: Partial<Omit<GitAccount, 'id'>>) => void;
removeAccount:    (id: string) => void;
setRepoAccount:   (repoPath: string, accountId: string | null) => void;
getActiveAccount: (repoPath: string) => GitAccount | undefined;
```

**Step 3: Inicializar estado y añadir acciones en `create()`**

Dentro del callback de `create()`, justo después de `ui: { ... }`:

```ts
accounts: [],
repoAccounts: {},

addAccount: (a) => {
    const id = crypto.randomUUID();
    set(s => ({ accounts: [...s.accounts, { ...a, id }] }));
    return id;
},

updateAccount: (id, patch) => {
    set(s => ({
        accounts: s.accounts.map(acc => acc.id === id ? { ...acc, ...patch } : acc),
    }));
},

removeAccount: (id) => {
    set(s => ({
        accounts: s.accounts.filter(acc => acc.id !== id),
        repoAccounts: Object.fromEntries(
            Object.entries(s.repoAccounts).filter(([, v]) => v !== id)
        ),
    }));
},

setRepoAccount: (repoPath, accountId) => {
    set(s => {
        const next = { ...s.repoAccounts };
        if (accountId === null) {
            delete next[repoPath];
        } else {
            next[repoPath] = accountId;
        }
        return { repoAccounts: next };
    });
},

getActiveAccount: (repoPath) => {
    const s = get();
    const id = s.repoAccounts[repoPath];
    return id ? s.accounts.find(a => a.id === id) : undefined;
},
```

**Step 4: Ajustar `partialize` para excluir accounts/repoAccounts**

El bloque `partialize` actual persiste `ui` y `repos`. Debe quedar exactamente igual (accounts y repoAccounts simplemente no se mencionan, así que ya quedan excluidos). Solo hay que confirmar que no se añaden.

**Step 5: Actualizar inicialización de `ui` — eliminar `activeSubTab`**

En el `create()`, la inicialización de `ui` pasa de:

```ts
ui: {
    activeTab: null,
    activeSubTab: 'git',
    sidebarWidth: 230,
    stagingWidth: 280,
    branchFilter: 'all',
},
```

a:

```ts
ui: {
    activeTab: null,
    sidebarWidth: 230,
    stagingWidth: 280,
    branchFilter: 'all',
},
```

**Step 6: Verificar que TypeScript no da errores**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1 | head -40
```

Esperado: solo errores en otros archivos que aún usan `activeSubTab` o `gitConfig` (los resolvemos en tasks siguientes).

**Step 7: Commit**

```bash
git add src/stores/gitStore.ts
git commit -m "feat(git): add GitAccount type + multi-account state to gitStore"
```

---

## Task 2: Actualizar `workspaceConfig.ts`

**Files:**
- Modify: `src/types/workspaceConfig.ts`

**Step 1: Importar `GitAccount` y añadir campos a `NexusWorkspaceConfig`**

Añadir al inicio del archivo:

```ts
import type { GitAccount } from '../stores/gitStore';
```

En `NexusWorkspaceConfig`, reemplazar la línea:

```ts
gitConfig?: { provider: string; url: string; token: string };
```

por:

```ts
gitAccounts?:  GitAccount[];
repoAccounts?: Record<string, string>; // folderName → accountId
```

**Step 2: Actualizar `buildWorkspaceConfigFromCurrentState`**

La función actualmente recibe `gitConfig` como parámetro. Hay que:
- Eliminar el parámetro `gitConfig` de la firma
- Leer cuentas desde `gitStore` directamente
- Añadir `gitAccounts` y `repoAccounts` al objeto retornado
- Eliminar `gitConfig` del objeto retornado

Añadir el import de gitStore al inicio del archivo:

```ts
import { useGitStore } from '../stores/gitStore';
```

La firma nueva de `buildWorkspaceConfigFromCurrentState`:

```ts
export function buildWorkspaceConfigFromCurrentState(
    workspacePath: string,
    selectedProjects: string[],
    multiScript: string,
    globalEnvName: string,
    // ELIMINADO: gitConfig param
    vitePreviewOpen: boolean,
    activeTerminalTabId: string | null,
    projectPaths: string[],
    savedCommands: Record<string, string> = {},
    savedCommandSteps: Record<string, CommandStep[]> = {},
): NexusWorkspaceConfig {
```

Dentro del return, añadir y quitar:

```ts
return {
    version: 1,
    workspacePath,
    selectedProjects: selectedProjects.map(getFolderName),
    multiScript,
    globalEnvName,
    // ELIMINADO: gitConfig,
    gitAccounts: useGitStore.getState().accounts,
    repoAccounts: Object.fromEntries(
        Object.entries(useGitStore.getState().repoAccounts)
            .map(([path, id]) => [getFolderName(path), id])
    ),
    vitePreviewOpen,
    savedCommands,
    savedCommandSteps: Object.keys(savedCommandSteps).length ? savedCommandSteps : undefined,
    activeTerminalTabId: activeTerminalTabId ? getFolderName(activeTerminalTabId) : undefined,
    projectEnvs: Object.keys(projectEnvs).length ? projectEnvs : undefined,
    projectViteWrapper: Object.keys(projectViteWrapper).length ? projectViteWrapper : undefined,
};
```

**Step 3: Commit**

```bash
git add src/types/workspaceConfig.ts
git commit -m "feat(git): replace gitConfig with gitAccounts/repoAccounts in workspace config"
```

---

## Task 3: Actualizar `WorkspaceContext.tsx`

**Files:**
- Modify: `src/context/WorkspaceContext.tsx`

**Step 1: Eliminar `GitConfig` interface y `gitConfig` del estado**

- Borrar el `export interface GitConfig { ... }` (ya no se usa)
- En `WorkspaceState`, eliminar el campo `gitConfig: GitConfig`
- En la inicialización del estado (el `useState` callback), eliminar toda la lógica que lee `nexus-git-settings` y construye `gitConfig`
- Eliminar `gitConfig` del objeto de estado inicial

**Step 2: Eliminar `setGitConfig` del contexto**

- En `WorkspaceContextType`, eliminar `setGitConfig: (config: GitConfig) => void`
- En el provider, eliminar la función `setGitConfig`
- En el objeto `value` del provider, eliminar `setGitConfig`

**Step 3: Eliminar el `useEffect` que persiste `nexus-git-settings`**

Borrar:
```ts
React.useEffect(() => {
    localStorage.setItem('nexus-git-settings', JSON.stringify(state.gitConfig));
}, [state.gitConfig]);
```

**Step 4: Añadir migración legacy + import de gitStore**

Añadir el import al inicio del archivo:
```ts
import { useGitStore } from '../stores/gitStore';
```

Dentro de `WorkspaceProvider`, antes del return, añadir un `useEffect` de una sola ejecución para migrar:

```ts
// Migración one-time desde gitConfig legacy (nexus-git-settings en localStorage)
React.useEffect(() => {
    const store = useGitStore.getState();
    if (store.accounts.length > 0) return; // ya migrado
    try {
        const raw = localStorage.getItem('nexus-git-settings');
        if (!raw) return;
        const cfg = JSON.parse(raw);
        if (cfg?.provider && cfg.provider !== 'none' && cfg.token) {
            store.addAccount({
                alias: `Default ${cfg.provider === 'github' ? 'GitHub' : 'GitLab'}`,
                provider: cfg.provider as 'github' | 'gitlab',
                url: cfg.url || (cfg.provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com'),
                token: cfg.token,
            });
            localStorage.removeItem('nexus-git-settings');
        }
    } catch (_) {}
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 5: Actualizar `applyWorkspaceConfig`**

Dentro de la función `applyWorkspaceConfig`, añadir la carga de cuentas desde el config:

```ts
// Cargar cuentas en gitStore
const gitStore = useGitStore.getState();
if (config.gitAccounts && config.gitAccounts.length > 0) {
    // Reemplazar toda la lista de cuentas con la del config
    // (usamos set directo via getState para no crear acciones extra)
    config.gitAccounts.forEach(a => {
        const exists = gitStore.accounts.find(x => x.id === a.id);
        if (exists) {
            gitStore.updateAccount(a.id, a);
        } else {
            // addAccount genera nuevo id, necesitamos preservar el id original
            // usamos el set interno del store
            useGitStore.setState(s => ({
                accounts: [...s.accounts.filter(x => x.id !== a.id), a],
            }));
        }
    });
}
if (config.repoAccounts) {
    Object.entries(config.repoAccounts).forEach(([folderName, accountId]) => {
        const fullPath = resolveFolderNameToPath(folderName, projectPaths);
        if (fullPath) gitStore.setRepoAccount(fullPath, accountId);
    });
}
```

**Step 6: Build check**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1 | head -50
```

Esperado: errores en `ServiceManager.tsx` (pasa gitConfig que ya no existe) y en `GitPanel.tsx`. Seguimos.

**Step 7: Commit**

```bash
git add src/context/WorkspaceContext.tsx
git commit -m "feat(git): remove gitConfig from WorkspaceContext, add account migration + load"
```

---

## Task 4: Actualizar `ServiceManager.tsx`

**Files:**
- Modify: `src/components/ServiceManager.tsx`

**Step 1: Eliminar `state.gitConfig` de las dos llamadas a `buildWorkspaceConfigFromCurrentState`**

La firma cambió: ya no recibe `gitConfig`. Hay dos llamadas en ServiceManager (una en `handleSaveWorkspaceConfig` y otra en el auto-save effect). En ambas, eliminar el argumento `state.gitConfig,`.

Antes (aprox línea 251):
```ts
const config = buildWorkspaceConfigFromCurrentState(
    state.currentPath,
    selectedProjects,
    multiScript,
    globalEnvName,
    state.gitConfig,      // ← ELIMINAR ESTA LÍNEA
    vitePreviewOpen,
    activeTerminalTab,
    ...
```

Después:
```ts
const config = buildWorkspaceConfigFromCurrentState(
    state.currentPath,
    selectedProjects,
    multiScript,
    globalEnvName,
    vitePreviewOpen,
    activeTerminalTab,
    ...
```

Hacer lo mismo para la segunda llamada (en el auto-save useEffect, ~línea 277).

**Step 2: Limpiar el array de deps del auto-save**

En el `useEffect` de auto-save, eliminar `state.gitConfig` del array de dependencias (línea ~295).

**Step 3: Build check**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1 | head -50
```

**Step 4: Commit**

```bash
git add src/components/ServiceManager.tsx
git commit -m "fix(git): remove gitConfig arg from buildWorkspaceConfigFromCurrentState calls"
```

---

## Task 5: Limpiar `GitPanel.tsx` — eliminar subtab remote y GithubPanel

**Files:**
- Modify: `src/components/GitPanel.tsx`

**Step 1: Eliminar imports no usados**

Eliminar de los imports:
```ts
import { Settings, Github, Gitlab, Server as Bitbucket, RefreshCw } from 'lucide-react';
import { GithubPanel } from './GithubPanel';
```

Reemplazar por:
```ts
import { Settings, RefreshCw, Github, Gitlab } from 'lucide-react';
```

(`Github` y `Gitlab` los necesitaremos para el badge de cuenta en el header.)

También eliminar `useWorkspace` si ya no se usa para nada más:
```ts
// Verificar si state sigue usándose — si no, eliminar:
// const { state } = useWorkspace();
```

**Step 2: Eliminar referencias a `activeSubTab`**

- Eliminar los dos botones `<button onClick={() => setUi({ activeSubTab: 'git' })}>` y `<button onClick={() => setUi({ activeSubTab: 'remote' })}>` del header
- Eliminar el bloque condicional `{ui.activeSubTab === 'remote' ? (...) : (...)}` — dejar solo el contenido del bloque `else` (el git workflow actual)

El bloque entero a eliminar es aproximadamente:
```tsx
{ui.activeSubTab === 'remote' ? (
    <div className="flex-1 ...">
        {/* GithubPanel y sus alternativas */}
    </div>
) : (
    <div className="flex-1 flex w-full min-h-0">
        {/* ← ESTE CONTENIDO SE MANTIENE */}
```

Quedará solo el div interior con `GitSidebar`, `ResizableDivider`, `GitStagingPanel`, etc.

**Step 3: Eliminar el bloque de subtab buttons del header**

En el header, eliminar:
```tsx
<div className="flex bg-slate-800 rounded p-0.5 space-x-0.5 mr-2">
    <button onClick={() => setUi({ activeSubTab: 'git' })} ...>Git</button>
    <button onClick={() => setUi({ activeSubTab: 'remote' })} ...>...</button>
</div>
```

**Step 4: Verificar que el panel git sigue renderizando correctamente**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add src/components/GitPanel.tsx
git commit -m "feat(git): remove remote subtab and GithubPanel from GitPanel"
```

---

## Task 6: Añadir badge de cuenta + banner de auto-detección en `GitPanel.tsx`

**Files:**
- Modify: `src/components/GitPanel.tsx`

**Step 1: Añadir helper `detectProviderFromUrl`**

Añadir esta función antes del componente `GitPanel`:

```ts
function detectProviderFromUrl(remoteUrl: string): 'github' | 'gitlab' | null {
    if (!remoteUrl) return null;
    if (remoteUrl.includes('github.com')) return 'github';
    if (remoteUrl.toLowerCase().includes('gitlab')) return 'gitlab';
    return null;
}
```

**Step 2: Añadir estado para auto-detección**

Dentro del componente, añadir:

```ts
const accounts = useGitStore(s => s.accounts);
const repoAccounts = useGitStore(s => s.repoAccounts);
const setRepoAccount = useGitStore(s => s.setRepoAccount);
const getActiveAccount = useGitStore(s => s.getActiveAccount);

const [detectedAccounts, setDetectedAccounts] = useState<typeof accounts>([]);
const activeAccount = ui.activeTab ? getActiveAccount(ui.activeTab) : undefined;
const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
```

**Step 3: Añadir `useEffect` de auto-detección**

```ts
useEffect(() => {
    if (!ui.activeTab) { setDetectedAccounts([]); return; }
    // Si ya tiene cuenta asignada, no detectar
    if (repoAccounts[ui.activeTab]) { setDetectedAccounts([]); return; }
    if (accounts.length === 0) { setDetectedAccounts([]); return; }

    invoke<{ success: boolean; stdout: string }>('git_execute', {
        projectPath: ui.activeTab,
        args: ['remote', 'get-url', 'origin'],
    }).then(res => {
        if (!res.success) { setDetectedAccounts([]); return; }
        const provider = detectProviderFromUrl(res.stdout.trim());
        if (!provider) { setDetectedAccounts([]); return; }
        const matches = accounts.filter(a => a.provider === provider);
        if (matches.length === 1) {
            // Auto-asignar silencioso
            setRepoAccount(ui.activeTab!, matches[0].id);
            setDetectedAccounts([]);
        } else {
            setDetectedAccounts(matches);
        }
    }).catch(() => setDetectedAccounts([]));
}, [ui.activeTab, repoAccounts, accounts]);
```

**Step 4: Añadir badge de cuenta en el header**

En el header del GitPanel, antes del botón de settings (`<button onClick={() => setIsConfigModalOpen...`), añadir:

```tsx
{/* Badge de cuenta activa */}
{ui.activeTab && (
    <button
        onClick={() => setIsAccountModalOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 transition-colors mr-1 text-slate-300"
        title="Gestionar cuentas"
    >
        {activeAccount ? (
            <>
                {activeAccount.provider === 'github'
                    ? <Github size={11} className="text-slate-400" />
                    : <Gitlab size={11} className="text-slate-400" />
                }
                <span>{activeAccount.alias}</span>
            </>
        ) : (
            <span className="text-slate-500">+ Cuenta</span>
        )}
    </button>
)}
```

**Step 5: Añadir banner de selección cuando hay 2+ cuentas detectadas**

Justo después del header div (`</div>` que cierra el header), añadir:

```tsx
{/* Banner auto-detección: múltiples cuentas coinciden */}
{detectedAccounts.length > 1 && ui.activeTab && (
    <div className="flex items-center gap-2 px-4 py-2 bg-nexus-accent/10 border-b border-nexus-accent/30 text-xs text-slate-300 shrink-0">
        <span>Se detectaron {detectedAccounts.length} cuentas para este repo. Selecciona:</span>
        {detectedAccounts.map(a => (
            <button
                key={a.id}
                onClick={() => { setRepoAccount(ui.activeTab!, a.id); setDetectedAccounts([]); }}
                className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium"
            >
                {a.alias}
            </button>
        ))}
    </div>
)}
```

**Step 6: Reemplazar `isConfigModalOpen` por `isAccountModalOpen` para el settings button**

El botón de settings ahora abre el AccountManagerModal:
```tsx
<button
    onClick={() => setIsAccountModalOpen(true)}
    ...
>
    <Settings size={14} />
</button>
```

Eliminar `isConfigModalOpen` y `setIsConfigModalOpen` del estado.

**Step 7: Build check**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1 | head -30
```

**Step 8: Commit**

```bash
git add src/components/GitPanel.tsx
git commit -m "feat(git): add account badge and auto-detection banner to GitPanel"
```

---

## Task 7: Crear `AccountManagerModal.tsx`

**Files:**
- Create: `src/components/AccountManagerModal.tsx`

**Step 1: Crear el componente completo**

```tsx
import React, { useState } from 'react';
import { X, Github, Gitlab, Plus, Pencil, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useGitStore, type GitAccount } from '../stores/gitStore';
import { useGitStore as useGitStoreRaw } from '../stores/gitStore';

interface AccountManagerModalProps {
    repoPath: string | null;
    onClose: () => void;
}

type VerifyState = 'idle' | 'loading' | { ok: true; username: string } | { ok: false; error: string };

const DEFAULT_URLS = {
    github: 'https://api.github.com',
    gitlab: 'https://gitlab.com',
};

async function verifyToken(provider: 'github' | 'gitlab', url: string, token: string): Promise<string> {
    if (provider === 'github') {
        const res = await fetch(`${url || DEFAULT_URLS.github}/user`, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        return data.login;
    } else {
        const base = url || DEFAULT_URLS.gitlab;
        const res = await fetch(`${base}/api/v4/user`, {
            headers: { 'PRIVATE-TOKEN': token },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        return data.username;
    }
}

interface AccountFormState {
    alias: string;
    provider: 'github' | 'gitlab';
    url: string;
    token: string;
}

const EMPTY_FORM: AccountFormState = {
    alias: '',
    provider: 'github',
    url: DEFAULT_URLS.github,
    token: '',
};

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({ repoPath, onClose }) => {
    const accounts = useGitStore(s => s.accounts);
    const repoAccounts = useGitStore(s => s.repoAccounts);
    const addAccount = useGitStore(s => s.addAccount);
    const updateAccount = useGitStore(s => s.updateAccount);
    const removeAccount = useGitStore(s => s.removeAccount);
    const setRepoAccount = useGitStore(s => s.setRepoAccount);

    const activeAccountId = repoPath ? repoAccounts[repoPath] : undefined;

    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);
    const [verifyState, setVerifyState] = useState<VerifyState>('idle');

    const startAdd = () => {
        setEditingId('new');
        setForm(EMPTY_FORM);
        setVerifyState('idle');
    };

    const startEdit = (acc: GitAccount) => {
        setEditingId(acc.id);
        setForm({ alias: acc.alias, provider: acc.provider, url: acc.url, token: acc.token });
        setVerifyState('idle');
    };

    const cancelEdit = () => { setEditingId(null); setVerifyState('idle'); };

    const handleProviderChange = (p: 'github' | 'gitlab') => {
        setForm(f => ({ ...f, provider: p, url: DEFAULT_URLS[p] }));
    };

    const handleVerify = async () => {
        setVerifyState('loading');
        try {
            const username = await verifyToken(form.provider, form.url, form.token);
            setVerifyState({ ok: true, username });
        } catch (e: any) {
            setVerifyState({ ok: false, error: e.message || 'Error desconocido' });
        }
    };

    const handleSave = () => {
        if (!form.alias.trim() || !form.token.trim()) return;
        if (editingId === 'new') {
            addAccount({ alias: form.alias.trim(), provider: form.provider, url: form.url, token: form.token });
        } else if (editingId) {
            updateAccount(editingId, { alias: form.alias.trim(), provider: form.provider, url: form.url, token: form.token });
        }
        setEditingId(null);
        setVerifyState('idle');
    };

    const handleDelete = (id: string) => {
        removeAccount(id);
        if (editingId === id) setEditingId(null);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 w-[540px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                    <h2 className="text-base font-bold text-white">Cuentas Git</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                    {/* Sección A: Repo actual */}
                    {repoPath && (
                        <section>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Repo actual</p>
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-400 truncate font-mono">{repoPath}</p>
                                    {activeAccountId ? (
                                        <p className="text-sm font-medium text-white mt-0.5">
                                            {accounts.find(a => a.id === activeAccountId)?.alias ?? 'Cuenta desconocida'}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-slate-500 mt-0.5">Sin cuenta asignada</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={activeAccountId ?? ''}
                                        onChange={e => setRepoAccount(repoPath, e.target.value || null)}
                                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon"
                                    >
                                        <option value="">Sin cuenta</option>
                                        {accounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.alias}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Sección B: Todas las cuentas */}
                    <section>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cuentas guardadas</p>

                        <div className="space-y-2">
                            {accounts.length === 0 && editingId !== 'new' && (
                                <p className="text-xs text-slate-500 py-2">No hay cuentas. Añade una.</p>
                            )}

                            {accounts.map(acc => (
                                <div key={acc.id}>
                                    {editingId === acc.id ? (
                                        <AccountForm
                                            form={form}
                                            verifyState={verifyState}
                                            onChange={setForm}
                                            onProviderChange={handleProviderChange}
                                            onVerify={handleVerify}
                                            onSave={handleSave}
                                            onCancel={cancelEdit}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700/60 group">
                                            {acc.provider === 'github'
                                                ? <Github size={14} className="text-slate-400 shrink-0" />
                                                : <Gitlab size={14} className="text-slate-400 shrink-0" />
                                            }
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-200">{acc.alias}</p>
                                                <p className="text-xs text-slate-500 truncate">{acc.url}</p>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => startEdit(acc)}
                                                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(acc.id)}
                                                    className="p-1 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Formulario de nueva cuenta */}
                            {editingId === 'new' && (
                                <AccountForm
                                    form={form}
                                    verifyState={verifyState}
                                    onChange={setForm}
                                    onProviderChange={handleProviderChange}
                                    onVerify={handleVerify}
                                    onSave={handleSave}
                                    onCancel={cancelEdit}
                                />
                            )}

                            {editingId === null && (
                                <button
                                    onClick={startAdd}
                                    className="flex items-center gap-1.5 text-xs text-nexus-neon hover:text-white transition-colors py-1"
                                >
                                    <Plus size={13} /> Añadir cuenta
                                </button>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

// ── Sub-componente del formulario ────────────────────────────────────────────

interface AccountFormProps {
    form: AccountFormState;
    verifyState: VerifyState;
    onChange: (f: AccountFormState) => void;
    onProviderChange: (p: 'github' | 'gitlab') => void;
    onVerify: () => void;
    onSave: () => void;
    onCancel: () => void;
}

const AccountForm: React.FC<AccountFormProps> = ({ form, verifyState, onChange, onProviderChange, onVerify, onSave, onCancel }) => {
    const canSave = form.alias.trim().length > 0 && form.token.trim().length > 0;

    return (
        <div className="rounded-lg border border-nexus-accent/40 bg-slate-800/60 p-4 space-y-3">
            {/* Alias */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Alias</label>
                <input
                    type="text"
                    value={form.alias}
                    onChange={e => onChange({ ...form, alias: e.target.value })}
                    placeholder="Trabajo GitHub, Personal GitLab..."
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-nexus-neon"
                />
            </div>

            {/* Proveedor */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor</label>
                <div className="flex gap-2">
                    {(['github', 'gitlab'] as const).map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => onProviderChange(p)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-all ${
                                form.provider === p
                                    ? 'border-nexus-accent bg-nexus-accent/10 text-white'
                                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                            }`}
                        >
                            {p === 'github' ? <Github size={12} /> : <Gitlab size={12} />}
                            {p === 'github' ? 'GitHub' : 'GitLab'}
                        </button>
                    ))}
                </div>
            </div>

            {/* URL */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">URL</label>
                <input
                    type="url"
                    value={form.url}
                    onChange={e => onChange({ ...form, url: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-nexus-neon"
                />
            </div>

            {/* Token + Verificar */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Token (PAT)</label>
                <div className="flex gap-2">
                    <input
                        type="password"
                        value={form.token}
                        onChange={e => onChange({ ...form, token: e.target.value })}
                        placeholder={form.provider === 'github' ? 'ghp_...' : 'glpat-...'}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-nexus-neon"
                    />
                    <button
                        type="button"
                        onClick={onVerify}
                        disabled={!form.token || verifyState === 'loading'}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                        {verifyState === 'loading' ? <Loader2 size={12} className="animate-spin" /> : 'Verificar'}
                    </button>
                </div>

                {/* Resultado verificación */}
                {typeof verifyState === 'object' && verifyState.ok && (
                    <p className="flex items-center gap-1 text-xs text-green-400 mt-1">
                        <CheckCircle size={11} /> Autenticado como <strong>{verifyState.username}</strong>
                    </p>
                )}
                {typeof verifyState === 'object' && !verifyState.ok && (
                    <p className="flex items-center gap-1 text-xs text-red-400 mt-1">
                        <XCircle size={11} /> {verifyState.error}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded text-xs text-slate-400 hover:bg-slate-700 transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!canSave}
                    className="px-4 py-1.5 rounded text-xs font-bold bg-nexus-neon text-slate-900 hover:bg-opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Guardar
                </button>
            </div>
        </div>
    );
};
```

**Step 2: Build check**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/components/AccountManagerModal.tsx
git commit -m "feat(git): add AccountManagerModal with account CRUD and token verification"
```

---

## Task 8: Conectar `AccountManagerModal` en `GitPanel.tsx`

**Files:**
- Modify: `src/components/GitPanel.tsx`

**Step 1: Importar el modal**

Añadir al bloque de imports:
```ts
import { AccountManagerModal } from './AccountManagerModal';
```

**Step 2: Reemplazar render de `GitConfigModal` por `AccountManagerModal`**

Buscar el render de `GitConfigModal`:
```tsx
{isConfigModalOpen && (
    <GitConfigModal onClose={() => setIsConfigModalOpen(false)} />
)}
```

Reemplazar por:
```tsx
{isAccountModalOpen && (
    <AccountManagerModal
        repoPath={ui.activeTab}
        onClose={() => setIsAccountModalOpen(false)}
    />
)}
```

**Step 3: Eliminar import de `GitConfigModal`**

```ts
// Eliminar:
import { GitConfigModal } from './GitConfigModal';
```

**Step 4: Build final limpio**

```bash
cd C:\Users\migue\Documents\projects\github\microtermix && npm run build 2>&1
```

Esperado: 0 errores de TypeScript.

**Step 5: Commit final**

```bash
git add src/components/GitPanel.tsx
git commit -m "feat(git): wire AccountManagerModal into GitPanel, complete multi-account feature"
```

---

## Verificación manual

1. `npm run tauri dev`
2. Abrir el panel Git
3. Hacer clic en el botón de settings (⚙) → debe abrir `AccountManagerModal`
4. Añadir una cuenta GitHub con token real → clic "Verificar" → debe mostrar username
5. Asignar la cuenta al repo actual desde la sección "Repo actual"
6. Cerrar y reabrir → el badge en el header debe mostrar el alias de la cuenta
7. Abrir otro repo → si no tiene cuenta, y solo hay una del mismo proveedor → auto-asignación
8. Guardar workspace (auto-save 1.5s) → abrir `nexus-workspace.json` → debe contener `gitAccounts` y `repoAccounts`
9. Confirmar que NO aparece el campo `gitConfig` legacy en el JSON
