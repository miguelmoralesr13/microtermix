import React from 'react';
import { RefreshCw } from 'lucide-react';
import { ReadOnlyDiff, FileStatusIcon, FileStatusLabel, Hunk } from '../utils/diffRenderer';
import { cn } from '../../../lib/utils';

export interface DiffFile {
    status: string;
    path: string;
    oldPath?: string;
}

interface FileDiffPanelProps {
    files: DiffFile[];
    selectedFile: DiffFile | null;
    onSelectFile: (file: DiffFile) => void;
    hunks: Hunk[];
    loadingFiles: boolean;
    loadingDiff: boolean;
    error?: string | null;
    sidebarTitle?: string;
    emptyState?: React.ReactNode;
}

export function FileDiffPanel({
    files,
    selectedFile,
    onSelectFile,
    hunks,
    loadingFiles,
    loadingDiff,
    error,
    sidebarTitle = 'Archivos modificados',
    emptyState,
}: FileDiffPanelProps) {
    return (
        <div className="flex flex-1 min-h-0">
            {/* File list sidebar */}
            <div className="w-72 shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/30">
                <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800/60">
                    {sidebarTitle}
                </div>
                {loadingFiles ? (
                    <div className="flex-1 flex items-center justify-center text-slate-600">
                        <RefreshCw size={16} className="animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-microtermix-danger text-xs p-3 italic">{error}</div>
                ) : files.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-xs italic px-3 text-center">
                        {emptyState ?? 'No hay archivos'}
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
                        {files.map((f, i) => {
                            const isSelected = selectedFile?.path === f.path;
                            return (
                                <button
                                    key={i}
                                    onClick={() => onSelectFile(f)}
                                    className={cn(
                                        'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors group',
                                        isSelected
                                            ? 'bg-microtermix-accent/15 border-r-2 border-microtermix-accent text-slate-200'
                                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                    )}
                                >
                                    <FileStatusIcon status={f.status} />
                                    <span className="flex-1 font-mono truncate" title={f.path}>
                                        {f.path.split('/').pop()}
                                    </span>
                                    <FileStatusLabel status={f.status} />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Diff area */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {selectedFile && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/40 shrink-0">
                        <FileStatusIcon status={selectedFile.status} />
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
                        {selectedFile
                            ? <ReadOnlyDiff hunks={hunks} />
                            : <div className="flex items-center justify-center h-full text-slate-600 text-sm">Seleccioná un archivo para ver sus cambios</div>
                        }
                    </div>
                )}
            </div>
        </div>
    );
}
