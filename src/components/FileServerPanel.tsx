import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Power, PowerOff, ChevronDown, ChevronUp, Plus, Trash2, Upload, FileText } from 'lucide-react';

export interface FileServerRouteEntry {
    path: string;
    content: string;
    content_type?: string;
}

const DEFAULT_FILE_SERVER_PORT = 3999;
const BIND_HOST_OPTIONS = [
    { value: '127.0.0.1', label: '127.0.0.1' },
    { value: 'localhost', label: 'localhost' },
    { value: '0.0.0.0', label: '0.0.0.0 (todas las interfaces)' },
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
    return {
        port: DEFAULT_FILE_SERVER_PORT,
        bindHost: '127.0.0.1',
        routes: [],
    };
}
function save(port: number, bindHost: string, routes: FileServerRouteEntry[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ port, bindHost, routes }));
}

export const FileServerPanel: React.FC = () => {
    const saved = loadSaved();
    const [running, setRunning] = useState(false);
    const [port, setPort] = useState(saved.port);
    const [routes, setRoutes] = useState<FileServerRouteEntry[]>(
        saved.routes.length > 0 ? saved.routes : [{ path: '/config.json', content: '{}' }]
    );
    const [bindHost, setBindHost] = useState(saved.bindHost);
    const [logs, setLogs] = useState<string[]>([]);
    const [logsCollapsed, setLogsCollapsed] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    // Sync with actual Rust state on mount (tab switch restores correct indicator)
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
        return () => {
            unlisten.then(fn => fn());
        };
    }, [running]);

    const addRoute = useCallback(() => {
        setRoutes(prev => [...prev, { path: '/config.json', content: '' }]);
    }, []);

    const removeRoute = useCallback((index: number) => {
        setRoutes(prev => prev.filter((_, i) => i !== index));
        setExpandedRoute(prev => (prev === index ? null : prev != null && prev > index ? prev - 1 : prev));
    }, []);

    const updateRoute = useCallback((index: number, field: 'path' | 'content', value: string) => {
        setRoutes(prev => {
            const next = [...prev];
            if (!next[index]) return next;
            next[index] = { ...next[index], [field]: value };
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
                next[index] = { ...next[index], content: text };
                return next;
            });
        };
        reader.readAsText(file);
        e.target.value = '';
    }, []);

    const triggerFileInput = useCallback((index: number) => {
        fileInputRefs.current[index]?.click();
    }, []);

    const handleStart = useCallback(async () => {
        setError(null);
        const valid = routes.filter(r => r.path.trim() && (r.content?.trim?.()?.length ?? 0) > 0);
        if (valid.length === 0) {
            setError('Añade al menos una ruta: path (URL) y contenido (sube archivo o escribe).');
            return;
        }
        const normalized = valid.map(r => ({
            path: r.path.trim().startsWith('/') ? r.path.trim() : `/${r.path.trim()}`,
            content: r.content,
            content_type: r.content_type || contentTypeFromPath(r.path),
        }));
        try {
            await invoke('start_file_server', {
                port,
                routes: normalized,
                bindHost: bindHost || undefined,
            });
            setRunning(true);
            setLogs(prev => [...prev.slice(-200), `Servidor iniciado en http://${bindHost}:${port}`]);
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

    const baseUrl = running ? `http://${bindHost}:${port}` : '';
    const canStart = routes.some(r => r.path.trim() && (r.content?.trim?.()?.length ?? 0) > 0);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-900">
            <div className="flex-1 overflow-auto p-4">
                {error && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-nexus-danger/10 border border-nexus-danger/30 text-nexus-danger text-xs">
                        {error}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <label className="text-xs text-slate-400">Puerto</label>
                    <input
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={e => setPort(parseInt(e.target.value, 10) || DEFAULT_FILE_SERVER_PORT)}
                        disabled={running}
                        className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono disabled:opacity-60"
                    />
                    {!running && (
                        <>
                            <label className="text-xs text-slate-400">Enlace (listen)</label>
                            <select
                                value={bindHost}
                                onChange={e => setBindHost(e.target.value)}
                                className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono"
                            >
                                {BIND_HOST_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </>
                    )}
                </div>

                <div className="mb-4 p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-slate-400">
                    <p className="font-semibold text-slate-300 mb-1">Rutas: path (URL) → contenido</p>
                    <p className="mb-1">
                        Para cada <strong>path</strong> (ej. <span className="font-mono">/config.json</span>) puedes <strong>subir un archivo</strong> (JSON, txt, etc.) o <strong>escribir el contenido directamente</strong>. Las configuraciones se guardan automáticamente.
                    </p>
                    <p className="text-slate-500">
                        Content-Type se infiere por la extensión del path (.json → application/json, etc.).
                    </p>
                </div>

                {!running && (
                    <div className="rounded-lg border border-slate-700 overflow-hidden mb-4">
                        <div className="bg-slate-800/80 px-3 py-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400">Rutas</span>
                            <button
                                type="button"
                                onClick={addRoute}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs text-nexus-neon hover:bg-nexus-neon/10 rounded transition-colors"
                            >
                                <Plus size={12} />
                                Añadir ruta
                            </button>
                        </div>
                        <div className="divide-y divide-slate-700">
                            {routes.map((r, i) => (
                                <div key={i} className="p-3 bg-slate-800/40">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={r.path}
                                            onChange={e => updateRoute(i, 'path', e.target.value)}
                                            placeholder="/config.json"
                                            className="min-w-[160px] bg-slate-800 border border-slate-600 rounded px-2 py-1.5 font-mono text-slate-200 text-xs placeholder:text-slate-500"
                                        />
                                        <input
                                            type="file"
                                            ref={el => { fileInputRefs.current[i] = el; }}
                                            accept=".json,.txt,.xml,.yaml,.yml,.html,.csv,.js"
                                            className="hidden"
                                            onChange={e => handleFileUpload(i, e)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => triggerFileInput(i)}
                                            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-nexus-neon border border-slate-600 hover:border-nexus-neon/50 rounded transition-colors"
                                        >
                                            <Upload size={12} />
                                            Subir archivo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedRoute(prev => prev === i ? null : i)}
                                            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-nexus-neon border border-slate-600 hover:border-nexus-neon/50 rounded transition-colors"
                                        >
                                            <FileText size={12} />
                                            {expandedRoute === i ? 'Ocultar editor' : 'Escribir contenido'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeRoute(i)}
                                            className="p-1.5 text-slate-500 hover:text-nexus-danger rounded transition-colors ml-auto"
                                            title="Quitar ruta"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {expandedRoute === i && (
                                        <textarea
                                            value={r.content}
                                            onChange={e => updateRoute(i, 'content', e.target.value)}
                                            placeholder='Ej: { "key": "value" }'
                                            className="w-full h-32 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-500 resize-y"
                                            spellCheck={false}
                                        />
                                    )}
                                    {r.content && expandedRoute !== i && (
                                        <p className="text-[11px] text-slate-500 mt-1 truncate" title={r.content.slice(0, 200)}>
                                            {r.content.length} caracteres
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        {routes.length === 0 && (
                            <div className="py-6 text-center text-slate-500 text-xs">
                                Sin rutas. Añade una y sube un archivo o escribe el contenido.
                            </div>
                        )}
                    </div>
                )}

                {!running ? (
                    <button
                        onClick={handleStart}
                        disabled={!canStart}
                        className="flex items-center gap-2 px-4 py-2 bg-nexus-neon text-nexus-darker font-bold rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 text-sm"
                    >
                        <Power size={14} />
                        Iniciar servidor
                    </button>
                ) : (
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-nexus-success animate-pulse" />
                            <span className="text-sm font-bold text-slate-200">Servidor en ejecución</span>
                            <span className="text-xs text-slate-500 font-mono">{baseUrl}</span>
                        </div>
                        <button
                            onClick={handleStop}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-nexus-danger hover:bg-nexus-danger/10 rounded-lg transition-colors"
                        >
                            <PowerOff size={14} />
                            Detener
                        </button>
                    </div>
                )}

                {running && routes.length > 0 && (
                    <div className="mb-4 p-2 rounded bg-slate-800/40 border border-slate-700 text-[11px] text-slate-400">
                        <p className="font-semibold text-slate-300 mb-1">Rutas activas</p>
                        <ul className="list-disc list-inside space-y-0.5 font-mono">
                            {routes.filter(r => r.path.trim()).map((r, i) => (
                                <li key={i}>
                                    <span className="text-nexus-neon">{r.path.trim().startsWith('/') ? r.path.trim() : `/${r.path.trim()}`}</span>
                                    {' · '}
                                    <span className="text-slate-500">{r.content?.length ?? 0} caracteres</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {running && (
                    <div className="mt-4 rounded-lg border border-slate-700 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setLogsCollapsed(!logsCollapsed)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/80 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors"
                        >
                            <span>Logs</span>
                            {logsCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {!logsCollapsed && (
                            <div className="h-40 overflow-y-auto bg-slate-950 p-2 font-mono text-[11px] text-slate-400 whitespace-pre-wrap break-all">
                                {logs.length === 0 ? 'Sin actividad aún.' : logs.join('\n')}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
