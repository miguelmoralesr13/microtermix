import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { 
    AlertTriangle, Lightbulb, Save, 
    FileText, CheckCircle2,
    Maximize2, Minimize2, Shield, RefreshCw
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { normalizeSonarUrl } from '../utils/sonarUtils';
import { useSonarStore } from '../stores/sonarStore';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from './ui/dialog';

interface SonarIssue {
    key: string;
    rule: string;
    severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
    type: string;
    message: string;
    component: string;
    line?: number;
}

interface SonarIssueRemediatorProps {
    issue: SonarIssue;
    projectPath: string;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export const SonarIssueRemediator: React.FC<SonarIssueRemediatorProps> = ({ 
    issue, projectPath, isOpen, onClose, onSaved 
}) => {
    const sonarConfig = useSonarStore(s => s.config);
    const [content, setContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [ruleDesc, setRuleDesc] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activePanel, setActiveTab] = useState<'both' | 'edit'>('both');
    
    const filePath = `${projectPath}/${issue.component}`;
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Inyectar estilos para el resaltado de Sonar
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            .sonar-error-line { background: rgba(239, 68, 68, 0.15) !important; border-left: 3px solid #ef4444 !important; }
            .sonar-error-margin { background: #ef4444 !important; width: 5px !important; margin-left: 5px; }
            .sonar-docs h2, .sonar-docs h3 { color: #60a5fa; font-weight: 800; margin-top: 1.2rem; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #1e293b; padding-bottom: 4px; margin-bottom: 0.5rem; }
            .sonar-docs p { margin-bottom: 0.8rem; color: #cbd5e1; }
            .sonar-docs code { background: #1e293b; padding: 1px 4px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; color: #f8fafc; font-size: 10px; }
            .sonar-docs pre { background: #020617; padding: 12px; border-radius: 8px; margin: 10px 0; border: 1px solid #1e293b; overflow-x: auto; font-size: 10px; }
            .sonar-docs ul { list-style-type: disc; margin-left: 1.5rem; margin-bottom: 1rem; color: #94a3b8; }
            .sonar-docs li { margin-bottom: 0.3rem; }
            .sonar-docs .compliant { color: #10b981; font-weight: bold; }
            .sonar-docs .noncompliant { color: #ef4444; font-weight: bold; }
        `;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const authHeader = (token: string) =>
        sonarConfig.authType === 'bearer'
            ? `Bearer ${token}`
            : `Basic ${btoa(token + ':')}`;

    // Cargar archivo y descripción de regla
    useEffect(() => {
        if (!isOpen) return;
        
        const loadData = async () => {
            setLoading(true);
            try {
                const fileData = await invoke<string>('read_file', { path: filePath });
                setContent(fileData);
                setOriginalContent(fileData);

                if (issue.rule && sonarConfig.token) {
                    const baseUrl = normalizeSonarUrl(sonarConfig.serverUrl);
                    const url = `${baseUrl}/api/rules/show?key=${encodeURIComponent(issue.rule)}${sonarConfig.organization ? `&organization=${sonarConfig.organization}` : ''}`;
                    
                    const resp = await tauriFetch(url, { headers: { Authorization: authHeader(sonarConfig.token) } });
                    if (resp.ok) {
                        const data = await resp.json() as any;
                        setRuleDesc(data.rule?.htmlDesc || data.rule?.mdDesc || 'No hay descripción técnica detallada.');
                    } else {
                        setRuleDesc(`<div class="text-slate-500 italic py-4">No se pudo cargar la documentación desde Sonar (HTTP ${resp.status}).</div>`);
                    }
                }
            } catch (e) {
                toast.error(`Error de carga: ${e}`);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [filePath, issue.rule, isOpen]);

    const handleSave = useCallback(async (newContent: string) => {
        if (newContent === originalContent && originalContent !== '') return;
        setIsSaving(true);
        try {
            await invoke('write_file', { path: filePath, content: newContent });
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

    const getLanguage = () => {
        const ext = issue.component.split('.').pop()?.toLowerCase();
        const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', java: 'java', go: 'go' };
        return map[ext || ''] || 'plaintext';
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="!max-w-[90vw] !w-[90vw] h-[92vh] p-0 gap-0 bg-slate-950 border-slate-800 overflow-hidden flex flex-col shadow-2xl transition-all">
                {/* Overlay de carga inicial */}
                {loading && (
                    <div className="absolute inset-0 z-[50] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                        <RefreshCw size={32} className="animate-spin text-blue-500" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Cargando contexto...</p>
                    </div>
                )}

                <DialogHeader className="h-12 shrink-0 border-b border-slate-800 bg-slate-900/40 px-4 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-blue-500/10 rounded border border-blue-500/20">
                            <Shield size={16} className="text-blue-400" />
                        </div>
                        <DialogTitle className="text-xs font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
                            Remediador Sonar: <span className="text-blue-400">{issue.rule}</span>
                        </DialogTitle>
                    </div>
                    <div className="flex items-center gap-4 pr-10">
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 rounded-full border border-slate-800">
                            <div className={cn("w-1.5 h-1.5 rounded-full", isSaving ? "bg-orange-500 animate-pulse" : "bg-emerald-500")} />
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                                {isSaving ? 'Guardando...' : 'Sincronizado'}
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Panel 1: Info & Receta (Izquierda) */}
                    <div className="w-[340px] shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                            {/* Detalles del Fallo */}
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Detalles del Fallo</p>
                                <div className={cn(
                                    "p-4 rounded-xl border flex gap-3",
                                    issue.severity === 'BLOCKER' || issue.severity === 'CRITICAL' 
                                        ? "bg-red-500/10 border-red-500/30 text-red-400" 
                                        : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                                )}>
                                    <AlertTriangle size={20} className="shrink-0" />
                                    <div>
                                        <p className="text-[11px] font-black uppercase mb-1">{issue.severity} | {issue.type}</p>
                                        <p className="text-[11px] leading-relaxed font-medium">{issue.message}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Receta de Arreglo */}
                            <div>
                                <div className="flex items-center gap-2 text-blue-400 mb-4">
                                    <Lightbulb size={16} />
                                    <p className="text-[10px] font-black uppercase tracking-widest">¿Cómo arreglarlo?</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                                        <p className="text-[11px] text-slate-300 leading-relaxed italic">
                                            "Identifica la línea resaltada en rojo y aplica la lógica correcta siguiendo las sugerencias de la documentación técnica."
                                        </p>
                                    </div>
                                    <div className="space-y-2.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase ml-1">Paso a paso:</p>
                                        {[
                                            'Revisa el código original resaltado en el panel central.',
                                            'Aplica la corrección en el editor interactivo derecho.',
                                            'El sistema autoguardará tus cambios cada 2 segundos.',
                                            'Refresca el análisis de Sonar para validar el arreglo.'
                                        ].map((step, i) => (
                                            <div key={i} className="flex gap-3 text-[11px] text-slate-400 leading-snug">
                                                <span className="text-blue-500 font-black">{i+1}.</span>
                                                <p>{step}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Documentación Técnica (Si carga) */}
                            {ruleDesc && (
                                <div className="pt-6 border-t border-slate-800">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <FileText size={14} /> Doc. de Sonar
                                    </p>
                                    <div 
                                        className="sonar-docs pb-6 opacity-80"
                                        dangerouslySetInnerHTML={{ __html: ruleDesc }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Botones de Acción */}
                        <div className="p-4 bg-slate-900/30 border-t border-slate-800 space-y-2">
                            <Button className="w-full justify-start gap-2 text-[10px] h-8 bg-slate-900 hover:bg-slate-800 border-slate-800" variant="outline">
                                <CheckCircle2 size={14} className="text-emerald-500" /> Marcar como Falso Positivo
                            </Button>
                            <Button className="w-full justify-start gap-2 text-[10px] h-8 bg-slate-900 hover:bg-slate-800 border-slate-800" variant="outline">
                                <Shield size={14} className="text-blue-500" /> Solicitar Revisión
                            </Button>
                        </div>
                    </div>

                    {/* Panel 2: Preview */}
                    <div className={cn("flex-1 border-r border-slate-800 flex flex-col bg-slate-950", activePanel === 'edit' && "hidden")}>
                        <div className="h-8 px-3 flex items-center bg-slate-900/30 border-b border-slate-800 gap-2">
                            <FileText size={12} className="text-slate-500" />
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Código Original</span>
                        </div>
                        <div className="flex-1">
                            <Editor
                                height="100%" language={getLanguage()} theme="vs-dark" value={originalContent}
                                options={{ readOnly: true, fontSize: 12, lineNumbers: 'on', minimap: { enabled: false }, glyphMargin: true, lineDecorationsWidth: 10, domReadOnly: true, renderLineHighlight: 'none' }}
                                onMount={(editor, monaco) => {
                                    if (issue.line) {
                                        editor.revealLineInCenter(issue.line);
                                        editor.deltaDecorations([], [{
                                            range: new monaco.Range(issue.line, 1, issue.line, 1),
                                            options: { isWholeLine: true, className: 'sonar-error-line', glyphMarginClassName: 'sonar-error-margin' }
                                        }]);
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Panel 3: Editor */}
                    <div className="flex-1 flex flex-col bg-[#020617]">
                        <div className="h-8 px-3 flex items-center justify-between bg-slate-900/30 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Save size={12} className={isSaving ? "text-orange-500 animate-pulse" : "text-emerald-500"} />
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Corrección (Auto-save)</span>
                            </div>
                            <button onClick={() => setActiveTab(activePanel === 'edit' ? 'both' : 'edit')} className="p-1 hover:bg-slate-800 rounded text-slate-500">
                                {activePanel === 'edit' ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                            </button>
                        </div>
                        <div className="flex-1">
                            <Editor
                                height="100%" language={getLanguage()} theme="vs-dark" value={content} onChange={onEditorChange}
                                options={{ fontSize: 12, minimap: { enabled: true }, scrollBeyondLastLine: false, formatOnPaste: true, formatOnType: true }}
                                onMount={(editor) => issue.line && editor.revealLineInCenter(issue.line)}
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
