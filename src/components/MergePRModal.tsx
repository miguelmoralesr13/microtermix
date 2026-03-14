import React, { useState, useEffect } from 'react';
import { X, GitMerge, RefreshCw, CheckCircle, GitCommit, FileText, Plus, Minus, FileCode, Trash2, FileMinus } from 'lucide-react';
import {
    mergeGithubPR, closeGithubPR, deleteGithubBranch,
    fetchGithubPRCommits, fetchGithubPRFiles,
    type GithubMergeMethod, type GithubPRCommit, type GithubPRFile,
} from '../services/githubApi';
import {
    mergeGitlabMR, closeGitlabMR,
    fetchGitlabMRCommits, fetchGitlabMRChanges,
    type GitlabMRCommit, type GitlabMRChange,
} from '../services/gitlabApi';
import { useGitStore } from '../stores/gitStore';
import type { GitAccount } from '../stores/gitStore';
import type { NormalizedPR } from './PRSection';
import { invoke } from '@tauri-apps/api/core';

interface MergePRModalProps {
    pr: NormalizedPR;
    projectPath: string;
    account: GitAccount;
    onClose: () => void;
    onMerged: () => void;
}

type Tab = 'commits' | 'files';

const GITHUB_METHODS: { value: GithubMergeMethod; label: string; desc: string }[] = [
    { value: 'merge', label: 'Merge commit', desc: 'Conserva el historial completo' },
    { value: 'squash', label: 'Squash and merge', desc: 'Un solo commit en destino' },
    { value: 'rebase', label: 'Rebase and merge', desc: 'Sin commit de merge' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileStatusIcon(status: GithubPRFile['status']) {
    if (status === 'added') return <Plus size={10} className="text-green-400 shrink-0" />;
    if (status === 'removed') return <Minus size={10} className="text-red-400 shrink-0" />;
    if (status === 'renamed') return <FileCode size={10} className="text-yellow-400 shrink-0" />;
    return <FileText size={10} className="text-slate-400 shrink-0" />;
}

function gitlabChangeIcon(c: GitlabMRChange) {
    if (c.new_file) return <Plus size={10} className="text-green-400 shrink-0" />;
    if (c.deleted_file) return <Minus size={10} className="text-red-400 shrink-0" />;
    if (c.renamed_file) return <FileCode size={10} className="text-yellow-400 shrink-0" />;
    return <FileText size={10} className="text-slate-400 shrink-0" />;
}

function shortSha(sha: string) { return sha.slice(0, 7); }
function shortMsg(msg: string) { return msg.split('\n')[0].slice(0, 72); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short' }); }

// ── Main component ─────────────────────────────────────────────────────────────

export const MergePRModal: React.FC<MergePRModalProps> = ({ pr, projectPath, account, onClose, onMerged }) => {
    const isGitlab = account.provider === 'gitlab';
    const prLabel = isGitlab ? 'Merge Request' : 'Pull Request';

    // Tabs
    const [tab, setTab] = useState<Tab>('commits');

    // Data
    const [commits, setCommits] = useState<(GithubPRCommit | GitlabMRCommit)[]>([]);
    const [files, setFiles] = useState<(GithubPRFile | GitlabMRChange)[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    // Merge options
    const [method, setMethod] = useState<GithubMergeMethod>('merge');
    const [squash, setSquash] = useState(false);
    const [removeBranch, setRemoveBranch] = useState(true);
    const [commitMessage, setCommitMessage] = useState('');
    const [showMessage, setShowMessage] = useState(false);

    // Actions
    const [actionLoading, setActionLoading] = useState<'merge' | 'close' | 'resolveLocally' | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [result, setResult] = useState<'merged' | 'closed' | 'resolving' | null>(null);

    const invalidate = useGitStore(s => s.invalidate);
    const fetchAll = useGitStore(s => s.fetchAll);

    useEffect(() => {
        (async () => {
            setLoadingData(true);
            setDataError(null);
            try {
                if (isGitlab) {
                    const [c, ch] = await Promise.all([
                        fetchGitlabMRCommits(projectPath, account.token, pr.number, account.url || undefined),
                        fetchGitlabMRChanges(projectPath, account.token, pr.number, account.url || undefined),
                    ]);
                    setCommits(c);
                    setFiles(ch);
                } else {
                    const [c, f] = await Promise.all([
                        fetchGithubPRCommits(projectPath, account.token, pr.number, account.url || undefined),
                        fetchGithubPRFiles(projectPath, account.token, pr.number, account.url || undefined),
                    ]);
                    setCommits(c);
                    setFiles(f);
                }
            } catch (e: any) {
                setDataError(e.message);
            } finally {
                setLoadingData(false);
            }
        })();
    }, []);

    const handleMerge = async () => {
        setActionLoading('merge');
        setActionError(null);
        try {
            if (isGitlab) {
                await mergeGitlabMR(
                    projectPath, account.token, pr.number,
                    squash, removeBranch,
                    commitMessage || undefined,
                    account.url || undefined,
                );
            } else {
                await mergeGithubPR(
                    projectPath, account.token, pr.number,
                    method, undefined,
                    commitMessage || undefined,
                    account.url || undefined,
                );
                if (removeBranch) {
                    // Best-effort: delete the source branch after merge
                    await deleteGithubBranch(projectPath, account.token, pr.headBranch, account.url || undefined);
                }
            }
            setResult('merged');
            onMerged();
        } catch (e: any) {
            setActionError(e.message || 'Error al hacer merge');
        } finally {
            setActionLoading(null);
        }
    };

    const handleClose = async () => {
        setActionLoading('close');
        setActionError(null);
        try {
            if (isGitlab) {
                await closeGitlabMR(projectPath, account.token, pr.number, account.url || undefined);
            } else {
                await closeGithubPR(projectPath, account.token, pr.number, account.url || undefined);
            }
            setResult('closed');
            onMerged(); // refresh list
        } catch (e: any) {
            setActionError(e.message || 'Error al cerrar');
        } finally {
            setActionLoading(null);
        }
    };

    const handleResolveLocally = async () => {
        setActionLoading('resolveLocally');
        setActionError(null);
        try {
            await invoke('git_execute', { projectPath, args: ['fetch', 'origin'] });
            await invoke('git_execute', { projectPath, args: ['checkout', pr.headBranch] });
            await invoke('git_execute', { projectPath, args: ['pull'] });
            const mergeResult: any = await invoke('git_execute', { projectPath, args: ['merge', `origin/${pr.baseBranch}`] });

            if (mergeResult && !mergeResult.success && (mergeResult.stderr?.includes('conflict') || mergeResult.stderr?.includes('Conflict'))) {
                console.log("[MergePRModal] Detected conflict during local resolution, deferring to conflict resolution UI");
            } else if (!mergeResult.success && mergeResult.stderr) {
                throw new Error(mergeResult.stderr);
            }

            // Force refresh so GitPanel detects MERGE_HEAD
            invalidate(projectPath, 'status');
            fetchAll(projectPath, true);

            setResult('resolving');
            onClose(); // Just close to reveal the UI below
        } catch (e: any) {
            setActionError(e.message || 'Error al resolver localmente');
        } finally {
            setActionLoading(null);
        }
    };

    // ── Result state ────────────────────────────────────────────────────────────
    if (result) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-slate-700 w-[400px] rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4 text-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${result === 'merged' ? 'bg-purple-900/30 border-purple-700/40' : 'bg-slate-800 border-slate-600'}`}>
                        {result === 'merged'
                            ? <CheckCircle size={22} className="text-purple-400" />
                            : <X size={22} className="text-slate-400" />
                        }
                    </div>
                    <div>
                        <p className="text-white font-semibold mb-1">
                            {result === 'merged' ? 'Merge completado' : `${prLabel} cerrado`}
                        </p>
                        <p className="text-slate-400 text-xs truncate max-w-[320px]">{pr.title}</p>
                    </div>
                    <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors mt-2">
                        Cerrar
                    </button>
                </div>
            </div>
        );
    }

    // ── Commits tab content ─────────────────────────────────────────────────────
    const CommitsContent = () => (
        <div className="space-y-0.5">
            {(commits as any[]).map((c, i) => {
                const isGl = 'short_id' in c;
                const sha = isGl ? c.short_id : shortSha(c.sha);
                const msg = isGl ? c.title : shortMsg(c.commit.message);
                const author = isGl ? c.author_name : c.commit.author.name;
                const date = isGl ? c.created_at : c.commit.author.date;
                return (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded hover:bg-slate-800/60 transition-colors group">
                        <GitCommit size={12} className="text-slate-600 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-200 truncate">{msg}</p>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                                <span className="font-mono text-slate-500">{sha}</span>
                                {' · '}{author}{' · '}{fmtDate(date)}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // ── Files tab content ───────────────────────────────────────────────────────
    const FilesContent = () => (
        <div className="space-y-0.5">
            {(files as any[]).map((f, i) => {
                const isGl = 'new_path' in f;
                const path = isGl ? f.new_path : f.filename;
                const icon = isGl ? gitlabChangeIcon(f) : fileStatusIcon(f.status);
                const stats = !isGl ? (
                    <span className="text-[10px] shrink-0 ml-auto">
                        <span className="text-green-400">+{f.additions}</span>
                        <span className="text-slate-600 mx-0.5">/</span>
                        <span className="text-red-400">-{f.deletions}</span>
                    </span>
                ) : null;
                return (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-slate-800/60 transition-colors">
                        {icon}
                        <span className="text-[11px] text-slate-300 truncate flex-1 font-mono">{path}</span>
                        {stats}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 w-[680px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <GitMerge size={14} className="text-purple-400 shrink-0" />
                            <h2 className="text-sm font-bold text-white truncate">{pr.title}</h2>
                            {pr.draft && <span className="shrink-0 text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">draft</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 ml-5">
                            #{pr.number} · <span className="text-slate-400 font-mono">{pr.headBranch}</span>
                            <span className="mx-1">→</span>
                            <span className="text-slate-400 font-mono">{pr.baseBranch}</span>
                            <span className="mx-1">·</span>{pr.author}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors shrink-0 ml-4">
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 shrink-0 px-5">
                    {(['commits', 'files'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-purple-500 text-purple-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                        >
                            {t === 'commits' ? `Commits (${commits.length})` : `Archivos (${files.length})`}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto scrollbar-hide py-2 min-h-0">
                    {loadingData ? (
                        <div className="flex justify-center py-10">
                            <RefreshCw size={18} className="animate-spin text-slate-600" />
                        </div>
                    ) : dataError ? (
                        <div className="px-5 py-4 text-xs text-red-400">{dataError}</div>
                    ) : tab === 'commits' ? (
                        commits.length === 0
                            ? <p className="px-5 py-4 text-xs text-slate-600 italic">Sin commits.</p>
                            : <CommitsContent />
                    ) : (
                        files.length === 0
                            ? <p className="px-5 py-4 text-xs text-slate-600 italic">Sin archivos cambiados.</p>
                            : <FilesContent />
                    )}
                </div>

                {/* Options + footer */}
                <div className="border-t border-slate-800 px-5 py-4 space-y-3 shrink-0 bg-slate-900/80">

                    {/* GitHub: method */}
                    {!isGitlab && (
                        <div className="flex gap-2">
                            {GITHUB_METHODS.map(m => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setMethod(m.value)}
                                    className={`flex-1 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${method === m.value ? 'border-purple-600/60 bg-purple-900/20 text-purple-200' : 'border-slate-700/50 text-slate-400 hover:border-slate-600'}`}
                                >
                                    <p className="font-medium">{m.label}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* GitLab: squash */}
                    {isGitlab && (
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={squash} onChange={e => setSquash(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800 accent-purple-500" />
                            <span className="text-xs text-slate-300">Squash commits al hacer merge</span>
                        </label>
                    )}

                    {/* Delete branch (both) */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={removeBranch} onChange={e => setRemoveBranch(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-800 accent-purple-500" />
                        <Trash2 size={11} className="text-slate-500" />
                        <span className="text-xs text-slate-300">Eliminar rama <span className="font-mono text-slate-400">{pr.headBranch}</span> tras el merge</span>
                    </label>

                    {/* Optional message */}
                    <div>
                        <button type="button" onClick={() => setShowMessage(v => !v)}
                            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline decoration-slate-700">
                            {showMessage ? 'Ocultar' : 'Personalizar'} mensaje de commit
                        </button>
                        {showMessage && (
                            <textarea value={commitMessage} onChange={e => setCommitMessage(e.target.value)}
                                rows={2} placeholder={`Merge #${pr.number}: ${pr.title}`}
                                className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                            />
                        )}
                    </div>

                    {/* Error */}
                    {actionError && (
                        <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                            {actionError}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={handleClose}
                            disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50 transition-colors"
                            title={`Cerrar ${prLabel} sin mergear`}
                        >
                            {actionLoading === 'close' ? <RefreshCw size={11} className="animate-spin" /> : <FileMinus size={11} />}
                            Cerrar {prLabel}
                        </button>
                        <div className="flex-1" />
                        <button onClick={onClose} disabled={!!actionLoading}
                            className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleResolveLocally}
                            disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-cyan-800/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 hover:text-cyan-300 disabled:opacity-50 transition-colors"
                            title="Haz checkout a la rama y fuerza el merge para resolver conflictos en Microtermix"
                        >
                            {actionLoading === 'resolveLocally' ? <RefreshCw size={11} className="animate-spin" /> : <GitMerge size={11} />}
                            Resolver localmente
                        </button>
                        <button
                            onClick={handleMerge}
                            disabled={!!actionLoading || pr.draft}
                            title={pr.draft ? 'No se puede mergear un PR en borrador' : undefined}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
                        >
                            {actionLoading === 'merge' ? <RefreshCw size={11} className="animate-spin" /> : <GitMerge size={11} />}
                            {actionLoading === 'merge' ? 'Mergeando...' : `Merge ${prLabel}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
