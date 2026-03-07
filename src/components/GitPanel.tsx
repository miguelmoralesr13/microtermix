import React, { useState, useCallback, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Settings, RefreshCw, Github, Gitlab, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { GitTimeline } from './GitTimeline';
import { GitStagingPanel } from './GitStagingPanel';
import { GitDiffViewer } from './GitDiffViewer';
import { GitConflictResolver } from './GitConflictResolver';
import { GitConsole } from './GitConsole';
import { GitSidebar } from './GitSidebar';
import { ResizableDivider } from './ResizableDivider';
import { CommitDiffModal } from './CommitDiffModal';
import { GitInitPanel } from './GitInitPanel';
import { GitConflictModal } from './GitConflictModal';
import { useGitStore, EMPTY_REPO_DATA } from '../stores/gitStore';
import { AccountManagerModal } from './AccountManagerModal';
import { CloneRepoModal } from './CloneRepoModal';

function detectProviderFromUrl(remoteUrl: string): 'github' | 'gitlab' | null {
    if (!remoteUrl) return null;
    if (remoteUrl.includes('github.com')) return 'github';
    if (remoteUrl.toLowerCase().includes('gitlab')) return 'gitlab';
    return null;
}

const MIN_PANEL = 150;
const MAX_PANEL = 800;

export const GitPanel: React.FC = () => {
    const { state } = useWorkspace();
    const ui = useGitStore(s => s.ui);
    const setUi = useGitStore(s => s.setUi);
    const fetchRepo = useGitStore(s => s.fetchRepo);
    const fetchAll = useGitStore(s => s.fetchAll);
    const fetchStatus = useGitStore(s => s.fetchStatus);

    const invalidate = useGitStore(s => s.invalidate);
    const ensureRepo = useGitStore(s => s.ensureRepo);
    const repoData = useGitStore(s => s.repos[ui.activeTab ?? ''] ?? EMPTY_REPO_DATA);

    const accounts = useGitStore(s => s.accounts);
    const repoAccounts = useGitStore(s => s.repoAccounts);
    const setRepoAccount = useGitStore(s => s.setRepoAccount);
    const getActiveAccount = useGitStore(s => s.getActiveAccount);

    const [activeDiffFile, setActiveDiffFile] = useState<{ file: string; mode: 'staged' | 'unstaged' | 'conflicted'; line?: number } | null>(null);
    const [selectedCommit, setSelectedCommit] = useState<{ hash: string; message: string; author: string; date: string } | null>(null);
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const [detectedAccounts, setDetectedAccounts] = useState<typeof accounts>([]);
    const activeAccount = ui.activeTab ? getActiveAccount(ui.activeTab) : undefined;

    useEffect(() => {
        if (!ui.activeTab) return;
        ensureRepo(ui.activeTab);
        fetchRepo(ui.activeTab).then(() => {
            const repo = useGitStore.getState().repos[ui.activeTab!];
            if (repo?.isGitRepo === 'initialized') {
                fetchAll(ui.activeTab!, false);
            }
        });
    }, [ui.activeTab]);

    const handleTabChange = (path: string) => {
        setUi({ activeTab: path });
        setActiveDiffFile(null);
        setSelectedCommit(null);
        ensureRepo(path);
        fetchRepo(path).then(() => {
            const repo = useGitStore.getState().repos[path];
            if (repo?.isGitRepo === 'initialized') {
                fetchAll(path, false);
            }
        });
    };

    const handleStatusRefresh = () => {
        if (ui.activeTab) { invalidate(ui.activeTab, 'status'); fetchStatus(ui.activeTab, true); }
    };
    const handleBranchRefresh = () => {
        if (ui.activeTab) { invalidate(ui.activeTab); fetchAll(ui.activeTab, true); }
    };

    const handleRefreshAll = useCallback(() => {
        if (!ui.activeTab) return;
        invalidate(ui.activeTab);
        fetchAll(ui.activeTab, true);
    }, [ui.activeTab, invalidate, fetchAll]);

    useEffect(() => {
        if (!repoData.status.isMergeInProgress) {
            setIsConflictModalOpen(false);
        }
    }, [repoData.status.isMergeInProgress]);

    useEffect(() => {
        if (!ui.activeTab) { setDetectedAccounts([]); return; }
        if (repoAccounts[ui.activeTab]) { setDetectedAccounts([]); return; }
        if (accounts.length === 0) { setDetectedAccounts([]); return; }

        invoke<{ success: boolean; stdout: string }>('git_execute', {
            projectPath: ui.activeTab,
            args: ['remote', 'get-url', 'origin'],
        }).then(res => {
            if (!res.success) { setDetectedAccounts([]); return; }
            const provider = detectProviderFromUrl(res.stdout.trim());
            if (!provider) { setDetectedAccounts([]); return; }
            const matches = accounts.filter(a => a.provider === provider);
            if (matches.length === 1) {
                setRepoAccount(ui.activeTab!, matches[0].id);
                setDetectedAccounts([]);
            } else {
                setDetectedAccounts(matches);
            }
        }).catch(() => setDetectedAccounts([]));
    }, [ui.activeTab, repoAccounts, accounts]);

    const resizeSidebar = useCallback((delta: number) => {
        setUi({ sidebarWidth: Math.min(MAX_PANEL, Math.max(MIN_PANEL, ui.sidebarWidth + delta)) });
    }, [ui.sidebarWidth, setUi]);

    const resizeStaging = useCallback((delta: number) => {
        setUi({ stagingWidth: Math.min(MAX_PANEL, Math.max(MIN_PANEL, ui.stagingWidth - delta)) });
    }, [ui.stagingWidth, setUi]);

    return (
        <div className="relative flex flex-col h-full w-full min-h-0 bg-slate-900 overflow-hidden">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800 shrink-0 pr-4">
                <div className="flex items-end overflow-x-auto scrollbar-hide">
                    {state.projects.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 font-mono">No Repositories Discovered</div>
                    ) : (
                        state.projects.map(project => (
                            <button
                                key={project.path as string}
                                onClick={() => handleTabChange(project.path as string)}
                                className={`px-4 py-2 text-xs font-bold transition-colors border-r border-slate-800 ${ui.activeTab === project.path ? 'bg-slate-900 text-nexus-accent border-t-2 border-t-nexus-accent' : 'bg-slate-950 text-slate-500 hover:bg-slate-900 hover:text-slate-300 border-t-2 border-transparent'}`}
                            >
                                {project.name}
                            </button>
                        ))
                    )}
                </div>
                <div className="flex items-center space-x-1 pl-4">
                    {repoData && Object.values(repoData.loading).some(Boolean) && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 animate-pulse mr-2">
                            <RefreshCw size={10} className="animate-spin" /> Actualizando...
                        </span>
                    )}
                    {/* Clone button */}
                    <button
                        onClick={() => setIsCloneModalOpen(true)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 transition-colors mr-1 text-slate-300"
                        title="Clonar repositorio"
                    >
                        <Download size={11} />
                        <span>Clonar</span>
                    </button>
                    {/* Badge de cuenta activa */}
                    {ui.activeTab && (
                        <button
                            onClick={() => setIsAccountModalOpen(true)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 transition-colors mr-1 text-slate-300"
                            title="Gestionar cuentas"
                        >
                            {activeAccount ? (
                                <>
                                    {activeAccount.provider === 'github'
                                        ? <Github size={11} className="text-slate-400" />
                                        : <Gitlab size={11} className="text-slate-400" />
                                    }
                                    <span>{activeAccount.alias}</span>
                                </>
                            ) : (
                                <span className="text-slate-500">+ Cuenta</span>
                            )}
                        </button>
                    )}
                    <button
                        onClick={() => setIsAccountModalOpen(true)}
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                        title="Repository Settings"
                    >
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            {/* Banner auto-detección: múltiples cuentas coinciden */}
            {detectedAccounts.length > 1 && ui.activeTab && (
                <div className="flex items-center gap-2 px-4 py-2 bg-nexus-accent/10 border-b border-nexus-accent/30 text-xs text-slate-300 shrink-0">
                    <span>Se detectaron {detectedAccounts.length} cuentas para este repo. Selecciona:</span>
                    {detectedAccounts.map(a => (
                        <button
                            key={a.id}
                            onClick={() => { setRepoAccount(ui.activeTab!, a.id); setDetectedAccounts([]); }}
                            className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium"
                        >
                            {a.alias}
                        </button>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {!ui.activeTab ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 p-8 text-center text-sm">
                        Select a repository tab to manage Git operations.
                    </div>
                ) : (repoData.isGitRepo === 'not_initialized' || repoData.isGitRepo === 'empty_repo') ? (
                    <GitInitPanel
                        projectPath={ui.activeTab}
                        initialStep={repoData.isGitRepo === 'empty_repo' ? 2 : 1}
                        onInitialized={() => {
                            if (ui.activeTab) {
                                invalidate(ui.activeTab);
                                fetchRepo(ui.activeTab).then(() => {
                                    const repo = useGitStore.getState().repos[ui.activeTab!];
                                    if (repo?.isGitRepo === 'initialized') {
                                        fetchAll(ui.activeTab!, true);
                                    }
                                });
                            }
                            handleStatusRefresh();
                        }}
                    />
                ) : (
                    <div className="flex-1 flex w-full min-h-0">
                        {/* Left: Branches and Stash (resizable) */}
                        <div style={{ width: ui.sidebarWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                            <GitSidebar
                                projectPath={ui.activeTab}
                                onRefreshRequest={handleBranchRefresh}
                            />
                        </div>

                        <ResizableDivider direction="horizontal" onResize={resizeSidebar} className="bg-slate-900" />

                        {/* Center: Commit Timeline or Diff Viewer (flex) */}
                        <div className="flex-1 min-w-[200px] min-h-0 border-r border-slate-800 relative flex flex-col overflow-hidden">
                            {activeDiffFile ? (
                                activeDiffFile.mode === 'conflicted' ? (
                                    <GitConflictResolver
                                        projectPath={ui.activeTab}
                                        file={activeDiffFile.file}
                                        onClose={() => setActiveDiffFile(null)}
                                        onRefreshRequest={handleStatusRefresh}
                                    />
                                ) : (
                                    <GitDiffViewer
                                        projectPath={ui.activeTab}
                                        file={activeDiffFile.file}
                                        mode={activeDiffFile.mode}
                                        targetLine={activeDiffFile.line}
                                        onClose={() => setActiveDiffFile(null)}
                                        onRefreshRequest={handleStatusRefresh}
                                    />
                                )
                            ) : (
                                <GitTimeline
                                    projectPath={ui.activeTab}
                                    onCommitSelect={(hash, message, author, date) =>
                                        setSelectedCommit({ hash, message, author, date })
                                    }
                                />
                            )}
                        </div>

                        <ResizableDivider direction="horizontal" onResize={resizeStaging} className="bg-slate-900" />

                        {/* Right: Staging & Commit (resizable) */}
                        <div style={{ width: ui.stagingWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                            <GitStagingPanel
                                projectPath={ui.activeTab}
                                onDiffRequest={(file, mode, line) => setActiveDiffFile({ file, mode, line })}
                                onOpenConflictModal={() => setIsConflictModalOpen(true)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom: Git Logs Console Drawer */}
            <GitConsole />

            {/* Commit Diff Modal */}
            {selectedCommit && ui.activeTab && (
                <CommitDiffModal
                    projectPath={ui.activeTab}
                    commitHash={selectedCommit.hash}
                    commitMessage={selectedCommit.message}
                    commitAuthor={selectedCommit.author}
                    commitDate={selectedCommit.date}
                    onClose={() => setSelectedCommit(null)}
                />
            )}

            {isAccountModalOpen && (
                <AccountManagerModal
                    repoPath={ui.activeTab}
                    onClose={() => setIsAccountModalOpen(false)}
                />
            )}

            {isCloneModalOpen && (
                <CloneRepoModal
                    onClose={() => setIsCloneModalOpen(false)}
                />
            )}

            {isConflictModalOpen && repoData.status.isMergeInProgress && ui.activeTab && (
                <GitConflictModal
                    projectPath={ui.activeTab}
                    conflictedFiles={repoData.status.files.filter(f => f.isConflicted).map(f => f.file)}
                    onClose={() => setIsConflictModalOpen(false)}
                    onRefreshAll={handleRefreshAll}
                />
            )}
        </div>
    );
};
