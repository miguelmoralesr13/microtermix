import React, { useState, useCallback, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Settings, RefreshCw, Github, Gitlab, Download, AlertCircle, GitCommitHorizontal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { GitTimeline } from './GitTimeline';
import { GitStagingPanel } from './GitStagingPanel';
import { GitHunkStaging } from './GitHunkStaging';
import { GitConflictResolver } from './GitConflictResolver';

interface ActiveDiff {
    file: string;
    mode: 'staged' | 'unstaged' | 'conflicted';
    line?: number;
    hunkMode?: boolean;
}
import { GitConsole } from './GitConsole';
import { GitSidebar } from './GitSidebar';
import { GithubPanel } from './GithubPanel';
import { ResizableDivider } from '../layout/ResizableDivider';
import { CommitDiffModal } from './CommitDiffModal';
import { GitInitPanel } from './GitInitPanel';
import { GitConflictModal } from './GitConflictModal';
import { useWorkflowRuns } from '../../hooks/queries/useGitQueries';
import { useGitStore } from '../../stores/gitStore';
import { AccountManagerModal } from './AccountManagerModal';
import { CloneRepoModal } from './CloneRepoModal';
import { cn } from '../../lib/utils';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { toast } from 'sonner';
import { useGitRepoCheck, useGitStatus, useGitAheadBehind, gitKeys } from '../../hooks/queries/useGitQueries';
import { useQueryClient } from '@tanstack/react-query';

// Leaf component: subscribes to workflow-runs cache (observer-only, enabled=false),
// renders a pulsing amber dot when any run is in_progress or queued.
const GithubTabPulse: React.FC<{ projectPath: string }> = ({ projectPath }) => {
    const { data } = useWorkflowRuns(projectPath, false);
    const hasActive = data?.some(r => r.status === 'in_progress' || r.status === 'queued') ?? false;
    if (!hasActive) return null;
    return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block shrink-0" />;
};

function detectProviderFromUrl(remoteUrl: string): 'github' | 'gitlab' | null {
    if (!remoteUrl) return null;
    if (remoteUrl.includes('github.com')) return 'github';
    if (remoteUrl.toLowerCase().includes('gitlab')) return 'gitlab';
    return null;
}

const MIN_PANEL = 150;
const MAX_PANEL = 800;

export const GitPanel: React.FC = () => {
    const { state, scanWorkspace } = useWorkspace();
    const queryClient = useQueryClient();

    // Selectores Zustand (Solo UI y Cuentas)
    const activeTab = useGitStore(s => s.ui.activeTab);
    const sidebarWidth = useGitStore(s => s.ui.sidebarWidth);
    const stagingWidth = useGitStore(s => s.ui.stagingWidth);
    const setUi = useGitStore(s => s.setUi);
    const accounts = useGitStore(s => s.accounts);
    const gitRepoAccounts = useGitStore(s => s.repoAccounts);
    const setRepoAccount = useGitStore(s => s.setRepoAccount);
    const getActiveAccount = useGitStore(s => s.getActiveAccount);

    // Queries React Query
    const { data: isGitRepo, isLoading: loadingRepo } = useGitRepoCheck(activeTab);
    const { data: statusData, isLoading: loadingStatus } = useGitStatus(activeTab);
    const { isLoading: loadingAhead } = useGitAheadBehind(activeTab);

    // Inicializar activeTab si no hay uno
    useEffect(() => {
        if (!activeTab && state.projects.length > 0) {
            setUi({ activeTab: state.projects[0].path as string });
        }
    }, [activeTab, state.projects, setUi]);

    const [activeDiffFile, setActiveDiffFile] = useState<ActiveDiff | null>(null);
    const [selectedCommit, setSelectedCommit] = useState<{ hash: string; message: string; author: string; date: string } | null>(null);
    const [centerTab, setCenterTab] = useState<'timeline' | 'github'>('timeline');
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const [detectedAccounts, setDetectedAccounts] = useState<typeof accounts>([]);
    
    const activeAccount = activeTab ? getActiveAccount(activeTab) : undefined;
    const isGithubAccount = activeAccount?.provider === 'github';
    const showBanner = !!activeTab && !activeAccount;

    // Si la cuenta deja de ser GitHub, volver al timeline
    useEffect(() => {
        if (!isGithubAccount) setCenterTab('timeline');
    }, [isGithubAccount]);

    const handleRefreshAll = useCallback(() => {
        if (!activeTab) return;
        queryClient.invalidateQueries({ queryKey: gitKeys.repo(activeTab) });
    }, [activeTab, queryClient]);

    const handleTabChange = (path: string) => {
        setUi({ activeTab: path });
        setActiveDiffFile(null);
        setSelectedCommit(null);
        setCenterTab('timeline');
    };

    // Focus background fetch worker on the current active project
    useEffect(() => {
        const label = getCurrentWindow().label;
        if (activeTab) {
            invoke('set_active_git_project', { windowLabel: label, projectPath: activeTab }).catch(console.error);
            invoke('watch_repo', { projectPath: activeTab }).catch(console.error);
        }
        return () => {
            invoke('set_active_git_project', { windowLabel: label, projectPath: null }).catch(console.error);
            if (activeTab) invoke('stop_watching_repo', { projectPath: activeTab }).catch(console.error);
        };
    }, [activeTab]);

    useEffect(() => {
        if (statusData && !statusData.isMergeInProgress && !statusData.isRebaseInProgress) {
            setIsConflictModalOpen(false);
        }
    }, [statusData]);

    useEffect(() => {
        if (!activeTab) { setDetectedAccounts([]); return; }
        if (gitRepoAccounts[activeTab]) { setDetectedAccounts([]); return; }
        if (accounts.length === 0) { setDetectedAccounts([]); return; }

        invoke<{ success: boolean; stdout: string }>('git_execute', {
            projectPath: activeTab,
            args: ['remote', 'get-url', 'origin'],
        }).then(res => {
            if (!res.success) {
                setDetectedAccounts(accounts);
                return;
            }
            const provider = detectProviderFromUrl(res.stdout.trim());
            if (!provider) {
                setDetectedAccounts(accounts);
                return;
            }
            const matches = accounts.filter(a => a.provider === provider);
            setDetectedAccounts(matches.length > 0 ? matches : accounts);
        }).catch(() => setDetectedAccounts(accounts));
    }, [activeTab, gitRepoAccounts, accounts]);

    const resizeSidebar = useCallback((delta: number) => {
        setUi({ sidebarWidth: Math.min(MAX_PANEL, Math.max(MIN_PANEL, sidebarWidth + delta)) });
    }, [sidebarWidth, setUi]);

    const resizeStaging = useCallback((delta: number) => {
        setUi({ stagingWidth: Math.min(MAX_PANEL, Math.max(MIN_PANEL, stagingWidth - delta)) });
    }, [stagingWidth, setUi]);

    const isSyncing = loadingRepo || loadingStatus || loadingAhead;

    return (
        <div className="flex-1 relative flex flex-col h-full w-full min-h-0 bg-slate-900 overflow-hidden">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800 shrink-0 pr-4 h-11 overflow-hidden">
                <Tabs value={activeTab || ""} onValueChange={handleTabChange} className="h-full flex flex-col justify-end min-w-0 flex-1 overflow-hidden">
                    <div className="overflow-x-auto overflow-y-hidden scrollbar-none flex-1 flex flex-col justify-end min-w-0">
                        <TabsList className="bg-transparent h-10 gap-0 p-0 rounded-none border-b-0 w-max min-w-full flex-nowrap">
                            {state.projects.length === 0 ? (
                                <div className="px-4 py-2.5 text-[10px] text-slate-500 font-mono uppercase tracking-widest">No Repositories</div>
                            ) : (
                                state.projects.map(project => (
                                    <TabsTrigger
                                        key={project.path as string}
                                        value={project.path as string}
                                        className={cn(
                                            "h-10 px-4 rounded-none border-t-2 border-transparent transition-all shrink-0",
                                            "data-[state=active]:bg-slate-900 data-[state=active]:text-microtermix-accent data-[state=active]:border-t-microtermix-accent",
                                            "data-[state=inactive]:text-slate-500 hover:data-[state=inactive]:bg-slate-900 hover:data-[state=inactive]:text-slate-300",
                                            "text-xs font-bold"
                                        )}
                                    >
                                        {project.name}
                                    </TabsTrigger>
                                ))
                            )}
                        </TabsList>
                    </div>
                </Tabs>

                <div className="flex items-center space-x-1 pl-4 h-full">
                    {isSyncing && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 animate-pulse mr-3">
                            <RefreshCw size={10} className="animate-spin" />
                            <span className="font-mono uppercase tracking-tighter">Syncing...</span>
                        </div>
                    )}

                    {/* Clone button */}
                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsCloneModalOpen(true)}
                                className="h-7 gap-1.5 px-2.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 border border-slate-800/50"
                            >
                                <Download size={13} />
                                <span className="text-[11px] font-bold">Clonar</span>
                            </Button>
                        } />
                        <TooltipContent>Clonar repositorio desde URL</TooltipContent>
                    </Tooltip>

                    {/* Badge de cuenta activa */}
                    {activeTab && (
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsAccountModalOpen(true)}
                                    className="h-7 gap-1.5 px-2.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 border border-slate-800/50"
                                >
                                    {activeAccount ? (
                                        <>
                                            {activeAccount.provider === 'github'
                                                ? <Github size={13} className="text-slate-400" />
                                                : <Gitlab size={13} className="text-slate-400" />
                                            }
                                            <span className="text-[11px] font-bold">{activeAccount.alias}</span>
                                            {activeAccount.provider === 'github' && (
                                                <GithubTabPulse projectPath={activeTab} />
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Settings size={13} className="text-slate-500" />
                                            <span className="text-[11px] font-bold text-slate-500">Configurar</span>
                                        </>
                                    )}
                                </Button>
                            } />
                            <TooltipContent>Gestionar cuentas y configuración de Git</TooltipContent>
                        </Tooltip>
                    )}

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setIsAccountModalOpen(true)}
                                className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                <Settings size={14} />
                            </Button>
                        } />
                        <TooltipContent>Ajustes del Repositorio</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Banner auto-detección */}
            {showBanner && (
                <div className="flex items-center gap-3 px-4 py-1.5 bg-blue-600/15 border-b border-blue-500/30 text-xs shrink-0 backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200">
                    {accounts.length === 0 ? (
                        <>
                            <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                                <AlertCircle size={14} />
                                <span>No hay cuentas Git configuradas:</span>
                            </div>
                            <button
                                onClick={() => setIsAccountModalOpen(true)}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-sm"
                            >
                                Configurar primera cuenta
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                                <AlertCircle size={14} />
                                <span>Asociar cuenta Git:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(detectedAccounts.length > 0 ? detectedAccounts : accounts).map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => {
                                            setRepoAccount(activeTab!, a.id);
                                            setDetectedAccounts([]);
                                            toast.success(`Cuenta "${a.alias}" asociada al repositorio`);
                                        }}
                                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 hover:border-blue-500 transition-all shadow-sm"
                                    >
                                        {a.alias}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={() => setIsAccountModalOpen(true)}
                        className="text-[10px] text-slate-500 hover:text-blue-400 font-bold uppercase transition-colors"
                    >
                        Gestionar cuentas
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {!activeTab ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
                        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-6 border border-slate-700/50">
                            <Github className="text-slate-500" size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Workspace sin repositorios</h2>
                        <p className="text-slate-400 max-w-sm mb-8">
                            Añade tus proyectos locales o clona repositorios remotos para empezar a gestionar tus cambios Git.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button 
                                onClick={() => state.currentPath && scanWorkspace(state.currentPath)}
                                className="bg-microtermix-accent hover:bg-microtermix-accent/80 text-white font-bold px-6"
                            >
                                <RefreshCw size={14} className="mr-2" />
                                Escanear Workspace
                            </Button>
                            <Button 
                                variant="outline"
                                onClick={() => setIsCloneModalOpen(true)}
                                className="border-slate-700 hover:bg-slate-800 text-slate-300 font-bold px-6"
                            >
                                <Download size={14} className="mr-2" />
                                Clonar Repositorio
                            </Button>
                        </div>
                        
                        <button 
                            onClick={() => setIsAccountModalOpen(true)}
                            className="mt-8 text-xs text-slate-500 hover:text-microtermix-neon transition-colors font-medium"
                        >
                            ¿Necesitas configurar tus credenciales primero?
                        </button>
                    </div>
                ) : (isGitRepo === undefined || loadingRepo) ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm gap-2">
                        <RefreshCw size={14} className="animate-spin" />
                        Detecting repository...
                    </div>
                ) : (isGitRepo === 'not_initialized' || isGitRepo === 'empty_repo') ? (
                    <GitInitPanel
                        projectPath={activeTab}
                        initialStep={isGitRepo === 'empty_repo' ? 2 : 1}
                        onInitialized={() => handleRefreshAll()}
                    />
                ) : (
                    <div className="flex-1 flex w-full min-h-0">
                        {/* Left: Branches and Stash (resizable) */}
                        <div style={{ width: sidebarWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                            <GitSidebar
                                projectPath={activeTab}
                                onRefreshRequest={handleRefreshAll}
                            />
                        </div>

                        <ResizableDivider direction="horizontal" onResize={resizeSidebar} className="bg-slate-900" />

                        {/* Center: Timeline / GitHub (tabs visibles solo con cuenta GitHub) */}
                        <div className="flex-1 min-w-[200px] min-h-0 border-r border-slate-800 relative flex flex-col overflow-hidden">
                            {/* Tab bar — solo cuando hay cuenta GitHub y no hay diff abierto */}
                            {isGithubAccount && !activeDiffFile && (
                                <div className="flex shrink-0 border-b border-slate-800 bg-slate-950">
                                    <button
                                        onClick={() => setCenterTab('timeline')}
                                        className={cn(
                                            "flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors",
                                            centerTab === 'timeline'
                                                ? "border-microtermix-accent text-microtermix-accent"
                                                : "border-transparent text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        <GitCommitHorizontal size={13} />
                                        Timeline
                                    </button>
                                    <button
                                        onClick={() => setCenterTab('github')}
                                        className={cn(
                                            "flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors",
                                            centerTab === 'github'
                                                ? "border-amber-500 text-amber-400"
                                                : "border-transparent text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        <Github size={13} />
                                        GitHub
                                        {activeTab && <GithubTabPulse projectPath={activeTab} />}
                                    </button>
                                </div>
                            )}

                            {centerTab === 'github' && isGithubAccount && !activeDiffFile ? (
                                <GithubPanel projectPath={activeTab} />
                            ) : activeDiffFile ? (
                                activeDiffFile.mode === 'conflicted' ? (
                                    <GitConflictResolver
                                        projectPath={activeTab}
                                        file={activeDiffFile.file}
                                        onClose={() => setActiveDiffFile(null)}
                                        onRefreshRequest={() => queryClient.invalidateQueries({ queryKey: gitKeys.status(activeTab) })}
                                    />
                                ) : (
                                    <GitHunkStaging
                                        projectPath={activeTab}
                                        file={activeDiffFile.file}
                                        mode={activeDiffFile.mode as 'staged' | 'unstaged'}
                                        onClose={() => setActiveDiffFile(null)}
                                        onRefreshRequest={() => {
                                            queryClient.invalidateQueries({ queryKey: gitKeys.status(activeTab) });
                                            handleRefreshAll();
                                        }}
                                    />
                                )
                            ) : (
                                <GitTimeline
                                    projectPath={activeTab}
                                    onCommitSelect={(hash, message, author, date) =>
                                        setSelectedCommit({ hash, message, author, date })
                                    }
                                />
                            )}
                        </div>

                        {centerTab !== 'github' && (
                            <>
                                <ResizableDivider direction="horizontal" onResize={resizeStaging} className="bg-slate-900" />

                                {/* Right: Staging & Commit */}
                                <div style={{ width: stagingWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                                    <GitStagingPanel
                                        projectPath={activeTab}
                                        onDiffRequest={(file, mode, line) => setActiveDiffFile({ file, mode, line })}
                                        onOpenConflictModal={() => setIsConflictModalOpen(true)}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom: Global Git Terminal */}
            {activeTab && <GitConsole projectPath={activeTab} />}

            {/* Modals */}
            {selectedCommit && activeTab && (
                <CommitDiffModal
                    projectPath={activeTab}
                    commitHash={selectedCommit.hash}
                    commitMessage={selectedCommit.message}
                    commitAuthor={selectedCommit.author}
                    commitDate={selectedCommit.date}
                    onClose={() => setSelectedCommit(null)}
                />
            )}

            {isAccountModalOpen && (
                <AccountManagerModal
                    repoPath={activeTab || null}
                    onClose={() => setIsAccountModalOpen(false)}
                />
            )}

            {isCloneModalOpen && (
                <CloneRepoModal
                    onClose={() => setIsCloneModalOpen(false)}
                />
            )}

            {isConflictModalOpen && statusData && (statusData.isMergeInProgress || statusData.isRebaseInProgress) && activeTab && (
                <GitConflictModal
                    projectPath={activeTab}
                    conflictedFiles={statusData.files.filter(f => f.isConflicted).map(f => f.file)}
                    isRebase={!!statusData.isRebaseInProgress}
                    onClose={() => setIsConflictModalOpen(false)}
                    onRefreshAll={handleRefreshAll}
                />
            )}
        </div>
    );
};
