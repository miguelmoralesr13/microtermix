import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Check, X, GitMerge, AlertCircle, Save, RefreshCw, Undo, RotateCcw } from 'lucide-react';

interface GitConflictResolverProps {
    projectPath: string;
    file: string;
    onClose?: () => void;
    onRefreshRequest?: () => void;
    onSaved?: () => void;          // modal calls this after write+git add
    showCloseButton?: boolean;     // false when embedded in modal (default true)
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
}

const EXT_TO_MONACO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', html: 'html', xml: 'xml',
    md: 'markdown', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    rs: 'rust', go: 'go', py: 'python', sh: 'shell', bash: 'shell',
    c: 'c', cpp: 'cpp', h: 'c', java: 'java', kt: 'kotlin',
};

const getMonacoLanguage = (file: string): string => {
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    return EXT_TO_MONACO_LANG[ext] ?? 'plaintext';
};

// Pure module-level parser — no props/state dependencies, safe to call anywhere
const parseConflictBlocks = (text: string): ConflictBlock[] => {
    const lines = text.split('\n');
    const foundConflicts: ConflictBlock[] = [];
    let inConflict = false;
    let c: Partial<ConflictBlock> = {};
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        if (line.startsWith('<<<<<<<')) {
            inConflict = true;
            c = { id: `conflict-${lineNum}`, startLine: lineNum, currentHeaderLine: lineNum, currentContent: '', incomingContent: '', resolved: false };
        } else if (line.startsWith('=======') && inConflict) {
            c.dividerLine = lineNum;
        } else if (line.startsWith('>>>>>>>') && inConflict) {
            c.endLine = lineNum;
            c.incomingHeaderLine = lineNum;
            foundConflicts.push(c as ConflictBlock);
            inConflict = false;
            c = {};
        } else if (inConflict) {
            if (!c.dividerLine) { c.currentContent += line + '\n'; }
            else { c.incomingContent += line + '\n'; }
        }
    });
    return foundConflicts;
};

export const GitConflictResolver: React.FC<GitConflictResolverProps> = ({ projectPath, file, onClose, onRefreshRequest, onSaved, showCloseButton }) => {
    const [fileContent, setFileContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflicts, setConflicts] = useState<ConflictBlock[]>([]);
    const [activeConflictIdx, setActiveConflictIdx] = useState(0);
    const [isEditorReady, setIsEditorReady] = useState(false);
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);
    const decorationIdsRef = useRef<string[]>([]);

    const parseConflicts = (text: string) => {
        setConflicts(parseConflictBlocks(text));
    };

    const loadContent = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const content: string = await invoke('read_file_content', { base: projectPath, file }) ?? '';
            setFileContent(content);
            setConflicts(parseConflictBlocks(content));
        } catch (e: any) {
            setError(e?.toString?.() || 'Failed to read file');
        } finally {
            setLoading(false);
        }
    }, [projectPath, file]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    useEffect(() => {
        setActiveConflictIdx(0);
    }, [file]);

    // Apply decorations when Monaco mounts or conflicts change
    useEffect(() => {
        if (!monaco || !editorRef.current || !isEditorReady) return;
        
        const editor = editorRef.current;
        const totalLines = editor.getModel()?.getLineCount() || 0;

        if (conflicts.length === 0) {
            editor.setHiddenAreas([]);
            return;
        }

        const decorations = conflicts.flatMap(c => {
            if (c.resolved) return [];
            return [
                {
                    range: new monaco.Range(c.currentHeaderLine, 1, c.dividerLine! - 1, 1),
                    options: { isWholeLine: true, className: 'bg-emerald-900/40', marginClassName: 'bg-emerald-500/50' }
                },
                {
                    range: new monaco.Range(c.dividerLine! + 1, 1, c.endLine, 1),
                    options: { isWholeLine: true, className: 'bg-blue-900/40', marginClassName: 'bg-blue-500/50' }
                },
                {
                    range: new monaco.Range(c.currentHeaderLine, 1, c.currentHeaderLine, 1),
                    options: { isWholeLine: true, className: 'text-emerald-400 font-bold bg-emerald-950' }
                },
                {
                    range: new monaco.Range(c.dividerLine!, 1, c.dividerLine!, 1),
                    options: { isWholeLine: true, className: 'text-slate-400 font-bold bg-slate-800' }
                },
                {
                    range: new monaco.Range(c.endLine, 1, c.endLine, 1),
                    options: { isWholeLine: true, className: 'text-blue-400 font-bold bg-blue-950' }
                }
            ];
        });
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);

        // Hide lines outside the active conflict
        const active = conflicts[activeConflictIdx];
        if (active && totalLines > 0) {
            const CONTEXT_LINES = 8;
            const showStart = Math.max(1, active.startLine - CONTEXT_LINES);
            const showEnd = Math.min(totalLines, active.endLine + CONTEXT_LINES);

            const hiddenAreas = [];
            if (showStart > 1) {
                hiddenAreas.push(new monaco.Range(1, 1, showStart - 1, 1));
            }
            if (showEnd < totalLines) {
                hiddenAreas.push(new monaco.Range(showEnd + 1, 1, totalLines, 1));
            }
            editor.setHiddenAreas(hiddenAreas);
            // Re-center around the conflict
            editor.revealLineInCenterIfOutsideViewport(active.startLine);
        } else {
            editor.setHiddenAreas([]);
        }

    }, [monaco, conflicts, activeConflictIdx, isEditorReady]);

    const handleEditorMount = (editor: any) => {
        editorRef.current = editor;
        setIsEditorReady(true);
    };

    const scrollToConflict = (idx: number) => {
        setActiveConflictIdx(idx);
    };

    const resolveConflict = (block: ConflictBlock, choice: 'current' | 'incoming' | 'both') => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const text = editor.getValue();
        const lines = text.split('\n');
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
        
        // Preserve undo stack by using executeEdits
        const fullRange = editor.getModel().getFullModelRange();
        editor.pushUndoStop();
        editor.executeEdits('resolver', [{
            range: fullRange,
            text: newText,
            forceMoveMarkers: true
        }]);
        editor.pushUndoStop();

        const newConflicts = parseConflictBlocks(newText);
        setFileContent(newText);
        setConflicts(newConflicts);
        setActiveConflictIdx(prev => Math.max(0, Math.min(prev, newConflicts.length - 1)));
    };

    const handleUndo = () => {
        if (editorRef.current) {
            editorRef.current.trigger('keyboard', 'undo', null);
        }
    };

    const handleResetContent = () => {
        loadContent();
    };

    const handleSaveAndAdd = async () => {
        if (!editorRef.current) return;
        setSaving(true);
        setError(null);
        try {
            const finalContent = editorRef.current.getValue();
            await invoke('write_file_content', { base: projectPath, file, content: finalContent });
            const addResult: any = await invoke('git_execute', { projectPath, args: ['add', file] });
            if (!addResult.success) throw new Error(addResult.stderr || 'Failed to stage resolved file');
            if (onSaved) {
                onSaved();
            } else {
                onRefreshRequest?.();
                onClose?.();
            }
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
                    {(showCloseButton ?? true) && (
                        <button onClick={onClose} className="p-1 mr-2 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors">
                            <X size={16} />
                        </button>
                    )}
                    <GitMerge size={16} className="text-orange-500 mr-2" />
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Resolve Conflict</h3>
                        <p className="text-xs font-mono text-slate-500">{file}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-800/80 rounded border border-slate-700/50 px-1 py-1 gap-1 h-full">
                        <button onClick={handleUndo} title="Deshacer última acción (Ctrl+Z)" className="px-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded transition-colors flex items-center gap-1.5 text-[10px] font-bold">
                            <Undo size={12} /> Deshacer
                        </button>
                        <button onClick={handleResetContent} title="Restaurar a original" className="px-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded transition-colors flex items-center gap-1.5 text-[10px] font-bold">
                            <RotateCcw size={12} /> Reiniciar archivo
                        </button>
                    </div>

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
                        Guardar y marcar resuelto →
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-nexus-danger/10 text-nexus-danger text-xs border-b border-nexus-danger/20 font-mono">
                    {error}
                </div>
            )}

            {/* Per-conflict nav + preview bar */}
            {conflicts.length > 0 && (() => {
                const active = conflicts[activeConflictIdx];
                if (!active) return null;
                return (
                    <div className="bg-slate-900 border-b border-slate-800 shrink-0">
                        {/* Conflict navigator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60">
                            <span className="text-xs text-slate-400 font-medium">
                                Conflicto {activeConflictIdx + 1} de {conflicts.length}
                            </span>
                            <button
                                onClick={() => scrollToConflict(Math.max(0, activeConflictIdx - 1))}
                                disabled={activeConflictIdx === 0}
                                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >← Anterior</button>
                            <button
                                onClick={() => scrollToConflict(Math.min(conflicts.length - 1, activeConflictIdx + 1))}
                                disabled={activeConflictIdx === conflicts.length - 1}
                                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >Siguiente →</button>
                        </div>
                        {/* Preview + action buttons */}
                        <div className="flex gap-2 px-3 py-2 overflow-x-auto">
                            <div className="flex-1 min-w-0">
                                <div className="text-[9px] font-bold text-emerald-400 mb-0.5 uppercase tracking-wide">HEAD (actual)</div>
                                <pre className="text-[10px] text-emerald-300 bg-emerald-950/40 rounded px-2 py-1 max-h-16 overflow-auto font-mono whitespace-pre-wrap border border-emerald-900/30">
                                    {active.currentContent || '(vacío)'}
                                </pre>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[9px] font-bold text-blue-400 mb-0.5 uppercase tracking-wide">Incoming</div>
                                <pre className="text-[10px] text-blue-300 bg-blue-950/40 rounded px-2 py-1 max-h-16 overflow-auto font-mono whitespace-pre-wrap border border-blue-900/30">
                                    {active.incomingContent || '(vacío)'}
                                </pre>
                            </div>
                            <div className="flex flex-col gap-1 justify-center shrink-0">
                                <button onClick={() => resolveConflict(active, 'current')}
                                    className="text-[10px] px-3 py-1 bg-emerald-950 border border-emerald-900 text-emerald-400 rounded hover:bg-emerald-900 transition-colors whitespace-nowrap">
                                    Aceptar actual
                                </button>
                                <button onClick={() => resolveConflict(active, 'incoming')}
                                    className="text-[10px] px-3 py-1 bg-blue-950 border border-blue-900 text-blue-400 rounded hover:bg-blue-900 transition-colors whitespace-nowrap">
                                    Aceptar incoming
                                </button>
                                <button onClick={() => resolveConflict(active, 'both')}
                                    className="text-[10px] px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-slate-700 transition-colors whitespace-nowrap">
                                    Aceptar ambos
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Editor */}
            <div className="flex-1 min-h-0 relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-10">
                        <RefreshCw className="animate-spin text-slate-500" size={24} />
                    </div>
                ) : null}
                <Editor
                    height="100%"
                    language={getMonacoLanguage(file)}
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
