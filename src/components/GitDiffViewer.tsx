import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffEditor, Monaco } from '@monaco-editor/react';
import {
    X, RefreshCw, GitCompare, CheckSquare, FilePlus, FileMinus,
    Maximize2, Minimize2, RotateCcw, Zap, Loader2, ChevronRight, Check
} from 'lucide-react';
import { useMonacoTheme } from '../hooks/useMonacoTheme';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

export interface GitDiffViewerProps {
    projectPath: string;
    file: string;
    mode: 'staged' | 'unstaged';
    targetLine?: number;
    onClose: () => void;
    onRefreshRequest?: () => void;
}

interface HunkInfo {
    id: number;
    old_start: number;
    old_count: number;
    new_start: number;
    new_count: number;
    content?: string; // Preview or summary
}

export const GitDiffViewer: React.FC<GitDiffViewerProps> = ({
    projectPath, file, mode, targetLine, onClose, onRefreshRequest,
}) => {
    const [originalText, setOriginalText] = useState('');
    const [modifiedText, setModifiedText] = useState('');
    const [hunks, setHunks] = useState<HunkInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [applyingAction, setApplyingAction] = useState(false);
    const [selectedHunkId, setSelectedHunkId] = useState<number | null>(null);
    
    const monacoTheme = useMonacoTheme();
    const editorRef = useRef<any>(null);

    const getLanguage = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (!ext) return 'plaintext';
        const map: Record<string, string> = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'rs': 'rust', 'py': 'python', 'json': 'json', 'html': 'html', 'css': 'css', 
            'md': 'markdown', 'yml': 'yaml', 'yaml': 'yaml', 'toml': 'toml', 'go': 'go'
        };
        return map[ext] || 'plaintext';
    };

    const loadContent = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Get raw contents
            const model: { original: string, modified: string } = await invoke('git_get_diff_model_native', {
                projectPath,
                filePath: file,
                mode
            });
            setOriginalText(model.original);
            setModifiedText(model.modified);

            // 2. Get detected hunks from Rust engine
            const diffData: { hunks: HunkInfo[] } = await invoke('compute_diff_hunks', {
                original: model.original,
                modified: model.modified,
                filePath: file
            });
            setHunks(diffData.hunks);
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to load diff');
        } finally {
            setLoading(false);
        }
    }, [projectPath, file, mode]);

    useEffect(() => { loadContent(); }, [loadContent]);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        editor.updateOptions({
            renderSideBySide: true,
            readOnly: true,
            originalEditable: false,
            scrollBeyondLastLine: false,
            fontSize: 12,
            minimap: { enabled: false },
            automaticLayout: true,
        });
        if (targetLine) editor.getModifiedEditor().revealLineInCenter(targetLine);
    };

    const scrollToHunk = (hunk: HunkInfo) => {
        if (!editorRef.current) return;
        setSelectedHunkId(hunk.id);
        editorRef.current.getModifiedEditor().revealLineInCenter(hunk.new_start);
        
        // Highlight the lines briefly
        const editor = editorRef.current.getModifiedEditor();
        const decorations = editor.deltaDecorations([], [
            {
                range: new (window as any).monaco.Range(hunk.new_start, 1, hunk.new_start + hunk.new_count - 1, 1),
                options: { isWholeLine: true, className: 'bg-sky-500/20 border-l-4 border-sky-500' }
            }
        ]);
        setTimeout(() => editor.deltaDecorations(decorations, []), 2000);
    };

    const stageHunk = async (hunkId: number) => {
        setApplyingAction(true);
        try {
            // Logic: keep only the targeted hunk, reject all others
            const allIndices = hunks.map(h => h.id);
            const rejectIndices = allIndices.filter(id => id !== hunkId);
            
            const partialModified: string = await invoke('apply_rejected_hunks', {
                original: originalText,
                modified: modifiedText,
                hunks,
                rejectIndices
            });

            const partialPatch: string = await invoke('compute_unified_diff', {
                original: originalText,
                modified: partialModified,
                filePath: file
            });

            await invoke('git_apply_patch', { 
                projectPath, 
                patchContent: partialPatch, 
                reverse: mode === 'staged', 
                target: 'index' 
            });

            await loadContent();
            onRefreshRequest?.();
        } catch (e: any) {
            setError(e?.toString() || "Error adding block.");
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
            onRefreshRequest?.();
            onClose();
        } catch (e: any) {
            setError(String(e));
            setApplyingAction(false);
        }
    };

    return (
        <div className={cn(
            "flex flex-col bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden",
            isFullScreen ? "fixed inset-0 z-50" : "absolute inset-0 z-20"
        )}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/80 shrink-0">
                <GitCompare size={14} className="text-nexus-neon" />
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Diff Viewer</span>
                <span className="text-slate-700">/</span>
                <span className="font-mono text-xs text-slate-300 truncate flex-1">{file}</span>
                
                <div className="flex items-center gap-1 ml-auto">
                    <Button 
                        variant="outline"
                        size="xs"
                        onClick={stageWholeFile} 
                        className={cn(
                            "h-7 gap-1.5 px-2.5 font-bold transition-all",
                            mode === 'unstaged' 
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                : "bg-nexus-accent/10 text-nexus-accent border-nexus-accent/30 hover:bg-nexus-accent/20"
                        )}
                    >
                        {mode === 'unstaged' ? <FilePlus size={13} /> : <FileMinus size={13} />}
                        <span className="text-[10px]">{mode === 'unstaged' ? 'STAGE ALL' : 'UNSTAGE ALL'}</span>
                    </Button>

                    <div className="h-4 w-px bg-slate-700 mx-1" />

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button variant="ghost" size="icon-xs" onClick={loadContent} className="text-slate-500 hover:text-white">
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
                            </Button>
                        } />
                        <TooltipContent>Recargar diferencias</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button variant="ghost" size="icon-xs" onClick={() => setIsFullScreen(v => !v)} className="text-slate-500 hover:text-nexus-neon">
                                {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </Button>
                        } />
                        <TooltipContent>{isFullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button variant="ghost" size="icon-xs" onClick={onClose} className="text-slate-500 hover:text-red-400">
                                <X size={14} />
                            </Button>
                        } />
                        <TooltipContent>Cerrar visor</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Hunk List - Narrower and more compact */}
                <div className="w-48 border-r border-slate-800 bg-slate-900/30 flex flex-col shrink-0 overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Blocks</span>
                        <span className="text-[9px] font-mono text-nexus-neon bg-nexus-neon/10 px-1.5 rounded">{hunks.length}</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
                        {loading ? (
                            <div className="py-8 text-center"><Loader2 size={16} className="animate-spin mx-auto text-slate-700" /></div>
                        ) : hunks.length === 0 ? (
                            <div className="py-8 text-center text-[9px] text-slate-600 italic">No changes detected.</div>
                        ) : hunks.map((hunk) => (
                            <div 
                                key={hunk.id}
                                onClick={() => scrollToHunk(hunk)}
                                className={cn(
                                    "p-1.5 rounded-lg border transition-all cursor-pointer group",
                                    selectedHunkId === hunk.id 
                                        ? "bg-sky-500/10 border-sky-500/40 shadow-sm" 
                                        : "bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <Badge variant="outline" className="text-[9px] px-1 h-3.5 border-slate-700 bg-transparent text-slate-500">
                                        #{hunk.id + 1}
                                    </Badge>
                                    <span className="text-[8px] font-mono text-slate-600">L:{hunk.new_start}</span>
                                </div>
                                <Button 
                                    variant="outline"
                                    size="xs"
                                    onClick={(e) => { e.stopPropagation(); stageHunk(hunk.id); }}
                                    className={cn(
                                        "w-full h-5 text-[8px] font-bold gap-1 transition-colors",
                                        mode === 'unstaged'
                                            ? "bg-nexus-neon/5 text-nexus-neon border-nexus-neon/20 hover:bg-nexus-neon/20"
                                            : "bg-nexus-accent/5 text-nexus-accent border-nexus-accent/20 hover:bg-nexus-accent/20"
                                    )}
                                >
                                    <Zap size={9} /> {mode === 'unstaged' ? 'STAGE BLOCK' : 'UNSTAGE BLOCK'}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Monaco Editor */}
                <div className="flex-1 relative bg-[#020617]">
                    {error && <div className="absolute top-0 left-0 right-0 z-20 bg-red-500/20 text-red-400 p-2 text-xs border-b border-red-500/30">{error}</div>}
                    <DiffEditor
                        original={originalText}
                        modified={modifiedText}
                        language={getLanguage(file)}
                        theme={monacoTheme}
                        onMount={handleEditorDidMount}
                    />
                    {applyingAction && (
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3">
                            <Loader2 size={32} className="animate-spin text-nexus-neon" />
                            <span className="text-xs font-mono text-nexus-neon tracking-widest uppercase animate-pulse">Updating Stage...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
