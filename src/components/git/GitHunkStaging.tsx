import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Check, RefreshCw, Zap, Loader2, FileCode } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/Checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { parseUnifiedDiff, buildPatch, Hunk, DiffLine } from './utils/diffParser';

export interface GitHunkStagingProps {
    projectPath: string;
    file: string;
    mode: 'staged' | 'unstaged';
    onClose: () => void;
    onRefreshRequest?: () => void;
}

export const GitHunkStaging: React.FC<GitHunkStagingProps> = ({
    projectPath, file, mode, onClose, onRefreshRequest,
}) => {
    const [hunks, setHunks] = useState<Hunk[]>([]);
    const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadDiff = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data: { unified_diff: string } = await invoke('get_full_diff', {
                projectPath,
                filePath: file,
                mode
            });
            const parsedHunks = parseUnifiedDiff(data.unified_diff);
            setHunks(parsedHunks);
            setSelectedLines(new Set()); // Reset selection on reload
        } catch (e: any) {
            setError(e?.toString() || 'Failed to load diff');
        } finally {
            setLoading(false);
        }
    }, [projectPath, file, mode]);

    useEffect(() => { loadDiff(); }, [loadDiff]);

    const toggleLine = (index: number) => {
        const next = new Set(selectedLines);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedLines(next);
    };

    const toggleHunk = (hunk: Hunk) => {
        const next = new Set(selectedLines);
        const allSelected = hunk.lines
            .filter(l => l.type !== 'unchanged')
            .every(l => next.has(l.index));

        hunk.lines.forEach(l => {
            if (l.type !== 'unchanged') {
                if (allSelected) next.delete(l.index);
                else next.add(l.index);
            }
        });
        setSelectedLines(next);
    };

    const handleApplySelection = async () => {
        if (selectedLines.size === 0) return;
        setApplying(true);
        try {
            const patch = buildPatch(file, selectedLines, hunks);
            await invoke('git_apply_patch', {
                projectPath,
                patchContent: patch,
                reverse: mode === 'staged',
                target: 'index'
            });
            onRefreshRequest?.();
            loadDiff(); // Refresh to see what's left
        } catch (e: any) {
            setError(e?.toString() || 'Failed to apply patch');
        } finally {
            setApplying(false);
        }
    };

    const hasSelection = selectedLines.size > 0;

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#020617] border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/80 shrink-0">
                <FileCode size={16} className="text-microtermix-neon" />
                <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Hunk Staging</span>
                    <span className="text-xs text-slate-300 font-mono truncate mt-0.5">{file}</span>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <Button
                        size="xs"
                        variant={mode === 'unstaged' ? 'default' : 'destructive'}
                        disabled={!hasSelection || applying}
                        onClick={handleApplySelection}
                        className={cn(
                            "h-7 px-3 gap-1.5 font-bold transition-all",
                            mode === 'unstaged' 
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                                : "bg-microtermix-accent hover:bg-microtermix-accent/80 text-white"
                        )}
                    >
                        {applying ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        <span className="text-[10px]">{mode === 'unstaged' ? 'STAGE SELECTED' : 'UNSTAGE SELECTED'}</span>
                        {hasSelection && (
                            <Badge className="h-4 px-1 min-w-[16px] flex items-center justify-center bg-white/20 text-[9px] border-none ml-0.5">
                                {selectedLines.size}
                            </Badge>
                        )}
                    </Button>

                    <div className="h-4 w-px bg-slate-700 mx-1" />

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button variant="ghost" size="icon-xs" onClick={loadDiff} disabled={loading} className="text-slate-500 hover:text-white">
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            </Button>
                        } />
                        <TooltipContent>Recargar</TooltipContent>
                    </Tooltip>

                    <Button variant="ghost" size="icon-xs" onClick={onClose} className="text-slate-500 hover:text-red-400">
                        <X size={16} />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-950/50">
                {error && (
                    <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-mono">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                        <Loader2 size={24} className="animate-spin" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Analyzing diff...</span>
                    </div>
                ) : hunks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 italic text-xs">
                        No changes found in this file.
                    </div>
                ) : (
                    hunks.map((hunk, hIdx) => (
                        <div key={hIdx} className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/20 group/hunk">
                            {/* Hunk Header */}
                            <div 
                                onClick={() => toggleHunk(hunk)}
                                className="px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors"
                            >
                                <span className="text-[10px] font-mono text-microtermix-neon/60">{hunk.header}</span>
                                <span className="text-[9px] text-slate-600 font-bold uppercase ml-auto group-hover/hunk:text-slate-400">Toggle Block</span>
                            </div>

                            {/* Lines */}
                            <div className="flex flex-col font-mono text-[12px] leading-5">
                                {hunk.lines.map((line) => (
                                    <div 
                                        key={line.index}
                                        className={cn(
                                            "flex items-start group transition-colors",
                                            line.type === 'added' && "bg-emerald-500/5 hover:bg-emerald-500/10",
                                            line.type === 'removed' && "bg-red-500/5 hover:bg-red-500/10",
                                            line.type === 'unchanged' && "hover:bg-slate-800/30"
                                        )}
                                    >
                                        {/* Gutter / Line Numbers */}
                                        <div className="w-12 shrink-0 flex flex-col items-end pr-2 text-[10px] text-slate-600 select-none pt-0.5">
                                            {line.oldLineNo && <span>{line.oldLineNo}</span>}
                                            {line.newLineNo && <span>{line.newLineNo}</span>}
                                        </div>

                                        {/* Interaction Zone (Checkbox) */}
                                        <div className="w-8 shrink-0 flex items-center justify-center pt-0.5">
                                            {line.type !== 'unchanged' && (
                                                <Checkbox 
                                                    checked={selectedLines.has(line.index)}
                                                    onCheckedChange={() => toggleLine(line.index)}
                                                    className={cn(
                                                        "h-3.5 w-3.5 border-slate-700",
                                                        line.type === 'added' && "data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500",
                                                        line.type === 'removed' && "data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                                                    )}
                                                />
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className={cn(
                                            "flex-1 px-2 whitespace-pre break-all",
                                            line.type === 'added' && "text-emerald-400",
                                            line.type === 'removed' && "text-red-400",
                                            line.type === 'unchanged' && "text-slate-400"
                                        )}>
                                            <span className="w-4 inline-block shrink-0 opacity-50">
                                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                                            </span>
                                            {line.content}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Overlay during applying */}
            {applying && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-40 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="animate-spin text-microtermix-neon" />
                    <span className="text-xs font-mono text-microtermix-neon tracking-widest uppercase animate-pulse">Applying Patch...</span>
                </div>
            )}
        </div>
    );
};
