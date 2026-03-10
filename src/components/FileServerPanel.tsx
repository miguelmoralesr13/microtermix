import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Power, PowerOff, ChevronDown, ChevronUp, Plus, Trash2, Upload, Pencil, ExternalLink, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Editor from '@monaco-editor/react';

export interface FileServerRouteEntry {
    path: string;
    content: string;
    content_type?: string;
}

const LANGUAGES = [
    { value: 'json',       label: 'JSON' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'html',       label: 'HTML' },
    { value: 'css',        label: 'CSS' },
    { value: 'xml',        label: 'XML' },
    { value: 'yaml',       label: 'YAML' },
    { value: 'plaintext',  label: 'Texto plano' },
] as const;

type MonacoLang = typeof LANGUAGES[number]['value'];

function langFromPath(path: string): MonacoLang {
    const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '';
    const map: Record<string, MonacoLang> = {
        json: 'json', js: 'javascript', mjs: 'javascript',
        ts: 'typescript', tsx: 'typescript',
        html: 'html', htm: 'html',
        css: 'css', xml: 'xml',
        yaml: 'yaml', yml: 'yaml',
    };
    return map[ext] ?? 'plaintext';
}

const DEFAULT_FILE_SERVER_PORT = 3999;
const BIND_HOST_OPTIONS = [
    { value: '127.0.0.1', label: '127.0.0.1' },
    { value: 'localhost', label: 'localhost' },
    { value: '0.0.0.0', label: '0.0.0.0 (todas)' },
] as const;

function contentTypeFromPath(path: string): string {
    const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '';
    const map: Record<string, string> = {
        json: 'application/json',
        txt: 'text/plain; charset=utf-8',
        html: 'text/html; charset=utf-8',
        htm: 'text/html; charset=utf-8',
        xml: 'application/xml',
        csv: 'text/csv; charset=utf-8',
        yaml: 'application/x-yaml',
        yml: 'application/x-yaml',
        js: 'application/javascript',
        mjs: 'application/javascript',
        css: 'text/css',
    };
    return map[ext] || 'application/octet-stream';
}

const STORAGE_KEY = 'nexus-file-server';
function loadSaved(): { port: number; bindHost: string; routes: FileServerRouteEntry[] } {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const routes = Array.isArray(parsed.routes)
                ? parsed.routes.filter(
                    (r: unknown) =>
                        r &&
                        typeof r === 'object' &&
                        'path' in r &&
                        'content' in r &&
                        typeof (r as FileServerRouteEntry).path === 'string' &&
                        typeof (r as FileServerRouteEntry).content === 'string'
                )
                : [];
            return {
                port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_FILE_SERVER_PORT,
                bindHost: typeof parsed.bindHost === 'string' ? parsed.bindHost : '127.0.0.1',
                routes: routes as FileServerRouteEntry[],
            };
        }
    } catch (_) { }
    return { port: DEFAULT_FILE_SERVER_PORT, bindHost: '127.0.0.1', routes: [] };
}

function save(port: number, bindHost: string, routes: FileServerRouteEntry[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ port, bindHost, routes }));
}

export const FileServerPanel: React.FC = () => {
    const saved = loadSaved();
    const [running, setRunning] = useState(false);
    const [port, setPort] = useState(saved.port);
    const [routes, setRoutes] = useState<FileServerRouteEntry[]>(
        saved.routes.length > 0 ? saved.routes : [{ path: '/config.json', content: '{\n  \n}' }]
    );
    const [bindHost, setBindHost] = useState(saved.bindHost);
    const [logs, setLogs] = useState<string[]>([]);
    const [logsOpen, setLogsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [editLang, setEditLang] = useState<MonacoLang>('json');
    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    useEffect(() => {
        invoke<boolean>('is_file_server_running')
            .then(isRunning => setRunning(isRunning))
            .catch(() => { });
    }, []);

    useEffect(() => {
        save(port, bindHost, routes);
    }, [port, bindHost, routes]);

    useEffect(() => {
        if (!running) return;
        const unlisten = listen<string>('file-server-logs', (event) => {
            const line = typeof event.payload === 'string' ? event.payload : String(event.payload);
            setLogs(prev => [...prev.slice(-200), line]);
        });
        return () => { unlisten.then(fn => fn()); };
    }, [running]);

    const addRoute = useCallback(() => {
        setRoutes(prev => [...prev, { path: '/nuevo.json', content: '' }]);
    }, []);

    const removeRoute = useCallback((index: number) => {
        setRoutes(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateRoutePath = useCallback((index: number, value: string) => {
        setRoutes(prev => {
            const next = [...prev];
            if (!next[index]) return next;
            next[index] = { ...next[index], path: value };
            return next;
        });
    }, []);

    const handleFileUpload = useCallback((index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = typeof reader.result === 'string' ? reader.result : '';
            setRoutes(prev => {
                const next = [...prev];
                if (!next[index]) return next;
                const currentPath = next[index].path;
                const isGeneric = currentPath === '/nuevo.json' || currentPath === '/config.json';
                next[index] = {
                    ...next[index],
                    content: text,
                    path: isGeneric ? `/${file.name}` : currentPath,
                };
                return next;
            });
        };
        reader.readAsText(file);
        e.target.value = '';
    }, []);

    const openEditor = (index: number) => {
        setEditDraft(routes[index].content);
        setEditLang(langFromPath(routes[index].path));
        setEditingIndex(index);
    };

    const saveEditor = () => {
        if (editingIndex === null) return;
        setRoutes(prev => {
            const next = [...prev];
            next[editingIndex] = { ...next[editingIndex], content: editDraft };
            return next;
        });
        setEditingIndex(null);
    };

    const handleStart = useCallback(async () => {
        setError(null);
        const valid = routes.filter(r => r.path.trim() && (r.content?.trim?.()?.length ?? 0) > 0);
        if (valid.length === 0) {
            setError('Añade al menos una ruta con path y contenido.');
            return;
        }
        const normalized = valid.map(r => ({
            path: r.path.trim().startsWith('/') ? r.path.trim() : `/${r.path.trim()}`,
            content: r.content,
            content_type: r.content_type || contentTypeFromPath(r.path),
        }));
        try {
            await invoke('start_file_server', { port, routes: normalized, bindHost: bindHost || undefined });
            setRunning(true);
            setLogs(prev => [...prev.slice(-200), `▶ Servidor iniciado en http://${bindHost}:${port}`]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [port, routes, bindHost]);

    const handleStop = useCallback(async () => {
        setError(null);
        try {
            await invoke('stop_file_server');
            setRunning(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    const baseUrl = `http://${bindHost}:${port}`;
    const canStart = routes.some(r => r.path.trim() && (r.content?.trim?.()?.length ?? 0) > 0);
    const editingRoute = editingIndex !== null ? routes[editingIndex] : null;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-900">
            {/* Header bar */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Puerto</label>
                    <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={e => setPort(parseInt(e.target.value, 10) || DEFAULT_FILE_SERVER_PORT)}
                        disabled={running}
                        className="w-24 bg-slate-800 border-slate-700 text-slate-200 font-mono text-xs h-7 focus-visible:border-nexus-neon disabled:opacity-60"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Bind</label>
                    <Select value={bindHost} onValueChange={v => v && setBindHost(v)} disabled={running}>
                        <SelectTrigger className="h-7 border-slate-700 bg-slate-800 text-slate-200 font-mono text-xs focus-visible:border-nexus-neon disabled:opacity-60">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {BIND_HOST_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {running ? (
                        <>
                            <div className="flex items-center gap-2 mr-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-nexus-success animate-pulse" />
                                <a
                                    href={baseUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1"
                                >
                                    {baseUrl}
                                    <ExternalLink size={10} />
                                </a>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleStop}
                                className="text-nexus-danger hover:text-nexus-danger hover:bg-nexus-danger/10 gap-1.5 font-bold h-7 text-xs"
                            >
                                <PowerOff size={13} />
                                Detener
                            </Button>
                        </>
                    ) : (
                        <Button
                            onClick={handleStart}
                            disabled={!canStart}
                            className="bg-nexus-neon text-nexus-darker hover:bg-nexus-neon/80 font-bold gap-1.5 h-7 text-xs"
                        >
                            <Power size={13} />
                            Iniciar
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg bg-nexus-danger/10 border border-nexus-danger/30 text-nexus-danger text-xs">
                    {error}
                </div>
            )}

            {/* Routes list */}
            <div className="flex-1 overflow-auto p-4">
                <div className="rounded-lg border border-slate-700 overflow-hidden mb-3">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Path (URL)</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Content-Type</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tamaño</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contenido</span>
                        {!running && <span />}
                    </div>

                    {routes.length === 0 ? (
                        <div className="py-8 text-center text-slate-600 text-xs">
                            Sin rutas. Añade una abajo.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {routes.map((r, i) => (
                                <div
                                    key={i}
                                    className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-2 hover:bg-slate-800/30 transition-colors"
                                >
                                    {/* Path input */}
                                    <Input
                                        type="text"
                                        value={r.path}
                                        onChange={e => updateRoutePath(i, e.target.value)}
                                        placeholder="/config.json"
                                        disabled={running}
                                        className="bg-transparent border-transparent hover:border-slate-700 focus-visible:border-nexus-neon text-nexus-neon font-mono text-xs h-7 px-2 disabled:opacity-70 disabled:cursor-default"
                                    />

                                    {/* Content-type */}
                                    <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                                        {contentTypeFromPath(r.path).split(';')[0]}
                                    </span>

                                    {/* Size */}
                                    <span className="text-[10px] font-mono text-slate-600 w-16 text-right">
                                        {r.content.length > 0
                                            ? r.content.length < 1024
                                                ? `${r.content.length} B`
                                                : `${(r.content.length / 1024).toFixed(1)} KB`
                                            : <span className="text-slate-700">vacío</span>
                                        }
                                    </span>

                                    {/* Edit content button */}
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => openEditor(i)}
                                        className="text-slate-500 hover:text-nexus-neon"
                                        title="Editar contenido"
                                    >
                                        {r.content.length > 0
                                            ? <FileCode size={13} />
                                            : <Pencil size={13} />
                                        }
                                    </Button>

                                    {/* Upload + delete (edit mode only) */}
                                    {!running ? (
                                        <div className="flex items-center gap-0.5">
                                            <input
                                                type="file"
                                                ref={el => { fileInputRefs.current[i] = el; }}
                                                accept=".json,.txt,.xml,.yaml,.yml,.html,.csv,.js,.css"
                                                className="hidden"
                                                onChange={e => handleFileUpload(i, e)}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => fileInputRefs.current[i]?.click()}
                                                className="text-slate-500 hover:text-nexus-neon"
                                                title="Subir archivo"
                                            >
                                                <Upload size={13} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => removeRoute(i)}
                                                className="text-slate-500 hover:text-nexus-danger"
                                                title="Eliminar ruta"
                                            >
                                                <Trash2 size={13} />
                                            </Button>
                                        </div>
                                    ) : <span />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {!running && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={addRoute}
                        className="w-full border-dashed border-slate-700 text-slate-500 hover:text-nexus-neon hover:border-nexus-neon/50 hover:bg-nexus-neon/5 gap-2"
                    >
                        <Plus size={13} />
                        Añadir ruta
                    </Button>
                )}

                {/* Logs */}
                {running && (
                    <div className="mt-3 rounded-lg border border-slate-700 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setLogsOpen(v => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/80 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                Logs
                                {logs.length > 0 && (
                                    <span className="text-[10px] text-slate-600">{logs.length}</span>
                                )}
                            </span>
                            {logsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {logsOpen && (
                            <div className="h-48 overflow-y-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-400 whitespace-pre-wrap break-all">
                                {logs.length === 0 ? 'Sin actividad aún.' : logs.join('\n')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Content editor modal */}
            <Dialog open={editingIndex !== null} onOpenChange={open => !open && setEditingIndex(null)}>
                <DialogContent
                    className="!inset-4 !w-auto !h-auto !max-w-none !max-h-none !translate-x-0 !translate-y-0 rounded-xl flex flex-col bg-slate-900 border border-slate-700 p-0"
                    showCloseButton={false}
                >
                    <DialogHeader className="flex flex-row items-center gap-2 px-4 py-2.5 border-b border-slate-700 shrink-0">
                        <FileCode size={14} className="text-nexus-neon shrink-0" />
                        <DialogTitle className="text-slate-200 font-mono text-sm flex-1 truncate">
                            {editingRoute?.path || ''}
                        </DialogTitle>
                        <Select value={editLang} onValueChange={v => v && setEditLang(v as MonacoLang)}>
                            <SelectTrigger className="h-7 w-36 border-slate-700 bg-slate-800 text-slate-300 text-xs focus-visible:border-nexus-neon shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LANGUAGES.map(l => (
                                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </DialogHeader>

                    <div className="flex-1 min-h-0" style={{ height: 0 }}>
                        <Editor
                            height="100%"
                            language={editLang}
                            value={editDraft}
                            onChange={v => setEditDraft(v ?? '')}
                            theme="vs-dark"
                            options={{
                                fontSize: 13,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                lineNumbers: 'on',
                                tabSize: 2,
                                automaticLayout: true,
                                padding: { top: 12, bottom: 12 },
                            }}
                        />
                    </div>

                    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-slate-700 bg-slate-950/50">
                        <span className="text-[10px] font-mono text-slate-600">
                            {editDraft.length} chars · {editDraft.split('\n').length} líneas
                        </span>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setEditingIndex(null)} className="text-slate-400">
                                Cancelar
                            </Button>
                            <Button onClick={saveEditor} className="bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 font-bold">
                                Guardar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
