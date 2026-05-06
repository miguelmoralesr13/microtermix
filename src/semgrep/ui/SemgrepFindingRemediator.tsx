import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import {
    FileText, Code2, CheckCircle2,
    Maximize2, Minimize2, ExternalLink,
    Lock, Wand2, BookOpen, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import type { SemgrepFinding } from '../domain/SemgrepFinding';
import { getLanguageFromPath } from '../domain/SemgrepFinding';

interface SemgrepRemediatorProps {
    finding: SemgrepFinding;
    projectPath: string;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export const SemgrepFindingRemediator: React.FC<SemgrepRemediatorProps> = ({
    finding, projectPath, isOpen, onClose, onSaved
}) => {
    const [content, setContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [activePanel, setActiveTab] = useState<'both' | 'edit'>('both');

    const filePath = `${projectPath}/${finding.path}`;
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Inyectar estilos específicos de seguridad
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            .semgrep-error-line { background: rgba(220, 38, 38, 0.15) !important; border-left: 3px solid #dc2626 !important; }
            .semgrep-error-margin { background: #dc2626 !important; width: 5px !important; margin-left: 5px; }
        `;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    // Cargar archivo
    useEffect(() => {
        if (!isOpen) return;
        const loadFile = async () => {
            try {
                const data = await invoke<string>('read_text_file', { path: filePath });
                setContent(data);
                setOriginalContent(data);
            } catch (e) {
                toast.error(`Error de lectura: ${e}`);
            }
        };
        loadFile();
    }, [filePath, isOpen]);

    const handleSave = useCallback(async (newContent: string) => {
        if (newContent === originalContent && originalContent !== '') return;
        setIsSaving(true);
        try {
            await invoke('write_file_content', { path: filePath, content: newContent });
            setOriginalContent(newContent);
            onSaved?.();
        } catch (e) {
            toast.error(`Error guardando: ${e}`);
        } finally {
            setIsSaving(false);
        }
    }, [filePath, originalContent, onSaved]);

    const onEditorChange = (value: string | undefined) => {
        const val = value || '';
        setContent(val);
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => handleSave(val), 2000);
    };

    const handleApplyFix = () => {
        if (finding.extra?.fix) {
            setContent(finding.extra.fix);
            handleSave(finding.extra.fix);
            toast.success("Parche aplicado con éxito");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="!max-w-[92vw] !w-[92vw] h-[92vh] p-0 gap-0 bg-slate-950 border-slate-800 overflow-hidden flex flex-col shadow-2xl">
                <DialogHeader className="h-12 shrink-0 border-b border-slate-800 bg-emerald-950/10 px-4 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-red-500/10 rounded border border-red-500/20">
                            <Lock size={16} className="text-red-400" />
                        </div>
                        <DialogTitle className="text-xs font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
                            Security Remediation: <span className="text-emerald-400">{finding.ruleId}</span>
                        </DialogTitle>
                    </div>
                    <div className="flex items-center gap-4 pr-8">
                        <div className="flex items-center gap-2 px-2.5 py-0.5 bg-slate-900 rounded-full border border-slate-800">
                            <div className={cn("w-1.5 h-1.5 rounded-full", isSaving ? "bg-orange-500 animate-pulse" : "bg-emerald-500")} />
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                {isSaving ? 'Saving' : 'Protected'}
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Panel 1: Security Context */}
                    <div className="w-80 shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Vulnerability</p>
                                <div className={cn(
                                    "p-4 rounded-xl border flex flex-col gap-3",
                                    finding.severity === 'ERROR' ? "bg-red-500/5 border-red-500/20 text-red-400" : "bg-yellow-500/5 border-yellow-500/20 text-yellow-400"
                                )}>
                                    <div className="flex items-center gap-2">
                                        <AlertCircle size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{finding.severity}</span>
                                    </div>
                                    <p className="text-[11px] leading-relaxed font-bold text-slate-200">{finding.message}</p>
                                </div>
                            </div>

                            {finding.extra?.fix && (
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        <Wand2 size={16} />
                                        <p className="text-[10px] font-black uppercase">Auto-fix available</p>
                                    </div>
                                    <p className="text-[10px] text-emerald-300/80 leading-relaxed italic">Semgrep has identified a potential fix for this issue.</p>
                                    <Button onClick={handleApplyFix} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] h-8 gap-2">
                                        Apply Magic Patch
                                    </Button>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-blue-400">
                                    <BookOpen size={16} />
                                    <p className="text-[10px] font-black uppercase">Technical References</p>
                                </div>
                                <div className="grid gap-2">
                                    {finding.extra?.metadata?.cwe?.map((cwe: string) => (
                                        <a
                                            key={cwe}
                                            href={`https://cwe.mitre.org/data/definitions/${cwe.split(':')[1]}.html`}
                                            target="_blank"
                                            className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between group hover:border-blue-500/50 transition-all"
                                        >
                                            <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-400">{cwe}</span>
                                            <ExternalLink size={12} className="text-slate-600" />
                                        </a>
                                    ))}
                                    {finding.extra?.metadata?.owasp?.map((ow: string) => (
                                        <div key={ow} className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-bold text-slate-400">
                                            {ow}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-900/30 border-t border-slate-800">
                            <Button className="w-full justify-start gap-2 text-[10px] h-8 text-slate-500 hover:text-slate-300" variant="ghost">
                                <CheckCircle2 size={14} /> Dismiss as Safe
                            </Button>
                        </div>
                    </div>

                    {/* Panel 2: Preview */}
                    <div className={cn("flex-1 border-r border-slate-800 flex flex-col bg-slate-950", activePanel === 'edit' && "hidden")}>
                        <div className="h-8 px-3 flex items-center bg-slate-900/30 border-b border-slate-800 gap-2">
                            <FileText size={12} className="text-slate-500" />
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Original Code</span>
                        </div>
                        <div className="flex-1">
                            <Editor
                                height="100%" language={getLanguageFromPath(finding.path)} theme="vs-dark" value={originalContent}
                                options={{ readOnly: true, fontSize: 12, lineNumbers: 'on', minimap: { enabled: false }, glyphMargin: true, lineDecorationsWidth: 10, domReadOnly: true }}
                                onMount={(editor, monaco) => {
                                    if (finding.line) {
                                        editor.revealLineInCenter(finding.line);
                                        editor.deltaDecorations([], [{
                                            range: new monaco.Range(finding.line, 1, finding.line, 1),
                                            options: { isWholeLine: true, className: 'semgrep-error-line', glyphMarginClassName: 'semgrep-error-margin' }
                                        }]);
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Panel 3: Interactive Editor */}
                    <div className="flex-1 flex flex-col bg-[#020617]">
                        <div className="h-8 px-3 flex items-center justify-between bg-slate-900/30 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Code2 size={12} className="text-emerald-500" />
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Interactive Fix</span>
                            </div>
                            <button onClick={() => setActiveTab(activePanel === 'edit' ? 'both' : 'edit')} className="p-1 hover:bg-slate-800 rounded text-slate-500">
                                {activePanel === 'edit' ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                            </button>
                        </div>
                        <div className="flex-1">
                            <Editor
                                height="100%" language={getLanguageFromPath(finding.path)} theme="vs-dark" value={content} onChange={onEditorChange}
                                options={{
                                    fontSize: 12,
                                    minimap: { enabled: true },
                                    formatOnPaste: true,
                                    formatOnType: true,
                                    quickSuggestions: false,
                                    suggestOnTriggerCharacters: false,
                                    parameterHints: { enabled: false },
                                    lightbulb: { enabled: false },
                                    snippetSuggestions: 'none',
                                    wordBasedSuggestions: "off",
                                    links: false,
                                    occurrencesHighlight: "off",
                                    colorDecorators: false,
                                    folding: false,
                                    glyphMargin: false,
                                }}
                                onMount={(editor) => {
                                    finding.line && editor.revealLineInCenter(finding.line);
                                    const monaco = (window as any).monaco;
                                    if (monaco) {
                                        monaco.languages.typescript?.javascriptDefaults.setDiagnosticsOptions({
                                            noSemanticValidation: true,
                                            noSyntaxValidation: true,
                                        });
                                        monaco.languages.typescript?.typescriptDefaults.setDiagnosticsOptions({
                                            noSemanticValidation: true,
                                            noSyntaxValidation: true,
                                        });
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
