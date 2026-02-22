import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { diffArrays } from 'diff';
import {
    X, RefreshCw, GitCompare, CheckSquare, FilePlus, FileMinus,
    Maximize2, Minimize2, RotateCcw, Edit3, Check, ChevronDown, ChevronRight, Zap
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Change {
    type: 'insert' | 'delete' | 'normal';
    content: string;            // line text including prefix (+/-/ )
    lineNumber?: number;        // new file line (insert/normal)
    oldLineNumber?: number;     // old file line (delete/normal)
    newLineNumber?: number;
    isNormal?: boolean;
    isInsert?: boolean;
    isDelete?: boolean;
}

interface Hunk {
    content: string;            // raw @@ header
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: Change[];
}

interface FileDiff {
    from: string;
    to: string;
    hunks: Hunk[];
}

interface UndoAction {
    patch: string;
    wasReverse: boolean;
    label: string;
}

// ─── Word-level Diff Algorithm (LCS) ─────────────────────────────────────────

type Token = { text: string; type: 'same' | 'del' | 'ins' };

function tokenize(text: string): string[] {
    // Split on word boundaries, preserving spaces
    return text.split(/([\s,;:.(){}\[\]"'`<>=!&|+\-*/\\^%@#~])/).filter(t => t.length > 0);
}

function lcsWordDiff(oldLine: string, newLine: string): { delTokens: Token[]; insTokens: Token[] } {
    const oldTokens = tokenize(oldLine);
    const newTokens = tokenize(newLine);
    const m = oldTokens.length, n = newTokens.length;

    // Build LCS matrix
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = oldTokens[i - 1] === newTokens[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Backtrack
    const delTokens: Token[] = [];
    const insTokens: Token[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
            delTokens.unshift({ text: oldTokens[i - 1], type: 'same' });
            insTokens.unshift({ text: newTokens[j - 1], type: 'same' });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            insTokens.unshift({ text: newTokens[j - 1], type: 'ins' });
            j--;
        } else {
            delTokens.unshift({ text: oldTokens[i - 1], type: 'del' });
            i--;
        }
    }

    return { delTokens, insTokens };
}

function renderTokens(tokens: Token[], kind: 'del' | 'ins'): string {
    return tokens.map(t => {
        const text = t.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        if (t.type === kind) {
            const bg = kind === 'del'
                ? 'background:rgba(239,68,68,0.45);border-radius:3px;padding:0 1px'
                : 'background:rgba(16,185,129,0.45);border-radius:3px;padding:0 1px';
            return `<span style="${bg}">${text}</span>`;
        }
        return `<span class="text-slate-400">${text}</span>`;
    }).join('');
}

// Similarity score for pairing heuristic (0=completely different, 1=identical)
function similarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length <= b.length ? a : b;
    if (longer.length === 0) return 1;
    let matches = 0;
    for (let k = 0; k < shorter.length; k++) {
        if (longer.includes(shorter[k])) matches++;
    }
    return matches / longer.length;
}

// ─── Hunk change pairing ──────────────────────────────────────────────────────

interface PairedChange {
    kind: 'pair';
    delChange: Change;
    insChange: Change;
    delIdx: number;
    insIdx: number;
}

interface SingleChange {
    kind: 'single';
    change: Change;
    idx: number;
}

type RenderedItem = PairedChange | SingleChange;

/** Pair up adjacent delete+insert blocks within a hunk for smart rendering */
function pairChanges(changes: Change[]): RenderedItem[] {
    const items: RenderedItem[] = [];
    let i = 0;

    while (i < changes.length) {
        const ch = changes[i];

        // Look for a delete run followed immediately by an insert run
        if (ch.type === 'delete') {
            const delStart = i;
            while (i < changes.length && changes[i].type === 'delete') i++;
            const delEnd = i;

            const insStart = i;
            while (i < changes.length && changes[i].type === 'insert') i++;
            const insEnd = i;

            const delCount = delEnd - delStart;
            const insCount = insEnd - insStart;

            if (insCount > 0) {
                // Pair them 1:1 (shortest count), remainder stays as singles
                const pairCount = Math.min(delCount, insCount);
                for (let p = 0; p < pairCount; p++) {
                    const d = changes[delStart + p];
                    const ins = changes[insStart + p];
                    // Only pair if the lines are reasonably similar (>10% overlap)
                    if (similarity(d.content, ins.content) > 0.1) {
                        items.push({ kind: 'pair', delChange: d, insChange: ins, delIdx: delStart + p, insIdx: insStart + p });
                    } else {
                        items.push({ kind: 'single', change: d, idx: delStart + p });
                        items.push({ kind: 'single', change: ins, idx: insStart + p });
                    }
                }
                // Remaining deletions
                for (let p = pairCount; p < delCount; p++) {
                    items.push({ kind: 'single', change: changes[delStart + p], idx: delStart + p });
                }
                // Remaining insertions
                for (let p = pairCount; p < insCount; p++) {
                    items.push({ kind: 'single', change: changes[insStart + p], idx: insStart + p });
                }
            } else {
                // No following inserts – just emit deletes as singles
                for (let p = delStart; p < delEnd; p++) {
                    items.push({ kind: 'single', change: changes[p], idx: p });
                }
            }
        } else {
            items.push({ kind: 'single', change: ch, idx: i });
            i++;
        }
    }

    return items;
}



export interface GitDiffViewerProps {
    projectPath: string;
    file: string;
    mode: 'staged' | 'unstaged';
    targetLine?: number;
    onClose: () => void;
    onRefreshRequest?: () => void;
}

// ─── Myers Line Diff Engine (Option B) ──────────────────────────────────────
// Compares two text bodies directly rather than relying on git diff output

type EditOp = 'equal' | 'insert' | 'delete';
interface EditScript { op: EditOp; oldLine?: number; newLine?: number; text: string; }

function myersDiff(oldLines: string[], newLines: string[]): EditScript[] {
    const diffs = diffArrays(oldLines, newLines);
    const edits: EditScript[] = [];
    let oldLine = 1;
    let newLine = 1;

    for (const d of diffs) {
        if (d.added) {
            for (const text of d.value) {
                edits.push({ op: 'insert', newLine: newLine++, text });
            }
        } else if (d.removed) {
            for (const text of d.value) {
                edits.push({ op: 'delete', oldLine: oldLine++, text });
            }
        } else {
            for (const text of d.value) {
                edits.push({ op: 'equal', oldLine: oldLine++, newLine: newLine++, text });
            }
        }
    }
    return edits;
}

/** Group a flat edit script into hunks (groups of changes + 3-line context) */
function buildHunksFromDiff(edits: EditScript[], _from: string, _to: string): FileDiff {
    const CONTEXT = 3;

    // Find indices of changed edits
    const changeMask = edits.map(e => e.op !== 'equal');
    const included = new Set<number>();
    changeMask.forEach((isChange, i) => {
        if (isChange) {
            for (let c = Math.max(0, i - CONTEXT); c <= Math.min(edits.length - 1, i + CONTEXT); c++) {
                included.add(c);
            }
        }
    });

    if (included.size === 0) return { from: _from, to: _to, hunks: [] };

    // Split into contiguous groups
    const sortedIdx = [...included].sort((a, b) => a - b);
    const groups: number[][] = [];
    let grp: number[] = [sortedIdx[0]];
    for (let i = 1; i < sortedIdx.length; i++) {
        if (sortedIdx[i] === sortedIdx[i - 1] + 1) {
            grp.push(sortedIdx[i]);
        } else {
            groups.push(grp);
            grp = [sortedIdx[i]];
        }
    }
    groups.push(grp);

    const hunks: Hunk[] = groups.map(idxs => {
        const slice = idxs.map(i => edits[i]);

        let oldStart = 0, oldCount = 0, newStart = 0, newCount = 0;
        const changes: Change[] = [];

        slice.forEach(e => {
            if (e.op !== 'insert') {
                if (oldStart === 0) oldStart = e.oldLine!;
                oldCount++;
            }
            if (e.op !== 'delete') {
                if (newStart === 0) newStart = e.newLine!;
                newCount++;
            }

            changes.push({
                type: e.op === 'equal' ? 'normal' : e.op === 'insert' ? 'insert' : 'delete',
                content: e.text,
                oldLineNumber: e.op !== 'insert' ? e.oldLine : undefined,
                newLineNumber: e.op !== 'delete' ? e.newLine : undefined,
                isNormal: e.op === 'equal',
                isInsert: e.op === 'insert',
                isDelete: e.op === 'delete',
            });
        });

        const hunkHeader = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
        return { content: hunkHeader, oldStart, oldLines: oldCount, newStart, newLines: newCount, changes };
    });

    return { from: _from, to: _to, hunks };
}


// ─── Patch Builder ────────────────────────────────────────────────────────────

function buildHunkPatch(filePath: string, hunk: Hunk): string {
    const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
    const lines = hunk.changes.map(c => {
        const prefix = c.type === 'insert' ? '+' : c.type === 'delete' ? '-' : ' ';
        const content = c.content.endsWith('\n') ? c.content : c.content + '\n';
        return prefix + content;
    }).join('');
    return `${header}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${lines}`;
}

function buildPartialPatch(filePath: string, hunks: Hunk[], selectedIds: Set<string>): string {
    const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
    const subHunks: string[] = [];

    hunks.forEach((hunk, hIdx) => {
        const selectedChanges = hunk.changes
            .map((ch, cIdx) => ({ ch, cIdx, id: `${hIdx}-${cIdx}` }))
            .filter(({ ch, id }) => (ch.type === 'insert' || ch.type === 'delete') && selectedIds.has(id));

        if (selectedChanges.length === 0) return;

        // Build a patch with only the selected lines + surrounding context
        const allChanges = hunk.changes;
        const includedIndices = new Set<number>(selectedChanges.map(({ cIdx }) => cIdx));

        // Add 3 context lines around each selected change
        [...includedIndices].forEach(idx => {
            for (let i = Math.max(0, idx - 3); i <= Math.min(allChanges.length - 1, idx + 3); i++) {
                if (allChanges[i].type === 'normal') includedIndices.add(i);
            }
        });

        const sorted = [...includedIndices].sort((a, b) => a - b);
        const slice = sorted.map(i => allChanges[i]);

        let oldStart = 0, oldCount = 0, newStart = 0, newCount = 0;
        const patchLines: string[] = [];

        slice.forEach(ch => {
            if (ch.type !== 'insert') {
                if (oldStart === 0 && ch.oldLineNumber) oldStart = ch.oldLineNumber;
                oldCount++;
            }
            if (ch.type !== 'delete') {
                if (newStart === 0 && ch.newLineNumber) newStart = ch.newLineNumber;
                newCount++;
            }
            const prefix = ch.type === 'insert' ? '+' : ch.type === 'delete' ? '-' : ' ';
            patchLines.push(prefix + (ch.content.endsWith('\n') ? ch.content : ch.content + '\n'));
        });

        if (patchLines.length > 0) {
            subHunks.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${patchLines.join('')}`);
        }
    });

    if (subHunks.length === 0) return '';
    return header + subHunks.join('');
}

// ─── Syntax highlighter (basic) ───────────────────────────────────────────────

const keywords = /\b(import|export|from|const|let|var|function|return|if|else|class|extends|async|await|try|catch|throw|new|type|interface|enum|for|of|in|while|do|break|continue|default|switch|case|null|undefined|true|false|void|any|string|number|boolean|never)\b/g;
const strings = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
const numbers = /\b(\d+\.?\d*)\b/g;

function highlightLine(text: string): string {
    // Escape HTML first
    let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    safe = safe.replace(comments, '<span class="diff-token-comment">$1</span>');
    safe = safe.replace(strings, '<span class="diff-token-string">$1$2$1</span>');
    safe = safe.replace(keywords, '<span class="diff-token-keyword">$1</span>');
    safe = safe.replace(numbers, '<span class="diff-token-number">$1</span>');
    return safe;
}

// ─── Undo State ───────────────────────────────────────────────────────────────

interface UndoAction {
    patch: string;
    wasReverse: boolean;
    target: 'index' | 'working' | 'both';
    label: string;
    isFullFile?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GitDiffViewer: React.FC<GitDiffViewerProps> = ({
    projectPath, file, mode, targetLine, onClose, onRefreshRequest,
}) => {
    const [parsedFile, setParsedFile] = useState<FileDiff | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [checkedLines, setCheckedLines] = useState<Set<string>>(new Set());
    const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(new Set());
    const [editingLine, setEditingLine] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [canUndo, setCanUndo] = useState(false);
    const [applyingAction, setApplyingAction] = useState(false);
    const lastUndoRef = useRef<UndoAction | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadContent = useCallback(async () => {
        setLoading(true);
        setError(null);
        setCheckedLines(new Set());
        setEditingLine(null);
        try {
            // Option B: fetch both file versions ourselves and diff them directly
            let originalText = '';
            let modifiedText = '';

            if (mode === 'staged') {
                // Compare HEAD vs Index (staged)
                const [headRes, indexRes]: any[] = await Promise.all([
                    invoke('git_execute', { projectPath, args: ['show', `HEAD:${file}`] }),
                    invoke('git_execute', { projectPath, args: ['show', `:${file}`] }),
                ]);
                originalText = headRes?.success ? (headRes.stdout ?? '') : '';
                modifiedText = indexRes?.success ? (indexRes.stdout ?? '') : '';
            } else {
                // Compare Index (or HEAD if not staged) vs working tree
                const indexRes: any = await invoke('git_execute', { projectPath, args: ['show', `:${file}`] });
                if (indexRes?.success) {
                    originalText = indexRes.stdout ?? '';
                } else {
                    // File not in index yet (untracked) — use HEAD
                    const headRes: any = await invoke('git_execute', { projectPath, args: ['show', `HEAD:${file}`] });
                    originalText = headRes?.success ? (headRes.stdout ?? '') : '';
                }
                try {
                    modifiedText = await invoke<string>('read_file_content', { base: projectPath, file }) ?? '';
                } catch {
                    modifiedText = '';
                }
            }

            // Normalize line endings
            const oldLines = originalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const newLines = modifiedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

            // Remove trailing empty line artifact from split
            if (oldLines[oldLines.length - 1] === '') oldLines.pop();
            if (newLines[newLines.length - 1] === '') newLines.pop();

            const edits = myersDiff(oldLines, newLines);
            const fileDiff = buildHunksFromDiff(edits, file, file);

            setParsedFile(fileDiff.hunks.length > 0 ? fileDiff : null);

        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to load diff');
        } finally {
            setLoading(false);
        }
    }, [projectPath, file, mode]);

    useEffect(() => { loadContent(); }, [loadContent]);

    // Auto-close if file becomes empty (no hunks left after an action)
    useEffect(() => {
        if (!loading && parsedFile && parsedFile.hunks.length === 0) {
            onClose();
            onRefreshRequest?.();
        }
    }, [parsedFile, loading, onClose, onRefreshRequest]);

    // Scroll to target line
    useEffect(() => {
        if (!targetLine || !containerRef.current) return;
        const el = containerRef.current.querySelector(`[data-newline="${targetLine}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [targetLine, parsedFile]);

    // Ctrl+Z
    const handleUndo = useCallback(async () => {
        const last = lastUndoRef.current;
        if (!last) return;
        try {
            if (last.isFullFile) {
                await invoke('write_file_content', { base: projectPath, file, content: last.patch });
            } else {
                await invoke('git_apply_patch', { projectPath, patchContent: last.patch, reverse: !last.wasReverse, target: last.target });
            }
            lastUndoRef.current = null;
            setCanUndo(false);
            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Undo failed');
        }
    }, [projectPath, loadContent, onRefreshRequest]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleUndo]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const applyHunkPatch = async (hunk: Hunk, reverse: boolean, label: string) => {
        setApplyingAction(true);
        setError(null);
        try {
            const patch = buildHunkPatch(file, hunk);
            await invoke('git_apply_patch', { projectPath, patchContent: patch, reverse, target: 'index' });
            lastUndoRef.current = { patch, wasReverse: reverse, target: 'index', label };
            setCanUndo(true);
            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Action failed');
        } finally {
            setApplyingAction(false);
        }
    };

    const discardHunk = async (hunk: Hunk) => {
        setApplyingAction(true);
        setError(null);
        try {
            // Option B discard: we have originalText & modifiedText in scope during load.
            // But we don't save them in state. Instead we can just fetch again.
            const indexRes: any = await invoke('git_execute', { projectPath, args: ['show', `:${file}`] });
            let originalText = '';
            if (indexRes?.success) {
                originalText = indexRes.stdout ?? '';
            } else {
                const headRes: any = await invoke('git_execute', { projectPath, args: ['show', `HEAD:${file}`] });
                originalText = headRes?.success ? (headRes.stdout ?? '') : '';
            }
            const modifiedText: string = await invoke('read_file_content', { base: projectPath, file }) ?? '';

            // Format hunk for the backend apply_rejected_hunks
            const hunkInfo = {
                id: 0,
                old_start: hunk.oldStart,
                old_count: hunk.oldLines,
                new_start: hunk.newStart,
                new_count: hunk.newLines
            };

            const revertedText: string = await invoke('apply_rejected_hunks', {
                original: originalText,
                modified: modifiedText,
                hunks: [hunkInfo],
                rejectIndices: [0]
            });

            // Save the reverted file
            await invoke('write_file_content', { base: projectPath, file, content: revertedText });

            // Undo is trickier for pure text manipulation unless we save the whole file text,
            // but we can just invalidate undo for this explicit file write or store the old text.
            lastUndoRef.current = { patch: modifiedText, wasReverse: false, target: 'working', label: 'Descartar bloque', isFullFile: true } as any;
            setCanUndo(true);

            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Discard failed');
        } finally {
            setApplyingAction(false);
        }
    };

    const stageCheckedLines = async () => {
        if (!parsedFile || checkedLines.size === 0) return;
        setApplyingAction(true);
        setError(null);
        try {
            const patch = buildPartialPatch(file, parsedFile.hunks, checkedLines);
            if (!patch) { setApplyingAction(false); return; }
            await invoke('git_apply_patch', { projectPath, patchContent: patch, reverse: mode === 'staged', target: 'index' });
            lastUndoRef.current = { patch, wasReverse: mode === 'staged', target: 'index', label: `${checkedLines.size} líneas marcadas` };
            setCanUndo(true);
            setCheckedLines(new Set());
            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to stage selected lines');
        } finally {
            setApplyingAction(false);
        }
    };

    const discardCheckedLines = async () => {
        if (!parsedFile || checkedLines.size === 0) return;
        setApplyingAction(true);
        setError(null);
        try {
            // Build a partial patch including only checked lines
            const patch = buildPartialPatch(file, parsedFile.hunks, checkedLines);
            if (!patch) { setApplyingAction(false); return; }

            // To discard specific lines from the working tree, we apply their forward patch in REVERSE
            // directly onto the working tree.
            await invoke('git_apply_patch', { projectPath, patchContent: patch, reverse: true, target: 'working' });
            lastUndoRef.current = { patch, wasReverse: true, target: 'working', label: `Descartar ${checkedLines.size} líneas` };
            setCanUndo(true);
            setCheckedLines(new Set());
            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to discard selected lines');
        } finally {
            setApplyingAction(false);
        }
    };

    const stageWholeFile = async () => {
        setApplyingAction(true);
        try {
            if (mode === 'unstaged') {
                await invoke('git_execute', { projectPath, args: ['add', '--', file] });
            } else {
                await invoke('git_execute', { projectPath, args: ['restore', '--staged', '--', file] });
            }
            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed');
        } finally {
            setApplyingAction(false);
        }
    };

    const saveInlineEdit = async (lineId: string, newContent: string) => {
        if (!parsedFile) return;
        try {
            const current: string = await invoke('read_file_content', { base: projectPath, file }) ?? '';
            const lines = current.split('\n');
            // Find line number from lineId (hunkIdx-changeIdx)
            const [hIdx, cIdx] = lineId.split('-').map(Number);
            const hunk = parsedFile.hunks[hIdx];
            if (!hunk) return;
            const change = hunk.changes[cIdx];
            const lineNum = (change.newLineNumber ?? 1) - 1;
            lines[lineNum] = newContent;
            await invoke('write_file_content', { base: projectPath, file, content: lines.join('\n') });
            setEditingLine(null);
            setEditValue('');
            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString?.() || 'Save failed');
        }
    };

    // ── Render helpers ────────────────────────────────────────────────────────

    const toggleCheck = (id: string) => {
        setCheckedLines(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllInHunk = (hIdx: number, hunk: Hunk) => {
        setCheckedLines(prev => {
            const next = new Set(prev);
            hunk.changes.forEach((ch, cIdx) => {
                if (ch.type === 'insert' || ch.type === 'delete') next.add(`${hIdx}-${cIdx}`);
            });
            return next;
        });
    };

    const deselectAllInHunk = (hIdx: number, hunk: Hunk) => {
        setCheckedLines(prev => {
            const next = new Set(prev);
            hunk.changes.forEach((_, cIdx) => next.delete(`${hIdx}-${cIdx}`));
            return next;
        });
    };

    const toggleHunkCollapse = (hIdx: number) => {
        setCollapsedHunks(prev => {
            const next = new Set(prev);
            if (next.has(hIdx)) next.delete(hIdx);
            else next.add(hIdx);
            return next;
        });
    };

    // ── Rendering ─────────────────────────────────────────────────────────────

    const renderChange = (ch: Change, hIdx: number, cIdx: number) => {
        const id = `${hIdx}-${cIdx}`;
        const isChangeLine = ch.type === 'insert' || ch.type === 'delete';
        const isChecked = isChangeLine && checkedLines.has(id);
        const isEditing = editingLine === id;

        const rowBg = isChecked
            ? ch.type === 'insert' ? 'bg-green-500/20' : 'bg-red-500/20'
            : ch.type === 'insert' ? 'bg-emerald-950/40 hover:bg-emerald-950/60'
                : ch.type === 'delete' ? 'bg-red-950/40 hover:bg-red-950/60'
                    : 'hover:bg-slate-800/30';

        const gutterColor = ch.type === 'insert' ? 'text-emerald-400 bg-emerald-950/60'
            : ch.type === 'delete' ? 'text-red-400 bg-red-950/60'
                : 'text-slate-600 bg-slate-900/40';

        const prefix = ch.type === 'insert' ? '+' : ch.type === 'delete' ? '-' : ' ';

        return (
            <div
                key={id}
                className={`flex items-stretch group font-mono text-xs select-text transition-colors ${rowBg} ${isChecked ? 'ring-1 ring-inset ring-green-500/30' : ''}`}
                data-newline={ch.newLineNumber}
                data-oldline={ch.oldLineNumber}
            >
                {/* Checkbox column */}
                <div className="w-5 flex items-center justify-center shrink-0 border-r border-slate-800/50">
                    {isChangeLine ? (
                        <button
                            onClick={() => toggleCheck(id)}
                            className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center
                                ${isChecked
                                    ? 'bg-nexus-success border-nexus-success text-slate-900'
                                    : 'border-slate-600 text-transparent hover:border-slate-400'}`}
                        >
                            {isChecked && <Check size={9} strokeWidth={3} />}
                        </button>
                    ) : null}
                </div>

                {/* Old line number */}
                <div className="w-9 text-right pr-2 text-slate-600 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">
                    {ch.type !== 'insert' ? ch.oldLineNumber : ''}
                </div>

                {/* New line number */}
                <div className="w-9 text-right pr-2 text-slate-600 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">
                    {ch.type !== 'delete' ? ch.newLineNumber : ''}
                </div>

                {/* Gutter (+/-/ ) */}
                <div className={`w-5 text-center text-xs font-bold leading-5 py-px shrink-0 ${gutterColor}`}>
                    {prefix}
                </div>

                {/* Line content */}
                <div className="flex-1 min-w-0 leading-5 py-px px-1 relative">
                    {isEditing ? (
                        <div className="flex items-center gap-1">
                            <input
                                autoFocus
                                className="flex-1 bg-slate-800 border border-nexus-accent rounded px-1 text-xs text-slate-100 outline-none"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineEdit(id, editValue); }
                                    if (e.key === 'Escape') { setEditingLine(null); }
                                }}
                            />
                            <button onClick={() => saveInlineEdit(id, editValue)} className="p-0.5 text-nexus-success hover:bg-nexus-success/20 rounded"><Check size={12} /></button>
                            <button onClick={() => setEditingLine(null)} className="p-0.5 text-slate-400 hover:bg-slate-700 rounded"><X size={12} /></button>
                        </div>
                    ) : (
                        <span
                            className="whitespace-pre text-slate-200"
                            dangerouslySetInnerHTML={{ __html: highlightLine(ch.content || '') }}
                        />
                    )}
                </div>

                {/* Edit button (insert lines in unstaged mode) */}
                {ch.type === 'insert' && mode === 'unstaged' && !isEditing && (
                    <button
                        onClick={() => { setEditingLine(id); setEditValue(ch.content); }}
                        className="opacity-0 group-hover:opacity-100 px-1 text-slate-500 hover:text-nexus-accent transition-all shrink-0"
                        title="Edit this line"
                    >
                        <Edit3 size={11} />
                    </button>
                )}
            </div>
        );
    };

    /** Render a paired del+ins as a smart two-row replacement with inline word diffs */
    const renderPair = (item: PairedChange, hIdx: number) => {
        const delId = `${hIdx}-${item.delIdx}`;
        const insId = `${hIdx}-${item.insIdx}`;
        const delChecked = checkedLines.has(delId);
        const insChecked = checkedLines.has(insId);
        const bothChecked = delChecked && insChecked;
        const eitherChecked = delChecked || insChecked;
        const isEditing = editingLine === insId;

        const { delTokens, insTokens } = lcsWordDiff(item.delChange.content, item.insChange.content);

        const togglePair = () => {
            setCheckedLines(prev => {
                const next = new Set(prev);
                if (bothChecked) {
                    next.delete(delId);
                    next.delete(insId);
                } else {
                    next.add(delId);
                    next.add(insId);
                }
                return next;
            });
        };

        const checkboxEl = (
            <button
                onClick={togglePair}
                className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center
                    ${bothChecked
                        ? 'bg-nexus-success border-nexus-success text-slate-900'
                        : eitherChecked
                            ? 'border-nexus-accent bg-nexus-accent/30 text-nexus-accent'
                            : 'border-slate-600 text-transparent hover:border-slate-400'}`}
            >
                {bothChecked && <Check size={9} strokeWidth={3} />}
                {eitherChecked && !bothChecked && <span className="text-[6px] font-black">~</span>}
            </button>
        );

        return (
            <div key={`pair-${hIdx}-${item.delIdx}`} className={`border-l-2 ${eitherChecked ? 'border-nexus-success/60' : 'border-nexus-accent/30'}`}>
                {/* Deletion row */}
                <div
                    className={`flex items-stretch group font-mono text-xs select-text transition-colors ${delChecked ? 'bg-red-500/25' : 'bg-red-950/40 hover:bg-red-950/60'}`}
                    data-oldline={item.delChange.oldLineNumber}
                >
                    <div className="w-5 flex items-center justify-center shrink-0 border-r border-slate-800/50">
                        {checkboxEl}
                    </div>
                    <div className="w-9 text-right pr-2 text-slate-600 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">
                        {item.delChange.oldLineNumber}
                    </div>
                    <div className="w-9 text-right pr-2 text-slate-600/30 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">—</div>
                    <div className="w-5 text-center text-xs font-bold leading-5 py-px shrink-0 text-red-400 bg-red-950/60">-</div>
                    <div className="flex-1 min-w-0 leading-5 py-px px-1">
                        <span
                            className="whitespace-pre"
                            dangerouslySetInnerHTML={{ __html: renderTokens(delTokens, 'del') }}
                        />
                    </div>
                    {/* Smart label on first row */}
                    <div className="flex items-center px-1.5 opacity-60 shrink-0">
                        <span className="flex items-center gap-0.5 text-[9px] text-nexus-accent font-bold uppercase tracking-wide">
                            <Zap size={8} />reemplazo
                        </span>
                    </div>
                </div>

                {/* Insertion row */}
                <div
                    className={`flex items-stretch group font-mono text-xs select-text transition-colors ${insChecked ? 'bg-green-500/25' : 'bg-emerald-950/40 hover:bg-emerald-950/60'}`}
                    data-newline={item.insChange.newLineNumber}
                >
                    <div className="w-5 flex items-center justify-center shrink-0 border-r border-slate-800/50">
                        {/* Shared checkbox in the pair — same as above */}
                    </div>
                    <div className="w-9 text-right pr-2 text-slate-600/30 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">—</div>
                    <div className="w-9 text-right pr-2 text-slate-600 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">
                        {item.insChange.newLineNumber}
                    </div>
                    <div className="w-5 text-center text-xs font-bold leading-5 py-px shrink-0 text-emerald-400 bg-emerald-950/60">+</div>
                    <div className="flex-1 min-w-0 leading-5 py-px px-1 relative">
                        {isEditing ? (
                            <div className="flex items-center gap-1">
                                <input
                                    autoFocus
                                    className="flex-1 bg-slate-800 border border-nexus-accent rounded px-1 text-xs text-slate-100 outline-none"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); saveInlineEdit(insId, editValue); }
                                        if (e.key === 'Escape') { setEditingLine(null); }
                                    }}
                                />
                                <button onClick={() => saveInlineEdit(insId, editValue)} className="p-0.5 text-nexus-success hover:bg-nexus-success/20 rounded"><Check size={12} /></button>
                                <button onClick={() => setEditingLine(null)} className="p-0.5 text-slate-400 hover:bg-slate-700 rounded"><X size={12} /></button>
                            </div>
                        ) : (
                            <span
                                className="whitespace-pre"
                                dangerouslySetInnerHTML={{ __html: renderTokens(insTokens, 'ins') }}
                            />
                        )}
                    </div>
                    {mode === 'unstaged' && !isEditing && (
                        <button
                            onClick={() => { setEditingLine(insId); setEditValue(item.insChange.content); }}
                            className="opacity-0 group-hover:opacity-100 px-1 text-slate-500 hover:text-nexus-accent transition-all shrink-0"
                            title="Edit this line"
                        >
                            <Edit3 size={11} />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderHunk = (hunk: Hunk, hIdx: number) => {
        const isCollapsed = collapsedHunks.has(hIdx);
        const hunkChangeIds = hunk.changes
            .map((ch, cIdx) => ({ ch, id: `${hIdx}-${cIdx}` }))
            .filter(({ ch }) => ch.type === 'insert' || ch.type === 'delete');
        const allChecked = hunkChangeIds.length > 0 && hunkChangeIds.every(({ id }) => checkedLines.has(id));
        const anyChecked = hunkChangeIds.some(({ id }) => checkedLines.has(id));

        // Build paired items for smart rendering
        const pairedItems: RenderedItem[] = pairChanges(hunk.changes);

        return (
            <div key={hIdx} className="border-b border-slate-800/60 last:border-b-0">
                {/* ── Hunk header ─────────────────────────────────────── */}
                <div className={`flex items-center gap-0 bg-slate-900/80 border-b border-slate-800/60 sticky top-0 z-10
                    ${allChecked ? 'bg-slate-900/95' : ''}`}>

                    {/* Three-state hunk checkbox */}
                    <button
                        onClick={() => allChecked ? deselectAllInHunk(hIdx, hunk) : selectAllInHunk(hIdx, hunk)}
                        title={allChecked ? 'Deseleccionar bloque' : anyChecked ? 'Seleccionar bloque completo' : 'Seleccionar bloque'}
                        className={`flex items-center justify-center shrink-0 w-10 self-stretch border-r border-slate-800/60 transition-colors
                            ${allChecked
                                ? 'bg-nexus-success/20 hover:bg-nexus-success/30'
                                : anyChecked
                                    ? 'bg-nexus-accent/10 hover:bg-nexus-accent/20'
                                    : 'hover:bg-slate-800/60'}`}
                    >
                        <span className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all text-[9px] font-black
                            ${allChecked
                                ? 'bg-nexus-success border-nexus-success text-slate-900'
                                : anyChecked
                                    ? 'border-nexus-accent bg-nexus-accent/20 text-nexus-accent'
                                    : 'border-slate-600 hover:border-slate-400'}`}>
                            {allChecked && <Check size={10} strokeWidth={3} />}
                            {anyChecked && !allChecked && <span>—</span>}
                        </span>
                    </button>

                    {/* Collapse toggle */}
                    <button
                        onClick={() => toggleHunkCollapse(hIdx)}
                        className="flex items-center justify-center w-6 self-stretch text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                        {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {/* Hunk @@ header + selection summary */}
                    <div className="flex-1 min-w-0 flex items-center gap-2 px-1 py-1.5">
                        <span className="font-mono text-[10px] text-slate-500 truncate">{hunk.content}</span>
                        {anyChecked && (
                            <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full
                                ${allChecked
                                    ? 'bg-nexus-success/25 text-nexus-success'
                                    : 'bg-nexus-accent/20 text-nexus-accent'}`}>
                                {allChecked
                                    ? `✓ bloque completo (${hunkChangeIds.length})`
                                    : `${hunkChangeIds.filter(({ id }) => checkedLines.has(id)).length}/${hunkChangeIds.length} líneas`}
                            </span>
                        )}
                    </div>

                    {/* Quick-action buttons (secondary) */}
                    <div className="flex items-center gap-1 px-2 py-1 shrink-0">
                        {/* Stage / Unstage hunk instantly */}
                        <button
                            disabled={applyingAction}
                            onClick={() => applyHunkPatch(hunk, mode === 'staged', mode === 'unstaged' ? 'Stage Hunk' : 'Unstage Hunk')}
                            title={mode === 'unstaged' ? 'Agregar bloque completo ahora' : 'Quitar bloque del stage ahora'}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors disabled:opacity-40
                                ${mode === 'unstaged'
                                    ? 'bg-nexus-accent/10 text-nexus-accent border-nexus-accent/30 hover:bg-nexus-accent/25'
                                    : 'bg-nexus-danger/10 text-nexus-danger border-nexus-danger/30 hover:bg-nexus-danger/25'}`}
                        >
                            {mode === 'unstaged' ? <FilePlus size={10} /> : <FileMinus size={10} />}
                            {mode === 'unstaged' ? 'Agregar' : 'Quitar'}
                        </button>

                        {/* Discard hunk (unstaged only) */}
                        {mode === 'unstaged' && (
                            <button
                                disabled={applyingAction}
                                onClick={() => discardHunk(hunk)}
                                title="Descartar cambios de este bloque"
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-transparent text-slate-500 border border-slate-700/60 hover:bg-nexus-danger/15 hover:text-nexus-danger hover:border-nexus-danger/40 text-[10px] font-medium transition-colors disabled:opacity-40"
                            >
                                <RotateCcw size={10} />
                                Descartar
                            </button>
                        )}
                    </div>
                </div>

                {/* Lines with smart pairing */}
                {!isCollapsed && (
                    <div>
                        {pairedItems.map((item) =>
                            item.kind === 'pair'
                                ? renderPair(item, hIdx)
                                : renderChange(item.change, hIdx, item.idx)
                        )}
                    </div>
                )}
            </div>
        );
    };


    // ── Main render ───────────────────────────────────────────────────────────

    const checkedCount = checkedLines.size;
    const modeColor = mode === 'staged' ? 'text-nexus-success bg-nexus-success/15 border-nexus-success/30' : 'text-nexus-accent bg-nexus-accent/15 border-nexus-accent/30';

    return (
        <div
            className={`flex flex-col bg-slate-950 border border-slate-700 shadow-2xl ${isFullScreen ? 'fixed inset-0 z-50' : 'absolute inset-0 z-20'}`}
            role="region"
            aria-label="Diff viewer"
        >
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/80 shrink-0 flex-wrap">
                <GitCompare size={15} className="text-nexus-neon shrink-0" />
                <span className="font-bold text-xs text-slate-200 shrink-0">Diff</span>
                <span className="text-slate-600 text-xs shrink-0">/</span>
                <span className="font-mono text-xs text-slate-400 truncate min-w-0 flex-1" title={file}>{file}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase shrink-0 ${modeColor}`}>
                    {mode}
                </span>

                {/* Discard checked lines (unstaged only) */}
                {mode === 'unstaged' && checkedCount > 0 && (
                    <button
                        onClick={discardCheckedLines}
                        disabled={applyingAction}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-nexus-danger/20 text-nexus-danger border border-nexus-danger/40 hover:bg-nexus-danger/30 text-[11px] font-medium transition-colors disabled:opacity-50 shrink-0"
                    >
                        <RotateCcw size={12} />
                        Descartar {checkedCount} líneas
                    </button>
                )}

                {/* Confirm staged lines */}
                {checkedCount > 0 && (
                    <button
                        onClick={stageCheckedLines}
                        disabled={applyingAction}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-nexus-success/20 text-nexus-success border border-nexus-success/40 hover:bg-nexus-success/30 text-[11px] font-medium transition-colors disabled:opacity-50 shrink-0"
                    >
                        <CheckSquare size={12} />
                        {mode === 'unstaged' ? 'Agregar' : 'Quitar'} {checkedCount} líneas
                    </button>
                )}

                {/* Stage/unstage whole file */}
                <button
                    onClick={stageWholeFile}
                    disabled={applyingAction}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors disabled:opacity-50 shrink-0
                        ${mode === 'unstaged'
                            ? 'bg-nexus-accent/15 text-nexus-accent border-nexus-accent/30 hover:bg-nexus-accent/25'
                            : 'bg-nexus-danger/15 text-nexus-danger border-nexus-danger/30 hover:bg-nexus-danger/25'}`}
                >
                    {mode === 'unstaged' ? <FilePlus size={12} /> : <FileMinus size={12} />}
                    {mode === 'unstaged' ? 'Agregar archivo' : 'Quitar archivo'}
                </button>

                {/* Undo */}
                {canUndo && (
                    <button
                        onClick={handleUndo}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-[11px] font-medium transition-colors shrink-0"
                        title="Ctrl+Z"
                    >
                        <RotateCcw size={12} />
                        Deshacer
                    </button>
                )}

                <div className="flex-1 shrink-0" />

                <button onClick={loadContent} title="Refresh" className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => setIsFullScreen(v => !v)} className="p-1 text-slate-400 hover:text-nexus-neon hover:bg-slate-800 rounded transition-colors">
                    {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-nexus-danger hover:bg-slate-800 rounded transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div className="px-3 py-1.5 bg-nexus-danger/10 text-nexus-danger text-xs border-b border-nexus-danger/20 shrink-0">
                    {error}
                </div>
            )}

            {/* ── Column headers ── */}
            <div className="flex items-center text-[9px] uppercase font-bold text-slate-600 border-b border-slate-800/60 bg-slate-900/50 shrink-0 select-none">
                <div className="w-5 text-center border-r border-slate-800/50 py-1">☑</div>
                <div className="w-9 text-right pr-2 border-r border-slate-800/50 py-1">Ant.</div>
                <div className="w-9 text-right pr-2 border-r border-slate-800/50 py-1">Nvo.</div>
                <div className="w-5 text-center border-r border-slate-800/50 py-1">±</div>
                <div className="flex-1 pl-2 py-1">Contenido</div>
            </div>

            {/* ── Content ── */}
            <div ref={containerRef} className="flex-1 overflow-auto font-mono text-xs">
                {loading ? (
                    <div className="flex items-center justify-center h-32 text-slate-500 gap-2">
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Cargando diff…</span>
                    </div>
                ) : !parsedFile || parsedFile.hunks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-slate-600 gap-2">
                        <GitCompare size={24} />
                        <span className="text-sm">Sin cambios para mostrar</span>
                        {mode === 'unstaged' && (
                            <button
                                onClick={stageWholeFile}
                                className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-xs rounded bg-nexus-success/20 text-nexus-success border border-nexus-success/40 hover:bg-nexus-success/30"
                            >
                                <FilePlus size={13} /> Agregar archivo completo
                            </button>
                        )}
                    </div>
                ) : (
                    <div>
                        {parsedFile.hunks.map((hunk, hIdx) => renderHunk(hunk, hIdx))}
                    </div>
                )}
            </div>
        </div>
    );
};
