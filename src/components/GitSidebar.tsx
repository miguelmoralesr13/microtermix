import React, { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitBranch, GitMerge, Download, UploadCloud, RefreshCw, Folder, Play, Trash2, Search, DownloadCloud, AlertTriangle, Archive, PackageOpen, Eye } from 'lucide-react';
import { GitlabBranchViewerModal } from './gitlab/GitlabBranchViewerModal';
import { PushPreviewModal } from './PushPreviewModal';
import { useGitStore, EMPTY_REPO_DATA } from '../stores/gitStore';
import { MergeConfirmModal } from './MergeConfirmModal';
import { PRSection } from './PRSection';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    DndContext,
    useDraggable,
    useDroppable,
    DragEndEvent,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    DragStartEvent
} from '@dnd-kit/core';

export type { BranchFilter } from '../stores/gitStore';

interface GitSidebarProps {
    projectPath: string;
    onRefreshRequest?: () => void;
}

// ── Draggable branch item (inactive) ──────────────────────────────────────────

const DraggableBranchItem = ({
    id,
    branchName,
    isRemote,
    handleCheckout,
    handleDeleteLocalBranch,
    setShowMergeModal,
    showViewCode,
    onViewCode,
}: {
    id: string;
    branchName: string;
    isRemote?: boolean;
    handleCheckout: (b: string, remote: boolean) => void;
    handleDeleteLocalBranch?: (b: string) => void;
    setShowMergeModal: (b: string) => void;
    showViewCode?: boolean;
    onViewCode?: (b: string) => void;
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id,
        data: { branchName },
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onDoubleClick={() => handleCheckout(branchName, !!isRemote)}
            style={{ opacity: isDragging ? 0.4 : 1 }}
            className="flex items-center justify-between px-4 py-1.5 text-xs cursor-grab active:cursor-grabbing group transition-all text-slate-300 hover:bg-slate-800 hover:text-white"
        >
            <div className="flex items-center overflow-hidden min-w-0 flex-1">
                {isRemote
                    ? <GitMerge size={12} className="mr-2 text-slate-600 shrink-0" />
                    : <GitBranch size={12} className="mr-2 text-slate-500 shrink-0" />
                }
                <span className="truncate">{branchName}</span>
            </div>
            <div className="flex items-center shrink-0 ml-1" onPointerDown={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowMergeModal(branchName); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-accent transition-opacity"
                    title="Merge into current branch"
                >
                    <GitMerge size={10} />
                </button>
                {showViewCode && onViewCode && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onViewCode(branchName); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-neon transition-opacity"
                        title="Ver código en GitLab (remoto)"
                    >
                        <Eye size={12} />
                    </button>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); handleCheckout(branchName, !!isRemote); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-neon transition-opacity"
                    title={isRemote ? 'Checkout Remote' : 'Checkout'}
                >
                    <Play size={10} />
                </button>
                {!isRemote && handleDeleteLocalBranch && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteLocalBranch(branchName); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-danger transition-opacity"
                        title="Delete local branch"
                    >
                        <Trash2 size={10} />
                    </button>
                )}
            </div>
        </div>
    );
};

// ── Active branch: acts as the drop zone ──────────────────────────────────────

const ActiveBranchDropZone = ({
    branchName,
    isDraggingAny,
}: {
    branchName: string;
    isDraggingAny: boolean;
}) => {
    const { isOver, setNodeRef } = useDroppable({ id: 'active-branch-drop' });

    const isHighlighted = isDraggingAny && isOver;
    const isDropReady = isDraggingAny && !isOver;

    return (
        <div
            ref={setNodeRef}
            className={`flex items-center justify-between px-4 py-1.5 text-xs group transition-all
                ${isHighlighted
                    ? 'text-nexus-neon bg-green-900/40 border border-green-500/60 ring-1 ring-inset ring-green-500/30'
                    : isDropReady
                        ? 'text-nexus-neon bg-slate-800/50 border border-dashed border-nexus-neon/40'
                        : 'text-nexus-neon bg-slate-800/50'
                }`}
        >
            <div className="flex items-center overflow-hidden min-w-0 flex-1">
                <GitBranch size={12} className="mr-2 text-nexus-neon shrink-0" />
                <span className="truncate font-semibold">
                    {isHighlighted ? `⬇ Mergear aquí → ${branchName}` : branchName}
                </span>
            </div>
            {isDraggingAny && (
                <span className="text-[9px] text-nexus-neon/60 ml-1 shrink-0 font-bold uppercase tracking-wider">
                    {isHighlighted ? '¡Suelta!' : 'Drop target'}
                </span>
            )}
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

export const GitSidebar: React.FC<GitSidebarProps> = ({ projectPath, onRefreshRequest }) => {
    const repo = useGitStore(s => s.repos[projectPath] ?? EMPTY_REPO_DATA);
    const aheadBehind = repo.aheadBehind;
    const branchFilter = useGitStore(s => s.ui.branchFilter);
    const setUi = useGitStore(s => s.setUi);
    const fetchAheadBehind = useGitStore(s => s.fetchAheadBehind);
    const fetchAll = useGitStore(s => s.fetchAll);
    const invalidate = useGitStore(s => s.invalidate);


    const { local: localBranches, remote: remoteBranches, stashes } = repo.branches;
    const loading = repo.loading.branches;

    const [showLocal, setShowLocal] = useState(true);
    const [showRemote, setShowRemote] = useState(false);
    const [showStashes, setShowStashes] = useState(true);
    const [branchSearch, setBranchSearch] = useState('');
    const [showPushModal, setShowPushModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState<string | null>(null);
    const [isDraggingAny, setIsDraggingAny] = useState(false);
    const [activeDragLabel, setActiveDragLabel] = useState<string>('');
    const [pullError, setPullError] = useState<{ message: string; raw: string } | null>(null);
    const [isResolvingPull, setIsResolvingPull] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [viewCodeBranch, setViewCodeBranch] = useState<string | null>(null);

    const searchLower = branchSearch.trim().toLowerCase();
    const filteredLocal = useMemo(() =>
        searchLower ? localBranches.filter(b => b.name.toLowerCase().includes(searchLower)) : localBranches,
        [localBranches, searchLower]
    );
    const filteredRemote = useMemo(() =>
        searchLower ? remoteBranches.filter(r => r.toLowerCase().includes(searchLower)) : remoteBranches,
        [remoteBranches, searchLower]
    );

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        })
    );

    const handleCheckout = async (branch: string, isRemote: boolean) => {
        try {
            let checkoutBranch = branch;
            if (isRemote) {
                const parts = branch.split('/');
                if (parts.length > 1) checkoutBranch = parts.slice(1).join('/');
            }
            await invoke('git_execute', { projectPath, args: ['checkout', checkoutBranch] });
            onRefreshRequest?.();
        } catch { /* no-op */ }
    };

    const handleStashSave = async () => {
        try {
            await invoke('git_execute', { projectPath, args: ['stash', 'save', 'Stashed via Nexus'] });
            onRefreshRequest?.();
        } catch { /* no-op */ }
    };

    const handleStashPop = async (stashId: string) => {
        try {
            const idMatch = stashId.match(/stash@\{\d+\}/);
            if (idMatch) {
                const res: any = await invoke('git_execute', { projectPath, args: ['stash', 'pop', idMatch[0]] });
                if (res?.success === false) {
                    alert(res.stderr || 'Error al aplicar stash');
                } else {
                    onRefreshRequest?.();
                }
            }
        } catch (e: any) {
            alert(e?.toString() || 'Error al ejecutar git stash pop');
        }
    };

    const handleStashDrop = async (stashId: string) => {
        if (!confirm(`Delete stash? "${stashId.split(': ').slice(1).join(': ')}"`)) return;
        try {
            const idMatch = stashId.match(/stash@\{\d+\}/);
            if (idMatch) {
                await invoke('git_execute', { projectPath, args: ['stash', 'drop', idMatch[0]] });
                onRefreshRequest?.();
            }
        } catch { /* no-op */ }
    };

    const handleDeleteLocalBranch = async (branchName: string) => {
        if (!branchName || localBranches.some(b => b.name === branchName && b.active)) return;
        if (!confirm(`Delete local branch "${branchName}"?`)) return;
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['branch', '-d', branchName] });
            if (result?.success !== false) {
                onRefreshRequest?.();
            } else {
                const msg = result?.stderr || 'Could not delete branch. Not fully merged? Try force delete.';
                if (confirm(`${msg}\n\nForce delete anyway?`)) {
                    await invoke('git_execute', { projectPath, args: ['branch', '-D', branchName] });
                    onRefreshRequest?.();
                }
            }
        } catch { /* no-op */ }
    };

    const handlePull = async () => {
        setIsPulling(true);
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['pull'] });
            // Always force-refresh ahead/behind and all status after a pull attempt
            invalidate(projectPath);
            fetchAll(projectPath, true);
            fetchAheadBehind(projectPath, true);
            onRefreshRequest?.();
            if (!result.success) {
                setPullError({
                    message: "Pull Failed: You may have conflicting changes or need to stash/rebase.",
                    raw: result.stderr || result.stdout
                });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[Pull] invoke error:', msg);
            setPullError({
                message: "Pull Error",
                raw: msg
            });
        } finally {
            setIsPulling(false);
        }
    };

    const handlePullAction = async (action: 'stash' | 'rebase' | 'abort') => {
        if (action === 'abort') {
            setPullError(null);
            return;
        }

        setIsResolvingPull(true);
        try {
            if (action === 'rebase') {
                const result: any = await invoke('git_execute', { projectPath, args: ['pull', '--rebase'] });
                // If there's a conflict preventing checkout, it's actually just a rebase conflict.
                // It's not a terminal error; the rebase has started and now needs resolution. 
                if (result && !result.success && (result.stderr?.includes('conflict') || result.stderr?.includes('Conflict'))) {
                    // Do nothing, let the system detect isRebaseInProgress and show the resolution UI
                    console.log("[Pull Rebase] Detected conflict, deferring to conflict resolution UI");
                } else if (!result.success && result.stderr) {
                    throw new Error(result.stderr);
                }
            } else if (action === 'stash') {
                await invoke('git_execute', { projectPath, args: ['stash', 'save', 'Auto-stash before pull'] });
                await invoke('git_execute', { projectPath, args: ['pull'] });
                await invoke('git_execute', { projectPath, args: ['stash', 'pop'] });
            }
            onRefreshRequest?.();
            // Force status fetch so the conflict modal opens immediately
            invalidate(projectPath, 'status');
            fetchAll(projectPath, true);
            setPullError(null);
        } catch (e: any) {
            alert(`Action failed:\n\n${e.message || String(e)}`);
        } finally {
            setIsResolvingPull(false);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setIsDraggingAny(true);
        setActiveDragLabel(event.active.data.current?.branchName ?? '');
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setIsDraggingAny(false);
        setActiveDragLabel('');
        const { active, over } = event;
        if (over?.id === 'active-branch-drop') {
            const sourceBranch = active.data.current?.branchName as string | undefined;
            if (sourceBranch) {
                setShowMergeModal(sourceBranch);
            }
        }
    };

    const handleDragCancel = () => {
        setIsDraggingAny(false);
        setActiveDragLabel('');
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (pullError) setPullError(null);
                if (showMergeModal) setShowMergeModal(null);
                if (showPushModal) setShowPushModal(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [pullError, showMergeModal, showPushModal]);

    const SectionHeader: React.FC<{ title: string; count: number; isExpanded: boolean; onToggle: () => void }> = ({ title, count, isExpanded, onToggle }) => (
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

    const activeBranch = localBranches.find(b => b.active);
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = getActiveAccount(projectPath);
    // Strip remote prefix (e.g. "origin/main" → "main") and merge with local for branch selectors
    const allBranchNames = [...new Set([
        ...localBranches.map(b => b.name),
        ...remoteBranches.map(r => r.replace(/^[^/]+\//, '')),
    ])].sort();

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="w-full h-full min-w-0 bg-slate-950 border-r border-slate-800 flex flex-col">
                {/* Header Toolbar */}
                <div className="flex flex-col gap-2 p-3 border-b border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">Workspace</span>
                        <div className="flex space-x-1">
                            <Button variant="ghost" size="icon-sm" onClick={handleStashSave} className="text-slate-400 hover:text-nexus-accent hover:bg-slate-800" title="Stash Changes">
                                <Download size={14} />
                            </Button>
                            {stashes.length > 0 && (
                                <Button variant="ghost" size="icon-sm" onClick={() => handleStashPop(stashes[0])} className="text-slate-400 hover:text-nexus-success hover:bg-slate-800" title="Pop Latest Stash">
                                    <UploadCloud size={14} />
                                </Button>
                            )}
                            <Button
                                variant="ghost" size="icon-sm"
                                onClick={handlePull}
                                disabled={isPulling}
                                className={[
                                    'relative cursor-pointer disabled:cursor-not-allowed',
                                    isPulling ? 'opacity-70' : '',
                                    aheadBehind?.behind && !isPulling
                                        ? 'text-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-500/50 shadow-[0_0_8px_rgba(34,211,238,0.45)] animate-pulse hover:bg-cyan-500/20'
                                        : 'text-slate-400 hover:text-nexus-success hover:bg-slate-800',
                                ].join(' ')}
                                title={aheadBehind?.behind ? `Pull — ${aheadBehind.behind} commit${aheadBehind.behind > 1 ? 's' : ''} behind` : 'Pull'}
                            >
                                {isPulling ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                                {!!aheadBehind?.behind && !isPulling && (
                                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-cyan-500 text-[8px] font-bold text-white rounded-full flex items-center justify-center px-0.5 leading-none">
                                        {aheadBehind.behind > 9 ? '9+' : aheadBehind.behind}
                                    </span>
                                )}
                            </Button>
                            <Button
                                variant="ghost" size="icon-sm"
                                onClick={() => setShowPushModal(true)}
                                className={[
                                    'relative cursor-pointer',
                                    aheadBehind?.ahead
                                        ? 'text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.45)] animate-pulse hover:bg-amber-500/20'
                                        : 'text-slate-400 hover:text-nexus-accent hover:bg-slate-800',
                                ].join(' ')}
                                title={aheadBehind?.ahead ? `Push — ${aheadBehind.ahead} commit${aheadBehind.ahead > 1 ? 's' : ''} ahead` : 'Push (Preview commits)'}
                            >
                                <UploadCloud size={14} />
                                {!!aheadBehind?.ahead && (
                                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-amber-500 text-[8px] font-bold text-white rounded-full flex items-center justify-center px-0.5 leading-none">
                                        {aheadBehind.ahead > 9 ? '9+' : aheadBehind.ahead}
                                    </span>
                                )}
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => onRefreshRequest?.()} className={`text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer ${loading ? 'animate-spin' : ''}`} title="Refresh">
                                <RefreshCw size={14} />
                            </Button>
                        </div>
                    </div>
                    {/* Branch filter */}
                    <div className="flex rounded bg-slate-800/80 p-0.5">
                        {(['all', 'local', 'remote'] as const).map((f) => (
                            <Button
                                key={f}
                                variant={branchFilter === f ? 'secondary' : 'ghost'}
                                size="xs"
                                onClick={() => setUi({ branchFilter: f })}
                                className={`flex-1 rounded capitalize transition-colors ${branchFilter === f ? 'bg-nexus-neon text-nexus-darker hover:bg-nexus-neon/90 hover:text-nexus-darker' : 'text-slate-400 hover:text-slate-200 hover:bg-transparent'}`}
                            >
                                {f === 'all' ? 'All' : f === 'local' ? 'Local' : 'Remote'}
                            </Button>
                        ))}
                    </div>
                    {/* Branch search */}
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                        <Input
                            type="text"
                            value={branchSearch}
                            onChange={(e) => setBranchSearch(e.target.value)}
                            placeholder="Search branches..."
                            className="w-full bg-slate-950 border-slate-800 h-8 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-nexus-neon transition-colors"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2 scrollbar-hide transition-all">

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
                                        filteredLocal.map(b =>
                                            b.active ? (
                                                <ActiveBranchDropZone
                                                    key={b.name}
                                                    branchName={b.name}
                                                    isDraggingAny={isDraggingAny}
                                                />
                                            ) : (
                                                <DraggableBranchItem
                                                    key={b.name}
                                                    id={`local-${b.name}`}
                                                    branchName={b.name}
                                                    handleCheckout={handleCheckout}
                                                    handleDeleteLocalBranch={handleDeleteLocalBranch}
                                                    setShowMergeModal={setShowMergeModal}
                                                />
                                            )
                                        )
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
                                        filteredRemote.map(r => (
                                            <DraggableBranchItem
                                                key={r}
                                                id={`remote-${r}`}
                                                branchName={r}
                                                isRemote
                                                handleCheckout={handleCheckout}
                                                setShowMergeModal={setShowMergeModal}
                                                showViewCode={activeAccount?.provider === 'gitlab'}
                                                onViewCode={(b) => {
                                                    const parts = b.split('/');
                                                    setViewCodeBranch(parts.length > 1 ? parts.slice(1).join('/') : b);
                                                }}
                                            />
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
                                        <Archive size={12} className="mr-2 text-slate-500 shrink-0" />
                                        <span className="truncate flex-1">{stash.split(': ').slice(1).join(': ') || stash}</span>
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleStashPop(stash); }}
                                                className="p-1 hover:bg-slate-700 text-nexus-accent rounded"
                                                title="Stash Pop (Apply & Delete)"
                                            >
                                                <PackageOpen size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleStashDrop(stash); }}
                                                className="p-1 hover:bg-slate-700 text-nexus-danger rounded"
                                                title="Stash Drop (Delete)"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Pull Requests / Merge Requests */}
                    <PRSection
                        projectPath={projectPath}
                        account={activeAccount}
                        activeBranch={activeBranch?.name ?? ''}
                        branches={allBranchNames}
                    />

                </div>
            </div>

            {/* Ghost label while dragging */}
            <DragOverlay dropAnimation={null}>
                {isDraggingAny && activeDragLabel ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-nexus-neon/50 rounded-lg shadow-xl text-xs text-nexus-neon font-mono select-none">
                        <GitBranch size={11} />
                        {activeDragLabel}
                    </div>
                ) : null}
            </DragOverlay>

            {/* Modals */}
            {showPushModal && (
                <PushPreviewModal
                    projectPath={projectPath}
                    onClose={() => setShowPushModal(false)}
                    onRefreshRequest={onRefreshRequest}
                />
            )}
            {showMergeModal && (
                <MergeConfirmModal
                    projectPath={projectPath}
                    sourceBranch={showMergeModal}
                    currentBranch={activeBranch?.name || ''}
                    onClose={() => setShowMergeModal(null)}
                    onMergeComplete={() => onRefreshRequest?.()}
                />
            )}

            {viewCodeBranch && activeAccount && (
                <GitlabBranchViewerModal
                    isOpen={!!viewCodeBranch}
                    onClose={() => setViewCodeBranch(null)}
                    projectPath={projectPath}
                    token={activeAccount.token}
                    branch={viewCodeBranch}
                    apiUrl={activeAccount.url}
                />
            )}

            {/* Pull Error Dialog */}
            <Dialog open={!!pullError} onOpenChange={(open) => !open && setPullError(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <AlertTriangle size={18} /> Error al hacer Pull
                        </DialogTitle>
                        <DialogDescription>
                            {pullError?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-slate-950 p-3 rounded-md border border-slate-800 font-mono text-xs text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {pullError?.raw}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => handlePullAction('abort')} disabled={isResolvingPull}>
                            Cancelar
                        </Button>
                        <Button variant="secondary" onClick={() => handlePullAction('stash')} disabled={isResolvingPull}>
                            Stash & Pull
                        </Button>
                        <Button onClick={() => handlePullAction('rebase')} disabled={isResolvingPull}>
                            Pull --rebase
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DndContext>
    );
};
