import React, { useState, useCallback } from 'react';
import { GitPullRequest, RefreshCw, Plus, ExternalLink, Folder, GitMerge, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchGithubPRs, type GithubPR } from '../services/githubApi';
import { fetchGitlabMRs, type GitlabMR } from '../services/gitlabApi';
import type { GitAccount } from '../stores/gitStore';
import { CreatePRModal } from './CreatePRModal';
import { MergePRModal } from './MergePRModal';

// Normalized PR shape shared between GitHub and GitLab
export interface NormalizedPR {
    id: number;
    number: number;
    title: string;
    htmlUrl: string;
    author: string;
    authorAvatar?: string;
    baseBranch: string;
    headBranch: string;
    draft: boolean;
    ciStatus: 'success' | 'failure' | 'pending' | 'none';
    createdAt: string;
    provider: 'github' | 'gitlab';
}

function normalizeGithubPR(pr: GithubPR): NormalizedPR {
    // ciStatus is derived from mergeable_state (merge readiness), not CI check runs.
    // Actual CI status would require a separate call to the Check Runs API.
    let ciStatus: NormalizedPR['ciStatus'] = 'none';
    if (pr.mergeable_state === 'clean') ciStatus = 'success';
    else if (pr.mergeable_state === 'dirty' || pr.mergeable_state === 'blocked') ciStatus = 'failure';
    else if (pr.mergeable_state === 'unstable') ciStatus = 'pending';
    return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        htmlUrl: pr.html_url,
        author: pr.user.login,
        authorAvatar: pr.user.avatar_url,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        draft: pr.draft,
        ciStatus,
        createdAt: pr.created_at,
        provider: 'github',
    };
}

function normalizeGitlabMR(mr: GitlabMR): NormalizedPR {
    let ciStatus: NormalizedPR['ciStatus'] = 'none';
    if (mr.head_pipeline?.status === 'success') ciStatus = 'success';
    else if (mr.head_pipeline?.status === 'failed') ciStatus = 'failure';
    else if (mr.head_pipeline?.status === 'running' || mr.head_pipeline?.status === 'pending') ciStatus = 'pending';
    return {
        id: mr.id,
        number: mr.iid,
        title: mr.title,
        htmlUrl: mr.web_url,
        author: mr.author.username,
        authorAvatar: mr.author.avatar_url,
        baseBranch: mr.target_branch,
        headBranch: mr.source_branch,
        draft: mr.draft,
        ciStatus,
        createdAt: mr.created_at,
        provider: 'gitlab',
    };
}

function CiDot({ status }: { status: NormalizedPR['ciStatus'] }) {
    if (status === 'success') return <CheckCircle size={10} className="text-green-400 shrink-0" />;
    if (status === 'failure') return <XCircle size={10} className="text-red-400 shrink-0" />;
    if (status === 'pending') return <Clock size={10} className="text-yellow-400 shrink-0 animate-pulse" />;
    return null;
}

interface PRSectionProps {
    projectPath: string;
    account: GitAccount | undefined;
    activeBranch: string;
    branches: string[];
}

export const PRSection: React.FC<PRSectionProps> = ({ projectPath, account, activeBranch, branches }) => {
    const [expanded, setExpanded] = useState(false);
    const [prs, setPrs] = useState<NormalizedPR[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetched, setFetched] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [mergingPR, setMergingPR] = useState<NormalizedPR | null>(null);

    const fetchPRs = useCallback(async () => {
        if (!account) return;
        setLoading(true);
        setError(null);
        try {
            if (account.provider === 'github') {
                const data = await fetchGithubPRs(projectPath, account.token, account.url || undefined);
                setPrs(data.map(normalizeGithubPR));
            } else {
                const data = await fetchGitlabMRs(projectPath, account.token, account.url || undefined);
                setPrs(data.map(normalizeGitlabMR));
            }
            setFetched(true);
        } catch (e: any) {
            setError(e.message || 'Error fetching PRs');
        } finally {
            setLoading(false);
        }
    }, [projectPath, account]);

    const handleToggle = () => {
        const next = !expanded;
        setExpanded(next);
        if (next && !fetched) fetchPRs();
    };

    const label = account?.provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests';

    return (
        <>
            {/* Section header — same style as SectionHeader in GitSidebar */}
            <div
                className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-slate-800 text-xs font-bold text-slate-400 uppercase group transition-colors"
                onClick={handleToggle}
            >
                <div className="flex items-center gap-2">
                    <GitPullRequest size={11} className="text-slate-500" />
                    {label}
                    <span className="bg-slate-800 text-slate-500 px-1.5 rounded text-[10px]">
                        {fetched ? prs.length : '•'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {expanded && (
                        <>
                            <button
                                onClick={e => { e.stopPropagation(); setShowCreate(true); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-microtermix-neon transition-all rounded hover:bg-slate-700"
                                title={`Nuevo ${label.slice(0, -1)}`}
                            >
                                <Plus size={11} />
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); fetchPRs(); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-all rounded hover:bg-slate-700"
                                title="Refrescar"
                            >
                                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </>
                    )}
                    <Folder size={12} className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </div>
            </div>

            {/* Content */}
            {expanded && (
                <div className="mb-2">
                    {!account && (
                        <div className="px-4 py-2 text-[11px] text-slate-600 italic flex items-center gap-1.5">
                            <AlertCircle size={11} />
                            Configura una cuenta para ver PRs
                        </div>
                    )}

                    {account && loading && (
                        <div className="flex justify-center py-3">
                            <RefreshCw size={14} className="animate-spin text-slate-600" />
                        </div>
                    )}

                    {account && error && (
                        <div className="px-4 py-2 text-[11px] text-red-400 flex items-start gap-1.5">
                            <AlertCircle size={11} className="mt-0.5 shrink-0" />
                            <span className="break-all">{error}</span>
                        </div>
                    )}

                    {account && !loading && !error && fetched && prs.length === 0 && (
                        <div className="px-4 py-2 text-[11px] text-slate-600 italic">
                            No hay {label.toLowerCase()} abiertos.
                        </div>
                    )}

                    {account && !loading && prs.map(pr => (
                        <PRRow key={pr.id} pr={pr} onMerge={() => setMergingPR(pr)} />
                    ))}

                    {account && !loading && !fetched && !error && (
                        <div className="px-4 py-1 text-[11px] text-slate-600 italic">Cargando...</div>
                    )}
                </div>
            )}

            {showCreate && account && (
                <CreatePRModal
                    projectPath={projectPath}
                    account={account}
                    activeBranch={activeBranch}
                    branches={branches}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { fetchPRs(); }}
                />
            )}

            {mergingPR && account && (
                <MergePRModal
                    pr={mergingPR}
                    projectPath={projectPath}
                    account={account}
                    onClose={() => setMergingPR(null)}
                    onMerged={() => { setMergingPR(null); fetchPRs(); }}
                />
            )}
        </>
    );
};

// ── PR row ─────────────────────────────────────────────────────────────────────

const PRRow: React.FC<{ pr: NormalizedPR; onMerge: () => void }> = ({ pr, onMerge }) => (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white group transition-colors">
        <GitMerge size={11} className={`shrink-0 ${pr.draft ? 'text-slate-600' : 'text-purple-400'}`} />
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
                <span className="text-slate-600 shrink-0">#{pr.number}</span>
                <span className="truncate">{pr.title}</span>
                {pr.draft && <span className="shrink-0 text-[9px] bg-slate-700 text-slate-400 px-1 rounded">draft</span>}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-600 mt-0.5">
                <span className="truncate max-w-[80px]">{pr.headBranch}</span>
                <span>→</span>
                <span className="truncate max-w-[60px]">{pr.baseBranch}</span>
                <CiDot status={pr.ciStatus} />
            </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
            <button
                onClick={e => { e.stopPropagation(); onMerge(); }}
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/40 text-purple-300 transition-all"
                title="Hacer merge"
            >
                <GitMerge size={9} /> Merge
            </button>
            <a
                href={pr.htmlUrl}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-all"
                title="Abrir en navegador"
            >
                <ExternalLink size={11} />
            </a>
        </div>
    </div>
);
