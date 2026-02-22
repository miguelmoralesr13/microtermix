import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    X, UploadCloud, RefreshCw, AlertCircle,
    ChevronRight, User, Clock, Hash, CheckCircle
} from 'lucide-react';
import { CommitDiffModal } from './CommitDiffModal';

interface PendingCommit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
}

interface PushPreviewModalProps {
    projectPath: string;
    onClose: () => void;
    onRefreshRequest?: () => void;
}

export const PushPreviewModal: React.FC<PushPreviewModalProps> = ({
    projectPath, onClose, onRefreshRequest
}) => {
    const [commits, setCommits] = useState<PendingCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [pushing, setPushing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pushSuccess, setPushSuccess] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<PendingCommit | null>(null);
    const [currentBranch, setCurrentBranch] = useState('');

    const loadPendingCommits = useCallback(async () => {
        setLoading(true);
        setError(null);
        setPushSuccess(false);
        try {
            // Get current branch name
            const branchRes: any = await invoke('git_execute', {
                projectPath,
                args: ['rev-parse', '--abbrev-ref', 'HEAD']
            });
            const branch = branchRes?.stdout?.trim() ?? '';
            setCurrentBranch(branch);

            // Get commits not yet pushed (ahead of remote tracking branch)
            const logRes: any = await invoke('git_execute', {
                projectPath,
                args: ['log', '@{u}..HEAD', '--pretty=format:%H|%h|%an|%ar|%s']
            });

            if (logRes?.success && logRes.stdout?.trim()) {
                const list: PendingCommit[] = logRes.stdout
                    .split('\n')
                    .filter((l: string) => l.trim())
                    .map((line: string) => {
                        const [hash, shortHash, author, date, ...msgParts] = line.split('|');
                        return { hash, shortHash, author, date, message: msgParts.join('|') };
                    });
                setCommits(list);
            } else if (!logRes?.success) {
                // No upstream set yet — just show all local commits from HEAD
                const fallbackRes: any = await invoke('git_execute', {
                    projectPath,
                    args: ['log', '-20', '--pretty=format:%H|%h|%an|%ar|%s']
                });
                if (fallbackRes?.success && fallbackRes.stdout?.trim()) {
                    const list: PendingCommit[] = fallbackRes.stdout
                        .split('\n')
                        .filter((l: string) => l.trim())
                        .map((line: string) => {
                            const [hash, shortHash, author, date, ...msgParts] = line.split('|');
                            return { hash, shortHash, author, date, message: msgParts.join('|') };
                        });
                    setCommits(list);
                    setError('No hay rama remota configurada. Se muestran los últimos commits locales.');
                } else {
                    setCommits([]);
                }
            } else {
                setCommits([]);
            }
        } catch (e: any) {
            setError(e?.toString?.() ?? 'Error loading commits');
        } finally {
            setLoading(false);
        }
    }, [projectPath]);

    const handlePush = async () => {
        setPushing(true);
        setError(null);
        try {
            const res: any = await invoke('git_execute', {
                projectPath,
                args: ['push']
            });
            if (res?.success) {
                setPushSuccess(true);
                onRefreshRequest?.();
                setTimeout(() => {
                    onClose();
                }, 1500);
            } else {
                setError(res?.stderr ?? 'Push failed');
            }
        } catch (e: any) {
            setError(e?.toString?.() ?? 'Push failed');
        } finally {
            setPushing(false);
        }
    };

    useEffect(() => { loadPendingCommits(); }, [loadPendingCommits]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !selectedCommit) onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, selectedCommit]);

    // If user clicks a commit, show CommitDiffModal on top
    if (selectedCommit) {
        return (
            <CommitDiffModal
                projectPath={projectPath}
                commitHash={selectedCommit.hash}
                commitMessage={selectedCommit.message}
                commitAuthor={selectedCommit.author}
                commitDate={selectedCommit.date}
                onClose={() => setSelectedCommit(null)}
            />
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="flex flex-col w-full max-w-2xl max-h-[80vh] bg-slate-950 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0">
                    <UploadCloud size={18} className="text-nexus-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-100">Vista previa de Push</div>
                        {currentBranch && (
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                <Hash size={10} />
                                <span className="font-mono text-nexus-neon">{currentBranch}</span>
                                {commits.length > 0 && (
                                    <span className="text-slate-500">— {commits.length} commit{commits.length !== 1 ? 's' : ''} pendiente{commits.length !== 1 ? 's' : ''}</span>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Commit list */}
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-600">
                            <RefreshCw size={18} className="animate-spin mr-3" />
                            <span className="text-sm">Cargando commits pendientes...</span>
                        </div>
                    ) : commits.length === 0 && !error ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-3">
                            <CheckCircle size={32} className="text-nexus-success/50" />
                            <div className="text-center">
                                <div className="text-sm font-medium text-slate-400">Todo está actualizado</div>
                                <div className="text-xs text-slate-600 mt-1">No hay commits locales pendientes de subir</div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-2 space-y-px">
                            {commits.map((commit, i) => (
                                <button
                                    key={commit.hash}
                                    onClick={() => setSelectedCommit(commit)}
                                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/60 transition-colors group"
                                >
                                    <div className="flex flex-col items-center shrink-0 mt-0.5">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-nexus-accent' : 'bg-slate-600'}`} />
                                        {i < commits.length - 1 && <div className="w-px flex-1 bg-slate-800 mt-1 min-h-[16px]" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-sm text-slate-200 group-hover:text-white line-clamp-1 flex-1">
                                                {commit.message}
                                            </span>
                                            <span className="font-mono text-[10px] text-nexus-neon bg-nexus-neon/10 px-1.5 py-0.5 rounded shrink-0">
                                                {commit.shortHash}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <User size={10} />
                                                {commit.author}
                                            </span>
                                            <span>·</span>
                                            <span className="flex items-center gap-1">
                                                <Clock size={10} />
                                                {commit.date}
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-slate-600 group-hover:text-nexus-accent shrink-0 mt-0.5 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Error banner */}
                {error && (
                    <div className="px-4 py-2.5 bg-nexus-danger/10 border-t border-nexus-danger/20 flex items-start gap-2 text-xs text-nexus-danger shrink-0">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                )}

                {/* Push success */}
                {pushSuccess && (
                    <div className="px-4 py-2.5 bg-nexus-success/10 border-t border-nexus-success/20 flex items-center gap-2 text-xs text-nexus-success shrink-0">
                        <CheckCircle size={13} />
                        ¡Push completado! Cerrando...
                    </div>
                )}

                {/* Footer: Push button */}
                <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/40 shrink-0 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                        {commits.length > 0
                            ? `Se subirán ${commits.length} commit${commits.length !== 1 ? 's' : ''} a origin/${currentBranch}`
                            : 'Nada que subir'
                        }
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handlePush}
                            disabled={pushing || pushSuccess || commits.length === 0}
                            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-nexus-accent text-white rounded-lg hover:bg-nexus-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {pushing ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                            {pushing ? 'Subiendo...' : 'Push'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
