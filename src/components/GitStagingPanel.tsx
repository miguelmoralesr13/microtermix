import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitCommit, RefreshCw, Layers, CheckSquare, Square, MinusSquare, Trash2, ChevronRight, ChevronDown, Folder, File, RotateCcw } from 'lucide-react';

interface GitStatusEntry {
    file: string;
    stateCode: string;
    isStaged: boolean;
    isUnstaged: boolean;
}

interface ArrayTreeNode {
    name: string;
    fullPath: string;
    isLeaf: boolean;
    children: ArrayTreeNode[];
    status?: GitStatusEntry;
    checkState: 'checked' | 'unchecked' | 'partial';
}

interface GitStagingPanelProps {
    projectPath: string;
    onDiffRequest?: (file: string, mode: 'staged' | 'unstaged', line?: number) => void;
    onStatusRefresh?: () => void;
}

export const GitStagingPanel: React.FC<GitStagingPanelProps> = ({ projectPath, onDiffRequest, onStatusRefresh }) => {
    const [files, setFiles] = useState<GitStatusEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitting, setIsCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedForRollback, setSelectedForRollback] = useState<Set<string>>(new Set());
    const loadStatus = async () => {
        setLoading(true);
        setError(null);
        try {
            const result: { stdout: string, stderr: string, success: boolean } = await invoke('git_execute', {
                projectPath,
                args: ['status', '-s', '-u']
            });

            if (!result.success) {
                setError(result.stderr || 'Failed to fetch git status.');
                setFiles([]);
            } else {
                const lines = result.stdout.split('\n').filter(l => l.trim().length > 0);
                const parsedFiles: GitStatusEntry[] = lines.map(line => {
                    const stateCode = line.substring(0, 2);
                    let file = line.substring(3).trim();
                    if (file.includes('->')) {
                        file = file.split('->').pop()!.trim();
                    }
                    if (file.startsWith('"') && file.endsWith('"')) {
                        file = file.substring(1, file.length - 1);
                    }

                    const isStaged = stateCode[0] !== ' ' && stateCode[0] !== '?';
                    const isUnstaged = stateCode[1] !== ' ' && stateCode[1] !== '?' || stateCode === '??';

                    return { file, stateCode, isStaged, isUnstaged };
                });
                setFiles(parsedFiles);
            }
        } catch (e: any) {
            setError(e.toString());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectPath) loadStatus();
    }, [projectPath]);

    const handleStageToggleAll = async (stage: boolean) => {
        setLoading(true);
        try {
            if (stage) {
                await invoke('git_execute', { projectPath, args: ['add', '.'] });
            } else {
                await invoke('git_execute', { projectPath, args: ['restore', '--staged', '.'] });
            }
            await loadStatus();
            if (onStatusRefresh) onStatusRefresh();
        } finally {
            setLoading(false);
        }
    };

    const handleToggleNode = async (node: ArrayTreeNode) => {
        setLoading(true);
        try {
            if (node.checkState === 'checked') {
                // Fully staged, so unstage completely
                await invoke('git_execute', { projectPath, args: ['restore', '--staged', node.fullPath] });
            } else {
                // Partially or unstaged, so stage fully
                await invoke('git_execute', { projectPath, args: ['add', node.fullPath] });
            }
            await loadStatus();
            if (onStatusRefresh) onStatusRefresh();
        } finally {
            setLoading(false);
        }
    };

    const handleDiscardNode = async (node: ArrayTreeNode) => {
        setLoading(true);
        try {
            await invoke('git_execute', { projectPath, args: ['restore', node.fullPath] });
            await invoke('git_execute', { projectPath, args: ['clean', '-fd', node.fullPath] });
            setSelectedForRollback((prev) => {
                const next = new Set(prev);
                next.delete(node.fullPath);
                return next;
            });
            await loadStatus();
            if (onStatusRefresh) onStatusRefresh();
        } finally {
            setLoading(false);
        }
    };

    const toggleSelectedForRollback = (path: string) => {
        setSelectedForRollback((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const handleDiscardSelected = async () => {
        if (selectedForRollback.size === 0) return;
        setLoading(true);
        try {
            for (const path of selectedForRollback) {
                await invoke('git_execute', { projectPath, args: ['restore', path] });
                await invoke('git_execute', { projectPath, args: ['clean', '-fd', path] });
            }
            setSelectedForRollback(new Set());
            await loadStatus();
            if (onStatusRefresh) onStatusRefresh();
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async () => {
        if (!commitMessage.trim()) return;
        setIsCommitting(true);
        setError(null);
        try {
            const result: { stdout: string, stderr: string, success: boolean } = await invoke('git_execute', {
                projectPath,
                args: ['commit', '-m', commitMessage]
            });
            if (!result.success) {
                setError(result.stderr);
            } else {
                setCommitMessage('');
                await loadStatus();
                if (onStatusRefresh) onStatusRefresh();
            }
        } finally {
            setIsCommitting(false);
        }
    };

    const buildTree = (fileList: GitStatusEntry[]): ArrayTreeNode[] => {
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
                    else checkState = 'partial'; // Both
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
    };

    const tree = buildTree(files);

    const totalFiles = files.length;
    const fullyStagedFiles = files.filter(f => f.isStaged && !f.isUnstaged).length;
    const isAnythingStaged = files.some(f => f.isStaged);
    const masterCheckState = totalFiles === 0 ? 'unchecked' : (fullyStagedFiles === totalFiles ? 'checked' : (isAnythingStaged ? 'partial' : 'unchecked'));

    const MasterCheckIcon = masterCheckState === 'checked' ? CheckSquare : (masterCheckState === 'partial' ? MinusSquare : Square);
    const masterCheckColor = masterCheckState === 'checked' ? 'text-nexus-neon' : (masterCheckState === 'partial' ? 'text-nexus-accent' : 'text-slate-500');

    const handleMasterToggle = async () => {
        if (masterCheckState === 'checked') {
            await handleStageToggleAll(false);
        } else {
            await handleStageToggleAll(true);
        }
    };

    const FileTreeNodeItem: React.FC<{ node: ArrayTreeNode, level: number }> = ({ node, level }) => {
        const [expanded, setExpanded] = useState(true);

        const CheckIcon = node.checkState === 'checked' ? CheckSquare : (node.checkState === 'partial' ? MinusSquare : Square);
        const checkColor = node.checkState === 'checked' ? 'text-nexus-neon' : (node.checkState === 'partial' ? 'text-nexus-accent' : 'text-slate-500');

        if (node.isLeaf && node.status) {
            const f = node.status;
            const isAdded = f.stateCode.includes('A') || f.stateCode === '??';
            const isModified = f.stateCode.includes('M') || f.stateCode.includes('R') || f.stateCode.includes('C');
            const isDeleted = f.stateCode.includes('D');

            let colorClass = 'text-slate-400';
            if (isAdded) colorClass = 'text-nexus-success';
            if (isModified) colorClass = 'text-nexus-accent';
            if (isDeleted) colorClass = 'text-nexus-danger';

            const defaultDiffMode = f.isUnstaged ? 'unstaged' : 'staged';
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
                                onClick={(e) => { e.stopPropagation(); handleToggleNode(node); }}
                                className={`${checkColor} hover:text-white shrink-0 z-10 transition-colors`}
                            >
                                <CheckIcon size={14} />
                            </button>
                            <span className={`font-mono text-[10px] w-4 shrink-0 ${colorClass} font-bold`}>{f.stateCode.trim()}</span>
                            <File size={12} className="text-slate-500 shrink-0" />
                            <span className={`truncate transition-colors text-xs ${node.checkState === 'checked' ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{node.name}</span>
                        </div>

                        <div className="flex items-center shrink-0 ml-2 gap-0.5">
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleSelectedForRollback(node.fullPath); }}
                                className={`p-1 rounded transition-colors ${isSelectedForRollback ? 'text-nexus-danger bg-nexus-danger/20' : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-nexus-danger hover:bg-slate-700'}`}
                                title="Select for rollback"
                            >
                                {isSelectedForRollback ? <CheckSquare size={12} /> : <Square size={12} />}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDiscardNode(node); }}
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
                            onClick={(e) => { e.stopPropagation(); handleToggleNode(node); }}
                            className={`${checkColor} hover:text-white shrink-0 z-10 mr-2 transition-colors`}
                        >
                            <CheckIcon size={14} />
                        </button>
                        <Folder size={12} className="text-slate-500 mr-2 shrink-0" />
                        <span className="text-slate-400 text-xs font-medium truncate group-hover:text-slate-200">{node.name}</span>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDiscardNode(node); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-nexus-danger hover:bg-slate-700 rounded transition-all shrink-0 ml-2"
                        title="Discard All Changes in Folder"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
                {expanded && (
                    <div>
                        {node.children.map(child => (
                            <FileTreeNodeItem key={child.fullPath} node={child} level={level + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full min-w-0 bg-slate-950 border-l border-slate-800 w-full">
            {/* Sync Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 block">
                <h3 className="text-sm font-bold text-slate-300 flex items-center">
                    <Layers size={16} className="mr-2 text-nexus-accent" /> Source Control
                </h3>
                <div className="flex space-x-1">
                    <button onClick={loadStatus} className={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ${loading ? 'animate-spin' : ''}`} title="Refresh">
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
                        {tree.map(node => <FileTreeNodeItem key={node.fullPath} node={node} level={0} />)}
                    </div>
                )}
            </div>

            {/* Commit Box */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/30">
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
            </div>
        </div>
    );
};
