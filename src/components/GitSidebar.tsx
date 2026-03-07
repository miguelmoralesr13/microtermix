import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitBranch, GitMerge, FileArchive, Download, UploadCloud, RefreshCw, Folder, Play, Trash2, Search, DownloadCloud } from 'lucide-react';
import { PushPreviewModal } from './PushPreviewModal';
import { useGitStore, EMPTY_REPO_DATA } from '../stores/gitStore';
import { MergeConfirmModal } from './MergeConfirmModal';
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
}: {
    id: string;
    branchName: string;
    isRemote?: boolean;
    handleCheckout: (b: string, remote: boolean) => void;
    handleDeleteLocalBranch?: (b: string) => void;
    setShowMergeModal: (b: string) => void;
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
    const branchFilter = useGitStore(s => s.ui.branchFilter);
    const setUi = useGitStore(s => s.setUi);

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
                await invoke('git_execute', { projectPath, args: ['stash', 'pop', idMatch[0]] });
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
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['pull'] });
            if (!result.success) alert(`Pull Failed:\n\n${result.stderr || result.stdout}`);
            onRefreshRequest?.();
        } catch { /* no-op */ }
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
                            <button onClick={handleStashSave} className="p-1.5 text-slate-400 hover:text-nexus-accent hover:bg-slate-800 rounded transition-colors" title="Stash Changes">
                                <Download size={14} />
                            </button>
                            {stashes.length > 0 && (
                                <button onClick={() => handleStashPop(stashes[0])} className="p-1.5 text-slate-400 hover:text-nexus-success hover:bg-slate-800 rounded transition-colors" title="Pop Latest Stash">
                                    <UploadCloud size={14} />
                                </button>
                            )}
                            <button
                                onClick={handlePull}
                                className={`p-1.5 text-slate-400 hover:text-nexus-success hover:bg-slate-800 rounded transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                                title="Pull (Fetch and Merge)"
                            >
                                <DownloadCloud size={14} />
                            </button>
                            <button onClick={() => setShowPushModal(true)} className="p-1.5 text-slate-400 hover:text-nexus-accent hover:bg-slate-800 rounded transition-colors" title="Push (Preview commits)">
                                <UploadCloud size={14} />
                            </button>
                            <button onClick={() => onRefreshRequest?.()} className={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ${loading ? 'animate-spin' : ''}`} title="Refresh">
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                    {/* Branch filter */}
                    <div className="flex rounded bg-slate-800/80 p-0.5">
                        {(['all', 'local', 'remote'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setUi({ branchFilter: f })}
                                className={`flex-1 py-1 px-2 text-[10px] font-medium rounded capitalize transition-colors ${branchFilter === f ? 'bg-nexus-neon text-nexus-darker' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {f === 'all' ? 'All' : f === 'local' ? 'Local' : 'Remote'}
                            </button>
                        ))}
                    </div>
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
                                        <FileArchive size={12} className="mr-2 text-slate-500 shrink-0" />
                                        <span className="truncate">{stash}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

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
        </DndContext>
    );
};
