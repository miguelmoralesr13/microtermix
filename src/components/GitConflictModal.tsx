import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitMerge, AlertTriangle, Check, RefreshCw, X } from 'lucide-react';
import { GitConflictResolver } from './GitConflictResolver';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

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

    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const allResolved = conflictedFiles.length > 0 && conflictedFiles.every(f => resolvedFiles.has(f));
    const progress = conflictedFiles.length > 0
        ? (resolvedFiles.size / conflictedFiles.length) * 100
        : 0;

    const handleFileSaved = (file: string) => {
        setResolvedFiles(prev => {
            const next = new Set(prev);
            next.add(file);
            // Auto-advance to next unresolved file using the updated set
            const nextFile = conflictedFiles.find(f => !next.has(f) && f !== file);
            if (nextFile) setSelectedFile(nextFile);
            return next;
        });
    };

    const handleAbortClick = async () => {
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
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[90vw] h-[85vh] p-0 overflow-hidden flex flex-col bg-slate-900 border-slate-700" showCloseButton={false}>

                {/* Header */}
                <DialogHeader className="flex flex-row items-center gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0 m-0 space-y-0 text-left relative justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <GitMerge size={18} className="text-orange-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="text-sm font-bold text-slate-100 flex items-center m-0">
                                Resolver conflictos de Merge
                            </DialogTitle>
                            <DialogDescription className="hidden">Resolver conflictos</DialogDescription>
                            {/* Progress bar */}
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[200px]">
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="h-8 px-3 text-slate-300 hover:text-white"
                        >
                            <X size={12} className="mr-1.5" /> Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleAbortClick}
                            disabled={aborting}
                            className="h-8 px-3 bg-red-950 hover:bg-red-900 text-red-400 border border-red-900"
                        >
                            {aborting ? <RefreshCw size={12} className="animate-spin mr-1.5" /> : <AlertTriangle size={12} className="mr-1.5" />}
                            Abort Merge
                        </Button>
                    </div>
                </DialogHeader>

                {error && (
                    <div className="p-3 bg-red-900/30 border-b border-red-900/50 flex items-start gap-3 text-red-200 text-sm max-h-32 overflow-y-auto shrink-0">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 break-words whitespace-pre-wrap font-mono text-xs">
                            {error}
                        </div>
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
                            <Button
                                onClick={handleCommitMerge}
                                disabled={!allResolved || committing}
                                className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 flex items-center justify-center gap-2 h-9 text-xs font-bold text-white transition-colors"
                            >
                                {committing
                                    ? <RefreshCw size={13} className="animate-spin" />
                                    : <Check size={13} />
                                }
                                Commit Merge
                            </Button>
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
            </DialogContent>
        </Dialog>
    );
};
