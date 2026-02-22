import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { diffArrays } from 'diff';
import {
    X, GitCommit, File, FilePlus, FileMinus, FileX,
    RefreshCw, ChevronDown, ChevronRight, User, Clock, Hash
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangedFile {
    status: 'M' | 'A' | 'D' | 'R' | string;
    path: string;
    oldPath?: string; // for renames
}

type EditOp = 'equal' | 'insert' | 'delete';
interface EditScript { op: EditOp; oldLine?: number; newLine?: number; text: string; }

interface Change {
    type: 'insert' | 'delete' | 'normal';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

interface Hunk {
    content: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: Change[];
}

export interface CommitDiffModalProps {
    projectPath: string;
    commitHash: string;
    commitMessage: string;
    commitAuthor?: string;
    commitDate?: string;
    onClose: () => void;
}

// ─── Diff helpers (inline, read-only version) ─────────────────────────────────

function computeDiff(oldLines: string[], newLines: string[]): EditScript[] {
    const diffs = diffArrays(oldLines, newLines);
    const edits: EditScript[] = [];
    let oldLine = 1, newLine = 1;
    for (const d of diffs) {
        if (d.added) {
            for (const text of d.value) edits.push({ op: 'insert', newLine: newLine++, text });
        } else if (d.removed) {
            for (const text of d.value) edits.push({ op: 'delete', oldLine: oldLine++, text });
        } else {
            for (const text of d.value) edits.push({ op: 'equal', oldLine: oldLine++, newLine: newLine++, text });
        }
    }
    return edits;
}

function buildHunks(edits: EditScript[]): Hunk[] {
    const CONTEXT = 3;
    const changeMask = edits.map(e => e.op !== 'equal');
    const included = new Set<number>();
    changeMask.forEach((isChange, i) => {
        if (isChange) {
            for (let c = Math.max(0, i - CONTEXT); c <= Math.min(edits.length - 1, i + CONTEXT); c++) {
                included.add(c);
            }
        }
    });
    if (included.size === 0) return [];

    const sortedIdx = [...included].sort((a, b) => a - b);
    const groups: number[][] = [];
    let grp = [sortedIdx[0]];
    for (let i = 1; i < sortedIdx.length; i++) {
        if (sortedIdx[i] === sortedIdx[i - 1] + 1) grp.push(sortedIdx[i]);
        else { groups.push(grp); grp = [sortedIdx[i]]; }
    }
    groups.push(grp);

    return groups.map(idxs => {
        const slice = idxs.map(i => edits[i]);
        let oldStart = 0, oldCount = 0, newStart = 0, newCount = 0;
        const changes: Change[] = [];
        slice.forEach(e => {
            if (e.op !== 'insert') { if (!oldStart) oldStart = e.oldLine!; oldCount++; }
            if (e.op !== 'delete') { if (!newStart) newStart = e.newLine!; newCount++; }
            changes.push({
                type: e.op === 'equal' ? 'normal' : e.op === 'insert' ? 'insert' : 'delete',
                content: e.text,
                oldLineNumber: e.op !== 'insert' ? e.oldLine : undefined,
                newLineNumber: e.op !== 'delete' ? e.newLine : undefined,
            });
        });
        return { content: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, oldStart, oldLines: oldCount, newStart, newLines: newCount, changes };
    });
}

// ─── Read-only diff renderer ──────────────────────────────────────────────────

function ReadOnlyDiff({ hunks }: { hunks: Hunk[] }) {
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

    if (hunks.length === 0) {
        return <div className="text-slate-500 text-xs px-4 py-8 italic text-center">No hay cambios en este archivo</div>;
    }

    return (
        <div className="font-mono text-xs">
            {hunks.map((hunk, hIdx) => {
                const isCollapsed = collapsed.has(hIdx);
                const toggle = () => setCollapsed(prev => {
                    const n = new Set(prev);
                    if (n.has(hIdx)) n.delete(hIdx); else n.add(hIdx);
                    return n;
                });
                return (
                    <div key={hIdx} className="border-b border-slate-800/50 last:border-b-0">
                        {/* Hunk header */}
                        <div
                            className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/70 border-b border-slate-800/40 text-[10px] sticky top-0 z-10 cursor-pointer hover:bg-slate-800/60 select-none"
                            onClick={toggle}
                        >
                            <span className="text-slate-500 shrink-0">
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            </span>
                            <span className="text-nexus-accent font-semibold">{hunk.content}</span>
                        </div>

                        {!isCollapsed && hunk.changes.map((ch, cIdx) => {
                            const bg = ch.type === 'insert'
                                ? 'bg-emerald-950/40 text-emerald-200'
                                : ch.type === 'delete'
                                    ? 'bg-red-950/40 text-red-200'
                                    : 'text-slate-300';
                            const gutterBg = ch.type === 'insert'
                                ? 'bg-emerald-900/60 text-emerald-400'
                                : ch.type === 'delete'
                                    ? 'bg-red-900/60 text-red-400'
                                    : 'bg-slate-900/40 text-slate-600';
                            const prefix = ch.type === 'insert' ? '+' : ch.type === 'delete' ? '-' : ' ';
                            return (
                                <div key={cIdx} className={`flex items-stretch ${bg}`}>
                                    <div className="w-9 text-right pr-2 text-slate-600 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">
                                        {ch.type !== 'insert' ? ch.oldLineNumber : ''}
                                    </div>
                                    <div className="w-9 text-right pr-2 text-slate-600 shrink-0 border-r border-slate-800/50 leading-5 py-px select-none">
                                        {ch.type !== 'delete' ? ch.newLineNumber : ''}
                                    </div>
                                    <div className={`w-5 text-center font-bold leading-5 py-px shrink-0 ${gutterBg}`}>{prefix}</div>
                                    <div className="flex-1 leading-5 py-px px-2 whitespace-pre overflow-x-auto">{ch.content}</div>
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

// ─── File status icon ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
    if (status === 'A') return <FilePlus size={13} className="text-emerald-400 shrink-0" />;
    if (status === 'D') return <FileX size={13} className="text-red-400 shrink-0" />;
    if (status === 'R') return <File size={13} className="text-purple-400 shrink-0" />;
    return <FileMinus size={13} className="text-amber-400 shrink-0" />;
}

function statusLabel(status: string) {
    if (status === 'A') return <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">ADD</span>;
    if (status === 'D') return <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">DEL</span>;
    if (status === 'R') return <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">REN</span>;
    return <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">MOD</span>;
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const CommitDiffModal: React.FC<CommitDiffModalProps> = ({
    projectPath, commitHash, commitMessage, commitAuthor, commitDate, onClose
}) => {
    const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null);
    const [hunks, setHunks] = useState<Hunk[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [loadingDiff, setLoadingDiff] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load file list for the commit
    const loadFiles = useCallback(async () => {
        setLoadingFiles(true);
        setError(null);
        try {
            const res: any = await invoke('git_execute', {
                projectPath,
                args: ['show', '--name-status', '--format=', commitHash]
            });
            if (res?.success && res.stdout) {
                const files: ChangedFile[] = res.stdout
                    .split('\n')
                    .filter((l: string) => l.trim())
                    .map((l: string) => {
                        const parts = l.split('\t');
                        const status = parts[0]?.charAt(0) ?? 'M';
                        if (status === 'R' && parts.length >= 3) {
                            return { status: 'R', oldPath: parts[1], path: parts[2] };
                        }
                        return { status, path: parts[1] ?? l };
                    });
                setChangedFiles(files);
                if (files.length > 0) setSelectedFile(files[0]);
            }
        } catch (e: any) {
            setError(e?.toString?.() ?? 'Error loading commit files');
        } finally {
            setLoadingFiles(false);
        }
    }, [projectPath, commitHash]);

    // Load diff for the selected file
    const loadFileDiff = useCallback(async (cf: ChangedFile) => {
        setLoadingDiff(true);
        setHunks([]);
        try {
            if (cf.status === 'A') {
                // New file: show all lines as inserts vs empty
                const newRes: any = await invoke('git_execute', {
                    projectPath,
                    args: ['show', `${commitHash}:${cf.path}`]
                });
                const newText = newRes?.success ? (newRes.stdout ?? '') : '';
                const newLines = newText.split('\n');
                const edits = computeDiff([], newLines);
                setHunks(buildHunks(edits));
            } else if (cf.status === 'D') {
                // Deleted file: show all lines as deletes vs empty
                const oldRes: any = await invoke('git_execute', {
                    projectPath,
                    args: ['show', `${commitHash}^:${cf.path}`]
                });
                const oldText = oldRes?.success ? (oldRes.stdout ?? '') : '';
                const oldLines = oldText.split('\n');
                const edits = computeDiff(oldLines, []);
                setHunks(buildHunks(edits));
            } else {
                // Modified or renamed: diff parent vs this commit
                const parentPath = cf.status === 'R' ? cf.oldPath! : cf.path;
                const [oldRes, newRes]: any[] = await Promise.all([
                    invoke('git_execute', { projectPath, args: ['show', `${commitHash}^:${parentPath}`] }),
                    invoke('git_execute', { projectPath, args: ['show', `${commitHash}:${cf.path}`] }),
                ]);
                const oldText = oldRes?.success ? (oldRes.stdout ?? '') : '';
                const newText = newRes?.success ? (newRes.stdout ?? '') : '';
                const edits = computeDiff(oldText.split('\n'), newText.split('\n'));
                setHunks(buildHunks(edits));
            }
        } catch (e: any) {
            setHunks([]);
        } finally {
            setLoadingDiff(false);
        }
    }, [projectPath, commitHash]);

    useEffect(() => { loadFiles(); }, [loadFiles]);
    useEffect(() => { if (selectedFile) loadFileDiff(selectedFile); }, [selectedFile, loadFileDiff]);

    // ESC to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        // Overlay
        <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="flex flex-col w-full max-w-7xl h-[90vh] bg-slate-950 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0">
                    <GitCommit size={18} className="text-nexus-neon mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-100 line-clamp-2 mb-1">{commitMessage}</div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                            {commitAuthor && (
                                <span className="flex items-center gap-1">
                                    <User size={11} />
                                    <span className="text-slate-400">{commitAuthor}</span>
                                </span>
                            )}
                            {commitDate && (
                                <span className="flex items-center gap-1">
                                    <Clock size={11} />
                                    {commitDate}
                                </span>
                            )}
                            <span className="flex items-center gap-1 font-mono">
                                <Hash size={11} />
                                <span className="text-nexus-neon">{commitHash.slice(0, 12)}</span>
                            </span>
                            <span className="text-slate-600">{changedFiles.length} archivo{changedFiles.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                        title="Cerrar (Esc)"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* ── Body: file list + diff ── */}
                <div className="flex flex-1 min-h-0">

                    {/* File list sidebar */}
                    <div className="w-72 shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/30">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800/60">
                            Archivos modificados
                        </div>
                        {loadingFiles ? (
                            <div className="flex-1 flex items-center justify-center text-slate-600">
                                <RefreshCw size={16} className="animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="text-nexus-danger text-xs p-3 italic">{error}</div>
                        ) : (
                            <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
                                {changedFiles.map((cf, i) => {
                                    const isSelected = selectedFile?.path === cf.path;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedFile(cf)}
                                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors group
                                                ${isSelected
                                                    ? 'bg-nexus-accent/15 border-r-2 border-nexus-accent text-slate-200'
                                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                                }`}
                                        >
                                            <StatusIcon status={cf.status} />
                                            <span className="flex-1 font-mono truncate" title={cf.path}>
                                                {cf.path.split('/').pop()}
                                            </span>
                                            {statusLabel(cf.status)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Diff area */}
                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                        {/* File path bar */}
                        {selectedFile && (
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/40 shrink-0">
                                <StatusIcon status={selectedFile.status} />
                                <span className="font-mono text-xs text-slate-300 truncate">{selectedFile.path}</span>
                                {selectedFile.oldPath && (
                                    <span className="text-slate-600 text-xs font-mono">← {selectedFile.oldPath}</span>
                                )}
                            </div>
                        )}

                        {loadingDiff ? (
                            <div className="flex-1 flex items-center justify-center text-slate-600">
                                <RefreshCw size={20} className="animate-spin mr-3" />
                                <span className="text-sm">Cargando diff...</span>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto scrollbar-hide">
                                {selectedFile ? (
                                    <ReadOnlyDiff hunks={hunks} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                                        Selecciona un archivo para ver sus cambios
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
