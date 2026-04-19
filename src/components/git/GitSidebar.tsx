import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitBranch, GitMerge, Download, UploadCloud, RefreshCw, Folder, Play, Trash2, Search, DownloadCloud, AlertTriangle, Archive, PackageOpen, Eye, GitCompare } from 'lucide-react';
import { GitlabBranchViewerModal } from '../gitlab/GitlabBranchViewerModal';
import { toast } from 'sonner';
import { PushPreviewModal } from './PushPreviewModal';
import { BranchDiffModal } from './BranchDiffModal';
import { useGitStore } from '../../stores/gitStore';
import { MergeConfirmModal } from './MergeConfirmModal';
import { PRSection } from './PRSection';
import { StashDiffModal } from './StashDiffModal';
import { ConfirmationDialog, ConfirmType } from '../ui/ConfirmationDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu';
import { cn } from '../../lib/utils';
import { useGitBranches, useGitAheadBehind, gitKeys } from '../../hooks/queries/useGitQueries';
import { useQueryClient } from '@tanstack/react-query';
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

export type { BranchFilter } from '../../stores/gitStore';

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
    handleDeleteRemoteBranch,
    setShowMergeModal,
    showViewCode,
    onViewCode,
    onCompare,
}: {
    id: string;
    branchName: string;
    isRemote?: boolean;
    handleCheckout: (b: string, remote: boolean) => void;
    handleDeleteLocalBranch?: (b: string) => void;
    handleDeleteRemoteBranch?: (b: string) => void;
    setShowMergeModal: (b: string) => void;
    showViewCode?: boolean;
    onViewCode?: (b: string) => void;
    onCompare?: (b: string) => void;
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id,
        data: { branchName },
    });

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div
                    ref={setNodeRef}
                    {...listeners}
                    {...attributes}
                    onDoubleClick={() => handleCheckout(branchName, !!isRemote)}
                    className={cn(
                        "flex items-center px-3 py-1 text-xs cursor-grab active:cursor-grabbing transition-all text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                        isDragging && "opacity-40"
                    )}
                >
                    {isRemote
                        ? <GitMerge size={12} className="mr-2 text-slate-600 shrink-0" />
                        : <GitBranch size={12} className="mr-2 text-slate-500 shrink-0" />
                    }
                    <span className="truncate">{branchName}</span>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => handleCheckout(branchName, !!isRemote)}>
                    <Play size={12} className="mr-2 text-microtermix-neon" />
                    {isRemote ? 'Checkout (remoto)' : 'Checkout'}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setShowMergeModal(branchName)}>
                    <GitMerge size={12} className="mr-2 text-microtermix-accent" />
                    Merge into current
                </ContextMenuItem>
                {!isRemote && onCompare && (
                    <ContextMenuItem onClick={() => onCompare(branchName)}>
                        <GitCompare size={12} className="mr-2 text-purple-400" />
                        Comparar con current
                    </ContextMenuItem>
                )}
                {showViewCode && onViewCode && (
                    <ContextMenuItem onClick={() => onViewCode(branchName)}>
                        <Eye size={12} className="mr-2 text-microtermix-neon" />
                        Ver código en GitLab
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                {!isRemote && handleDeleteLocalBranch && (
                    <ContextMenuItem
                        onClick={() => handleDeleteLocalBranch(branchName)}
                        className="text-red-400 hover:text-red-300"
                    >
                        <Trash2 size={12} className="mr-2" />
                        Eliminar rama local
                    </ContextMenuItem>
                )}
                {handleDeleteRemoteBranch && (
                    <ContextMenuItem
                        onClick={() => handleDeleteRemoteBranch(branchName)}
                        className="text-orange-400 hover:text-orange-300"
                    >
                        <Trash2 size={12} className="mr-2" />
                        Eliminar de origin
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
};

// ── Active branch: acts as the drop zone ──────────────────────────────────────

const ActiveBranchDropZone = ({
    branchName,
    isDraggingAny,
    onCherryPickCommit,
}: {
    branchName: string;
    isDraggingAny: boolean;
    onCherryPickCommit?: (hash: string) => void;
}) => {
    const { isOver, setNodeRef } = useDroppable({ id: 'active-branch-drop' });
    const [isCommitDragOver, setIsCommitDragOver] = useState(false);

    const isHighlighted = isDraggingAny && isOver;
    const isDropReady = isDraggingAny && !isOver;

    const handleDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/commit')) {
            e.preventDefault();
            setIsCommitDragOver(true);
        }
    };

    const handleDragLeave = () => setIsCommitDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsCommitDragOver(false);
        const data = e.dataTransfer.getData('application/commit');
        if (data && onCherryPickCommit) {
            try {
                const { hash } = JSON.parse(data);
                onCherryPickCommit(hash);
            } catch { /* no-op */ }
        }
    };

    return (
        <div
            ref={setNodeRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex items-center justify-between px-4 py-1.5 text-xs group transition-all
                ${isCommitDragOver
                    ? 'text-amber-300 bg-amber-900/30 border border-amber-500/60 ring-1 ring-inset ring-amber-500/30'
                    : isHighlighted
                        ? 'text-microtermix-neon bg-green-900/40 border border-green-500/60 ring-1 ring-inset ring-green-500/30'
                        : isDropReady
                            ? 'text-microtermix-neon bg-slate-800/50 border border-dashed border-microtermix-neon/40'
                            : 'text-microtermix-neon bg-slate-800/50'
                }`}
        >
            <div className="flex items-center overflow-hidden min-w-0 flex-1">
                <GitBranch size={12} className="mr-2 text-microtermix-neon shrink-0" />
                <span className="truncate font-semibold">
                    {isCommitDragOver ? `🍒 Cherry-pick → ${branchName}` : isHighlighted ? `⬇ Mergear aquí → ${branchName}` : branchName}
                </span>
            </div>
            {(isDraggingAny || isCommitDragOver) && (
                <span className="text-[9px] ml-1 shrink-0 font-bold uppercase tracking-wider text-microtermix-neon/60">
                    {isCommitDragOver ? 'Cherry-pick' : isHighlighted ? '¡Suelta!' : 'Drop target'}
                </span>
            )}
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

export const GitSidebar: React.FC<GitSidebarProps> = ({ projectPath, onRefreshRequest }) => {
    const queryClient = useQueryClient();
    
    // Queries
    const { data: branchesData, isLoading: loadingBranches } = useGitBranches(projectPath);
    const { data: aheadBehind } = useGitAheadBehind(projectPath);

    // Zustand
    const branchFilter = useGitStore(s => s.ui.branchFilter);
    const setUi = useGitStore(s => s.setUi);
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = getActiveAccount(projectPath);

    const { local: localBranches = [], remote: remoteBranches = [], stashes = [] } = branchesData || {};

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
    const [viewStash, setViewStash] = useState<string | null>(null);
    const [compareBranch, setCompareBranch] = useState<string | null>(null);

    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        confirmLabel?: string;
        type?: ConfirmType;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        description: '',
        onConfirm: () => { },
    });

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

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: gitKeys.repo(projectPath) });
        onRefreshRequest?.();
    };

    const handleCheckout = async (branch: string, isRemote: boolean) => {
        try {
            // Normalize path
            const normalizedPath = projectPath.replace(/\/+$/, '');
            
            // Extraemos el nombre limpio de la rama (ej: de 'origin/main' sacamos 'main')
            const parts = branch.split('/');
            const branchName = isRemote ? parts.slice(1).join('/') : branch;

            const res: any = await invoke('git_execute', { 
                projectPath: normalizedPath, 
                args: ['checkout', branchName] 
            });
            
            if (!res.success) {
                alert(res.stderr || 'Error al ejecutar checkout');
                return;
            }
            
            // Wait a bit for filesystem to settle before refreshing
            setTimeout(() => {
                handleRefresh();
            }, 300);
        } catch (e: any) {
            alert(e?.toString() || 'Error al ejecutar checkout');
        }
    };

    const handleStashSave = async () => {
        try {
            await invoke('git_execute', { projectPath, args: ['stash', 'save', 'Stashed via Microtermix'] });
            handleRefresh();
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
                    handleRefresh();
                }
            }
        } catch (e: any) {
            alert(e?.toString() || 'Error al ejecutar git stash pop');
        }
    };

    const handleStashDrop = async (stashId: string) => {
        setConfirmState({
            isOpen: true,
            title: 'Eliminar Stash',
            description: `¿Estás seguro de que quieres eliminar este stash? "${stashId.split(': ').slice(1).join(': ')}"`,
            confirmLabel: 'Eliminar',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const idMatch = stashId.match(/stash@\{\d+\}/);
                    if (idMatch) {
                        await invoke('git_execute', { projectPath, args: ['stash', 'drop', idMatch[0]] });
                        handleRefresh();
                    }
                } catch { /* no-op */ }
                setConfirmState(s => ({ ...s, isOpen: false }));
            }
        });
    };

    const handleDeleteRemoteBranch = async (branchName: string) => {
        // Remove "origin/" or similar prefix before pushing delete
        const cleanName = branchName.replace(/^[^/]+\//, '');
        setConfirmState({
            isOpen: true,
            title: 'Eliminar del Remoto',
            description: `¿Eliminar "${cleanName}" de origin? Esta acción no se puede deshacer.`,
            confirmLabel: 'Eliminar de origin',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const result: any = await invoke('git_execute', { projectPath, args: ['push', 'origin', '--delete', cleanName] });
                    if (result?.success !== false) {
                        toast.success(`Rama "${cleanName}" eliminada de origin`);
                        handleRefresh();
                    } else {
                        toast.error('Error al eliminar del remoto', { description: result?.stderr });
                    }
                } catch (e: any) {
                    toast.error('Error', { description: e?.toString() });
                }
                setConfirmState(s => ({ ...s, isOpen: false }));
            }
        });
    };

    const handleDeleteLocalBranch = async (branchName: string) => {
        if (!branchName || localBranches.some(b => b.name === branchName && b.active)) return;

        setConfirmState({
            isOpen: true,
            title: 'Eliminar Rama Local',
            description: `¿Estás seguro de que quieres eliminar la rama "${branchName}"?`,
            confirmLabel: 'Eliminar',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const result: any = await invoke('git_execute', { projectPath, args: ['branch', '-d', branchName] });
                    if (result?.success !== false) {
                        handleRefresh();
                        setConfirmState(s => ({ ...s, isOpen: false }));
                    } else {
                        const msg = result?.stderr || 'Could not delete branch. Not fully merged?';
                        setConfirmState({
                            isOpen: true,
                            title: 'Forzar Eliminación',
                            description: `${msg}\n\n¿Quieres forzar la eliminación de todas formas?`,
                            confirmLabel: 'Forzar Eliminación',
                            type: 'danger',
                            onConfirm: async () => {
                                await invoke('git_execute', { projectPath, args: ['branch', '-D', branchName] });
                                handleRefresh();
                                setConfirmState(s => ({ ...s, isOpen: false }));
                            }
                        });
                    }
                } catch { 
                    setConfirmState(s => ({ ...s, isOpen: false }));
                }
            }
        });
    };

    const handlePull = async () => {
        setIsPulling(true);
        setPullError(null);
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['pull'] });
            await new Promise(resolve => setTimeout(resolve, 500));
            handleRefresh();

            if (!result.success) {
                toast.error("Pull Failed", { description: "You may have local changes or history has diverged." });
                setPullError({
                    message: "Pull Failed: You may have conflicting changes or need to stash/rebase.",
                    raw: result.stderr || result.stdout
                });
            }
        } catch (e: any) {
            const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e));
            toast.error("Pull Error", { description: msg });
            setPullError({ message: "Pull Error", raw: msg });
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
                await invoke('git_execute', { projectPath, args: ['pull', '--rebase', '--autostash'] });
            } else if (action === 'stash') {
                await invoke('git_execute', { projectPath, args: ['stash', 'save', 'Auto-stash before pull'] });
                await invoke('git_execute', { projectPath, args: ['pull'] });
                await invoke('git_execute', { projectPath, args: ['stash', 'pop'] });
            }
            handleRefresh();
            setPullError(null);
        } catch (e: any) {
            setPullError({ message: "Action Failed", raw: e.message || String(e) });
        } finally {
            setIsResolvingPull(false);
        }
    };

    const handleCherryPickOnBranch = async (commitHash: string) => {
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['cherry-pick', commitHash] });
            if (!result?.success) {
                toast.error('Cherry-pick fallido', { description: result?.stderr });
            } else {
                toast.success('Cherry-pick aplicado');
                handleRefresh();
            }
        } catch (e: any) {
            toast.error('Error', { description: e?.toString() });
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
            if (sourceBranch) setShowMergeModal(sourceBranch);
        }
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
    const allBranchNames = [...new Set([
        ...localBranches.map(b => b.name),
        ...remoteBranches.map(r => r.replace(/^[^/]+\//, '')),
    ])].sort();

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setIsDraggingAny(false)}>
            <div className="w-full h-full min-w-0 bg-slate-950 border-r border-slate-800 flex flex-col">
                <div className="flex flex-col gap-2 p-3 border-b border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">Workspace</span>
                        <div className="flex space-x-1">
                            <Button variant="ghost" size="icon-sm" onClick={handleStashSave} className="text-slate-400 hover:text-microtermix-accent" title="Stash Changes">
                                <Download size={14} />
                            </Button>
                            {stashes.length > 0 && (
                                <Button variant="ghost" size="icon-sm" onClick={() => handleStashPop(stashes[0])} className="text-slate-400 hover:text-microtermix-success" title="Pop Latest Stash">
                                    <UploadCloud size={14} />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon-sm" onClick={handlePull} disabled={isPulling}
                                className={cn('relative', aheadBehind?.behind && !isPulling && 'text-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-500/50 animate-pulse')}>
                                {isPulling ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                                {!!aheadBehind?.behind && !isPulling && <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-cyan-500 text-[8px] font-bold text-white rounded-full flex items-center justify-center px-0.5 leading-none">{aheadBehind.behind > 9 ? '9+' : aheadBehind.behind}</span>}
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setShowPushModal(true)}
                                className={cn('relative', aheadBehind?.ahead && 'text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/50 animate-pulse')}>
                                <UploadCloud size={14} />
                                {!!aheadBehind?.ahead && <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-amber-500 text-[8px] font-bold text-white rounded-full flex items-center justify-center px-0.5 leading-none">{aheadBehind.ahead > 9 ? '9+' : aheadBehind.ahead}</span>}
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={handleRefresh} className={cn("text-slate-400 hover:text-white", loadingBranches && 'animate-spin')} title="Refresh">
                                <RefreshCw size={14} />
                            </Button>
                        </div>
                    </div>
                    <div className="flex rounded bg-slate-800/80 p-0.5">
                        {(['all', 'local', 'remote'] as const).map((f) => (
                            <Button key={f} variant={branchFilter === f ? 'secondary' : 'ghost'} size="xs" onClick={() => setUi({ branchFilter: f })}
                                className={cn('flex-1 rounded capitalize transition-colors', branchFilter === f ? 'bg-microtermix-neon text-microtermix-darker' : 'text-slate-400')}>
                                {f}
                            </Button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                        <Input type="text" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} placeholder="Search branches..." className="w-full bg-slate-950 border-slate-800 h-8 pl-7 pr-2 text-xs text-slate-200" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                    {(branchFilter === 'all' || branchFilter === 'local') && (
                        <>
                            <SectionHeader title="Local" count={filteredLocal.length} isExpanded={showLocal} onToggle={() => setShowLocal(!showLocal)} />
                            {showLocal && (
                                <div className="mb-2">
                                    {filteredLocal.map(b => b.active ? <ActiveBranchDropZone key={b.name} branchName={b.name} isDraggingAny={isDraggingAny} onCherryPickCommit={handleCherryPickOnBranch} /> :
                                        <DraggableBranchItem key={b.name} id={`local-${b.name}`} branchName={b.name} handleCheckout={handleCheckout} handleDeleteLocalBranch={handleDeleteLocalBranch} handleDeleteRemoteBranch={handleDeleteRemoteBranch} setShowMergeModal={setShowMergeModal} onCompare={setCompareBranch} />
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {(branchFilter === 'all' || branchFilter === 'remote') && (
                        <>
                            <SectionHeader title="Remote" count={filteredRemote.length} isExpanded={showRemote} onToggle={() => setShowRemote(!showRemote)} />
                            {showRemote && (
                                <div className="mb-2">
                                    {filteredRemote.map(r => <DraggableBranchItem key={r} id={`remote-${r}`} branchName={r} isRemote handleCheckout={handleCheckout} handleDeleteRemoteBranch={handleDeleteRemoteBranch} setShowMergeModal={setShowMergeModal} showViewCode={activeAccount?.provider === 'gitlab'} onViewCode={(b) => setViewCodeBranch(b.split('/').slice(1).join('/') || b)} />)}
                                </div>
                            )}
                        </>
                    )}

                    <SectionHeader title="Stashes" count={stashes.length} isExpanded={showStashes} onToggle={() => setShowStashes(!showStashes)} />
                    {showStashes && (
                        <div className="mb-2">
                            {stashes.map(stash => (
                                <div key={stash} onDoubleClick={() => handleStashPop(stash)} className="flex items-center px-3 py-1 text-xs cursor-pointer text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 group transition-colors">
                                    <Archive size={12} className="mr-2 text-slate-500 shrink-0" />
                                    <span className="truncate flex-1">{stash.split(': ').slice(1).join(': ') || stash}</span>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); setViewStash(stash); }} className="h-6 w-6 p-0 hover:bg-slate-700/50 text-microtermix-neon rounded"><Eye size={12} /></Button>} /><TooltipContent>Ver cambios</TooltipContent></Tooltip>
                                        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); handleStashPop(stash); }} className="h-6 w-6 p-0 hover:bg-slate-700/50 text-microtermix-accent rounded"><PackageOpen size={12} /></Button>} /><TooltipContent>Stash Pop</TooltipContent></Tooltip>
                                        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); handleStashDrop(stash); }} className="h-6 w-6 p-0 hover:bg-slate-700/50 text-microtermix-danger rounded"><Trash2 size={12} /></Button>} /><TooltipContent>Stash Drop</TooltipContent></Tooltip>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <PRSection projectPath={projectPath} account={activeAccount} activeBranch={activeBranch?.name ?? ''} branches={allBranchNames} />
                </div>
            </div>

            <DragOverlay dropAnimation={null}>{isDraggingAny && activeDragLabel && <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-microtermix-neon/50 rounded-lg shadow-xl text-xs text-microtermix-neon font-mono select-none"><GitBranch size={11} />{activeDragLabel}</div>}</DragOverlay>

            {showPushModal && <PushPreviewModal projectPath={projectPath} onClose={() => setShowPushModal(false)} onRefreshRequest={handleRefresh} />}
            {showMergeModal && <MergeConfirmModal projectPath={projectPath} sourceBranch={showMergeModal} currentBranch={activeBranch?.name || ''} onClose={() => setShowMergeModal(null)} onMergeComplete={handleRefresh} />}
            {viewCodeBranch && activeAccount && <GitlabBranchViewerModal isOpen={!!viewCodeBranch} onClose={() => setViewCodeBranch(null)} projectPath={projectPath} token={activeAccount.token} branch={viewCodeBranch} apiUrl={activeAccount.url} />}
            {viewStash && <StashDiffModal isOpen={!!viewStash} onClose={() => setViewStash(null)} projectPath={projectPath} stashRef={viewStash.split(':')[0]} />}
            {compareBranch && (
                <BranchDiffModal
                    projectPath={projectPath}
                    initialBase={compareBranch}
                    initialHead={activeBranch?.name || 'HEAD'}
                    branches={[...(localBranches?.map(b => b.name) ?? []), ...(remoteBranches ?? [])]}
                    onClose={() => setCompareBranch(null)}
                />
            )}

            <ConfirmationDialog
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                description={confirmState.description}
                confirmLabel={confirmState.confirmLabel}
                type={confirmState.type}
                onConfirm={confirmState.onConfirm}
                onCancel={() => setConfirmState(s => ({ ...s, isOpen: false }))}
            />

            <Dialog open={!!pullError} onOpenChange={(open) => !open && setPullError(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle className="text-red-500 flex items-center gap-2"><AlertTriangle size={18} /> Error al hacer Pull</DialogTitle><DialogDescription>{pullError?.message}</DialogDescription></DialogHeader>
                    <div className="bg-slate-950 p-3 rounded-md border border-slate-800 font-mono text-xs text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">{pullError?.raw}</div>
                    <DialogFooter><Button variant="outline" onClick={() => setPullError(null)} disabled={isResolvingPull}>Cancelar</Button><Button variant="secondary" onClick={() => handlePullAction('stash')} disabled={isResolvingPull}>Stash & Pull</Button><Button onClick={() => handlePullAction('rebase')} disabled={isResolvingPull}>Pull --rebase</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </DndContext>
    );
};
