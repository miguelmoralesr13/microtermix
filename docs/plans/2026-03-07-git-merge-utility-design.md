# Git Merge Utility Design

**Date:** 2026-03-07
**Status:** Approved

## Objetivo

Añadir una utilidad de merge amigable al panel Git. El usuario puede iniciar un merge desde el `GitSidebar` (botón hover o drag & drop), confirmar en un modal con preview de commits y selección de estrategia, y si hay conflictos el flujo conecta automáticamente con el `GitConflictModal` existente.

---

## Flujo de datos

```
Usuario inicia merge (botón hover o drag & drop sobre rama activa)
        ↓
MergeConfirmModal abre — source=<rama seleccionada>, target=<rama activa>
        ↓
git log <currentBranch>..<sourceBranch> --oneline   ← preview commits entrantes
        ↓
Usuario elige estrategia: fast-forward | merge commit | squash
        ↓
[Confirmar]
        ↓
git merge [--ff-only | --no-ff | --squash] <sourceBranch>
        ↓
┌─ sin conflictos ──→ invalidate(path) + refresh → listo
└─ con conflictos ──→ isMergeInProgress = true → GitConflictModal existente
```

**Ramas remotas:** se pasan directamente a `git merge` (e.g. `origin/feature`) — git acepta remotes sin checkout previo.

**Conflictos:** `GitPanel` ya escucha `repoData.status.isMergeInProgress` y abre `GitConflictModal`. No requiere cambios en `GitPanel.tsx` ni en `GitConflictModal.tsx`.

---

## Componentes UI

### `GitSidebar.tsx` — cambios

**Botón merge en hover** (igual al botón eliminar ya existente):
- Aparece en cada rama local y remota al hacer hover
- Icono: `GitMerge` de lucide-react
- La rama activa (`b.active === true`) NO tiene botón merge (no tiene sentido)
- Al clickar → abre `MergeConfirmModal`

**Drag & drop** (HTML5 nativo):
- Cada fila de rama es `draggable`
- Al iniciar drag (`onDragStart`): guarda nombre de rama en estado local `draggingBranch`
- La fila de la rama activa se convierte en zona de drop:
  - Borde verde + texto "Soltar para mergear en `<rama-activa>`"
  - `onDragOver`: `e.preventDefault()`, cursor `copy`
  - `onDrop`: abre `MergeConfirmModal` con source=draggingBranch
- Al soltar en cualquier otra fila o fuera: no-op
- Al cancelar drag (dragend sin drop): reset visual

### `MergeConfirmModal.tsx` — nuevo componente

```
┌─ Merge ──────────────────────────────────────────┐
│                                                   │
│  origin/feature/login  →→→  main (actual)        │
│                                                   │
│  Commits que entrarían (3):                       │
│  ● abc1234  fix: login validation                 │
│  ● def5678  feat: add remember me                 │
│  ● ghi9012  test: login suite                     │
│                                                   │
│  Estrategia:  [Merge commit ▾]                   │
│               • Fast-forward (--ff-only)          │
│               • Merge commit (--no-ff) ← default  │
│               • Squash (--squash)                 │
│                                                   │
│  [Cancelar]              [Mergear ⇌]             │
└──────────────────────────────────────────────────┘
```

Props:
```ts
interface MergeConfirmModalProps {
    projectPath: string;
    sourceBranch: string;       // rama a mergear
    currentBranch: string;      // rama activa (target)
    onClose: () => void;
    onMergeComplete: () => void; // llama invalidate + refresh en GitPanel
}
```

Estrategias disponibles:
```ts
type MergeStrategy = '--ff-only' | '--no-ff' | '--squash';
```
Default: `--no-ff` (merge commit explícito).

---

## Edge cases

### En `MergeConfirmModal`

| Situación | Comportamiento |
|---|---|
| 0 commits entrantes | Banner amarillo "Sin commits nuevos respecto a la rama actual" — botón mergear deshabilitado |
| Error al cargar preview | "No se pudo cargar el preview" — botón mergear habilitado igualmente |
| Merge exitoso sin conflictos | Modal cierra + `onMergeComplete()` → refresh |
| Merge con conflictos | Modal cierra + `onMergeComplete()` → refresh → `isMergeInProgress` → GitConflictModal |
| Fast-forward imposible | Error inline "Esta rama no puede aplicarse en fast-forward. Prueba con Merge commit." |
| Squash exitoso | Banner "Squash aplicado — haz commit en el panel de staging" (squash no auto-commitea) |

### Drag & drop

| Situación | Comportamiento |
|---|---|
| Soltar rama sobre sí misma | No-op silencioso |
| Soltar fuera de zona de drop | No-op |
| Esc durante drag | Reset visual via `onDragEnd` |

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/components/GitSidebar.tsx` | + botón merge en hover, + drag & drop sobre rama activa |
| `src/components/MergeConfirmModal.tsx` | nuevo — preview commits + estrategia + ejecutar |

**Sin cambios:** `GitPanel.tsx`, `GitConflictModal.tsx`, `GitConflictResolver.tsx`, `gitStore.ts`
