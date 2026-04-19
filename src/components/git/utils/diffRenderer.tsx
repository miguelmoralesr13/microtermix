import { useState } from 'react';
import { diffArrays } from 'diff';
import { File, FilePlus, FileX, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Change {
    type: 'insert' | 'delete' | 'normal';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

export interface Hunk {
    content: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: Change[];
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

type EditOp = 'equal' | 'insert' | 'delete';
interface EditScript { op: EditOp; oldLine?: number; newLine?: number; text: string; }

export function computeDiff(oldLines: string[], newLines: string[]): EditScript[] {
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

export function buildHunks(edits: EditScript[]): Hunk[] {
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

// ─── ReadOnlyDiff renderer ────────────────────────────────────────────────────

export function ReadOnlyDiff({ hunks }: { hunks: Hunk[] }) {
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
                        <div
                            className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/70 border-b border-slate-800/40 text-[10px] sticky top-0 z-10 cursor-pointer hover:bg-slate-800/60 select-none"
                            onClick={toggle}
                        >
                            <span className="text-slate-500 shrink-0">
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            </span>
                            <span className="text-microtermix-accent font-semibold">{hunk.content}</span>
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

// ─── File status helpers ──────────────────────────────────────────────────────

export function FileStatusIcon({ status }: { status: string }) {
    if (status === 'A') return <FilePlus size={13} className="text-emerald-400 shrink-0" />;
    if (status === 'D') return <FileX size={13} className="text-red-400 shrink-0" />;
    if (status === 'R' || status === 'C') return <File size={13} className="text-purple-400 shrink-0" />;
    return <File size={13} className="text-amber-400 shrink-0" />;
}

export function FileStatusLabel({ status }: { status: string }) {
    if (status === 'A') return <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">ADD</span>;
    if (status === 'D') return <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">DEL</span>;
    if (status === 'R') return <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">REN</span>;
    return <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">MOD</span>;
}
