import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    X, UploadCloud, RefreshCw, AlertCircle,
    ChevronRight, User, Clock, Hash, CheckCircle
} from 'lucide-react';
import { CommitDiffModal } from './CommitDiffModal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

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
    const [noUpstream, setNoUpstream] = useState(false);

    const loadPendingCommits = useCallback(async () => {
        setLoading(true);
        setError(null);
        setPushSuccess(false);
        setNoUpstream(false);
        try {
            // Get current branch name
            const branchRes: any = await invoke('git_execute', {
                projectPath,
                args: ['rev-parse', '--abbrev-ref', 'HEAD']
            });
            const branch = branchRes?.stdout?.trim() ?? '';
            setCurrentBranch(branch);

            const parseCommits = (stdout: string): PendingCommit[] =>
                stdout.split('\n').filter((l: string) => l.trim()).map((line: string) => {
                    const [hash, shortHash, author, date, ...msgParts] = line.split('|');
                    return { hash, shortHash, author, date, message: msgParts.join('|') };
                });

            // 1. Try upstream tracking branch (@{u}..HEAD)
            const logRes: any = await invoke('git_execute', {
                projectPath,
                args: ['log', '@{u}..HEAD', '--pretty=format:%H|%h|%an|%ar|%s']
            });

            if (logRes?.success) {
                // Upstream tracking ref exists — show commits ahead of it
                setCommits(logRes.stdout?.trim() ? parseCommits(logRes.stdout) : []);
                return;
            }

            // 2. @{u} failed — try origin/{branch} directly (branch exists on remote but tracking not configured)
            const originLogRes: any = branch ? await invoke('git_execute', {
                projectPath,
                args: ['log', `origin/${branch}..HEAD`, '--pretty=format:%H|%h|%an|%ar|%s']
            }) : null;

            if (originLogRes?.success) {
                // Branch exists on origin, just missing local tracking config
                setNoUpstream(false);
                setCommits(originLogRes.stdout?.trim() ? parseCommits(originLogRes.stdout) : []);
                return;
            }

            // 3. Branch doesn't exist on origin yet — show commits not in any remote
            setNoUpstream(true);
            const noRemoteRes: any = await invoke('git_execute', {
                projectPath,
                args: ['log', '--not', '--remotes', 'HEAD', '--pretty=format:%H|%h|%an|%ar|%s']
            });
            setCommits(noRemoteRes?.success && noRemoteRes.stdout?.trim()
                ? parseCommits(noRemoteRes.stdout)
                : []);
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
            // Always use --set-upstream when tracking is not configured
            const pushArgs = currentBranch
                ? ['push', '--set-upstream', 'origin', currentBranch]
                : ['push'];
            const res: any = await invoke('git_execute', {
                projectPath,
                args: pushArgs,
            });
            if (res?.success) {
                setPushSuccess(true);
                // Delay refresh so git has time to update local remote tracking refs
                setTimeout(() => {
                    onRefreshRequest?.();
                }, 600);
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
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col bg-slate-950 border-slate-700" showCloseButton={false}>

                {/* Header */}
                <DialogHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0 m-0 space-y-0 text-left relative">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <UploadCloud size={18} className="text-microtermix-accent shrink-0" />
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="text-sm font-bold text-slate-100 flex items-center m-0">
                                Vista previa de Push
                            </DialogTitle>
                            <DialogDescription className="hidden">Preview commits to push</DialogDescription>
                            {currentBranch && (
                                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                    <Hash size={10} />
                                    <span className="font-mono text-microtermix-neon">{currentBranch}</span>
                                    {commits.length > 0 && (
                                        <span className="text-slate-500">— {commits.length} commit{commits.length !== 1 ? 's' : ''} pendiente{commits.length !== 1 ? 's' : ''}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onClose}
                        className="text-slate-500 hover:text-white hover:bg-slate-800"
                    >
                        <X size={16} />
                    </Button>
                </DialogHeader>

                {/* Commit list */}
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-600">
                            <RefreshCw size={18} className="animate-spin mr-3" />
                            <span className="text-sm">Cargando commits pendientes...</span>
                        </div>
                    ) : commits.length === 0 && !noUpstream ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-3">
                            <CheckCircle size={32} className="text-microtermix-success/50" />
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
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-microtermix-accent' : 'bg-slate-600'}`} />
                                        {i < commits.length - 1 && <div className="w-px flex-1 bg-slate-800 mt-1 min-h-[16px]" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-sm text-slate-200 group-hover:text-white line-clamp-1 flex-1">
                                                {commit.message}
                                            </span>
                                            <span className="font-mono text-[10px] text-microtermix-neon bg-microtermix-neon/10 px-1.5 py-0.5 rounded shrink-0">
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
                                    <ChevronRight size={14} className="text-slate-600 group-hover:text-microtermix-accent shrink-0 mt-0.5 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* No-upstream info banner */}
                {noUpstream && !error && (
                    <div className="px-4 py-2.5 bg-amber-500/8 border-t border-amber-500/20 flex items-start gap-2 text-xs text-amber-400/80 shrink-0">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        <span>Esta rama no tiene rama remota. El Push la creará en <span className="font-mono text-amber-300">origin/{currentBranch}</span>.</span>
                    </div>
                )}

                {/* Error banner */}
                {error && (
                    <div className="px-4 py-2.5 bg-microtermix-danger/10 border-t border-microtermix-danger/20 flex items-start gap-2 text-xs text-microtermix-danger shrink-0">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                )}

                {/* Push success */}
                {pushSuccess && (
                    <div className="px-4 py-2.5 bg-microtermix-success/10 border-t border-microtermix-success/20 flex items-center gap-2 text-xs text-microtermix-success shrink-0">
                        <CheckCircle size={13} />
                        ¡Push completado! Cerrando...
                    </div>
                )}

                {/* Footer: Push button */}
                <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/40 shrink-0 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                        {noUpstream
                            ? `Configurará upstream → origin/${currentBranch}`
                            : commits.length > 0
                                ? `Se subirán ${commits.length} commit${commits.length !== 1 ? 's' : ''} a origin/${currentBranch}`
                                : 'Nada que subir'
                        }
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="bg-transparent border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handlePush}
                            disabled={pushing || pushSuccess || (!noUpstream && commits.length === 0)}
                            className="bg-microtermix-accent text-white hover:bg-microtermix-accent/80 font-medium"
                        >
                            {pushing ? <RefreshCw size={14} className="animate-spin mr-2" /> : <UploadCloud size={14} className="mr-2" />}
                            {pushing ? 'Subiendo...' : 'Push'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
