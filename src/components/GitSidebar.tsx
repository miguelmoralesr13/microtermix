import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitBranch, GitMerge, FileArchive, Download, UploadCloud, RefreshCw, Folder, Play, Trash2, Search } from 'lucide-react';
import { PushPreviewModal } from './PushPreviewModal';

export type BranchFilter = 'all' | 'local' | 'remote';

interface GitSidebarProps {
    projectPath: string;
    onRefreshRequest?: () => void;
    refreshKey?: number;
    branchFilter?: BranchFilter;
    onBranchFilterChange?: (filter: BranchFilter) => void;
}

export const GitSidebar: React.FC<GitSidebarProps> = ({ projectPath, onRefreshRequest, refreshKey, branchFilter = 'all', onBranchFilterChange }) => {
    const [localBranches, setLocalBranches] = useState<{ name: string, active: boolean }[]>([]);
    const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
    const [stashes, setStashes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const [showLocal, setShowLocal] = useState(true);
    const [showRemote, setShowRemote] = useState(false);
    const [showStashes, setShowStashes] = useState(true);
    const [branchSearch, setBranchSearch] = useState('');
    const [showPushModal, setShowPushModal] = useState(false);

    const searchLower = branchSearch.trim().toLowerCase();
    const filteredLocal = searchLower
        ? localBranches.filter(b => b.name.toLowerCase().includes(searchLower))
        : localBranches;
    const filteredRemote = searchLower
        ? remoteBranches.filter(r => r.toLowerCase().includes(searchLower))
        : remoteBranches;

    const loadSidebarData = async () => {
        setLoading(true);
        try {
            // Local Branches
            const localRes: any = await invoke('git_execute', { projectPath, args: ['branch'] });
            if (localRes.success) {
                const locals = localRes.stdout.split('\n').filter((l: string) => l.trim().length > 0).map((l: string) => ({
                    active: l.startsWith('*'),
                    name: l.replace('*', '').trim()
                }));
                setLocalBranches(locals);
            }

            // Remote Branches
            const remoteRes: any = await invoke('git_execute', { projectPath, args: ['branch', '-r'] });
            if (remoteRes.success) {
                const remotes = remoteRes.stdout.split('\n')
                    .filter((l: string) => l.trim().length > 0 && !l.includes('->'))
                    .map((l: string) => l.trim());
                setRemoteBranches(remotes);
            }

            // Stashes
            const stashRes: any = await invoke('git_execute', { projectPath, args: ['stash', 'list'] });
            if (stashRes.success) {
                const stashList = stashRes.stdout.split('\n').filter((l: string) => l.trim().length > 0);
                setStashes(stashList);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectPath) loadSidebarData();
    }, [projectPath, refreshKey]);

    const handleCheckout = async (branch: string, isRemote: boolean) => {
        setLoading(true);
        try {
            let checkoutBranch = branch;
            if (isRemote) {
                // Remove remote name (e.g. origin/main -> main) for a tracked checkout
                const parts = branch.split('/');
                if (parts.length > 1) {
                    checkoutBranch = parts.slice(1).join('/');
                }
            }

            await invoke('git_execute', { projectPath, args: ['checkout', checkoutBranch] });
            await loadSidebarData();
            if (onRefreshRequest) onRefreshRequest();
        } finally {
            setLoading(false);
        }
    };

    const handleStashSave = async () => {
        setLoading(true);
        try {
            await invoke('git_execute', { projectPath, args: ['stash', 'save', 'Stashed via Nexus'] });
            await loadSidebarData();
            if (onRefreshRequest) onRefreshRequest();
        } finally {
            setLoading(false);
        }
    };

    const handleStashPop = async (stashId: string) => {
        setLoading(true);
        try {
            const idMatch = stashId.match(/stash@\{\d+\}/);
            if (idMatch) {
                await invoke('git_execute', { projectPath, args: ['stash', 'pop', idMatch[0]] });
                await loadSidebarData();
                if (onRefreshRequest) onRefreshRequest();
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLocalBranch = async (branchName: string) => {
        if (!branchName || localBranches.some(b => b.name === branchName && b.active)) return;
        const force = false; // use -d by default; user can retry with -D if needed
        if (!confirm(`Delete local branch "${branchName}"? ${force ? ' (Force)' : ''}`)) return;
        setLoading(true);
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['branch', force ? '-D' : '-d', branchName] });
            if (result?.success !== false) {
                await loadSidebarData();
                if (onRefreshRequest) onRefreshRequest();
            } else {
                const msg = result?.stderr || 'Could not delete branch. Not fully merged? Try force delete.';
                if (confirm(`${msg}\n\nForce delete anyway?`)) {
                    await invoke('git_execute', { projectPath, args: ['branch', '-D', branchName] });
                    await loadSidebarData();
                    if (onRefreshRequest) onRefreshRequest();
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const SectionHeader: React.FC<{ title: string, count: number, isExpanded: boolean, onToggle: () => void }> = ({ title, count, isExpanded, onToggle }) => (
        <div
            className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-slate-800 text-xs font-bold text-slate-400 uppercase group transition-colors"
            onClick={onToggle}
        >
            <div className="flex items-center">
                {title} <span className="ml-2 bg-slate-800 text-slate-500 px-1.5 rounded text-[10px]">{count}</span>
            </div>
            <Folder size={12} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
    );

    return (
        <>
            <div className="w-full h-full min-w-0 bg-slate-950 border-r border-slate-800 flex flex-col">
                {/* Header Toolbar */}
                <div className="flex flex-col gap-2 p-3 border-b border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">Workspace</span>
                        <div className="flex space-x-1">
                            <button onClick={handleStashSave} className="p-1.5 text-slate-400 hover:text-nexus-accent hover:bg-slate-800 rounded transition-colors" title="Stash Changes">
                                <Download size={14} />
                            </button>
                            {stashes.length > 0 && (
                                <button onClick={() => handleStashPop(stashes[0])} className="p-1.5 text-slate-400 hover:text-nexus-success hover:bg-slate-800 rounded transition-colors" title="Pop Latest Stash">
                                    <UploadCloud size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => setShowPushModal(true)}
                                className="p-1.5 text-slate-400 hover:text-nexus-accent hover:bg-slate-800 rounded transition-colors"
                                title="Push (Preview commits)"
                            >
                                <UploadCloud size={14} className="rotate-0" />
                            </button>
                            <button onClick={loadSidebarData} className={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ${loading ? 'animate-spin' : ''}`} title="Refresh">
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                    {/* Branch filter: All | Local | Remote */}
                    {onBranchFilterChange && (
                        <div className="flex rounded bg-slate-800/80 p-0.5">
                            {(['all', 'local', 'remote'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => onBranchFilterChange(f)}
                                    className={`flex-1 py-1 px-2 text-[10px] font-medium rounded capitalize transition-colors ${branchFilter === f ? 'bg-nexus-neon text-nexus-darker' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    {f === 'all' ? 'All' : f === 'local' ? 'Local' : 'Remote'}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Branch search */}
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                        <input
                            type="text"
                            value={branchSearch}
                            onChange={(e) => setBranchSearch(e.target.value)}
                            placeholder="Search branches..."
                            className="w-full bg-slate-950 border border-slate-800 rounded py-1.5 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-nexus-neon transition-colors"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2 scrollbar-hide select-none transition-all">

                    {/* Local Branches */}
                    {(branchFilter === 'all' || branchFilter === 'local') && (
                        <>
                            <SectionHeader title="Local" count={filteredLocal.length} isExpanded={showLocal} onToggle={() => setShowLocal(!showLocal)} />
                            {showLocal && (
                                <div className="mb-2">
                                    {filteredLocal.length === 0 ? (
                                        <div className="px-4 py-1 text-xs text-slate-600 italic">
                                            {localBranches.length === 0 ? 'No local branches.' : 'No branches match search.'}
                                        </div>
                                    ) : (
                                        filteredLocal.map(repo => (
                                            <div
                                                key={repo.name}
                                                onDoubleClick={() => !repo.active && handleCheckout(repo.name, false)}
                                                className={`flex items-center justify-between px-4 py-1.5 text-xs cursor-pointer group ${repo.active ? 'text-nexus-neon bg-slate-800/50' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                                            >
                                                <div className="flex items-center overflow-hidden min-w-0 flex-1">
                                                    <GitBranch size={12} className={`mr-2 shrink-0 ${repo.active ? 'text-nexus-neon' : 'text-slate-500'}`} />
                                                    <span className="truncate">{repo.name}</span>
                                                </div>
                                                <div className="flex items-center shrink-0 ml-1">
                                                    {!repo.active && (
                                                        <>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleCheckout(repo.name, false); }}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-neon transition-opacity"
                                                                title="Checkout Branch"
                                                            >
                                                                <Play size={10} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteLocalBranch(repo.name); }}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-danger transition-opacity"
                                                                title="Delete local branch"
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* Remote Branches */}
                    {(branchFilter === 'all' || branchFilter === 'remote') && (
                        <>
                            <SectionHeader title="Remote" count={filteredRemote.length} isExpanded={showRemote} onToggle={() => setShowRemote(!showRemote)} />
                            {showRemote && (
                                <div className="mb-2">
                                    {filteredRemote.length === 0 ? (
                                        <div className="px-4 py-1 text-xs text-slate-600 italic">
                                            {remoteBranches.length === 0 ? 'No remote branches.' : 'No branches match search.'}
                                        </div>
                                    ) : (
                                        filteredRemote.map(repo => (
                                            <div
                                                key={repo}
                                                onDoubleClick={() => handleCheckout(repo, true)}
                                                className="flex items-center justify-between px-4 py-1.5 text-xs cursor-pointer text-slate-400 hover:bg-slate-800 hover:text-white group"
                                            >
                                                <div className="flex items-center overflow-hidden">
                                                    <GitMerge size={12} className="mr-2 text-slate-600 shrink-0" />
                                                    <span className="truncate">{repo}</span>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCheckout(repo, true); }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-neon transition-opacity shrink-0 ml-2"
                                                    title="Checkout Remote Branch (Creates Local)"
                                                >
                                                    <Play size={10} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* Stashes */}
                    <SectionHeader title="Stashes" count={stashes.length} isExpanded={showStashes} onToggle={() => setShowStashes(!showStashes)} />
                    {showStashes && (
                        <div className="mb-2">
                            {stashes.length === 0 ? (
                                <div className="px-4 py-1 text-xs text-slate-600 italic">No stashes.</div>
                            ) : (
                                stashes.map(stash => (
                                    <div
                                        key={stash}
                                        onDoubleClick={() => handleStashPop(stash)}
                                        className="flex items-center px-4 py-1.5 text-xs cursor-pointer text-slate-400 hover:bg-slate-800 hover:text-white group"
                                        title="Double-click to Pop"
                                    >
                                        <FileArchive size={12} className="mr-2 text-slate-500 shrink-0" />
                                        <span className="truncate">{stash}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Push Preview Modal */}
            {
                showPushModal && (
                    <PushPreviewModal
                        projectPath={projectPath}
                        onClose={() => setShowPushModal(false)}
                        onRefreshRequest={onRefreshRequest}
                    />
                )
            }
        </>
    );
};
