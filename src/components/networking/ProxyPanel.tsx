import React, { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Power, PowerOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useProcessStore } from '@/stores/processStore';
import { useWorkspace } from '@/context/WorkspaceContext';

export interface ProxyCandidate {
    project_path: string;
    display_name: string;
    port: number;
    preview_port?: number;
}

export interface ProxyRoute {
    path_prefix: string;
    target_url: string;
}

const DEFAULT_PROXY_PORT = 5173;
const BIND_HOST_OPTIONS = [
    { value: '127.0.0.1', label: '127.0.0.1' },
    { value: 'localhost', label: 'localhost' },
    { value: '0.0.0.0', label: '0.0.0.0 (todas las interfaces)' },
] as const;
const TARGET_HOST_OPTIONS = [
    { value: '127.0.0.1', label: '127.0.0.1' },
    { value: 'localhost', label: 'localhost' },
] as const;

export const ProxyPanel: React.FC = () => {
    const { state } = useWorkspace();
    const activeProcesses = useProcessStore(s => s.activeProcesses);

    const [proxyOn, setProxyOn] = useState(false);
    const [proxyPort, setProxyPort] = useState(DEFAULT_PROXY_PORT);
    const [hostPort, setHostPort] = useState<number | ''>('');
    const [interceptPrefix, setInterceptPrefix] = useState<string>('');
    const [bindHost, setBindHost] = useState<string>('127.0.0.1');
    const [targetHost, setTargetHost] = useState<string>('localhost');
    const [candidates, setCandidates] = useState<ProxyCandidate[]>([]);
    const [enabledRoutes, setEnabledRoutes] = useState<Record<string, boolean>>({});
    const [pathOverrides, setPathOverrides] = useState<Record<string, string>>({});
    const [portOverrides, setPortOverrides] = useState<Record<string, number>>({});
    const [proxyLogs, setProxyLogs] = useState<string[]>([]);
    const [logsCollapsed, setLogsCollapsed] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadCandidates = useCallback(async () => {
        if (!state.currentPath) {
            setCandidates([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const list = await invoke<ProxyCandidate[]>('get_proxy_candidates', {
                workspacePath: state.currentPath,
            });
            setCandidates(list);
            setPathOverrides(prev => {
                const next = { ...prev };
                list.forEach(c => {
                    if (next[c.project_path] === undefined) {
                        const prefix = c.display_name.startsWith('/') ? c.display_name : `/${c.display_name}`;
                        next[c.project_path] = prefix;
                    }
                });
                return next;
            });
            setPortOverrides(prev => {
                const next = { ...prev };
                list.forEach(c => {
                    if (next[c.project_path] === undefined) next[c.project_path] = c.port;
                });
                return next;
            });
            if (list.length > 0 && proxyPort === DEFAULT_PROXY_PORT && list[0].preview_port) {
                setProxyPort(list[0].preview_port);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setCandidates([]);
        } finally {
            setLoading(false);
        }
    }, [state.currentPath, proxyPort]);

    useEffect(() => {
        loadCandidates();
    }, [loadCandidates]);

    useEffect(() => {
        if (!proxyOn) return;
        const unlisten = listen<string>('proxy-logs', (event) => {
            const line = typeof event.payload === 'string' ? event.payload : String(event.payload);
            setProxyLogs(prev => [...prev.slice(-500), line]);
        });
        return () => {
            unlisten.then(fn => fn());
        };
    }, [proxyOn]);

    const isProjectRunning = (projectPath: string) =>
        Object.keys(activeProcesses).some(
            id => id.startsWith(`${projectPath}::`) && activeProcesses[id].status === 'running'
        );

    const handleStartProxy = async () => {
        setError(null);
        const host = targetHost || 'localhost';
        const routes: ProxyRoute[] = candidates
            .filter(c => enabledRoutes[c.project_path] && isProjectRunning(c.project_path))
            .map(c => {
                const pathPrefix = (pathOverrides[c.project_path] ?? `/${c.display_name}`).trim() || `/${c.display_name}`;
                const port = portOverrides[c.project_path] ?? c.port;
                return {
                    path_prefix: pathPrefix.startsWith('/') ? pathPrefix : `/${pathPrefix}`,
                    target_url: `http://${host}:${port}`,
                };
            });
        if (hostPort !== '' && typeof hostPort === 'number' && hostPort > 0) {
            routes.push({ path_prefix: '/', target_url: `http://${host}:${hostPort}` });
        }
        try {
            await invoke('start_proxy', {
                port: proxyPort,
                routes,
                bindHost: bindHost || undefined,
                interceptPrefix: interceptPrefix.trim() || undefined,
            });
            setProxyOn(true);
            setProxyLogs(prev => [...prev, `Proxy started on port ${proxyPort} with ${routes.length} route(s).`]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const handleStopProxy = async () => {
        setError(null);
        try {
            await invoke('stop_proxy');
            setProxyOn(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const pathFor = (c: ProxyCandidate) =>
        pathOverrides[c.project_path] ?? (c.display_name.startsWith('/') ? c.display_name : `/${c.display_name}`);
    const portFor = (c: ProxyCandidate) => portOverrides[c.project_path] ?? c.port;

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900">
            <div className="flex-1 overflow-auto p-4">
                {error && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-microtermix-danger/10 border border-microtermix-danger/30 text-microtermix-danger text-xs">
                        {error}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <label className="text-xs text-slate-400">Puerto del proxy</label>
                    <input
                        type="number"
                        min={1}
                        max={65535}
                        value={proxyPort}
                        onChange={e => setProxyPort(parseInt(e.target.value, 10) || DEFAULT_PROXY_PORT)}
                        disabled={proxyOn}
                        className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono disabled:opacity-60"
                    />
                    {!proxyOn && (
                        <>
                            <label className="text-xs text-slate-400" title="Sirve / y recursos (JS, CSS) desde este puerto para evitar error de MIME type">Host (/)</label>
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                value={hostPort === '' ? '' : hostPort}
                                onChange={e => setHostPort(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')}
                                placeholder="ej. 4000"
                                className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-500"
                            />
                            <label className="text-xs text-slate-400" title="Solo se interceptan rutas bajo este prefijo (ej. /mfe). El resto pasa transparente al Host (/). Relacionado con VITE_VAR_PF_POS_URL_DOMAIN.">Solo interceptar bajo</label>
                            <input
                                type="text"
                                value={interceptPrefix}
                                onChange={e => setInterceptPrefix(e.target.value)}
                                placeholder="ej. /mfe"
                                className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-500"
                            />
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
                            <label className="text-xs text-slate-400">Host para destinos</label>
                            <select
                                value={targetHost}
                                onChange={e => setTargetHost(e.target.value)}
                                className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono"
                            >
                                {TARGET_HOST_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </>
                    )}
                    {!proxyOn && (
                        <button
                            onClick={loadCandidates}
                            disabled={loading || !state.currentPath}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-microtermix-neon border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                            Refrescar candidatos
                        </button>
                    )}
                </div>

                {!proxyOn ? (
                    <>
                        <div className="mb-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-slate-400">
                            <p className="font-semibold text-slate-300 mb-1">Usar el proxy en la misma URL que el host</p>
                            <p className="mb-1">
                                Para abrir todo en <span className="font-mono text-slate-200">localhost:4000</span> sin cambiar de URL: pon <strong>Puerto del proxy</strong> = 4000 y <strong>Host (/)</strong> = 4001. Luego en tu app host (Vite) cambia <span className="font-mono">server.port</span> a 4001. El proxy escuchará en 4000 y redirigirá / al host (4001) y las rutas de MFEs a sus puertos.
                            </p>
                        </div>
                        <button
                            onClick={handleStartProxy}
                            disabled={!state.currentPath}
                            className="flex items-center gap-2 px-4 py-2 bg-microtermix-neon text-microtermix-darker font-bold rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 text-sm mb-4"
                        >
                            <Power size={14} />
                            Encender proxy
                        </button>
                    </>
                ) : (
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-microtermix-success animate-pulse" />
                            <span className="text-sm font-bold text-slate-200">Proxy encendido</span>
                            <span className="text-xs text-slate-500 font-mono">http://{bindHost}:{proxyPort}</span>
                        </div>
                        <button
                            onClick={handleStopProxy}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-microtermix-danger hover:bg-microtermix-danger/10 rounded-lg transition-colors"
                        >
                            <PowerOff size={14} />
                            Apagar proxy
                        </button>
                    </div>
                )}

                {candidates.length > 0 && (
                    <div className="rounded-lg border border-slate-700 overflow-hidden mb-4">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-slate-800/80">
                                    <th className="text-left py-2 px-3 font-semibold text-slate-500">Proyecto</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-500">Ruta</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-500">Puerto destino</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-500">Redirigir</th>
                                </tr>
                            </thead>
                            <tbody>
                                {candidates.map(c => {
                                    const running = isProjectRunning(c.project_path);
                                    return (
                                        <tr key={c.project_path} className="border-t border-slate-800">
                                            <td className="py-2 px-3 font-mono text-slate-300">{c.display_name}</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={pathFor(c)}
                                                    onChange={e => setPathOverrides(prev => ({ ...prev, [c.project_path]: e.target.value }))}
                                                    className="w-full max-w-[180px] bg-slate-800 border border-slate-600 rounded px-2 py-1 font-mono text-slate-200 text-[11px]"
                                                    placeholder="/nombre"
                                                />
                                            </td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={65535}
                                                    value={portFor(c)}
                                                    onChange={e => setPortOverrides(prev => ({ ...prev, [c.project_path]: parseInt(e.target.value, 10) || c.port }))}
                                                    className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 font-mono text-slate-200 text-[11px]"
                                                />
                                            </td>
                                            <td className="py-2 px-3">
                                                {running ? (
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!enabledRoutes[c.project_path]}
                                                            onChange={e => setEnabledRoutes(prev => ({ ...prev, [c.project_path]: e.target.checked }))}
                                                            className="accent-microtermix-neon"
                                                        />
                                                        <span className="text-slate-400">Activo</span>
                                                    </label>
                                                ) : (
                                                    <span className="text-slate-500 italic text-[10px]">Enciende el proceso en Terminals</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {candidates.length === 0 && !loading && state.currentPath && (
                    <div className="py-6 text-center text-slate-500 text-xs rounded-lg border border-slate-700 border-dashed">
                        No hay proyectos con vite.config en el workspace.
                    </div>
                )}

                {proxyOn && (
                    <div className="mt-4 rounded-lg border border-slate-700 overflow-hidden">
                        <button
                            onClick={() => setLogsCollapsed(!logsCollapsed)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/80 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors"
                        >
                            <span>Logs del proxy</span>
                            {logsCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {!logsCollapsed && (
                            <div className="h-40 overflow-y-auto bg-slate-950 p-2 font-mono text-[11px] text-slate-400 whitespace-pre-wrap break-all">
                                {proxyLogs.length === 0 ? 'Sin actividad aún.' : proxyLogs.join('\n')}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
