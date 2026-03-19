import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import jsYaml from 'js-yaml';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { useSwaggerStore } from '@/stores/swaggerStore';
import {
    Eye, EyeOff, FolderOpen, Download, ArrowLeftRight,
    CheckCircle2, XCircle, FileCode2, AlertCircle, Copy,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type SpecFormat  = 'json' | 'yaml';
type SpecVersion = 'swagger-2.0' | 'openapi-3.0' | 'openapi-3.1' | 'unknown';

interface DetectedSpec {
    format:       SpecFormat;
    version:      SpecVersion;
    versionLabel: string;
}

// ── Detection ────────────────────────────────────────────────────────────────

function detectSpec(text: string): DetectedSpec {
    const trimmed = text.trim();
    const isJson  = trimmed.startsWith('{');
    const format: SpecFormat = isJson ? 'json' : 'yaml';

    let obj: Record<string, unknown> | null = null;
    try {
        obj = isJson
            ? JSON.parse(trimmed)
            : (jsYaml.load(trimmed) as Record<string, unknown>);
    } catch {
        return { format, version: 'unknown', versionLabel: 'Desconocido' };
    }

    if (!obj || typeof obj !== 'object') {
        return { format, version: 'unknown', versionLabel: 'Desconocido' };
    }

    if (typeof obj['swagger'] === 'string' && obj['swagger'].startsWith('2')) {
        return { format, version: 'swagger-2.0', versionLabel: 'Swagger 2.0' };
    }
    if (typeof obj['openapi'] === 'string') {
        const v = obj['openapi'] as string;
        if (v.startsWith('3.1')) return { format, version: 'openapi-3.1', versionLabel: `OpenAPI ${v}` };
        if (v.startsWith('3.0')) return { format, version: 'openapi-3.0', versionLabel: `OpenAPI ${v}` };
    }
    return { format, version: 'unknown', versionLabel: 'Desconocido' };
}

function parseSpecObj(text: string, format: SpecFormat): Record<string, unknown> | null {
    try {
        return format === 'json'
            ? JSON.parse(text)
            : (jsYaml.load(text) as Record<string, unknown>);
    } catch {
        return null;
    }
}

// ── Version badge colours ────────────────────────────────────────────────────

const VERSION_COLORS: Record<SpecVersion, string> = {
    'swagger-2.0': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'openapi-3.0': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'openapi-3.1': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    'unknown':     'bg-slate-700/40 text-slate-400 border-slate-600',
};

// ── Default placeholder ───────────────────────────────────────────────────────

const PLACEHOLDER = `openapi: "3.0.3"
info:
  title: Mi API
  version: "1.0.0"
paths:
  /ping:
    get:
      summary: Ping
      responses:
        "200":
          description: OK
`;

const EDITOR_MIN_PX = 200;
const PREVIEW_MIN_PX = 200;

// ── Component ─────────────────────────────────────────────────────────────────

export const SwaggerPanel: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const { 
        text, setText, 
        preview, setPreview, 
        editorPx, setEditorPx 
    } = useSwaggerStore();

    const [copied, setCopied]     = useState(false);
    const [specObj, setSpecObj]   = useState<Record<string, unknown> | null>(null);
    const [detected, setDetected] = useState<DetectedSpec>(() => detectSpec(text));
    const [valid, setValid]       = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Resizable split — stored as editor width in px; null = 50%
    const bodyRef                   = useRef<HTMLDivElement>(null);
    const draggingRef               = useRef(false);

    const onResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (ev: MouseEvent) => {
            if (!draggingRef.current || !bodyRef.current) return;
            const rect   = bodyRef.current.getBoundingClientRect();
            const total  = rect.width;
            const newW   = ev.clientX - rect.left;
            const clamped = Math.min(total - PREVIEW_MIN_PX, Math.max(EDITOR_MIN_PX, newW));
            setEditorPx(clamped);
        };
        const onUp = () => {
            draggingRef.current = false;
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleReparse = useCallback((value: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const det = detectSpec(value);
            setDetected(det);
            const obj = parseSpecObj(value, det.format);
            if (obj) {
                setSpecObj(obj);
                setValid(true);
                setErrorMsg(null);
            } else {
                setSpecObj(null);
                setValid(false);
                setErrorMsg('Sintaxis inválida');
            }
        }, 300);
    }, []);

    useEffect(() => { scheduleReparse(text); }, []);

    const handleChange = (val: string | undefined) => {
        const v = val ?? '';
        setText(v);
        scheduleReparse(v);
    };

    // ── Import ────────────────────────────────────────────────────────────────

    const handleImport = async () => {
        try {
            const file = await openDialog({
                multiple: false,
                title: 'Importar spec',
                filters: [{ name: 'API Spec', extensions: ['json', 'yaml', 'yml'] }],
            });
            if (!file || Array.isArray(file)) return;
            const content = await invoke<string>('read_file_at_path', { path: file });
            setText(content);
            scheduleReparse(content);
            toast.success('Spec importada');
        } catch (e) {
            toast.error(`Error importando: ${e}`);
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────

    const handleExport = async () => {
        try {
            const ext  = detected.format === 'json' ? 'json' : 'yaml';
            const path = await saveDialog({
                title: 'Exportar spec',
                filters: [{ name: 'API Spec', extensions: [ext, 'yml'] }],
                defaultPath: `api-spec.${ext}`,
            });
            if (!path) return;
            await invoke('notes_write_file', { path, content: text });
            toast.success(`Exportado a ${path}`);
        } catch (e) {
            toast.error(`Error exportando: ${e}`);
        }
    };

    // ── JSON ↔ YAML ──────────────────────────────────────────────────────────

    const handleConvert = async () => {
        try {
            let converted: string;
            if (detected.format === 'json') {
                converted = await invoke<string>('json_convert_format', { input: text, target: 'yaml' });
            } else {
                converted = await invoke<string>('yaml_to_json_cmd', { input: text });
                converted = JSON.stringify(JSON.parse(converted), null, 2);
            }
            setText(converted);
            scheduleReparse(converted);
            toast.success(detected.format === 'json' ? 'Convertido a YAML' : 'Convertido a JSON');
        } catch (e) {
            toast.error(`Error convirtiendo: ${e}`);
        }
    };

    const monacoLang = detected.format === 'json' ? 'json' : 'yaml';

    // Editor pane style: fixed px when dragged, else 50%
    const editorStyle: React.CSSProperties = preview
        ? editorPx !== null
            ? { width: editorPx, minWidth: EDITOR_MIN_PX, flexShrink: 0 }
            : { width: '50%', minWidth: EDITOR_MIN_PX, flexShrink: 0 }
        : { flex: 1, minWidth: 0 };

    return (
        <div className="flex-1 flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-950 border-b border-slate-800">
                <FileCode2 size={15} className="text-violet-400 shrink-0" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0">
                    Swagger / OpenAPI Editor
                </span>

                {/* Version badge */}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${VERSION_COLORS[detected.version]}`}>
                    {detected.versionLabel}
                </span>

                {/* Validation badge */}
                {valid ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                        <CheckCircle2 size={11} /> Válido
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-[10px] text-red-400">
                        <XCircle size={11} /> {errorMsg}
                    </span>
                )}

                <div className="flex-1" />

                <Button size="sm" variant="ghost"
                    onClick={() => {
                        navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                    {copied
                        ? <><CheckCircle2 size={13} className="text-emerald-400" /> Copiado</>
                        : <><Copy size={13} /> Copiar</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleImport}
                    className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                    <FolderOpen size={13} /> Importar
                </Button>
                <Button size="sm" variant="ghost" onClick={handleExport}
                    className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                    <Download size={13} /> Exportar
                </Button>
                <Button size="sm" variant="ghost" onClick={handleConvert}
                    className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                    <ArrowLeftRight size={13} />
                    {detected.format === 'json' ? '→ YAML' : '→ JSON'}
                </Button>
                <Button size="sm" variant={preview ? 'outline' : 'ghost'}
                    onClick={() => setPreview(!preview)}

                    className="h-7 text-xs gap-1">
                    {preview ? <><EyeOff size={13} /> Solo editor</> : <><Eye size={13} /> Preview</>}
                </Button>
            </div>

            {/* Body */}
            <div ref={bodyRef} className="flex-1 min-h-0 flex overflow-hidden">
                {/* Editor pane */}
                <div style={editorStyle} className="overflow-hidden">
                    <Editor
                        height="100%"
                        language={monacoLang}
                        theme={monacoTheme}
                        value={text}
                        onChange={handleChange}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            wordWrap: 'on',
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            padding: { top: 12, bottom: 12 },
                        }}
                    />
                </div>

                {/* Drag handle (only when preview is visible) */}
                {preview && (
                    <div
                        onMouseDown={onResizeStart}
                        className="w-1 shrink-0 cursor-col-resize bg-slate-800 hover:bg-violet-500/50 transition-colors"
                    />
                )}

                {/* Preview pane */}
                {preview && (
                    <div className="flex-1 min-w-0 overflow-auto bg-white">
                        {specObj ? (
                            <SwaggerUI
                                spec={specObj}
                                docExpansion="list"
                                defaultModelsExpandDepth={1}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-900">
                                <AlertCircle size={32} className="text-slate-600" />
                                <span className="text-sm text-slate-500">
                                    {errorMsg ?? 'Escribe un spec válido para ver el preview'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
