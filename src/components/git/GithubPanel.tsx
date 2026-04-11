import React, { useState, useEffect } from 'react';
import { GithubPR, GithubIssue, fetchGithubPRs, fetchGithubIssues } from '../../services/githubApi';
import { CircleDot, GitPullRequest, RefreshCw, ExternalLink, Zap } from 'lucide-react';
import { useGitStore } from '../../stores/gitStore';
import { useWorkflowRuns } from '../../hooks/queries/useGitQueries';
import { WorkflowRunList } from './github/WorkflowRunList';

interface GithubPanelProps {
    projectPath: string | null;
}

// Leaf component: reads workflow runs from cache (observer-only when enabled=false),
// renders a pulsing amber dot when any run is in progress or queued.
const ActionsTabIndicator: React.FC<{ projectPath: string | null }> = ({ projectPath }) => {
    const { data } = useWorkflowRuns(projectPath, false);
    const hasActive = data?.some(r => r.status === 'in_progress' || r.status === 'queued') ?? false;
    if (!hasActive) return null;
    return <span className="ml-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block shrink-0" />;
};

export const GithubPanel: React.FC<GithubPanelProps> = ({ projectPath }) => {
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = projectPath ? getActiveAccount(projectPath) : undefined;
    const [activeTab, setActiveTab] = useState<'prs' | 'issues' | 'actions'>('prs');
    const [prs, setPrs] = useState<GithubPR[]>([]);
    const [issues, setIssues] = useState<GithubIssue[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        if (!projectPath) return;
        if (activeTab === 'actions') return; // Actions tab is handled by WorkflowRunList
        setLoading(true);
        setError(null);
        try {
            const token = activeAccount?.token || '';
            if (activeTab === 'prs') {
                const data = await fetchGithubPRs(projectPath, token);
                setPrs(data);
            } else {
                const data = await fetchGithubIssues(projectPath, token);
                setIssues(data);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch data from GitHub');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [projectPath, activeTab, activeAccount?.token]);

    if (!projectPath) {
        return <div className="flex-1 flex items-center justify-center text-slate-500 p-8">No repository selected.</div>;
    }

    return (
        <div className="flex flex-col h-full w-full bg-slate-900 overflow-hidden">
            {/* Header Tabs */}
            <div className="flex items-center bg-slate-950 border-b border-slate-800 px-4 pt-2">
                <button
                    onClick={() => setActiveTab('prs')}
                    className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 flex items-center ${activeTab === 'prs' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                    <GitPullRequest size={14} className="mr-2" /> Pull Requests
                </button>
                <button
                    onClick={() => setActiveTab('issues')}
                    className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 flex items-center ${activeTab === 'issues' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                    <CircleDot size={14} className="mr-2" /> Issues
                </button>
                <button
                    onClick={() => setActiveTab('actions')}
                    className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 flex items-center ${activeTab === 'actions' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                    <Zap size={14} className="mr-2" /> Actions
                    <ActionsTabIndicator projectPath={projectPath} />
                </button>
                <div className="flex-1" />
                {activeTab !== 'actions' && (
                    <button
                        onClick={loadData}
                        className={`p-1.5 text-slate-400 hover:text-white rounded transition-colors ${loading ? 'animate-spin' : ''}`}
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>

            {/* Content Body */}
            {activeTab === 'actions' ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                    <WorkflowRunList projectPath={projectPath} />
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-4 scrollbar-hide relative">
                    {error && (
                        <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs">
                            <p className="font-bold mb-1">Error fetching from GitHub</p>
                            <p>{error}</p>
                            <p className="mt-2 text-[10px] opacity-80">Make sure your branch has a remote tracking branch, or configure a valid PAT in Settings.</p>
                        </div>
                    )}

                    {loading && !error && (
                        <div className="flex justify-center p-8">
                            <RefreshCw className="animate-spin text-slate-600" size={24} />
                        </div>
                    )}

                    {!loading && !error && activeTab === 'prs' && (
                        <div className="space-y-2">
                            {prs.length === 0 ? (
                                <div className="text-center text-slate-500 text-xs py-8">No open pull requests found.</div>
                            ) : (
                                prs.map(pr => (
                                    <a
                                        key={pr.id}
                                        href={pr.html_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <GitPullRequest className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                                <div>
                                                    <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{pr.title}</h4>
                                                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                                        <span>#{pr.number}</span>
                                                        <span>•</span>
                                                        <span>opened by {pr.user.login}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <ExternalLink size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </a>
                                ))
                            )}
                        </div>
                    )}

                    {!loading && !error && activeTab === 'issues' && (
                        <div className="space-y-2">
                            {issues.length === 0 ? (
                                <div className="text-center text-slate-500 text-xs py-8">No open issues found.</div>
                            ) : (
                                issues.map(issue => (
                                    <a
                                        key={issue.id}
                                        href={issue.html_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <CircleDot className="text-blue-500 mt-0.5 shrink-0" size={16} />
                                                <div>
                                                    <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{issue.title}</h4>
                                                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                                        <span>#{issue.number}</span>
                                                        <span>•</span>
                                                        <span>opened by {issue.user.login}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <ExternalLink size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </a>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};
