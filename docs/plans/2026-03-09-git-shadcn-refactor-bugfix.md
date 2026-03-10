# Plan: Git Components — Bug Fixes + shadcn/ui Refactor

**Fecha:** 2026-03-09
**Estado:** Pendiente

---

## Contexto

Los componentes git mezclan HTML raw con shadcn/ui y tienen bugs críticos en el flujo pull/push.
Este plan cubre: fixes de bugs primero, luego migración a shadcn/ui.

---

## Bugs identificados (raíz exacta)

### Bug 1 — Pull/Push no actualiza badge ahead/behind (CRÍTICO)
- **Raíz:** `handleBranchRefresh` en `GitPanel.tsx:94-96` llama `fetchAll()` pero nunca llama `fetchAheadBehind`
- Tanto pull (`GitSidebar.tsx:220`) como push (`PushPreviewModal.tsx:101`) usan `onRefreshRequest` que apunta a `handleBranchRefresh`
- El badge de "X commits behind/ahead" sigue visible hasta que expira el stale time de 120s
- **Fix:** Añadir `fetchAheadBehind(path, true)` dentro de `handleBranchRefresh` en `GitPanel.tsx`

### Bug 2 — Stale time de aheadBehind demasiado largo (CRÍTICO)
- **Raíz:** `gitStore.ts` tiene `STALE.aheadBehind = 120_000` (2 minutos)
- Aunque se llame `fetchAheadBehind` con `force=false`, respeta ese stale
- **Fix:** Bajar `STALE.aheadBehind` de `120_000` a `30_000` (igual que `status`)
- También bajar el polling de `GitPanel.tsx:74` de `120_000` a `60_000`

### Bug 3 — Pull con conflictos/cambios locales muestra `alert()` crudo (CRÍTICO)
- **Raíz:** `GitSidebar.tsx:216-222` usa `alert()` cuando pull falla
- Mensajes de error de git son largos y no formateados
- No hay opciones de resolución (stash, rebase, force)
- **Fix:** Reemplazar `alert()` por un `Dialog` shadcn con:
  - El error formateado en bloque `<pre>` con scroll
  - Botón "Hacer stash y reintentar pull" (`git stash && git pull`)
  - Botón "Pull con rebase" (`git pull --rebase`)
  - Botón "Cancelar"

### Bug 4 — Commit usa `force=false` al refrescar status (MEDIO)
- **Raíz:** `GitStagingPanel.tsx:314,316` llama `fetchStatus(path, false)` y `fetchTimeline(path, false)`
- Si el usuario hace commit dentro de la ventana de 30s de stale, los datos no se actualizan
- **Fix:** Cambiar a `fetchStatus(path, true)` y `fetchTimeline(path, true)` después de commit

### Bug 5 — Refresh manual no detecta ahead/behind pendientes (MEDIO)
- **Raíz:** El botón refresh del sidebar llama `handleStatusRefresh` que solo hace `fetchStatus`
- El usuario ve "sin cambios" pero hay commits ahead/behind
- **Fix:** El botón principal de refresh debe llamar `handleRefreshAll` (ya incluye `fetchAheadBehind`)

---

## Tasks de implementación

### T1 — Fix `handleBranchRefresh` (GitPanel.tsx)
**Archivo:** `src/components/GitPanel.tsx`
**Prioridad:** 🔴 Alta
**Cambio:**
```typescript
// ANTES (líneas 94-96)
const handleBranchRefresh = () => {
    if (ui.activeTab) {
        invalidate(ui.activeTab);
        fetchAll(ui.activeTab, true);
    }
};

// DESPUÉS
const handleBranchRefresh = () => {
    if (ui.activeTab) {
        invalidate(ui.activeTab);
        fetchAll(ui.activeTab, true);
        fetchAheadBehind(ui.activeTab, true);  // ← añadir esta línea
    }
};
```

### T2 — Bajar stale times (gitStore.ts)
**Archivo:** `src/stores/gitStore.ts`
**Prioridad:** 🔴 Alta
**Cambio:**
```typescript
// ANTES
const STALE = {
    branches: 60_000,
    status: 30_000,
    timeline: 60_000,
    aheadBehind: 120_000,
};

// DESPUÉS
const STALE = {
    branches: 60_000,
    status: 30_000,
    timeline: 60_000,
    aheadBehind: 30_000,   // ← bajar de 120_000
};
```
También en `GitPanel.tsx:74`: cambiar el `setInterval` de `120_000` a `60_000`.

### T3 — Reemplazar `alert()` de pull por Dialog (GitSidebar.tsx)
**Archivo:** `src/components/GitSidebar.tsx`
**Prioridad:** 🔴 Alta
**Cambio:**
- Añadir estado: `const [pullError, setPullError] = useState<string | null>(null)`
- En `handlePull`: capturar error en estado en lugar de `alert()`
- Añadir Dialog de error con:
  - Mensaje formateado en `<pre className="font-mono text-xs...">`
  - Botón "Stash y Pull" → ejecuta `git stash && git pull`, luego refresca
  - Botón "Pull --rebase" → ejecuta `git pull --rebase`, luego refresca
  - Botón "Cerrar"
- Imports a añadir: `Dialog, DialogContent, DialogHeader, DialogTitle` + `Button` ya está

### T4 — Fix force=true en commit (GitStagingPanel.tsx)
**Archivo:** `src/components/GitStagingPanel.tsx`
**Prioridad:** 🟡 Media
**Cambio:** líneas 314 y 316
```typescript
// ANTES
fetchStatus(projectPath, false);
fetchTimeline(projectPath, false);

// DESPUÉS
fetchStatus(projectPath, true);
fetchTimeline(projectPath, true);
```

### T5 — Migrar MergeConfirmModal a shadcn
**Archivo:** `src/components/MergeConfirmModal.tsx`
**Prioridad:** 🟡 Media
**Cambios:**
- `<select>` de estrategia → `Select / SelectTrigger / SelectContent / SelectItem`
- Botones raw → `Button` con variantes
- Asegurar `Dialog` wrapping correcto con `showCloseButton={false}`

### T6 — Migrar GitSidebar inputs/botones a shadcn
**Archivo:** `src/components/GitSidebar.tsx`
**Prioridad:** 🟡 Media
**Cambios:**
- Input search de ramas (línea 343-349) → `Input`
- Botones de acción principales → `Button` con tamaños correctos
- Badges de ahead/behind → `Badge`

### T7 — Migrar GitStagingPanel a shadcn
**Archivo:** `src/components/GitStagingPanel.tsx`
**Prioridad:** 🟡 Media
**Cambios:**
- `<textarea>` del commit message → conservar raw pero con clases consistentes con el resto
- Botones de stage/unstage/commit → `Button`
- Checkbox de archivos → consistente con shadcn

### T8 — Mejorar GitConflictModal
**Archivo:** `src/components/GitConflictModal.tsx`
**Prioridad:** 🟡 Media
**Cambios:**
- Errores en banner formateado, no texto plano
- Botones "Abort" y "Commit Merge" → `Button` con variantes destructive/default
- Asegurar scroll correcto en lista de archivos con conflicto

### T9 — Migrar PushPreviewModal a shadcn
**Archivo:** `src/components/PushPreviewModal.tsx`
**Prioridad:** 🟢 Baja
**Cambios:**
- Botones raw → `Button`
- Banner de éxito → `Badge` o componente de alerta

### T10 — Migrar GitTimeline botones a shadcn
**Archivo:** `src/components/GitTimeline.tsx`
**Prioridad:** 🟢 Baja
**Cambios:**
- Botones de acción en commits → `Button`
- Inputs de filtro → `Input`

---

## Orden de ejecución recomendado

```
T1 → T2 → T3   (bugs críticos, independientes entre sí)
     ↓
     T4          (bug medio, 2 líneas)
     ↓
T5 → T6 → T7   (refactors UI, pueden hacerse en paralelo)
     ↓
T8 → T9 → T10  (mejoras menores)
```

---

## Archivos involucrados

```
src/stores/gitStore.ts              (T2)
src/components/GitPanel.tsx         (T1, T2-polling)
src/components/GitSidebar.tsx       (T3, T6)
src/components/GitStagingPanel.tsx  (T4, T7)
src/components/MergeConfirmModal.tsx (T5)
src/components/GitConflictModal.tsx (T8)
src/components/PushPreviewModal.tsx (T9)
src/components/GitTimeline.tsx      (T10)
```

---

## Notas técnicas

- `handleRefreshAll` en GitPanel.tsx es el ÚNICO método que llama `fetchAheadBehind` + `fetchAll` juntos. Usarlo como referencia.
- `onRefreshRequest` prop en GitSidebar y PushPreviewModal debe apuntar a algo que incluya `fetchAheadBehind`.
- Los conflictos se detectan via `status.isMergeInProgress` en el store — no cambiar esta lógica.
- shadcn/ui en este proyecto usa **base-ui** (no Radix). API differences:
  - `TooltipTrigger` usa `render={<Button />}` prop
  - `Select` usa `onValueChange` (recibe `string | null`)
  - `Dialog` usa `open` / `onOpenChange`
