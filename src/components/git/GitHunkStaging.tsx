import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Check, RefreshCw, Zap, Loader2, FileCode, MousePointer2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
// import { Checkbox } from '../ui/Checkbox'; // Reemplazado por div interactivo pro
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { parseUnifiedDiff, buildPatch, Hunk } from './utils/diffParser';

export interface GitHunkStagingProps {
    projectPath: string;
    file: string;
    mode: 'staged' | 'unstaged';
    onClose: () => void;
    onRefreshRequest?: () => void;
}

/**
 * Simple syntax highlighting for common languages.
 */
function highlightCode(content: string, _language: string) {
    if (!content) return content;
    
    // Simple regex patterns for highlighting
    const patterns = [
        { name: 'comment', regex: /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g, color: 'text-slate-500 italic' },
        { name: 'string', regex: /(".*?"|'.*?'|`.*?`)/g, color: 'text-amber-400' },
        { name: 'keyword', regex: /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|enum|struct|pub|async|await|use|mod|let|mut|match|impl|trait|public|private|protected|static|new|try|catch|finally|throw|throws)\b/g, color: 'text-purple-400 font-bold' },
        { name: 'number', regex: /\b(\d+)\b/g, color: 'text-orange-400' },
        { name: 'type', regex: /\b(string|number|boolean|any|void|unknown|never|Set|Map|Record|Result|Option|Vec|HashMap|Arc|AsyncMutex|AppHandle|Emitter|i32|i64|u32|u64|f32|f64|str|String|any|unknown|object|any)\b/g, color: 'text-sky-400' },
    ];

    let highlighted: any[] = [{ text: content, color: '' }];

    patterns.forEach(p => {
        const newHighlighted: any[] = [];
        highlighted.forEach(part => {
            if (part.color) {
                newHighlighted.push(part);
                return;
            }
            const parts = part.text.split(p.regex);
            parts.forEach((sub: string, i: number) => {
                if (i % 2 === 1) {
                    newHighlighted.push({ text: sub, color: p.color });
                } else if (sub) {
                    newHighlighted.push({ text: sub, color: '' });
                }
            });
        });
        highlighted = newHighlighted;
    });

    return highlighted.map((p, i) => (
        <span key={i} className={p.color}>{p.text}</span>
    ));
}

export const GitHunkStaging: React.FC<GitHunkStagingProps> = ({
    projectPath, file, mode, onClose, onRefreshRequest,
}) => {
    const [hunks, setHunks] = useState<Hunk[]>([]);
    const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Interaction state for dragging
    const [isDragging, setIsDragging] = useState(false);
    const [dragAction, setDragAction] = useState<'select' | 'deselect' | null>(null);

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
            setSelectedLines(new Set());
        } catch (e: any) {
            setError(e?.toString() || 'Failed to load diff');
        } finally {
            setLoading(false);
        }
    }, [projectPath, file, mode]);

    useEffect(() => { loadDiff(); }, [loadDiff]);

    const toggleLine = (index: number, forceState?: boolean) => {
        const next = new Set(selectedLines);
        const shouldSelect = forceState !== undefined ? forceState : !next.has(index);
        
        if (shouldSelect) next.add(index);
        else next.delete(index);
        
        setSelectedLines(next);
        return shouldSelect;
    };

    const handleMouseDown = (index: number, type: string) => {
        if (type === 'unchanged') return;
        setIsDragging(true);
        const newState = toggleLine(index);
        setDragAction(newState ? 'select' : 'deselect');
    };

    const handleMouseEnter = (index: number, type: string) => {
        if (!isDragging || type === 'unchanged' || !dragAction) return;
        toggleLine(index, dragAction === 'select');
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragAction(null);
    };

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

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
            console.log("[HunkStaging] Applying Patch:\n", patch);
            const res: any = await invoke('git_apply_patch', {
                projectPath,
                patchContent: patch,
                reverse: mode === 'staged',
                target: 'index'
            });
            
            if (!res.success) throw new Error(res.stderr || 'Git apply failed');
            
            onRefreshRequest?.();
            loadDiff();
        } catch (e: any) {
            setError(e?.toString() || 'Failed to apply patch');
        } finally {
            setApplying(false);
        }
    };

    const hasSelection = selectedLines.size > 0;
    const fileExt = file.split('.').pop() || '';

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#020617] border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 select-none">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/80 shrink-0">
                <div className="p-1.5 rounded bg-microtermix-neon/10 border border-microtermix-neon/20">
                    <FileCode size={16} className="text-microtermix-neon" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none">Surgical Staging</span>
                    <span className="text-xs text-slate-300 font-mono truncate mt-1">{file}</span>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <div className="flex items-center gap-1 bg-slate-950/50 px-2 py-1 rounded border border-slate-800/50 mr-2">
                        <MousePointer2 size={10} className="text-slate-500" />
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Drag to select</span>
                    </div>

                    <Button
                        size="xs"
                        variant={mode === 'unstaged' ? 'default' : 'destructive'}
                        disabled={!hasSelection || applying}
                        onClick={handleApplySelection}
                        className={cn(
                            "h-8 px-4 gap-2 font-black transition-all border shadow-lg active:scale-95",
                            mode === 'unstaged' 
                                ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                                : "bg-microtermix-accent/10 hover:bg-microtermix-accent/20 text-microtermix-accent border-microtermix-accent/30"
                        )}
                    >
                        {applying ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="fill-current" />}
                        <span className="text-[10px] tracking-widest">{mode === 'unstaged' ? 'STAGE SELECTED' : 'UNSTAGE SELECTED'}</span>
                        {hasSelection && (
                            <Badge className="h-4 px-1.5 min-w-[18px] flex items-center justify-center bg-current/20 text-[10px] border-none ml-1">
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
                        <TooltipContent>Refresh Diff</TooltipContent>
                    </Tooltip>

                    <Button variant="ghost" size="icon-xs" onClick={onClose} className="text-slate-500 hover:text-red-400">
                        <X size={18} />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-950/50 custom-scrollbar">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono shadow-inner">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap size={14} className="fill-current" />
                            <span className="font-bold uppercase tracking-widest">Git Apply Error</span>
                        </div>
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                        <div className="relative">
                            <Loader2 size={40} className="animate-spin text-microtermix-neon/20" />
                            <FileCode size={20} className="absolute inset-0 m-auto text-microtermix-neon animate-pulse" />
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.3em] font-black animate-pulse">Analyzing structures...</span>
                    </div>
                ) : hunks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2 opacity-50">
                        <Check size={48} strokeWidth={1} />
                        <span className="text-xs uppercase tracking-widest font-bold italic">Working tree is clean</span>
                    </div>
                ) : (
                    hunks.map((hunk, hIdx) => (
                        <div key={hIdx} className="rounded-xl border border-slate-800/50 overflow-hidden bg-slate-900/20 shadow-xl group/hunk transition-all hover:border-slate-700/50">
                            {/* Hunk Header */}
                            <div 
                                onClick={() => toggleHunk(hunk)}
                                className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center gap-4 cursor-pointer hover:bg-slate-800 transition-colors group/header"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-microtermix-neon/40 group-hover/header:bg-microtermix-neon transition-colors" />
                                    <span className="text-[10px] font-mono text-microtermix-neon/60 group-hover/header:text-microtermix-neon transition-colors">{hunk.header}</span>
                                </div>
                                <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest ml-auto group-hover/hunk:text-slate-400 transition-colors">Select Block</span>
                            </div>

                            {/* Lines */}
                            <div className="flex flex-col font-mono text-[13px] leading-6 py-2">
                                {hunk.lines.map((line) => {
                                    const isSelected = selectedLines.has(line.index);
                                    return (
                                        <div 
                                            key={line.index}
                                            onMouseDown={() => handleMouseDown(line.index, line.type)}
                                            onMouseEnter={() => handleMouseEnter(line.index, line.type)}
                                            className={cn(
                                                "flex items-start group transition-all duration-75 relative",
                                                line.type === 'added' && (isSelected ? "bg-emerald-500/20" : "bg-emerald-500/5 hover:bg-emerald-500/10"),
                                                line.type === 'removed' && (isSelected ? "bg-red-500/20" : "bg-red-500/5 hover:bg-red-500/10"),
                                                line.type === 'unchanged' && "hover:bg-slate-800/30 opacity-60"
                                            )}
                                        >
                                            {/* Selection Indicator Bar */}
                                            {isSelected && (
                                                <div className={cn(
                                                    "absolute left-0 top-0 bottom-0 w-1",
                                                    line.type === 'added' ? "bg-emerald-500" : "bg-red-500"
                                                )} />
                                            )}

                                            {/* Gutter / Line Numbers */}
                                            <div className="w-14 shrink-0 flex flex-col items-end pr-3 text-[10px] text-slate-600 select-none pt-0.5 font-bold opacity-40">
                                                {line.oldLineNo && <span>{line.oldLineNo}</span>}
                                                {line.newLineNo && <span>{line.newLineNo}</span>}
                                            </div>

                                            {/* Interaction Zone (Status Icon) */}
                                            <div className="w-8 shrink-0 flex items-center justify-center pt-0.5">
                                                {line.type !== 'unchanged' ? (
                                                    <div className={cn(
                                                        "h-4 w-4 rounded flex items-center justify-center border transition-all cursor-pointer",
                                                        isSelected 
                                                            ? (line.type === 'added' ? "bg-emerald-500 border-emerald-400 text-white" : "bg-red-500 border-red-400 text-white")
                                                            : "bg-slate-950 border-slate-700 text-transparent hover:border-slate-500"
                                                    )}>
                                                        {isSelected && <Check size={10} strokeWidth={4} />}
                                                    </div>
                                                ) : (
                                                    <div className="w-4" />
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className={cn(
                                                "flex-1 px-2 whitespace-pre break-all tracking-tight",
                                                line.type === 'added' && (isSelected ? "text-emerald-300" : "text-emerald-400/80"),
                                                line.type === 'removed' && (isSelected ? "text-red-300" : "text-red-400/80"),
                                                line.type === 'unchanged' && "text-slate-400"
                                            )}>
                                                <span className="w-5 inline-block shrink-0 opacity-30 select-none font-black text-center mr-1">
                                                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                                                </span>
                                                {highlightCode(line.content, fileExt)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Overlay during applying */}
            {applying && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-40 flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                        <Loader2 size={64} className="animate-spin text-microtermix-neon/20" />
                        <Zap size={32} className="absolute inset-0 m-auto text-microtermix-neon fill-current animate-bounce" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-black text-microtermix-neon tracking-[0.4em] uppercase animate-pulse">Surgical Procedure in Progress</span>
                        <span className="text-[9px] text-slate-500 font-mono">Applying patch to git index...</span>
                    </div>
                </div>
            )}
        </div>
    );
};
