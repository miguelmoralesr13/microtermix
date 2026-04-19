import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, History, User, Clock, Hash, RefreshCw } from 'lucide-react';
import { ReadOnlyDiff, computeDiff, buildHunks, Hunk } from './utils/diffRenderer';
import { useFileHistory } from '../../hooks/queries/useGitQueries';

interface FileHistoryModalProps {
    projectPath: string;
    filePath: string;
    onClose: () => void;
}

export const FileHistoryModal: React.FC<FileHistoryModalProps> = ({ projectPath, filePath, onClose }) => {
    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const [hunks, setHunks] = useState<Hunk[]>([]);
    const [loadingDiff, setLoadingDiff] = useState(false);

    const { data, isLoading, error } = useFileHistory(projectPath, filePath);
    const commits = data?.commits ?? [];

    const loadDiff = useCallback(async (hash: string) => {
        setLoadingDiff(true);
        setHunks([]);
        try {
            const [oldRes, newRes]: any[] = await Promise.all([
                invoke('git_execute', { projectPath, args: ['show', `${hash}^:${filePath}`] }),
                invoke('git_execute', { projectPath, args: ['show', `${hash}:${filePath}`] }),
            ]);
            const oldText = oldRes?.success ? (oldRes.stdout ?? '') : '';
            const newText = newRes?.success ? (newRes.stdout ?? '') : '';
            setHunks(buildHunks(computeDiff(oldText.split('\n'), newText.split('\n'))));
        } catch {
            setHunks([]);
        } finally {
            setLoadingDiff(false);
        }
    }, [projectPath, filePath]);

    const handleSelectCommit = (hash: string) => {
        setSelectedHash(hash);
        loadDiff(hash);
    };

    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const fileName = filePath.split('/').pop() ?? filePath;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="flex flex-col w-full max-w-7xl h-[90vh] bg-slate-950 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0">
                    <History size={18} className="text-microtermix-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-100">Historial de archivo</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{filePath}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 min-h-0">

                    {/* Commit timeline */}
                    <div className="w-80 shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/30">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800/60">
                            Commits ({commits.length})
                        </div>
                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center text-slate-600">
                                <RefreshCw size={16} className="animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="text-microtermix-danger text-xs p-3">{String(error)}</div>
                        ) : (
                            <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
                                {commits.map((commit, i) => {
                                    const isSelected = selectedHash === commit.hash;
                                    return (
                                        <button
                                            key={commit.hash}
                                            onClick={() => handleSelectCommit(commit.hash)}
                                            className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors group ${
                                                isSelected
                                                    ? 'bg-microtermix-accent/15 border-r-2 border-microtermix-accent'
                                                    : 'hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <div className="flex flex-col items-center shrink-0 mt-1">
                                                <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-microtermix-accent' : 'bg-slate-600'}`} />
                                                {i < commits.length - 1 && <div className="w-px flex-1 bg-slate-800 mt-1 min-h-[12px]" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs text-slate-200 truncate group-hover:text-white">{commit.message}</div>
                                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-600">
                                                    <span className="flex items-center gap-0.5"><User size={9} />{commit.author}</span>
                                                    <span className="flex items-center gap-0.5"><Clock size={9} />{commit.date}</span>
                                                </div>
                                            </div>
                                            <span className="font-mono text-[9px] text-microtermix-neon shrink-0">{commit.shortHash}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Diff area */}
                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                        {selectedHash ? (
                            <>
                                <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/40 shrink-0 text-xs">
                                    <Hash size={11} className="text-slate-500" />
                                    <span className="font-mono text-microtermix-neon">{selectedHash.slice(0, 12)}</span>
                                    <span className="text-slate-500">·</span>
                                    <span className="text-slate-400 font-mono truncate">{fileName}</span>
                                </div>
                                {loadingDiff ? (
                                    <div className="flex-1 flex items-center justify-center text-slate-600">
                                        <RefreshCw size={20} className="animate-spin mr-3" />
                                        <span className="text-sm">Cargando diff...</span>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto scrollbar-hide">
                                        <ReadOnlyDiff hunks={hunks} />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                                Seleccioná un commit para ver los cambios
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
