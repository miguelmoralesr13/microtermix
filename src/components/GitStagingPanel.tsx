import React, { useState, useCallback, useMemo } from 'react';
import { GitJiraCommitButton } from './GitJiraCommitButton';
import { invoke } from '@tauri-apps/api/core';
import { GitCommit, RefreshCw, Layers, CheckSquare, Square, MinusSquare, Trash2, ChevronRight, ChevronDown, Folder, File, RotateCcw, AlertTriangle } from 'lucide-react';
import { useGitStore, defaultRepoData } from '../stores/gitStore';

interface GitStatusEntry {
    file: string;
    stateCode: string;
    isStaged: boolean;
    isUnstaged: boolean;
    isConflicted: boolean;
}

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
    onDiffRequest?: (file: string, mode: 'staged' | 'unstaged' | 'conflicted', line?: number) => void;
}

// ── File tree node — defined OUTSIDE GitStagingPanel so React never remounts it ──

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
    const checkColor = node.checkState === 'checked' ? 'text-nexus-neon' : (node.checkState === 'partial' ? 'text-nexus-accent' : 'text-slate-500');

    if (node.isLeaf && node.status) {
        const f = node.status;
        const isAdded = f.stateCode.includes('A') || f.stateCode === '??';
        const isModified = f.stateCode.includes('M') || f.stateCode.includes('R') || f.stateCode.includes('C');
        const isDeleted = f.stateCode.includes('D');

        let colorClass = 'text-slate-400';
        let StatusIcon = File;

        if (isAdded) colorClass = 'text-nexus-success';
        if (isModified) colorClass = 'text-nexus-accent';
        if (isDeleted) colorClass = 'text-nexus-danger';
        if (f.isConflicted) {
            colorClass = 'text-orange-500';
            StatusIcon = AlertTriangle;
        }

        const defaultDiffMode: 'staged' | 'unstaged' | 'conflicted' = f.isConflicted ? 'conflicted' : (f.isUnstaged ? 'unstaged' : 'staged');
        const isSelectedForRollback = selectedForRollback.has(node.fullPath);
        return (
            <div className="min-w-0">
                <div
                    className={`flex items-center justify-between group py-1 hover:bg-slate-800 transition-colors text-sm ${isSelectedForRollback ? 'bg-nexus-danger/10' : ''}`}
                    style={{ paddingLeft: `${level * 12 + 8}px`, paddingRight: '8px' }}
                >
                    <div
                        className="flex items-center space-x-2 overflow-hidden cursor-pointer flex-1 min-w-0"
                        onClick={() => onDiffRequest && onDiffRequest(f.file, defaultDiffMode)}
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleNode(node); }}
                            className={`${checkColor} hover:text-white shrink-0 z-10 transition-colors`}
                            disabled={f.isConflicted}
                            title={f.isConflicted ? "Cannot stage directly. Resolve conflicts first." : ""}
                        >
                            <CheckIcon size={14} className={f.isConflicted ? 'opacity-30' : ''} />
                        </button>
                        <span className={`font-mono text-[10px] w-4 shrink-0 ${colorClass} font-bold`}>{f.stateCode.trim()}</span>
                        <StatusIcon size={12} className={`${colorClass} shrink-0`} />
                        <span className={`truncate transition-colors text-xs ${node.checkState === 'checked' ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{node.name}</span>
                    </div>

                    <div className="flex items-center shrink-0 ml-2 gap-0.5">
                        <button
                            onClick={(e) => { e.stopPropagation(); onRollbackToggle(node.fullPath); }}
                            className={`p-1 rounded transition-colors ${isSelectedForRollback ? 'text-nexus-danger bg-nexus-danger/20' : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-nexus-danger hover:bg-slate-700'}`}
                            title="Select for rollback"
                        >
                            {isSelectedForRollback ? <CheckSquare size={12} /> : <Square size={12} />}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDiscardNode(node); }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-danger hover:bg-slate-700 rounded transition-all"
                            title="Discard this file"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between group py-1 hover:bg-slate-800 transition-colors" style={{ paddingLeft: `${level * 12 + 4}px`, paddingRight: '8px' }}>
                <div className="flex items-center cursor-pointer flex-1 overflow-hidden" onClick={() => setExpanded(!expanded)}>
                    <span className="w-4 h-4 flex items-center justify-center text-slate-500 shrink-0 mr-1">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleNode(node); }}
                        className={`${checkColor} hover:text-white shrink-0 z-10 mr-2 transition-colors`}
                    >
                        <CheckIcon size={14} />
                    </button>
                    <Folder size={12} className="text-slate-500 mr-2 shrink-0" />
                    <span className="text-slate-400 text-xs font-medium truncate group-hover:text-slate-200">{node.name}</span>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDiscardNode(node); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-danger hover:bg-slate-700 rounded transition-all shrink-0 ml-2"
                    title="Discard All Changes in Folder"
                >
                    <Trash2 size={12} />
                </button>
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

// ── buildTree helper — defined outside to avoid recreation ────────────────────

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

// ── Main Component ─────────────────────────────────────────────────────────────

export const GitStagingPanel: React.FC<GitStagingPanelProps> = ({ projectPath, onDiffRequest }) => {
    const repo = useGitStore(s => s.repos[projectPath] ?? defaultRepoData());
    const fetchStatus = useGitStore(s => s.fetchStatus);
    const fetchTimeline = useGitStore(s => s.fetchTimeline);
    const invalidate = useGitStore(s => s.invalidate);

    const { files, currentBranch, isMergeInProgress } = repo.status;
    const loading = repo.loading.status;

    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitting, setIsCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedForRollback, setSelectedForRollback] = useState<Set<string>>(new Set());

    // ── Derived values ────────────────────────────────────────────────────────
    const tree = useMemo(() => buildTree(files), [files]);
    const totalFiles = files.length;
    const isAnythingStaged = useMemo(() => files.some(f => f.isStaged), [files]);
    const masterCheckState = useMemo(() => {
        if (totalFiles === 0) return 'unchecked';
        const fullyStagedCount = files.filter(f => f.isStaged && !f.isUnstaged).length;
        if (fullyStagedCount === totalFiles) return 'checked';
        if (isAnythingStaged) return 'partial';
        return 'unchecked';
    }, [files, totalFiles, isAnythingStaged]);

    const MasterCheckIcon = masterCheckState === 'checked' ? CheckSquare : (masterCheckState === 'partial' ? MinusSquare : Square);
    const masterCheckColor = masterCheckState === 'checked' ? 'text-nexus-neon' : (masterCheckState === 'partial' ? 'text-nexus-accent' : 'text-slate-500');

    // Check merge / status / branch is now handled by fetchStatus inside gitStore
    // which is triggered whenever the sidebar tab mounts or refresh is requested.

    const handleStageToggleAll = useCallback(async (stage: boolean) => {
        try {
            if (stage) {
                await invoke('git_execute', { projectPath, args: ['add', '.'] });
            } else {
                await invoke('git_execute', { projectPath, args: ['restore', '--staged', '.'] });
            }
            invalidate(projectPath, 'status');
            fetchStatus(projectPath, true);
        } finally {
        }
    }, [projectPath, fetchStatus, invalidate]);

    const handleToggleNode = useCallback(async (node: ArrayTreeNode) => {
        try {
            if (node.checkState === 'checked') {
                await invoke('git_execute', { projectPath, args: ['restore', '--staged', node.fullPath] });
            } else {
                await invoke('git_execute', { projectPath, args: ['add', node.fullPath] });
            }
            invalidate(projectPath, 'status');
            fetchStatus(projectPath, true);
        } finally {
        }
    }, [projectPath, fetchStatus, invalidate]);

    const handleDiscardNode = useCallback(async (node: ArrayTreeNode) => {
        try {
            await invoke('git_execute', { projectPath, args: ['restore', node.fullPath] });
            await invoke('git_execute', { projectPath, args: ['clean', '-fd', node.fullPath] });
            setSelectedForRollback((prev) => {
                const next = new Set(prev);
                next.delete(node.fullPath);
                return next;
            });
            invalidate(projectPath, 'status');
            fetchStatus(projectPath, true);
        } finally {
        }
    }, [projectPath, fetchStatus, invalidate]);

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
        try {
            for (const path of selectedForRollback) {
                await invoke('git_execute', { projectPath, args: ['restore', path] });
                await invoke('git_execute', { projectPath, args: ['clean', '-fd', path] });
            }
            setSelectedForRollback(new Set());
            invalidate(projectPath, 'status');
            fetchStatus(projectPath, true);
        } finally {
        }
    }, [selectedForRollback, projectPath, fetchStatus, invalidate]);

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
                invalidate(projectPath, 'status');
                fetchStatus(projectPath, true);
                invalidate(projectPath, 'timeline');
                fetchTimeline(projectPath, true);
            }
        } finally {
            setIsCommitting(false);
        }
    }, [commitMessage, projectPath, isAnythingStaged, invalidate, fetchStatus, fetchTimeline]);

    const handleAbortMerge = useCallback(async () => {
        if (!confirm('Are you sure you want to abort the merge? This will discard all uncommitted changes.')) return;
        try {
            const res: { stdout: string, stderr: string, success: boolean } = await invoke('git_execute', { projectPath, args: ['merge', '--abort'] });
            if (!res.success) {
                setError(res.stderr || 'Failed to abort merge');
            }
            invalidate(projectPath, 'status');
            fetchStatus(projectPath, true);
            invalidate(projectPath, 'timeline');
            fetchTimeline(projectPath, true);
        } finally {
        }
    }, [projectPath, invalidate, fetchStatus, fetchTimeline]);


    const handleMasterToggle = useCallback(async () => {
        if (masterCheckState === 'checked') {
            await handleStageToggleAll(false);
        } else {
            await handleStageToggleAll(true);
        }
    }, [masterCheckState, handleStageToggleAll]);

    return (
        <div className="flex flex-col h-full min-w-0 bg-slate-950 border-l border-slate-800 w-full">
            {/* Sync Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 block">
                <h3 className="text-sm font-bold text-slate-300 flex items-center">
                    <Layers size={16} className="mr-2 text-nexus-accent" /> Source Control
                </h3>
                <div className="flex space-x-1">
                    <button onClick={() => { invalidate(projectPath, 'status'); fetchStatus(projectPath, true); }} className={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ${loading ? 'animate-spin' : ''}`} title="Refresh">
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-3 bg-nexus-danger/10 text-nexus-danger text-xs border-b border-nexus-danger/20 max-h-32 overflow-y-auto">
                    {error}
                </div>
            )}

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
                <div className="flex items-center justify-between px-3 mb-2 flex-wrap gap-2">
                    <div className="flex items-center cursor-pointer group" onClick={handleMasterToggle}>
                        <MasterCheckIcon size={14} className={`${masterCheckColor} group-hover:text-white transition-colors mr-2`} />
                        <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 uppercase tracking-wider">Changes ({totalFiles})</span>
                    </div>
                    {totalFiles > 0 && (
                        <button
                            onClick={handleDiscardSelected}
                            disabled={loading || selectedForRollback.size === 0}
                            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded bg-nexus-danger/20 text-nexus-danger border border-nexus-danger/40 hover:bg-nexus-danger/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Discard selected files (no confirmation)"
                        >
                            <RotateCcw size={12} />
                            Rollback selected ({selectedForRollback.size})
                        </button>
                    )}
                </div>
                {totalFiles === 0 ? (
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

            {/* Commit Box */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                {isMergeInProgress && (
                    <div className="mb-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded flex items-center justify-between">
                        <span className="text-xs font-bold text-orange-400 flex items-center">
                            <AlertTriangle size={12} className="mr-1" /> Merge in Progress
                        </span>
                        <button
                            onClick={handleAbortMerge}
                            className="text-[10px] font-bold px-2 py-1 bg-red-950 text-red-400 border border-red-900 rounded hover:bg-red-900 transition-colors"
                        >
                            Abort Merge
                        </button>
                    </div>
                )}
                <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message (Ctrl+Enter)"
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-nexus-accent min-h-[80px] mb-3 resize-none scrollbar-hide"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleCommit();
                        }
                    }}
                />
                <button
                    onClick={handleCommit}
                    disabled={isCommitting || !isAnythingStaged || !commitMessage.trim()}
                    className="w-full flex items-center justify-center py-2 bg-nexus-accent hover:bg-opacity-80 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-all"
                >
                    <GitCommit size={16} className="mr-2" />
                    {isCommitting ? 'Committing...' : 'Commit'}
                </button>
                <GitJiraCommitButton
                    projectPath={projectPath}
                    commitMessage={commitMessage}
                    isAnythingStaged={isAnythingStaged}
                    currentBranch={currentBranch}
                    onSuccess={() => {
                        setCommitMessage('');
                        invalidate(projectPath, 'status');
                        fetchStatus(projectPath, true);
                        invalidate(projectPath, 'timeline');
                        fetchTimeline(projectPath, true);
                    }}
                />
            </div>
        </div>
    );
};
