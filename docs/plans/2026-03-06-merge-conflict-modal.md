# Merge Conflict Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the minimal "Merge in Progress" banner with a focused modal that lets the user resolve merge conflicts file by file, with per-conflict navigation and a clear abort/commit path.

**Architecture:** A new `GitConflictModal` component lives in `GitPanel.tsx` as a fixed overlay. It owns the file-navigation state (`selectedFile`, `resolvedFiles`) and delegates the actual conflict resolution to an enhanced `GitConflictResolver`. The existing store data (`status.files.filter(isConflicted)`) drives the file list — no new Rust commands needed.

**Tech Stack:** React 19, TypeScript, Zustand (`useGitStore`), `@monaco-editor/react`, Tauri `invoke`, Lucide icons, TailwindCSS v4.

**Design doc:** `docs/plans/2026-03-06-merge-conflict-modal-design.md`

---

### Task 1: Enhance `GitConflictResolver.tsx` — per-conflict navigation

**Files:**
- Modify: `src/components/GitConflictResolver.tsx`

The current component only resolves `conflicts[0]`. We need:
1. Internal `activeConflictIdx` state
2. Nav bar: "Conflicto N de M" + Prev/Next buttons that scroll Monaco
3. Per-conflict preview (current/incoming content shown above editor)
4. Action buttons act on `conflicts[activeConflictIdx]`
5. New `onSaved` prop (called after write + git add, used by modal to advance files)

**Step 1: Update the props interface**

Replace:
```tsx
interface GitConflictResolverProps {
    projectPath: string;
    file: string;
    onClose: () => void;
    onRefreshRequest?: () => void;
}
```
With:
```tsx
interface GitConflictResolverProps {
    projectPath: string;
    file: string;
    onClose?: () => void;
    onRefreshRequest?: () => void;
    onSaved?: () => void;          // modal calls this after write+git add
    showCloseButton?: boolean;     // false when embedded in modal (default true)
}
```

**Step 2: Add `activeConflictIdx` state after the existing state declarations**

```tsx
const [activeConflictIdx, setActiveConflictIdx] = useState(0);
```

Also reset it when the file changes:
```tsx
useEffect(() => {
    setActiveConflictIdx(0);
}, [file]);
```

**Step 3: Add `scrollToConflict` helper after `handleEditorMount`**

```tsx
const scrollToConflict = (idx: number) => {
    const c = conflicts[idx];
    if (!c || !editorRef.current) return;
    editorRef.current.revealLineInCenter(c.startLine);
    setActiveConflictIdx(idx);
};
```

**Step 4: Replace `handleSaveAndAdd` to call `onSaved` when provided**

```tsx
const handleSaveAndAdd = async () => {
    if (!editorRef.current) return;
    setSaving(true);
    setError(null);
    try {
        const finalContent = editorRef.current.getValue();
        await invoke('write_file_content', { base: projectPath, file, content: finalContent });
        const addResult: any = await invoke('git_execute', { projectPath, args: ['add', file] });
        if (!addResult.success) throw new Error(addResult.stderr || 'Failed to stage resolved file');
        if (onSaved) {
            onSaved();
        } else {
            onRefreshRequest?.();
            onClose?.();
        }
    } catch (e: any) {
        setError(e?.toString?.() || 'Failed to save and resolve');
    } finally {
        setSaving(false);
    }
};
```

**Step 5: Change the action buttons to use `conflicts[activeConflictIdx]`**

Find the existing "Quick Resolve First Conflict" bar and replace it entirely:
```tsx
{conflicts.length > 0 && (() => {
    const active = conflicts[activeConflictIdx];
    if (!active) return null;
    return (
        <div className="bg-slate-900 border-b border-slate-800 shrink-0">
            {/* Conflict navigator */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60">
                <span className="text-xs text-slate-400 font-medium">
                    Conflicto {activeConflictIdx + 1} de {conflicts.length}
                </span>
                <button
                    onClick={() => scrollToConflict(Math.max(0, activeConflictIdx - 1))}
                    disabled={activeConflictIdx === 0}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >← Anterior</button>
                <button
                    onClick={() => scrollToConflict(Math.min(conflicts.length - 1, activeConflictIdx + 1))}
                    disabled={activeConflictIdx === conflicts.length - 1}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >Siguiente →</button>
            </div>
            {/* Preview + action buttons */}
            <div className="flex gap-2 px-3 py-2 overflow-x-auto">
                <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold text-emerald-400 mb-0.5 uppercase tracking-wide">HEAD (actual)</div>
                    <pre className="text-[10px] text-emerald-300 bg-emerald-950/40 rounded px-2 py-1 max-h-16 overflow-auto font-mono whitespace-pre-wrap border border-emerald-900/30">
                        {active.currentContent || '(vacío)'}
                    </pre>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold text-blue-400 mb-0.5 uppercase tracking-wide">Incoming</div>
                    <pre className="text-[10px] text-blue-300 bg-blue-950/40 rounded px-2 py-1 max-h-16 overflow-auto font-mono whitespace-pre-wrap border border-blue-900/30">
                        {active.incomingContent || '(vacío)'}
                    </pre>
                </div>
                <div className="flex flex-col gap-1 justify-center shrink-0">
                    <button onClick={() => resolveConflict(active, 'current')}
                        className="text-[10px] px-3 py-1 bg-emerald-950 border border-emerald-900 text-emerald-400 rounded hover:bg-emerald-900 transition-colors whitespace-nowrap">
                        Aceptar actual
                    </button>
                    <button onClick={() => resolveConflict(active, 'incoming')}
                        className="text-[10px] px-3 py-1 bg-blue-950 border border-blue-900 text-blue-400 rounded hover:bg-blue-900 transition-colors whitespace-nowrap">
                        Aceptar incoming
                    </button>
                    <button onClick={() => resolveConflict(active, 'both')}
                        className="text-[10px] px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-slate-700 transition-colors whitespace-nowrap">
                        Aceptar ambos
                    </button>
                </div>
            </div>
        </div>
    );
})()}
```

**Step 6: After `resolveConflict`, advance to next unresolved conflict**

In `resolveConflict`, after `parseConflicts(newText)`, add:
```tsx
// Advance to next unresolved conflict after resolution
setTimeout(() => {
    setActiveConflictIdx(prev => {
        const next = Math.min(prev, conflicts.length - 2); // conflicts array shrinks by 1
        return Math.max(0, next);
    });
}, 0);
```

**Step 7: Update the "Mark as Resolved" button label and the header close button**

Change the save button label to "Guardar y marcar resuelto →".

In the header, conditionally show the close button:
```tsx
{(showCloseButton ?? true) && (
    <button onClick={onClose} className="p-1 mr-2 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors">
        <X size={16} />
    </button>
)}
```

**Step 8: Verify TypeScript**

```bash
cd E:/Users/1200056/Documents/projects/microtermix && npx tsc --noEmit
```
Expected: no errors.

---

### Task 2: Create `GitConflictModal.tsx`

**Files:**
- Create: `src/components/GitConflictModal.tsx`

**Step 1: Create the file with full implementation**

```tsx
import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitMerge, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { GitConflictResolver } from './GitConflictResolver';
import { useGitStore } from '../stores/gitStore';

interface GitConflictModalProps {
    projectPath: string;
    conflictedFiles: string[];
    onClose: () => void;
    onRefreshAll: () => void;
}

export const GitConflictModal: React.FC<GitConflictModalProps> = ({
    projectPath,
    conflictedFiles,
    onClose,
    onRefreshAll,
}) => {
    const [selectedFile, setSelectedFile] = useState(conflictedFiles[0] ?? '');
    const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set());
    const [aborting, setAborting] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const allResolved = resolvedFiles.size === conflictedFiles.length;
    const progress = conflictedFiles.length > 0
        ? (resolvedFiles.size / conflictedFiles.length) * 100
        : 0;

    const handleFileSaved = (file: string) => {
        const newResolved = new Set(resolvedFiles);
        newResolved.add(file);
        setResolvedFiles(newResolved);
        // Auto-advance to next unresolved file
        const next = conflictedFiles.find(f => !newResolved.has(f));
        if (next) setSelectedFile(next);
    };

    const handleAbort = async () => {
        if (!window.confirm('¿Abortar el merge? Se perderán todos los cambios del merge en progreso.')) return;
        setAborting(true);
        setError(null);
        try {
            const res: any = await invoke('git_execute', { projectPath, args: ['merge', '--abort'] });
            if (!res.success) throw new Error(res.stderr || 'Error al abortar el merge');
            onRefreshAll();
            onClose();
        } catch (e: any) {
            setError(e?.toString?.() || 'Error al abortar');
        } finally {
            setAborting(false);
        }
    };

    const handleCommitMerge = async () => {
        setCommitting(true);
        setError(null);
        try {
            // --no-edit uses the auto-generated MERGE_MSG (includes merged branch info)
            const res: any = await invoke('git_execute', { projectPath, args: ['commit', '--no-edit'] });
            if (!res.success) throw new Error(res.stderr || 'Error al hacer commit del merge');
            onRefreshAll();
            onClose();
        } catch (e: any) {
            setError(e?.toString?.() || 'Error al hacer commit');
        } finally {
            setCommitting(false);
        }
    };

    return (
        // Backdrop
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            {/* Modal */}
            <div className="w-[90vw] h-[85vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
                    <GitMerge size={18} className="text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold text-slate-100">Resolver conflictos de Merge</h2>
                        {/* Progress bar */}
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">
                                {resolvedFiles.size} / {conflictedFiles.length} resueltos
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={handleAbort}
                        disabled={aborting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950 hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 border border-red-900 text-xs font-bold rounded transition-colors"
                    >
                        {aborting ? <RefreshCw size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                        Abort Merge
                    </button>
                </div>

                {error && (
                    <div className="px-4 py-2 bg-red-950/50 text-red-400 text-xs border-b border-red-900/30">
                        {error}
                    </div>
                )}

                {/* Body: file list + resolver */}
                <div className="flex flex-1 min-h-0">

                    {/* Left: file list */}
                    <div className="w-52 shrink-0 flex flex-col border-r border-slate-800 bg-slate-950/50">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                            Archivos en conflicto
                        </div>
                        <div className="flex-1 overflow-y-auto py-1">
                            {conflictedFiles.map(f => {
                                const isResolved = resolvedFiles.has(f);
                                const isActive = f === selectedFile;
                                const shortName = f.split('/').pop() ?? f;
                                const dir = f.includes('/') ? f.split('/').slice(0, -1).join('/') : '';
                                return (
                                    <button
                                        key={f}
                                        onClick={() => setSelectedFile(f)}
                                        className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                                            isActive
                                                ? 'bg-slate-800 border-l-2 border-nexus-accent'
                                                : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                                        }`}
                                    >
                                        <span className={`shrink-0 mt-0.5 ${isResolved ? 'text-emerald-400' : 'text-orange-400'}`}>
                                            {isResolved ? <Check size={12} /> : <AlertTriangle size={12} />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className={`block text-xs font-medium truncate ${isResolved ? 'text-slate-400' : 'text-slate-200'}`}>
                                                {shortName}
                                            </span>
                                            {dir && (
                                                <span className="block text-[10px] text-slate-600 truncate">{dir}</span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Commit Merge button */}
                        <div className="p-3 border-t border-slate-800">
                            <button
                                onClick={handleCommitMerge}
                                disabled={!allResolved || committing}
                                className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors"
                            >
                                {committing
                                    ? <RefreshCw size={13} className="animate-spin" />
                                    : <Check size={13} />
                                }
                                Commit Merge
                            </button>
                            {!allResolved && (
                                <p className="text-[10px] text-slate-600 text-center mt-1">
                                    Resuelve todos los archivos primero
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right: resolver */}
                    <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                        {selectedFile ? (
                            <GitConflictResolver
                                key={selectedFile}
                                projectPath={projectPath}
                                file={selectedFile}
                                showCloseButton={false}
                                onSaved={() => handleFileSaved(selectedFile)}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                                Selecciona un archivo para resolver
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
```

**Step 2: Verify TypeScript**

```bash
cd E:/Users/1200056/Documents/projects/microtermix && npx tsc --noEmit
```
Expected: no errors.

---

### Task 3: Update `GitStagingPanel.tsx` — replace banner with conflict button

**Files:**
- Modify: `src/components/GitStagingPanel.tsx`

**Step 1: Add `onOpenConflictModal` to props interface**

Find `interface GitStagingPanelProps` and add:
```tsx
onOpenConflictModal?: () => void;
```

**Step 2: Destructure the new prop in the component**

```tsx
export const GitStagingPanel: React.FC<GitStagingPanelProps> = ({
    projectPath,
    onDiffRequest,
    onOpenConflictModal,
}) => {
```

**Step 3: Compute conflictedFilesCount**

After the `isAnythingStaged` declaration add:
```tsx
const conflictedFilesCount = useMemo(() => files.filter(f => f.isConflicted).length, [files]);
```

**Step 4: Replace the existing "Merge in Progress" banner**

Find:
```tsx
{isMergeInProgress && (
    <div className="mb-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded flex items-center justify-between">
        <span className="text-xs font-bold text-orange-400 flex items-center">
            <AlertTriangle size={12} className="mr-1" /> Merge in Progress
        </span>
        <button
            onClick={handleAbortMerge}
            className="text-[10px] font-bold px-2 py-1 bg-red-950 text-red-400 border border-red-900 rounded hover:bg-red-900 transition-colors"
        >
            Abort Merge
        </button>
    </div>
)}
```

Replace with:
```tsx
{isMergeInProgress && (
    <div className="mb-3 p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg flex flex-col gap-2">
        <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-orange-400 flex items-center gap-1">
                <AlertTriangle size={12} /> Merge in Progress
            </span>
            <button
                onClick={handleAbortMerge}
                className="text-[10px] font-bold px-2 py-1 bg-red-950 text-red-400 border border-red-900 rounded hover:bg-red-900 transition-colors"
            >
                Abort
            </button>
        </div>
        {conflictedFilesCount > 0 && (
            <button
                onClick={onOpenConflictModal}
                className="w-full py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 text-xs font-bold rounded transition-colors flex items-center justify-center gap-1.5"
            >
                <GitMerge size={12} />
                Resolver conflictos ({conflictedFilesCount} {conflictedFilesCount === 1 ? 'archivo' : 'archivos'})
            </button>
        )}
    </div>
)}
```

**Step 5: Add `GitMerge` to the imports from lucide-react**

The existing import is:
```tsx
import { GitCommit, RefreshCw, Layers, CheckSquare, Square, MinusSquare, Trash2, ChevronRight, ChevronDown, Folder, File, RotateCcw, AlertTriangle } from 'lucide-react';
```

Add `GitMerge`:
```tsx
import { GitCommit, RefreshCw, Layers, CheckSquare, Square, MinusSquare, Trash2, ChevronRight, ChevronDown, Folder, File, RotateCcw, AlertTriangle, GitMerge } from 'lucide-react';
```

**Step 6: Verify TypeScript**

```bash
cd E:/Users/1200056/Documents/projects/microtermix && npx tsc --noEmit
```
Expected: no errors.

---

### Task 4: Wire up `GitPanel.tsx` — state + modal render

**Files:**
- Modify: `src/components/GitPanel.tsx`

**Step 1: Import `GitConflictModal`**

Add to the imports at the top:
```tsx
import { GitConflictModal } from './GitConflictModal';
```

**Step 2: Add `isConflictModalOpen` state**

After the existing `useState` declarations (near `activeDiffFile`, `selectedCommit`, `isConfigModalOpen`):
```tsx
const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
```

**Step 3: Add `handleRefreshAll` helper**

After the existing `handleStatusRefresh` and `handleTimelineRefresh` handlers:
```tsx
const handleRefreshAll = useCallback(() => {
    invalidate(ui.activeTab);
    fetchAll(ui.activeTab, true);
}, [ui.activeTab, invalidate, fetchAll]);
```

Make sure `fetchAll` and `invalidate` are already destructured from `useGitStore`. If not, add them:
```tsx
const fetchAll = useGitStore(s => s.fetchAll);
const invalidate = useGitStore(s => s.invalidate);
```

**Step 4: Pass `onOpenConflictModal` to `GitStagingPanel`**

Find:
```tsx
<GitStagingPanel
    projectPath={ui.activeTab}
    onDiffRequest={(file, mode, line) => setActiveDiffFile({ file, mode, line })}
/>
```

Replace with:
```tsx
<GitStagingPanel
    projectPath={ui.activeTab}
    onDiffRequest={(file, mode, line) => setActiveDiffFile({ file, mode, line })}
    onOpenConflictModal={() => setIsConflictModalOpen(true)}
/>
```

**Step 5: Render `GitConflictModal` as overlay inside the git panel root**

Find the outermost `<div>` of the git panel return (the one wrapping everything when `isGitRepo === 'initialized'`). It should already be `relative` or can be made so. Add the modal render just before the closing tag of that div:

```tsx
{isConflictModalOpen && repoData.status.isMergeInProgress && (
    <GitConflictModal
        projectPath={ui.activeTab}
        conflictedFiles={repoData.status.files.filter(f => f.isConflicted).map(f => f.file)}
        onClose={() => setIsConflictModalOpen(false)}
        onRefreshAll={handleRefreshAll}
    />
)}
```

Make sure the parent container has `relative` positioning (add `relative` to the class if not present).

**Step 6: Auto-close modal if merge is no longer in progress**

Add a `useEffect` that closes the modal when the merge is done:
```tsx
useEffect(() => {
    if (!repoData.status.isMergeInProgress) {
        setIsConflictModalOpen(false);
    }
}, [repoData.status.isMergeInProgress]);
```

**Step 7: Verify TypeScript**

```bash
cd E:/Users/1200056/Documents/projects/microtermix && npx tsc --noEmit
```
Expected: no errors.

**Step 8: Manual test checklist**

- [ ] Start a merge that produces conflicts: `git merge <branch-with-conflicts>`
- [ ] GitStagingPanel shows "Merge in Progress" banner with "Resolver conflictos (N archivos)" button
- [ ] Clicking the button opens the modal
- [ ] Left panel shows all conflicted files with orange ✗ icons
- [ ] Clicking a file loads it in the resolver on the right
- [ ] "Conflicto 1 de N" nav bar shows, prev/next scroll to correct blocks
- [ ] Green preview = HEAD content, Blue preview = Incoming content
- [ ] "Aceptar actual" replaces the active conflict block with HEAD content
- [ ] After resolving all blocks in a file, "Guardar y marcar resuelto" is enabled
- [ ] Clicking it writes the file, runs git add, marks the file ✓, advances to next file
- [ ] When all files are ✓, "Commit Merge" button enables
- [ ] Clicking "Commit Merge" runs `git commit --no-edit`, closes modal, refreshes store
- [ ] "Abort Merge" shows confirmation dialog, runs `git merge --abort`, closes modal
- [ ] After abort, the staging panel shows normal state (no merge banner)
