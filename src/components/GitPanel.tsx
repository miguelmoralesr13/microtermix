import React, { useState, useCallback, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { GitBranch, Settings, Github, Gitlab, Server } from 'lucide-react';
import { GitConfigModal } from './GitConfigModal';
import { GitTimeline } from './GitTimeline';
import { GitStagingPanel } from './GitStagingPanel';
import { GitDiffViewer } from './GitDiffViewer';
import { GitConsole } from './GitConsole';
import { GitSidebar, BranchFilter } from './GitSidebar';
import { ResizableDivider } from './ResizableDivider';
import { CommitDiffModal } from './CommitDiffModal';

const STORAGE_SIDEBAR = 'nexus-git-sidebar-width';
const STORAGE_STAGING = 'nexus-git-staging-width';
const MIN_PANEL = 180;
const MAX_PANEL = 600;
const DEFAULT_SIDEBAR = 240;
const DEFAULT_STAGING = 320;

function loadStored(key: string, defaultVal: number): number {
    try {
        const v = localStorage.getItem(key);
        if (v != null) {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= MIN_PANEL && n <= MAX_PANEL) return n;
        }
    } catch (_) { }
    return defaultVal;
}

export const GitPanel: React.FC = () => {
    const { state } = useWorkspace();
    const [activeGitTab, setActiveGitTab] = useState<string | null>(
        state.projects.length > 0 ? state.projects[0].path as string : null
    );
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [activeDiffFile, setActiveDiffFile] = useState<{ file: string, mode: 'staged' | 'unstaged', line?: number } | null>(null);
    const [selectedCommit, setSelectedCommit] = useState<{ hash: string; message: string; author: string; date: string; } | null>(null);

    const [sidebarWidth, setSidebarWidth] = useState(() => loadStored(STORAGE_SIDEBAR, DEFAULT_SIDEBAR));
    const [stagingWidth, setStagingWidth] = useState(() => loadStored(STORAGE_STAGING, DEFAULT_STAGING));
    const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');

    useEffect(() => {
        localStorage.setItem(STORAGE_SIDEBAR, String(sidebarWidth));
    }, [sidebarWidth]);
    useEffect(() => {
        localStorage.setItem(STORAGE_STAGING, String(stagingWidth));
    }, [stagingWidth]);

    const resizeSidebar = useCallback((delta: number) => {
        setSidebarWidth(w => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w + delta)));
    }, []);
    const resizeStaging = useCallback((delta: number) => {
        setStagingWidth(w => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w - delta)));
    }, []);

    const handleStatusRefresh = () => setRefreshKey(prev => prev + 1);

    const isConfigured = state.gitConfig.provider !== 'none' && state.gitConfig.token !== '';

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900 overflow-hidden">
            {/* Header / Tabs */}
            <div className="flex items-center bg-slate-950 border-b border-slate-800 shrink-0 pr-4">
                <div className="flex-1 flex overflow-x-auto scrollbar-hide border-r border-slate-800">
                    {state.projects.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 font-mono">No Repositories Discovered</div>
                    ) : (
                        state.projects.map(project => (
                            <button
                                key={project.path as string}
                                onClick={() => setActiveGitTab(project.path as string)}
                                className={`px-4 py-3 text-sm font-mono whitespace-nowrap border-b-2 transition-colors ${activeGitTab === project.path
                                    ? 'border-nexus-neon text-slate-100 bg-slate-900'
                                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                    }`}
                            >
                                <GitBranch size={14} className="inline mr-2 opacity-50" />
                                {project.name}
                            </button>
                        ))
                    )}
                </div>

                {/* Settings Toggle */}
                <div className="flex items-center pl-4 shrink-0 space-x-3">
                    {isConfigured ? (
                        <div className="flex items-center text-xs px-2 py-1 bg-nexus-success/10 border border-nexus-success/20 rounded font-medium text-nexus-success">
                            {state.gitConfig.provider === 'gitlab' && <Gitlab size={12} className="mr-1" />}
                            {state.gitConfig.provider === 'github' && <Github size={12} className="mr-1" />}
                            {state.gitConfig.provider === 'bitbucket' && <Server size={12} className="mr-1" />}
                            Connected
                        </div>
                    ) : (
                        <div className="text-xs text-slate-500 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-slate-600 mr-2" />
                            Offline Mode
                        </div>
                    )}
                    <button
                        onClick={() => setIsConfigModalOpen(true)}
                        className={`p-2 rounded transition-colors ${isConfigModalOpen ? 'bg-nexus-neon text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                        title="Configure Git Provider"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {!activeGitTab ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 p-8 text-center text-sm">
                        Select a repository tab to manage Git operations.
                    </div>
                ) : (
                    <>
                        <div className="flex-1 flex w-full min-h-0">
                            {/* Left: Branches and Stash (resizable) */}
                            <div style={{ width: sidebarWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }} className="flex flex-col shrink-0 min-h-0 overflow-hidden">
                                <GitSidebar
                                    projectPath={activeGitTab}
                                    refreshKey={refreshKey}
                                    onRefreshRequest={handleStatusRefresh}
                                    branchFilter={branchFilter}
                                    onBranchFilterChange={setBranchFilter}
                                />
                            </div>

                            <ResizableDivider direction="horizontal" onResize={resizeSidebar} className="bg-slate-900" />

                            {/* Center: Commit Timeline or Diff Viewer (flex) */}
                            <div className="flex-1 min-w-[200px] min-h-0 border-r border-slate-800 relative flex flex-col overflow-hidden">
                                {activeDiffFile ? (
                                    <GitDiffViewer
                                        projectPath={activeGitTab}
                                        file={activeDiffFile.file}
                                        mode={activeDiffFile.mode}
                                        targetLine={activeDiffFile.line}
                                        onClose={() => setActiveDiffFile(null)}
                                        onRefreshRequest={handleStatusRefresh}
                                    />
                                ) : (
                                    <GitTimeline
                                        key={`timeline-${activeGitTab}-${refreshKey}`}
                                        projectPath={activeGitTab}
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
                                    key={`staging-${activeGitTab}-${refreshKey}`}
                                    projectPath={activeGitTab}
                                    onStatusRefresh={handleStatusRefresh}
                                    onDiffRequest={(file, mode, line) => setActiveDiffFile({ file, mode, line })}
                                />
                            </div>
                        </div>

                        {/* Bottom: Git Logs Console Drawer */}
                        <GitConsole />
                    </>
                )}
            </div>

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
