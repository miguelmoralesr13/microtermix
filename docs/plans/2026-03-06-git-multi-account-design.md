# Git Multi-Account Design

**Date:** 2026-03-06
**Status:** Approved

## Objetivo

Permitir gestionar múltiples cuentas de GitHub y GitLab en el panel Git. Cada repo puede tener una cuenta asignada que persiste por workspace. Se elimina el panel remoto (GithubPanel con PRs/Issues).

---

## Modelo de datos

### `GitAccount`

```ts
export interface GitAccount {
  id: string;          // nanoid, generado al crear
  alias: string;       // "Trabajo GitHub", "Personal GitLab", etc.
  provider: 'github' | 'gitlab';
  url: string;         // https://api.github.com o https://gitlab.com por defecto
  token: string;
}
```

### Adiciones a `GitStore`

```ts
// Estado en memoria (NO en partialize de Zustand)
accounts: GitAccount[];
repoAccounts: Record<string, string>; // repoPath → accountId

// Acciones
addAccount:       (a: Omit<GitAccount, 'id'>) => string;
updateAccount:    (id: string, patch: Partial<Omit<GitAccount, 'id'>>) => void;
removeAccount:    (id: string) => void;
setRepoAccount:   (repoPath: string, accountId: string | null) => void;
getActiveAccount: (repoPath: string) => GitAccount | undefined;
```

> `accounts` y `repoAccounts` se excluyen del `partialize` de Zustand.
> La única fuente de verdad es `microtermix.json`.

### `MicrotermixConfig` — campos añadidos

```ts
gitAccounts?:  GitAccount[];
repoAccounts?: Record<string, string>; // folderName → accountId
```

El campo legacy `gitConfig` se elimina del output de `buildWorkspaceConfigFromCurrentState`.

---

## Persistencia

**Una sola fuente de verdad: `microtermix.json`.**

- `accounts` y `repoAccounts` NO van al `partialize` de Zustand (sin doble persistencia).
- Al guardar: `buildWorkspaceConfigFromCurrentState` lee `gitStore.getState().accounts` y `.repoAccounts`.
- Al cargar: `applyWorkspaceConfig` en `WorkspaceContext` llama a `store.addAccount` / `store.setRepoAccount`.
- El auto-save de 1.5 s existente los persiste automáticamente.

### Migración desde `gitConfig` legacy

Al arrancar, una sola vez en `WorkspaceContext` init:

```ts
const legacy = localStorage.getItem('microtermix-git-settings');
const store = useGitStore.getState();
if (legacy && store.accounts.length === 0) {
  const cfg = JSON.parse(legacy);
  if (cfg.provider !== 'none' && cfg.token) {
    store.addAccount({
      alias: `Default ${cfg.provider === 'github' ? 'GitHub' : 'GitLab'}`,
      provider: cfg.provider,
      url: cfg.url,
      token: cfg.token,
    });
    localStorage.removeItem('microtermix-git-settings');
  }
}
```

---

## Auto-detección de cuenta por repo

Cuando `ui.activeTab` cambia a un repo sin cuenta asignada:

```
git remote get-url origin
        ↓
detectProviderFromUrl(url)
  • "github.com"  → provider = 'github'
  • "gitlab"      → provider = 'gitlab'
  • otro          → null
        ↓
accounts.filter(a => a.provider === provider)
        ↓
0 matches → banner "No hay cuenta — Añadir cuenta"
1 match   → auto-asignar + banner "Usando [alias]  ·  Cambiar"
2+ matches → banner con dropdown selector
```

El banner vive en el header del GitPanel. Desaparece cuando hay cuenta asignada.

---

## UI

### GitPanel — header (simplificado)

Se elimina el subtab "Remote / GitHub" y `GithubPanel` completamente.

```
[sidebar repos]  [branch actual]  [● Alias cuenta ▾]  [↺]
```

El badge de cuenta abre `AccountManagerModal`. Sin cuenta: `[+ Añadir cuenta]`.

### `AccountManagerModal` (reemplaza `GitConfigModal`)

**Sección A — Repo actual**
```
Repo: /ruta/proyecto
Cuenta asignada: ● Trabajo GitHub   [Cambiar ▾]  [Sin cuenta]
```

**Sección B — Todas las cuentas**
```
[GH] Trabajo GitHub     api.github.com      [✎] [✕]
[GL] Personal GitLab    gitlab.empresa.com  [✎] [✕]
[+ Añadir cuenta]
```

**Formulario add/edit (inline):**
```
Alias:     [________________]
Proveedor: [ GitHub ▾ ]
URL:       [https://api.github.com]
Token:     [••••••••••••]   [Verificar]
                            → "✓ autenticado como octocat"
                            → "✕ token inválido"
[Cancelar]  [Guardar]
```

Verificación: `GET /user` (GitHub) o `GET /api/v4/user` (GitLab).

---

## Eliminaciones

| Qué | Dónde |
|---|---|
| `GithubPanel` | Eliminar import y render en `GitPanel.tsx` |
| `activeSubTab: 'git' \| 'remote'` | Eliminar de `GitUi` en `gitStore.ts` |
| Botón subtab "Remote" | Eliminar del header de `GitPanel.tsx` |
| `gitConfig` legacy en workspace JSON | Eliminar de `buildWorkspaceConfigFromCurrentState` |

`GithubPanel.tsx` y `githubApi.ts` pueden mantenerse en disco (sin uso) por si se retoman en el futuro.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/stores/gitStore.ts` | + `GitAccount`, + `accounts`, + `repoAccounts`, + 4 acciones, ajustar `partialize` y `GitUi` |
| `src/types/workspaceConfig.ts` | + `gitAccounts`, + `repoAccounts`, - `gitConfig` |
| `src/context/WorkspaceContext.tsx` | Migración legacy, load/save accounts vía gitStore, eliminar `gitConfig` state |
| `src/components/GitPanel.tsx` | Eliminar subtab remote, añadir badge cuenta + banner auto-detect |
| `src/components/GitConfigModal.tsx` | Reemplazar completamente → `AccountManagerModal` |
| `src/components/ServiceManager.tsx` | Sin cambios en render (GitPanel sigue igual) |
