# Merge Conflict Modal — Design

**Date:** 2026-03-06
**Status:** Approved

## Problem

When a `git merge` produces conflicts, the current UX requires the user to:
1. Notice the orange "Merge in Progress" banner in GitStagingPanel
2. Manually click each conflicted file in the staging file tree
3. Use the GitConflictResolver which only has "Quick Resolve First Conflict" (acts on block 0 only)
4. Close and repeat for each file

There is no overview of progress, no file-by-file navigation, and no easy abort path.

## Solution

A focused modal (`GitConflictModal`) that opens when the user clicks "Resolver conflictos" in the staging panel. It provides:
- Left sidebar: list of conflicted files with resolved/pending status
- Right panel: enhanced resolver with per-conflict navigation and preview
- Header: progress bar + Abort Merge button
- Footer: Commit Merge button (enabled only when all files resolved)

## Layout

```
┌─ Conflictos de Merge ──────────────────────────────────────────────────────┐
│ ████████████░░░░  2 / 3 resueltos                    [Abort Merge]         │
├──────────────────┬─────────────────────────────────────────────────────────┤
│ ✗ src/api/user   │  src/api/user.ts                                        │
│ ✓ src/utils/fmt  │  Conflicto 1 de 3  [← Ant] [Sig →]  [↓ Ir]            │
│ ✗ src/config.ts  │  ┌─ HEAD (actual) ──────────────────────────────────┐  │
│                  │  │  const x = getUser()                             │  │
│                  │  └──────────────────────────────────────────────────┘  │
│                  │  ┌─ Incoming ────────────────────────────────────────┐  │
│                  │  │  const user = fetchUser()                        │  │
│                  │  └──────────────────────────────────────────────────┘  │
│                  │  [Aceptar actual] [Aceptar incoming] [Aceptar ambos]    │
│                  │  ──────── Monaco Editor (edición manual) ────────────   │
│ ────────────────  │                                                         │
│ [Commit Merge ✓] │  [Guardar y marcar resuelto →]                         │
└──────────────────┴─────────────────────────────────────────────────────────┘
```

**Modal size:** `w-[90vw] h-[85vh]`, centrado, backdrop oscuro.
**No hay botón X** — el merge está en progreso; solo se cierra con Abort o tras el Commit.

## Components

### `GitConflictModal.tsx` (nuevo)

Props:
```ts
interface GitConflictModalProps {
    projectPath: string;
    conflictedFiles: string[];   // files[].filter(isConflicted).map(f => f.file)
    onClose: () => void;         // called after abort or commit
    onRefreshRequest: () => void;
}
```

State:
```ts
resolvedFiles: Set<string>   // files saved + git add'd
selectedFile: string         // active file in resolver (default: first)
aborting: boolean
committing: boolean
```

Behavior:
- **Abort Merge**: `window.confirm()` → `git merge --abort` → `invalidate + fetchStatus + fetchTimeline` → `onClose()`
- **Commit Merge**: `git commit` (no `-m`, git uses MERGE_MSG) → `invalidate all` → `onClose()`
- File saved in resolver → add to `resolvedFiles` set → auto-advance to next unresolved file
- `resolvedFiles.size === conflictedFiles.length` → enables Commit Merge button

### `GitConflictResolver.tsx` (modificado)

New/changed props:
```ts
conflictIndex: number                          // which conflict is focused (0-based)
onConflictIndexChange: (i: number) => void     // parent controls navigation
onSaved: () => void                            // called after write + git add
```

New features:
- **Per-conflict preview**: above the editor, shows current/incoming content of the active conflict block
- **Conflict nav bar**: "Conflicto N de M" + Anterior/Siguiente buttons that scroll Monaco to the block and update `conflictIndex`
- **Per-conflict action buttons**: Aceptar actual / Aceptar incoming / Aceptar ambos — act on `conflicts[conflictIndex]`, not hardcoded `[0]`
- **"Guardar y marcar resuelto"** button: writes file + `git add` + calls `onSaved()`

### `GitStagingPanel.tsx` (modificado)

The existing "Merge in Progress" banner becomes:
```
⚠ Merge in Progress
[Resolver conflictos (N archivos)]   [Abort Merge]
```
Clicking "Resolver conflictos" calls `onOpenConflictModal?.()`.

### `GitPanel.tsx` (modificado)

- Adds `isConflictModalOpen: boolean` state
- Passes `onOpenConflictModal` to `GitStagingPanel`
- Renders `<GitConflictModal>` when `isConflictModalOpen && repoData.status.isMergeInProgress`

## Data Flow

```
gitStore.status.files
  └─ filter(f => f.isConflicted)
        └─ passed as conflictedFiles prop to GitConflictModal

User actions:
  Select file     → selectedFile state (local to modal)
  Resolve block   → resolveConflict() in resolver (modifies editor value)
  Save file       → write_file_content + git add + onSaved() → resolvedFiles.add(file) → advance
  Abort           → git merge --abort → store invalidate → onClose()
  Commit Merge    → git commit → store invalidate → onClose()
```

## Key Constraints

- `resolvedFiles` is local state (ephemeral) — not persisted to store
- Abort always asks for confirmation before running
- Commit Merge uses `git commit` without `-m` so git auto-uses MERGE_MSG (includes merged branch info)
- After abort or commit: `invalidate(path)` + `fetchAll(path, true)` to refresh everything
