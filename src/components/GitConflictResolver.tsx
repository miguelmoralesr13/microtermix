import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Check, X, GitMerge, AlertCircle, Save, RefreshCw } from 'lucide-react';

interface GitConflictResolverProps {
    projectPath: string;
    file: string;
    onClose: () => void;
    onRefreshRequest?: () => void;
}

interface ConflictBlock {
    id: string;
    startLine: number;
    endLine: number;
    currentHeaderLine: number;
    dividerLine: number;
    incomingHeaderLine: number;
    currentContent: string;
    incomingContent: string;
    resolved: boolean;
    resolution?: 'current' | 'incoming' | 'both' | 'manual';
    markerStyleIds: string[];
}

export const GitConflictResolver: React.FC<GitConflictResolverProps> = ({ projectPath, file, onClose, onRefreshRequest }) => {
    const [fileContent, setFileContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflicts, setConflicts] = useState<ConflictBlock[]>([]);
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);

    const loadContent = async () => {
        setLoading(true);
        setError(null);
        try {
            const content: string = await invoke('read_file_content', { base: projectPath, file }) ?? '';
            setFileContent(content);
            parseConflicts(content);
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to read file');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadContent();
    }, [projectPath, file]);

    const parseConflicts = (text: string) => {
        const lines = text.split('\n');
        const foundConflicts: ConflictBlock[] = [];

        let inConflict = false;
        let c: Partial<ConflictBlock> = {};

        lines.forEach((line, index) => {
            const lineNum = index + 1;
            if (line.startsWith('<<<<<<<')) {
                inConflict = true;
                c = {
                    id: `conflict-${lineNum}`,
                    startLine: lineNum,
                    currentHeaderLine: lineNum,
                    currentContent: '',
                    incomingContent: '',
                    resolved: false,
                    markerStyleIds: []
                };
            } else if (line.startsWith('=======') && inConflict) {
                c.dividerLine = lineNum;
            } else if (line.startsWith('>>>>>>>') && inConflict) {
                c.endLine = lineNum;
                c.incomingHeaderLine = lineNum;
                foundConflicts.push(c as ConflictBlock);
                inConflict = false;
                c = {};
            } else if (inConflict) {
                // Collect content
                if (!c.dividerLine) {
                    c.currentContent += line + '\n';
                } else {
                    c.incomingContent += line + '\n';
                }
            }
        });

        setConflicts(foundConflicts);
    };

    // Apply decorations (CodeLens-like buttons) when Monaco mounts or conflicts change
    useEffect(() => {
        if (!monaco || !editorRef.current || conflicts.length === 0) return;

        const decorations = conflicts.flatMap(c => {
            if (c.resolved) return [];
            return [
                // Highlight Current side
                {
                    range: new monaco.Range(c.currentHeaderLine, 1, c.dividerLine! - 1, 1),
                    options: {
                        isWholeLine: true,
                        className: 'bg-emerald-900/40',
                        marginClassName: 'bg-emerald-500/50',
                    }
                },
                // Highlight Incoming side
                {
                    range: new monaco.Range(c.dividerLine! + 1, 1, c.endLine, 1),
                    options: {
                        isWholeLine: true,
                        className: 'bg-blue-900/40',
                        marginClassName: 'bg-blue-500/50',
                    }
                },
                // Color the marker lines themselves
                {
                    range: new monaco.Range(c.currentHeaderLine, 1, c.currentHeaderLine, 1),
                    options: { isWholeLine: true, className: 'text-emerald-400 font-bold bg-emerald-950', }
                },
                {
                    range: new monaco.Range(c.dividerLine!, 1, c.dividerLine!, 1),
                    options: { isWholeLine: true, className: 'text-slate-400 font-bold bg-slate-800', }
                },
                {
                    range: new monaco.Range(c.endLine, 1, c.endLine, 1),
                    options: { isWholeLine: true, className: 'text-blue-400 font-bold bg-blue-950', }
                }
            ];
        });

        // Store active decoration IDs so we can clear them later
        const oldIds = conflicts.flatMap(c => c.markerStyleIds || []);
        const newIds = editorRef.current.deltaDecorations(oldIds, decorations);

        // Update state with new IDs without triggering a re-render loop
        setConflicts(conflicts.map(c => ({ ...c, markerStyleIds: newIds })));
    }, [monaco, conflicts.length]); // Intentionally not depending on full 'conflicts' array to avoid loop

    const handleEditorMount = (editor: any) => {
        editorRef.current = editor;
    };

    const resolveConflict = (block: ConflictBlock, choice: 'current' | 'incoming' | 'both') => {
        const text = editorRef.current.getValue();
        const lines = text.split('\n');

        // Replace the conflict block with the chosen content
        const before = lines.slice(0, block.startLine - 1);
        const after = lines.slice(block.endLine);

        let resolvedLines: string[] = [];
        if (choice === 'current') {
            resolvedLines = block.currentContent.replace(/\n$/, '').split('\n');
        } else if (choice === 'incoming') {
            resolvedLines = block.incomingContent.replace(/\n$/, '').split('\n');
        } else if (choice === 'both') {
            resolvedLines = [
                ...block.currentContent.replace(/\n$/, '').split('\n'),
                ...block.incomingContent.replace(/\n$/, '').split('\n')
            ];
        }

        const newText = [...before, ...resolvedLines, ...after].join('\n');

        // Mark as resolved in state by replacing the text entirely and triggering a re-parse
        setFileContent(newText);
        parseConflicts(newText);
    };

    const handleSaveAndAdd = async () => {
        if (!editorRef.current) return;
        setSaving(true);
        setError(null);
        try {
            const finalContent = editorRef.current.getValue();

            // 1. Save file to disk
            await invoke('write_file_content', { base: projectPath, file, content: finalContent });

            // 2. git add to mark as resolved
            const addResult: any = await invoke('git_execute', { projectPath, args: ['add', file] });
            if (!addResult.success) throw new Error(addResult.stderr || "Failed to stage resolved file");

            onRefreshRequest?.();
            onClose();
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to save and resolve');
        } finally {
            setSaving(false);
        }
    };

    const remainingConflicts = conflicts.filter(c => !c.resolved).length;

    return (
        <div className="flex flex-col h-full w-full bg-slate-900 border-l border-slate-800 shadow-2xl animate-fade-in relative z-20">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
                <div className="flex items-center">
                    <button onClick={onClose} className="p-1 mr-2 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors">
                        <X size={16} />
                    </button>
                    <GitMerge size={16} className="text-orange-500 mr-2" />
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Resolve Conflict</h3>
                        <p className="text-xs font-mono text-slate-500">{file}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {remainingConflicts > 0 ? (
                        <span className="text-xs font-bold text-orange-400 flex items-center bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">
                            <AlertCircle size={12} className="mr-1" />
                            {remainingConflicts} Conflict{remainingConflicts !== 1 ? 's' : ''} Remaining
                        </span>
                    ) : (
                        <span className="text-xs font-bold text-nexus-success flex items-center bg-nexus-success/10 px-2 py-1 rounded border border-nexus-success/20">
                            <Check size={12} className="mr-1" />
                            All Conflicts Resolved
                        </span>
                    )}

                    <button
                        onClick={handleSaveAndAdd}
                        disabled={saving || remainingConflicts > 0}
                        className="flex items-center px-3 py-1.5 bg-nexus-success hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 text-xs font-bold rounded transition-colors"
                    >
                        {saving ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                        Mark as Resolved
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-nexus-danger/10 text-nexus-danger text-xs border-b border-nexus-danger/20 font-mono">
                    {error}
                </div>
            )}

            {/* Actions for current conflict (overlay) */}
            {conflicts.length > 0 && (
                <div className="bg-slate-900 border-b border-slate-800 p-2 flex gap-2 overflow-x-auto shrink-0">
                    <div className="text-xs text-slate-400 flex items-center px-2 border-r border-slate-800">
                        Quick Resolve First Conflict:
                    </div>
                    <button
                        onClick={() => resolveConflict(conflicts[0], 'current')}
                        className="text-xs px-3 py-1 bg-emerald-950 border border-emerald-900 text-emerald-400 rounded hover:bg-emerald-900 transition-colors"
                    >
                        Accept Current (HEAD)
                    </button>
                    <button
                        onClick={() => resolveConflict(conflicts[0], 'incoming')}
                        className="text-xs px-3 py-1 bg-blue-950 border border-blue-900 text-blue-400 rounded hover:bg-blue-900 transition-colors"
                    >
                        Accept Incoming
                    </button>
                    <button
                        onClick={() => resolveConflict(conflicts[0], 'both')}
                        className="text-xs px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-slate-700 transition-colors"
                    >
                        Accept Both
                    </button>
                </div>
            )}

            {/* Editor */}
            <div className="flex-1 min-h-0 relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-10">
                        <RefreshCw className="animate-spin text-slate-500" size={24} />
                    </div>
                ) : null}
                <Editor
                    height="100%"
                    language="typescript" // Should ideally be dynamic based on extension
                    theme="vs-dark"
                    value={fileContent}
                    onChange={(val) => {
                        setFileContent(val || '');
                        parseConflicts(val || '');
                    }}
                    onMount={handleEditorMount}
                    options={{
                        minimap: { enabled: true },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        fontFamily: "'Consolas', 'Courier New', monospace",
                        renderWhitespace: "selection",
                        wordWrap: "on",
                        glyphMargin: true,
                        renderValidationDecorations: "off" // Disable syntax errors since conflict markers break syntax
                    }}
                />
            </div>
        </div>
    );
};
