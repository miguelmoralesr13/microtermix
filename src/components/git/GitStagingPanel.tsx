import React, { useState, useCallback, useMemo } from 'react';
import { GitJiraCommitButton } from './GitJiraCommitButton';
import { invoke } from '@tauri-apps/api/core';
import { GitCommit, GitMerge, RefreshCw, Layers, CheckSquare, Square, MinusSquare, Trash2, ChevronRight, ChevronDown, Folder, File, RotateCcw, AlertTriangle, Zap } from 'lucide-react';
import { GitStatusEntry } from '../../stores/gitStore';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { useGitStatus, gitKeys } from '../../hooks/queries/useGitQueries';
import { useQueryClient } from '@tanstack/react-query';

interface ArrayTreeNode {
    name: string;
    fullPath: string;
    isLeaf: boolean;
    children: ArrayTreeNode[];
    status?: GitStatusEntry;
    checkState: 'checked' | 'unchecked' | 'partial';
    isConflicted?: boolean;
}

interface GitStagingPanelProps {
    projectPath: string;
    onDiffRequest: (file: string, mode: 'staged' | 'unstaged' | 'conflicted', line?: number) => void;
    onOpenConflictModal: () => void;
}

// ── File tree node ──

interface FileTreeNodeItemProps {
    node: ArrayTreeNode;
    level: number;
    selectedForRollback: Set<string>;
    onToggleNode: (node: ArrayTreeNode) => Promise<void>;
    onDiscardNode: (node: ArrayTreeNode) => Promise<void>;
    onDiffRequest?: (file: string, mode: 'staged' | 'unstaged' | 'conflicted', line?: number) => void;
    onRollbackToggle: (path: string) => void;
}

const FileTreeNodeItem = React.memo<FileTreeNodeItemProps>(({ node, level, selectedForRollback, onToggleNode, onDiscardNode, onDiffRequest, onRollbackToggle }) => {
    const [expanded, setExpanded] = useState(true);

    const CheckIcon = node.checkState === 'checked' ? CheckSquare : (node.checkState === 'partial' ? MinusSquare : Square);
    const checkColor = node.checkState === 'checked' ? 'text-microtermix-neon' : (node.checkState === 'partial' ? 'text-microtermix-accent' : 'text-slate-500');

    if (node.isLeaf && node.status) {
        const f = node.status;
        const isAdded = f.stateCode.includes('A') || f.stateCode === '??';
        const isModified = f.stateCode.includes('M') || f.stateCode.includes('R') || f.stateCode.includes('C');
        const isDeleted = f.stateCode.includes('D');

        let colorClass = 'text-slate-400';
        let StatusIcon = File;

        if (isAdded) colorClass = 'text-microtermix-success';
        if (isModified) colorClass = 'text-microtermix-accent';
        if (isDeleted) colorClass = 'text-microtermix-danger';
        if (f.isConflicted) {
            colorClass = 'text-orange-500';
            StatusIcon = AlertTriangle;
        }

        const defaultDiffMode: 'staged' | 'unstaged' | 'conflicted' = f.isConflicted ? 'conflicted' : (f.isUnstaged ? 'unstaged' : 'staged');
        const isSelectedForRollback = selectedForRollback.has(node.fullPath);
        return (
            <div className="min-w-0">
                <div
                    className={cn(
                        "flex items-center justify-between group py-0.5 hover:bg-slate-800/50 transition-colors text-sm",
                        isSelectedForRollback && "bg-microtermix-danger/10"
                    )}
                    style={{ paddingLeft: `${level * 12 + 8}px`, paddingRight: '8px' }}
                >
                    <div
                        className="flex items-center space-x-2 overflow-hidden cursor-pointer flex-1 min-w-0"
                        onClick={() => onDiffRequest && onDiffRequest(f.file, defaultDiffMode)}
                    >
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={(e) => { e.stopPropagation(); onToggleNode(node); }}
                                    className={cn("shrink-0 h-6 w-6 p-0", checkColor)}
                                    disabled={f.isConflicted}
                                >
                                    <CheckIcon size={14} className={f.isConflicted ? 'opacity-30' : ''} />
                                </Button>
                            } />
                            {f.isConflicted && (
                                <TooltipContent>Cannot stage directly. Resolve conflicts first.</TooltipContent>
                            )}
                        </Tooltip>

                        <Badge
                            variant="outline"
                            className={cn("font-mono text-[9px] px-1 py-0 h-4 border-none bg-transparent", colorClass)}
                        >
                            {f.stateCode.trim()}
                        </Badge>
                        <StatusIcon size={12} className={cn(colorClass, "shrink-0")} />
                        <span className={cn(
                            "truncate transition-colors text-xs",
                            node.checkState === 'checked' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                        )}>
                            {node.name}
                        </span>
                    </div>

                    <div className="flex items-center shrink-0 ml-2 gap-0.5">
                        {/* Hunk Staging Button — The surgical way */}
                        {!f.isConflicted && !isDeleted && (
                            <Tooltip>
                                <TooltipTrigger render={
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={(e) => { e.stopPropagation(); onDiffRequest?.(f.file, defaultDiffMode as any); }}
                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-microtermix-neon hover:bg-microtermix-neon/10"
                                    >
                                        <Zap size={12} />
                                    </Button>
                                } />
                                <TooltipContent>Surgical Staging (Hunks & Lines)</TooltipContent>
                            </Tooltip>
                        )}

                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => { e.stopPropagation(); onRollbackToggle(node.fullPath); }}
                            className={cn(
                                "h-6 w-6 p-0 transition-opacity",
                                isSelectedForRollback ? "text-microtermix-danger bg-microtermix-danger/20 opacity-100" : "opacity-0 group-hover:opacity-100 text-slate-500 hover:text-microtermix-danger hover:bg-slate-700/50"
                            )}
                            title="Select for rollback"
                        >
                            {isSelectedForRollback ? <CheckSquare size={12} /> : <Square size={12} />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => { e.stopPropagation(); onDiscardNode(node); }}
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-slate-500 hover:text-microtermix-danger hover:bg-slate-700/50 transition-all"
                            title="Discard this file"
                        >
                            <Trash2 size={12} />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between group py-1 hover:bg-slate-800/50 transition-colors" style={{ paddingLeft: `${level * 12 + 4}px`, paddingRight: '8px' }}>
                <div className="flex items-center cursor-pointer flex-1 overflow-hidden" onClick={() => setExpanded(!expanded)}>
                    <span className="w-4 h-4 flex items-center justify-center text-slate-500 shrink-0 mr-1">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => { e.stopPropagation(); onToggleNode(node); }}
                        className={cn("h-6 w-6 p-0 mr-1", checkColor)}
                    >
                        <CheckIcon size={14} />
                    </Button>
                    <Folder size={12} className="text-slate-500 mr-2 shrink-0" />
                    <span className="text-slate-400 text-xs font-medium truncate group-hover:text-slate-200">{node.name}</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => { e.stopPropagation(); onDiscardNode(node); }}
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-slate-500 hover:text-microtermix-danger hover:bg-slate-700/50 transition-all shrink-0 ml-2"
                    title="Discard All Changes in Folder"
                >
                    <Trash2 size={12} />
                </Button>
            </div>
            {expanded && (
                <div>
                    {node.children.map(child => (
                        <FileTreeNodeItem
                            key={child.fullPath}
                            node={child}
                            level={level + 1}
                            selectedForRollback={selectedForRollback}
                            onToggleNode={onToggleNode}
                            onDiscardNode={onDiscardNode}
                            onDiffRequest={onDiffRequest}
                            onRollbackToggle={onRollbackToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

function buildTree(fileList: GitStatusEntry[]): ArrayTreeNode[] {
    const root: Record<string, any> = {};
    fileList.forEach(f => {
        const parts = f.file.split('/');
        let currentLevel = root;
        parts.forEach((part, index) => {
            if (!currentLevel[part]) {
                currentLevel[part] = {
                    name: part,
                    fullPath: parts.slice(0, index + 1).join('/'),
                    isLeaf: index === parts.length - 1,
                    children: {}
                };
            }
            if (index === parts.length - 1) {
                currentLevel[part].status = f;
            }
            currentLevel = currentLevel[part].children;
        });
    });

    const toArray = (nodes: Record<string, any>): ArrayTreeNode[] => {
        return Object.values(nodes).sort((a, b) => {
            if (a.isLeaf === b.isLeaf) return a.name.localeCompare(b.name);
            return a.isLeaf ? 1 : -1;
        }).map(node => {
            let checkState: 'checked' | 'unchecked' | 'partial' = 'unchecked';
            if (node.isLeaf) {
                const st = node.status as GitStatusEntry;
                if (st.isStaged && !st.isUnstaged) checkState = 'checked';
                else if (!st.isStaged && st.isUnstaged) checkState = 'unchecked';
                else checkState = 'partial';
            } else {
                node.children = toArray(node.children);
                const allChecked = node.children.length > 0 && node.children.every((c: any) => c.checkState === 'checked');
                const allUnchecked = node.children.length > 0 && node.children.every((c: any) => c.checkState === 'unchecked');
                if (allChecked) checkState = 'checked';
                else if (allUnchecked) checkState = 'unchecked';
                else checkState = 'partial';
            }
            return { ...node, checkState };
        });
    };
    return toArray(root);
}

export const GitStagingPanel: React.FC<GitStagingPanelProps> = ({ projectPath, onDiffRequest, onOpenConflictModal }) => {
    const queryClient = useQueryClient();
    const { data: statusData, isLoading: loading } = useGitStatus(projectPath);
    
    const files = statusData?.files || [];
    const currentBranch = statusData?.currentBranch || '';
    const isMergeInProgress = statusData?.isMergeInProgress || false;

    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitting, setIsCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedForRollback, setSelectedForRollback] = useState<Set<string>>(new Set());

    const tree = useMemo(() => buildTree(files), [files]);
    const totalFiles = files.length;
    const isAnythingStaged = useMemo(() => files.some(f => f.isStaged), [files]);
    const conflictedFilesCount = useMemo(() => files.filter(f => f.isConflicted).length, [files]);
    const masterCheckState = useMemo(() => {
        if (totalFiles === 0) return 'unchecked';
        const fullyStagedCount = files.filter(f => f.isStaged && !f.isUnstaged).length;
        if (fullyStagedCount === totalFiles) return 'checked';
        if (isAnythingStaged) return 'partial';
        return 'unchecked';
    }, [files, totalFiles, isAnythingStaged]);

    const MasterCheckIcon = masterCheckState === 'checked' ? CheckSquare : (masterCheckState === 'partial' ? MinusSquare : Square);
    const masterCheckColor = masterCheckState === 'checked' ? 'text-microtermix-neon' : (masterCheckState === 'partial' ? 'text-microtermix-accent' : 'text-slate-500');

    const handleRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: gitKeys.repo(projectPath) });
    }, [projectPath, queryClient]);

    const handleStageToggleAll = useCallback(async (stage: boolean) => {
        setError(null);
        try {
            if (stage) await invoke('git_execute', { projectPath, args: ['add', '.'] });
            else await invoke('git_execute', { projectPath, args: ['restore', '--staged', '.'] });
            handleRefresh();
        } catch (e: any) { setError(e?.toString() || 'Failed to toggle stage all'); }
    }, [projectPath, handleRefresh]);

    const handleToggleNode = useCallback(async (node: ArrayTreeNode) => {
        setError(null);
        try {
            if (node.checkState === 'checked') await invoke('git_execute', { projectPath, args: ['restore', '--staged', node.fullPath] });
            else await invoke('git_execute', { projectPath, args: ['add', node.fullPath] });
            handleRefresh();
        } catch (e: any) { setError(e?.toString() || 'Failed to toggle stage'); }
    }, [projectPath, handleRefresh]);

    const handleDiscardNode = useCallback(async (node: ArrayTreeNode) => {
        setError(null);
        try {
            await invoke('git_execute', { projectPath, args: ['restore', node.fullPath] });
            await invoke('git_execute', { projectPath, args: ['clean', '-fd', node.fullPath] });
            setSelectedForRollback((prev) => {
                const next = new Set(prev);
                next.delete(node.fullPath);
                return next;
            });
            handleRefresh();
        } catch (e: any) { setError(e?.toString() || 'Failed to discard changes'); }
    }, [projectPath, handleRefresh]);

    const toggleSelectedForRollback = useCallback((path: string) => {
        setSelectedForRollback((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

    const handleDiscardSelected = useCallback(async () => {
        if (selectedForRollback.size === 0) return;
        setError(null);
        try {
            for (const path of selectedForRollback) {
                await invoke('git_execute', { projectPath, args: ['restore', path] });
                await invoke('git_execute', { projectPath, args: ['clean', '-fd', path] });
            }
            setSelectedForRollback(new Set());
            handleRefresh();
        } catch (e: any) { setError(e?.toString() || 'Failed to discard selected'); }
    }, [selectedForRollback, projectPath, handleRefresh]);

    const handleCommit = useCallback(async () => {
        if (!commitMessage.trim() || !isAnythingStaged) return;
        setIsCommitting(true);
        setError(null);
        try {
            const result: any = await invoke('git_execute', { projectPath, args: ['commit', '-m', commitMessage] });
            if (!result.success) {
                setError(result.stderr || 'Commit failed');
            } else {
                setCommitMessage('');
                handleRefresh();
            }
        } finally {
            setIsCommitting(false);
        }
    }, [commitMessage, projectPath, isAnythingStaged, handleRefresh]);

    const handleAbortMerge = useCallback(async () => {
        try {
            const res: { stdout: string, stderr: string, success: boolean } = await invoke('git_execute', { projectPath, args: ['merge', '--abort'] });
            if (!res.success) setError(res.stderr || 'Failed to abort merge');
            else handleRefresh();
        } catch (e: any) { setError(e?.message ?? 'Failed to abort merge'); }
    }, [projectPath, handleRefresh]);

    return (
        <div className="flex flex-col h-full min-w-0 bg-slate-950 border-l border-slate-800 w-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 block">
                <h3 className="text-sm font-bold text-slate-300 flex items-center">
                    <Layers size={16} className="mr-2 text-microtermix-accent" /> Source Control
                </h3>
                <div className="flex space-x-1">
                    <Button variant="ghost" size="icon-sm" onClick={handleRefresh} className={cn("text-slate-400 hover:text-white", loading && 'animate-spin')} title="Refresh">
                        <RefreshCw size={16} />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-microtermix-danger/10 text-microtermix-danger text-xs border-b border-microtermix-danger/20 max-h-32 overflow-y-auto">
                    {error}
                </div>
            )}

            <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
                <div className="flex items-center justify-between px-3 mb-2 flex-wrap gap-2">
                    <div className="flex items-center cursor-pointer group" onClick={() => handleStageToggleAll(masterCheckState !== 'checked')}>
                        <MasterCheckIcon size={14} className={`${masterCheckColor} group-hover:text-white transition-colors mr-2`} />
                        <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 uppercase tracking-wider">Changes ({totalFiles})</span>
                    </div>
                    {totalFiles > 0 && (
                        <Button
                            variant="destructive"
                            size="xs"
                            onClick={handleDiscardSelected}
                            disabled={loading || selectedForRollback.size === 0}
                            className="flex items-center gap-1.5 rounded bg-microtermix-danger/20 text-microtermix-danger hover:bg-microtermix-danger/30 border border-microtermix-danger/40 disabled:opacity-50"
                        >
                            <RotateCcw size={12} />
                            Rollback selected ({selectedForRollback.size})
                        </Button>
                    )}
                </div>
                {totalFiles === 0 && !loading ? (
                    <div className="text-xs text-slate-600 px-8 py-2 italic font-mono">Working tree is clean.</div>
                ) : (
                    <div>
                        {tree.map(node => (
                            <FileTreeNodeItem
                                key={node.fullPath}
                                node={node}
                                level={0}
                                selectedForRollback={selectedForRollback}
                                onToggleNode={handleToggleNode}
                                onDiscardNode={handleDiscardNode}
                                onDiffRequest={onDiffRequest}
                                onRollbackToggle={toggleSelectedForRollback}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                {isMergeInProgress && (
                    <div className="mb-3 p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-orange-400 flex items-center gap-1">
                                <AlertTriangle size={12} /> Merge in Progress
                            </span>
                            <Button variant="destructive" size="xs" onClick={handleAbortMerge} className="h-6 px-2 text-[10px] font-bold">Abort</Button>
                        </div>
                        {conflictedFilesCount > 0 && (
                            <Button variant="outline" onClick={onOpenConflictModal} className="w-full bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/30 text-orange-300 mt-2 text-xs font-bold font-sans">
                                <GitMerge size={12} className="mr-1.5" />
                                Resolver conflictos ({conflictedFilesCount})
                            </Button>
                        )}
                    </div>
                )}
                <Textarea
                    value={commitMessage}
                    onChange={(e: any) => setCommitMessage(e.target.value)}
                    placeholder="Commit message (Ctrl+Enter)"
                    className="w-full bg-slate-950 border-slate-800 text-sm text-slate-200 focus-visible:ring-1 focus-visible:ring-microtermix-accent min-h-[80px] mb-3 resize-none"
                    onKeyDown={(e: any) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }}
                />
                <Button
                    onClick={handleCommit}
                    disabled={isCommitting || !isAnythingStaged || !commitMessage.trim()}
                    className="w-full bg-microtermix-accent hover:bg-microtermix-accent/80 text-white font-bold mb-3 flex items-center justify-center font-sans"
                >
                    {isCommitting ? <>Committing...</> : <><GitCommit size={16} className="mr-2" /> Commit</>}
                </Button>
                <GitJiraCommitButton
                    projectPath={projectPath}
                    commitMessage={commitMessage}
                    isAnythingStaged={isAnythingStaged}
                    currentBranch={currentBranch}
                    onSuccess={() => {
                        setCommitMessage('');
                        handleRefresh();
                    }}
                />
            </div>
        </div>
    );
};
