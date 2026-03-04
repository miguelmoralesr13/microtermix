import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspace } from '../context/WorkspaceContext';
import { Settings, Github, Gitlab, Server as Bitbucket } from 'lucide-react';
import { GitConfigModal } from './GitConfigModal';
import { GitTimeline } from './GitTimeline';
import { GitStagingPanel } from './GitStagingPanel';
import { GitDiffViewer } from './GitDiffViewer';
import { GitConflictResolver } from './GitConflictResolver';
import { GitConsole } from './GitConsole';
import { GitSidebar, BranchFilter } from './GitSidebar';
import { ResizableDivider } from './ResizableDivider';
import { CommitDiffModal } from './CommitDiffModal';
import { GithubPanel } from './GithubPanel';
import { GitInitPanel } from './GitInitPanel';

const STORAGE_SIDEBAR = 'nexus-git-sidebar-width';
const STORAGE_STAGING = 'nexus-git-staging-width';
const STORAGE_GIT_TAB = 'nexus-git-active-tab';
const STORAGE_GIT_SUBTAB = 'nexus-git-active-subtab';
const MIN_PANEL = 150;
const MAX_PANEL = 800;
const DEFAULT_SIDEBAR = 230;
const DEFAULT_STAGING = 280;

export const GitPanel: React.FC = () => {
    const { state } = useWorkspace();
    const [activeGitTab, setActiveGitTab] = useState<string | null>(() => {
        const saved = localStorage.getItem(STORAGE_GIT_TAB);
        if (saved && state.projects.some(p => p.path === saved)) return saved;
        return state.projects.length > 0 ? state.projects[0].path as string : null;
    });
    const [activeSubTab, setActiveSubTab] = useState<'git' | 'remote'>(() => {
        const saved = localStorage.getItem(STORAGE_GIT_SUBTAB);
        return saved === 'remote' ? 'remote' : 'git';
    });

    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
    const [stagingWidth, setStagingWidth] = useState(DEFAULT_STAGING);
    const [activeDiffFile, setActiveDiffFile] = useState<{ file: string; mode: 'staged' | 'unstaged' | 'conflicted'; line?: number } | null>(null);
    const [selectedCommit, setSelectedCommit] = useState<{ hash: string; message: string; author: string; date: string } | null>(null);

    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [statusRefreshKey, setStatusRefreshKey] = useState(0);
    const [branchRefreshKey, setBranchRefreshKey] = useState(0);
    const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
    const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');
    const [isGitRepo, setIsGitRepo] = useState<'not_initialized' | 'empty_repo' | 'initialized' | null>(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_SIDEBAR, String(sidebarWidth));
    }, [sidebarWidth]);
    useEffect(() => {
        localStorage.setItem(STORAGE_STAGING, String(stagingWidth));
    }, [stagingWidth]);
    useEffect(() => {
        if (activeGitTab) localStorage.setItem(STORAGE_GIT_TAB, activeGitTab);
    }, [activeGitTab]);
    useEffect(() => {
        localStorage.setItem(STORAGE_GIT_SUBTAB, activeSubTab);
    }, [activeSubTab]);

    useEffect(() => {
        if (!activeGitTab) {
            setIsGitRepo(null);
            return;
        }
        const checkRepo = async () => {
            try {
                const isInsideRes: any = await invoke('git_execute', { projectPath: activeGitTab, args: ['rev-parse', '--is-inside-work-tree'] });
                if (isInsideRes.success && isInsideRes.stdout.trim() === 'true') {
                    const headRes: any = await invoke('git_execute', { projectPath: activeGitTab, args: ['rev-parse', 'HEAD'] });
                    if (!headRes.success) {
                        setIsGitRepo('empty_repo');
                    } else {
                        setIsGitRepo('initialized');
                    }
                } else {
                    setIsGitRepo('not_initialized');
                }
            } catch (e) {
                setIsGitRepo('not_initialized');
            }
        };
        checkRepo();
    }, [activeGitTab]);

    const handleTabChange = (path: string) => {
        setActiveGitTab(path);
        setActiveDiffFile(null); // Clear diff when switching repos
        setSelectedCommit(null);
    };

    const handleStatusRefresh = () => {
        setStatusRefreshKey(prev => prev + 1);
    };

    const handleTimelineRefresh = () => {
        setTimelineRefreshKey(prev => prev + 1);
    };

    const handleBranchRefresh = () => {
        setBranchRefreshKey(prev => prev + 1);
        setStatusRefreshKey(prev => prev + 1); // Branch operations often affect working tree status
        setTimelineRefreshKey(prev => prev + 1); // Branch operations affect the commit graph
    };

    const resizeSidebar = useCallback((delta: number) => {
        setSidebarWidth(w => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w + delta)));
    }, []);
    const resizeStaging = useCallback((delta: number) => {
        setStagingWidth(w => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w - delta)));
    }, []);

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900 overflow-hidden">
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
                                className={`px-4 py-2 text-xs font-bold transition-colors border-r border-slate-800 ${activeGitTab === project.path ? 'bg-slate-900 text-nexus-accent border-t-2 border-t-nexus-accent' : 'bg-slate-950 text-slate-500 hover:bg-slate-900 hover:text-slate-300 border-t-2 border-transparent'}`}
                            >
                                {project.name}
                            </button>
                        ))
                    )}
                </div>
                <div className="flex items-center space-x-1 pl-4">
                    {activeGitTab && (
                        <>
                            <div className="flex bg-slate-800 rounded p-0.5 space-x-0.5 mr-2">
                                <button
                                    onClick={() => setActiveSubTab('git')}
                                    className={`px-3 py-1 text-xs font-bold rounded transition-colors ${activeSubTab === 'git' ? 'bg-slate-900 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Git
                                </button>
                                <button
                                    onClick={() => setActiveSubTab('remote')}
                                    className={`px-3 py-1 text-xs font-bold rounded transition-colors flex items-center ${activeSubTab === 'remote' ? 'bg-slate-900 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {state.gitConfig.provider === 'gitlab' ? (
                                        <Gitlab size={12} className="mr-1" />
                                    ) : state.gitConfig.provider === 'bitbucket' ? (
                                        <Bitbucket size={12} className="mr-1" />
                                    ) : (
                                        <Github size={12} className="mr-1" />
                                    )}
                                    {state.gitConfig.provider === 'gitlab' ? 'GitLab'
                                        : state.gitConfig.provider === 'bitbucket' ? 'Bitbucket'
                                            : state.gitConfig.provider === 'none' ? 'Remote'
                                                : 'GitHub'}
                                </button>
                            </div>
                        </>
                    )}
                    <button
                        onClick={() => setIsConfigModalOpen(true)}
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                        title="Repository Settings"
                    >
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {!activeGitTab ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 p-8 text-center text-sm">
                        Select a repository tab to manage Git operations.
                    </div>
                ) : (isGitRepo === 'not_initialized' || isGitRepo === 'empty_repo') ? (
                    <GitInitPanel
                        projectPath={activeGitTab}
                        initialStep={isGitRepo === 'empty_repo' ? 2 : 1}
                        onInitialized={() => {
                            setIsGitRepo('initialized');
                            handleStatusRefresh();
                        }}
                    />
                ) : (
                    <>
                        {activeSubTab === 'remote' ? (
                            <div className="flex-1 flex flex-col w-full min-h-0 bg-slate-900 overflow-hidden">
                                {state.gitConfig.provider === 'github' ? (
                                    <GithubPanel projectPath={activeGitTab} />
                                ) : state.gitConfig.provider === 'none' ? (
                                    <div className="flex-1 flex items-center justify-center flex-col text-slate-500 p-8 text-center">
                                        <Settings size={32} className="mb-4 text-slate-600" />
                                        <p>Go to settings (top right gear icon) to configure a Git Provider (GitHub, GitLab, etc).</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center flex-col text-slate-500 p-8 text-center">
                                        <p>Integration for {state.gitConfig.provider} is not yet implemented.</p>
                                        <p className="text-sm mt-2 opacity-70">Currently, only GitHub is fully supported.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex w-full min-h-0">
                                {/* Left: Branches and Stash (resizable) */}
                                <div style={{ width: sidebarWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                                    <GitSidebar
                                        projectPath={activeGitTab}
                                        refreshKey={branchRefreshKey}
                                        onRefreshRequest={handleBranchRefresh}
                                        branchFilter={branchFilter}
                                        onBranchFilterChange={setBranchFilter}
                                    />
                                </div>

                                <ResizableDivider direction="horizontal" onResize={resizeSidebar} className="bg-slate-900" />

                                {/* Center: Commit Timeline or Diff Viewer (flex) */}
                                <div className="flex-1 min-w-[200px] min-h-0 border-r border-slate-800 relative flex flex-col overflow-hidden">
                                    {activeDiffFile ? (
                                        activeDiffFile.mode === 'conflicted' ? (
                                            <GitConflictResolver
                                                projectPath={activeGitTab}
                                                file={activeDiffFile.file}
                                                onClose={() => setActiveDiffFile(null)}
                                                onRefreshRequest={handleStatusRefresh}
                                            />
                                        ) : (
                                            <GitDiffViewer
                                                projectPath={activeGitTab}
                                                file={activeDiffFile.file}
                                                mode={activeDiffFile.mode}
                                                targetLine={activeDiffFile.line}
                                                onClose={() => setActiveDiffFile(null)}
                                                onRefreshRequest={handleStatusRefresh}
                                            />
                                        )
                                    ) : (
                                        <GitTimeline
                                            projectPath={activeGitTab}
                                            refreshKey={timelineRefreshKey}
                                            onCommitSelect={(hash, message, author, date) =>
                                                setSelectedCommit({ hash, message, author, date })
                                            }
                                        />
                                    )}
                                </div>

                                <ResizableDivider direction="horizontal" onResize={resizeStaging} className="bg-slate-900" />

                                {/* Right: Staging & Commit (resizable) */}
                                <div style={{ width: stagingWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                                    <GitStagingPanel
                                        projectPath={activeGitTab}
                                        refreshKey={statusRefreshKey}
                                        onStatusRefresh={handleStatusRefresh}
                                        onTimelineRefresh={handleTimelineRefresh}
                                        onDiffRequest={(file, mode, line) => setActiveDiffFile({ file, mode, line })}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom: Git Logs Console Drawer */}
            <GitConsole />

            {/* Config Modal placeholder */}
            {isConfigModalOpen && (
                <GitConfigModal onClose={() => setIsConfigModalOpen(false)} />
            )}

            {/* Commit Diff Modal */}
            {selectedCommit && activeGitTab && (
                <CommitDiffModal
                    projectPath={activeGitTab}
                    commitHash={selectedCommit.hash}
                    commitMessage={selectedCommit.message}
                    commitAuthor={selectedCommit.author}
                    commitDate={selectedCommit.date}
                    onClose={() => setSelectedCommit(null)}
                />
            )}
        </div>
    );
};
