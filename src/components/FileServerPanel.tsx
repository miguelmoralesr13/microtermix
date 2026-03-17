import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Power, PowerOff, Plus, Trash2, Upload, Pencil, ExternalLink, FileCode, FolderOpen, QrCode, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { open } from '@tauri-apps/plugin-dialog';
import { cn } from '@/lib/utils';

export interface FileServerRouteEntry {
    path: string;
    content: string;
    content_type?: string;
}

const LANGUAGES = [
    { value: 'json', label: 'JSON' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'xml', label: 'XML' },
    { value: 'yaml', label: 'YAML' },
    { value: 'plaintext', label: 'Texto plano' },
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

const STORAGE_KEY = 'microtermix-file-server';
function loadSaved(): { port: number; bindHost: string; routes: FileServerRouteEntry[]; baseDir?: string } {
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
                        'content' in r
                )
                : [];
            return {
                port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_FILE_SERVER_PORT,
                bindHost: typeof parsed.bindHost === 'string' ? parsed.bindHost : '127.0.0.1',
                routes: routes as FileServerRouteEntry[],
                baseDir: typeof parsed.baseDir === 'string' ? parsed.baseDir : undefined,
            };
        }
    } catch (_) { }
    return { port: DEFAULT_FILE_SERVER_PORT, bindHost: '127.0.0.1', routes: [] };
}

function save(port: number, bindHost: string, routes: FileServerRouteEntry[], baseDir?: string) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ port, bindHost, routes, baseDir }));
}

export const FileServerPanel: React.FC = () => {
    const saved = useMemo(() => loadSaved(), []);
    const monacoTheme = useMonacoTheme();
    const [running, setRunning] = useState(false);
    const [port, setPort] = useState(saved.port);
    const [routes, setRoutes] = useState<FileServerRouteEntry[]>(
        saved.routes.length > 0 ? saved.routes : [{ path: '/config.json', content: '{\n  \n}' }]
    );
    const [bindHost, setBindHost] = useState(saved.bindHost);
    const [baseDir, setBaseDir] = useState<string | undefined>(saved.baseDir);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [editLang, setEditLang] = useState<MonacoLang>('json');
    const [showQr, setShowQr] = useState(false);
    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    useEffect(() => {
        invoke<boolean>('is_file_server_running')
            .then(isRunning => setRunning(isRunning))
            .catch(() => { });
    }, []);

    useEffect(() => {
        save(port, bindHost, routes, baseDir);
    }, [port, bindHost, routes, baseDir]);

    useEffect(() => {
        if (!running) return;
        const unlisten = listen<string>('file-server-logs', (event) => {
            const line = typeof event.payload === 'string' ? event.payload : String(event.payload);
            setLogs(prev => [...prev.slice(-500), line]);
        });
        return () => { unlisten.then(fn => fn()); };
    }, [running]);

    const handleSelectFolder = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Seleccionar carpeta para el servidor'
        });
        if (selected && !Array.isArray(selected)) {
            setBaseDir(selected);
        }
    };

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

        const config = {
            port,
            bindHost: bindHost || undefined,
            base_directory: baseDir,
            routes: valid.map(r => ({
                path: r.path.trim().startsWith('/') ? r.path.trim() : `/${r.path.trim()}`,
                content: r.content,
                content_type: r.content_type || contentTypeFromPath(r.path),
            }))
        };

        try {
            await invoke('start_file_server', { config });
            setRunning(true);
            setLogs([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [port, routes, bindHost, baseDir]);

    const handleStop = useCallback(async () => {
        setError(null);
        try {
            await invoke('stop_file_server');
            setRunning(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    const baseUrl = `http://${bindHost === '0.0.0.0' ? 'localhost' : bindHost}:${port}`;
    const canStart = baseDir || routes.some(r => r.path.trim() && (r.content?.trim?.()?.length ?? 0) > 0);
    const editingRoute = editingIndex !== null ? routes[editingIndex] : null;

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-950">
            {/* Header bar */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Puerto</label>
                    <Input
                        type="number" min={1} max={65535} value={port}
                        onChange={e => setPort(parseInt(e.target.value, 10) || DEFAULT_FILE_SERVER_PORT)}
                        disabled={running}
                        className="w-20 bg-slate-900 border-slate-800 text-slate-200 font-mono text-xs h-8 focus-visible:ring-microtermix-neon disabled:opacity-60"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Host</label>
                    <Select value={bindHost} onValueChange={v => v && setBindHost(v)} disabled={running}>
                        <SelectTrigger className="h-8 w-28 border-slate-800 bg-slate-900 text-slate-200 font-mono text-xs focus:ring-microtermix-neon">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {BIND_HOST_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="h-6 w-px bg-slate-800 mx-1" />

                <div className="flex items-center gap-2 flex-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Carpeta Base</label>
                    <div className="flex-1 flex gap-1">
                        <Input
                            readOnly
                            value={baseDir || 'Sin carpeta física (solo rutas virtuales)'}
                            className="flex-1 bg-slate-900 border-slate-800 text-slate-400 font-mono text-[10px] h-8 truncate"
                        />
                        {!running && (
                            <Button variant="outline" size="icon-xs" onClick={handleSelectFolder} className="h-8 w-8 bg-slate-900 border-slate-800 hover:bg-slate-800">
                                <FolderOpen size={14} className="text-microtermix-accent" />
                            </Button>
                        )}
                        {!running && baseDir && (
                            <Button variant="ghost" size="icon-xs" onClick={() => setBaseDir(undefined)} className="h-8 w-8 text-slate-600 hover:text-red-400">
                                <Trash2 size={14} />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {running ? (
                        <>
                            <div className="flex items-center gap-3 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mr-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <a href={baseUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1.5">
                                    {baseUrl} <ExternalLink size={12} />
                                </a>
                                <Button variant="ghost" size="icon-xs" onClick={() => setShowQr(true)} className="text-emerald-500 hover:text-emerald-300 h-6 w-6 p-0">
                                    <QrCode size={14} />
                                </Button>
                            </div>
                            <Button variant="destructive" size="sm" onClick={handleStop} className="h-8 gap-1.5 font-bold text-xs">
                                <PowerOff size={14} /> Detener
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleStart} disabled={!canStart} className="bg-microtermix-neon text-microtermix-darker hover:bg-microtermix-neon/80 font-black gap-1.5 h-8 text-xs uppercase">
                            <Power size={14} /> Iniciar Servidor
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg bg-microtermix-danger/10 border border-microtermix-danger/30 text-microtermix-danger text-xs flex items-center gap-2">
                    <Activity size={14} /> <span>{error}</span>
                </div>
            )}

            <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
                <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <FileCode size={12} /> Rutas Virtuales (en memoria)
                        </h3>
                        {!running && (
                            <Button
                                variant="outline"
                                size="xs"
                                onClick={addRoute}
                                className="h-7 border-dashed border-slate-700 text-slate-500 hover:text-microtermix-neon hover:border-microtermix-neon/40 hover:bg-microtermix-neon/5 gap-2"
                            >
                                <Plus size={14} /> Añadir Ruta
                            </Button>
                        )}
                    </div>

                    {routes.length === 0 ? (
                        <div className="py-12 text-center text-slate-700 text-xs italic border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                            No hay rutas virtuales configuradas.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {routes.map((r, i) => {
                                const contentType = contentTypeFromPath(r.path).split(';')[0];
                                const isJson = contentType.includes('json');
                                const isHtml = contentType.includes('html');

                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex flex-col rounded-xl border p-3 transition-all group relative",
                                            running ? "bg-slate-900/20 border-slate-800 opacity-80" : "bg-slate-900/40 border-slate-800 hover:border-slate-600 hover:shadow-lg hover:shadow-microtermix-neon/5"
                                        )}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                isJson ? "bg-amber-500/10 text-amber-500" :
                                                    isHtml ? "bg-blue-500/10 text-blue-500" :
                                                        "bg-slate-500/10 text-slate-500"
                                            )}>
                                                <FileCode size={16} />
                                            </div>
                                            <Badge variant="outline" className="text-[9px] font-mono border-slate-800 bg-slate-950 text-slate-500 h-5">
                                                {contentType.split('/').pop()}
                                            </Badge>
                                        </div>

                                        <div className="flex-1 space-y-2">
                                            <div className="relative group/input">
                                                <Input
                                                    type="text"
                                                    value={r.path}
                                                    onChange={e => updateRoutePath(i, e.target.value)}
                                                    placeholder="/config.json"
                                                    disabled={running}
                                                    className="bg-slate-950/50 border-slate-800 text-microtermix-neon font-mono text-[11px] h-8 px-2 pr-8 focus-visible:ring-1 focus-visible:ring-microtermix-neon disabled:opacity-100 disabled:border-transparent"
                                                />
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-700 group-hover/input:text-slate-500">
                                                    <ExternalLink size={10} />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[10px] font-mono text-slate-600">
                                                    {r.content.length > 0 ? (r.content.length < 1024 ? `${r.content.length} B` : `${(r.content.length / 1024).toFixed(1)} KB`) : '0 B'}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Tooltip>
                                                        <TooltipTrigger render={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-xs"
                                                                onClick={() => openEditor(i)}
                                                                className="h-7 w-7 text-slate-500 hover:text-microtermix-neon hover:bg-slate-800"
                                                            >
                                                                <Pencil size={12} />
                                                            </Button>
                                                        } />
                                                        <TooltipContent>Editar contenido</TooltipContent>
                                                    </Tooltip>

                                                    {!running && (
                                                        <>
                                                            <input type="file" ref={el => { fileInputRefs.current[i] = el; }} className="hidden" onChange={e => handleFileUpload(i, e)} />
                                                            <Tooltip>
                                                                <TooltipTrigger render={
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon-xs"
                                                                        onClick={() => fileInputRefs.current[i]?.click()}
                                                                        className="h-7 w-7 text-slate-500 hover:text-microtermix-neon hover:bg-slate-800"
                                                                    >
                                                                        <Upload size={12} />
                                                                    </Button>
                                                                } />
                                                                <TooltipContent>Subir archivo</TooltipContent>
                                                            </Tooltip>

                                                            <Tooltip>
                                                                <TooltipTrigger render={
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon-xs"
                                                                        onClick={() => removeRoute(i)}
                                                                        className="h-7 w-7 text-slate-500 hover:text-microtermix-danger hover:bg-red-500/10"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </Button>
                                                                } />
                                                                <TooltipContent>Eliminar ruta</TooltipContent>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Logs */}
                {running && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden flex flex-col flex-1 min-h-[300px]">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Activity size={12} className="text-emerald-500" /> Monitor de Tráfico
                            </h3>
                            <span className="text-[10px] font-mono text-slate-600">{logs.length} peticiones</span>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-950/50 p-4 font-mono text-[11px] space-y-1">
                            {logs.length === 0 ? (
                                <div className="text-slate-700 italic">Esperando tráfico...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className={cn(
                                        "py-0.5 border-l-2 pl-3 transition-colors",
                                        log.includes('-> 200') ? "border-emerald-500/30 text-slate-400" : "border-red-500/30 text-red-400 bg-red-500/5"
                                    )}>
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* QR Modal */}
            <Dialog open={showQr} onOpenChange={setShowQr}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-[320px] flex flex-col items-center p-8">
                    <DialogHeader className="items-center text-center pb-4">
                        <DialogTitle className="text-lg font-bold">Acceso Remoto</DialogTitle>
                        <DialogDescription className="text-slate-400 text-center">
                            Escanea para abrir en tu móvil o tablet (asegúrate de estar en la misma red).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-4 bg-white rounded-2xl shadow-2xl shadow-microtermix-neon/10">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(baseUrl.replace('localhost', '127.0.0.1'))}`} alt="QR Code" className="w-48 h-48" />
                    </div>
                    <div className="mt-6 w-full p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">URL Detectada</p>
                        <p className="text-xs font-mono text-microtermix-neon truncate">{baseUrl}</p>
                    </div>
                    <Button className="mt-6 w-full" variant="outline" onClick={() => setShowQr(false)}>Cerrar</Button>
                </DialogContent>
            </Dialog>

            {/* Content editor modal */}
            <Dialog open={editingIndex !== null} onOpenChange={open => !open && setEditingIndex(null)}>
                <DialogContent className="!inset-4 !w-auto !h-auto !max-w-none !max-h-none !translate-x-0 !translate-y-0 rounded-xl flex flex-col bg-slate-900 border border-slate-700 p-0" showCloseButton={false}>
                    <DialogHeader className="flex flex-row items-center gap-2 px-4 py-2.5 border-b border-slate-700 shrink-0">
                        <FileCode size={14} className="text-microtermix-neon shrink-0" />
                        <DialogTitle className="text-slate-200 font-mono text-sm flex-1 truncate">{editingRoute?.path || ''}</DialogTitle>
                        <Select value={editLang} onValueChange={v => v && setEditLang(v as MonacoLang)}>
                            <SelectTrigger className="h-7 w-36 border-slate-700 bg-slate-800 text-slate-300 text-xs focus-visible:border-microtermix-neon shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>{LANGUAGES.map(l => (<SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>))}</SelectContent>
                        </Select>
                    </DialogHeader>
                    <div className="flex-1 min-h-0" style={{ height: 0 }}>
                        <Editor height="100%" language={editLang} value={editDraft} onChange={v => setEditDraft(v ?? '')} theme={monacoTheme} options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', lineNumbers: 'on', tabSize: 2, automaticLayout: true, padding: { top: 12, bottom: 12 } }} />
                    </div>
                    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-slate-700 bg-slate-950/50">
                        <span className="text-[10px] font-mono text-slate-600">{editDraft.length} chars · {editDraft.split('\n').length} líneas</span>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setEditingIndex(null)} className="text-slate-400">Cancelar</Button>
                            <Button onClick={saveEditor} className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold">Guardar</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
