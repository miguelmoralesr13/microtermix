import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Plus, Trash2 } from 'lucide-react';

const VITE_WRAPPER_STORAGE_PREFIX = 'nexus-vite-wrapper-';

function storageKey(projectPath: string): string {
    return `${VITE_WRAPPER_STORAGE_PREFIX}${projectPath.replace(/[/\\:]/g, '_')}`;
}

export interface ViteRemoteEntry {
    name: string;
    default_url: string;
}

export interface ViteFederationInfo {
    federation_name: string;
    remotes: ViteRemoteEntry[];
}

export interface ViteWrapperConfig {
    enabled: boolean;
    remotes: Record<string, string>;
    disabledRemotes?: string[];
    base?: string;
    sourcemap?: boolean;
    host?: string;
}

export interface ProxyCandidateItem {
    project_path: string;
    display_name: string;
}

interface ViteWrapperModalProps {
    onClose: () => void;
    workspacePath: string;
    candidates: ProxyCandidateItem[];
}

export const ViteWrapperModal: React.FC<ViteWrapperModalProps> = ({
    onClose,
    candidates,
}) => {
    const candidatePaths = useMemo(() => candidates.map(c => c.project_path), [candidates]);
    const namesInWorkspace = useMemo(() => new Set(candidates.map(c => c.display_name)), [candidates]);

    const [selectedPath, setSelectedPath] = useState<string>(candidatePaths[0] ?? '');
    const [enabled, setEnabled] = useState(false);
    const [remotes, setRemotes] = useState<Record<string, string>>({});
    const [federationName, setFederationName] = useState('');
    const [remoteList, setRemoteList] = useState<ViteRemoteEntry[]>([]);
    const [disabledRemotes, setDisabledRemotes] = useState<Set<string>>(new Set());
    const [base, setBase] = useState('');
    const [sourcemap, setSourcemap] = useState(false);
    const [host, setHost] = useState('');
    const [loading, setLoading] = useState(false);
    const [newRemoteName, setNewRemoteName] = useState('');
    const [newRemoteUrl, setNewRemoteUrl] = useState('');

    const persistCurrentProject = useCallback(() => {
        if (!selectedPath) return;
        const config: ViteWrapperConfig = { enabled, remotes, disabledRemotes: [...disabledRemotes], base: base || undefined, sourcemap: sourcemap || undefined, host: host || undefined };
        localStorage.setItem(storageKey(selectedPath), JSON.stringify(config));
    }, [selectedPath, enabled, remotes, disabledRemotes, base, sourcemap, host]);

    const loadFederation = useCallback(async (projectPath: string) => {
        if (!projectPath) return;
        setLoading(true);
        try {
            const info = await invoke<ViteFederationInfo>('parse_vite_federation', {
                projectPath,
            });
            setFederationName(info.federation_name);
            const onlyInWorkspace = info.remotes.filter(r => namesInWorkspace.has(r.name));
            setRemoteList(onlyInWorkspace);
            const savedRaw = localStorage.getItem(storageKey(projectPath));
            let saved: Partial<ViteWrapperConfig> = {};
            try {
                if (savedRaw) saved = JSON.parse(savedRaw);
            } catch (_) { }
            setEnabled(!!saved.enabled);
            setDisabledRemotes(new Set(saved.disabledRemotes ?? []));
            setBase(saved.base ?? '');
            setSourcemap(!!saved.sourcemap);
            setHost(saved.host ?? '');
            const merged: Record<string, string> = {};
            onlyInWorkspace.forEach(r => {
                merged[r.name] = saved.remotes?.[r.name] ?? r.default_url;
            });
            if (saved.remotes) {
                Object.entries(saved.remotes).forEach(([k, v]) => {
                    if (namesInWorkspace.has(k) && !(k in merged)) merged[k] = v;
                });
            }
            setRemotes(merged);
        } catch (_) {
            setFederationName('');
            setRemoteList([]);
            setRemotes({});
        } finally {
            setLoading(false);
        }
    }, [namesInWorkspace]);

    useEffect(() => {
        if (selectedPath) loadFederation(selectedPath);
    }, [selectedPath, loadFederation]);

    useEffect(() => {
        if (candidatePaths.length && !selectedPath) setSelectedPath(candidatePaths[0]);
    }, [candidatePaths.length, selectedPath]);

    const handleProjectChange = (newPath: string) => {
        persistCurrentProject();
        setSelectedPath(newPath);
    };

    const handleSave = () => {
        const config: ViteWrapperConfig = { enabled, remotes, disabledRemotes: [...disabledRemotes], base: base || undefined, sourcemap: sourcemap || undefined, host: host || undefined };
        localStorage.setItem(storageKey(selectedPath), JSON.stringify(config));
        onClose();
    };

    const toggleRemote = (name: string) => {
        setDisabledRemotes(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const setRemoteUrl = (name: string, url: string) => {
        setRemotes(prev => ({ ...prev, [name]: url }));
    };

    const removeRemote = (name: string) => {
        setRemotes(prev => {
            const next = { ...prev };
            delete next[name];
            return next;
        });
    };

    const addManualRemote = () => {
        const name = newRemoteName.trim();
        const url = newRemoteUrl.trim();
        if (!name || !url) return;
        setRemotes(prev => ({ ...prev, [name]: url }));
        setNewRemoteName('');
        setNewRemoteUrl('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-slate-100">Vite wrapper (MFE remotes)</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-4">
                    {candidatePaths.length === 0 ? (
                        <p className="text-sm text-slate-500">No hay proyectos con vite.config en el workspace.</p>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Proyecto</label>
                                <select
                                    value={selectedPath}
                                    onChange={e => handleProjectChange(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-nexus-neon focus:outline-none"
                                >
                                    {candidatePaths.map(p => (
                                        <option key={p} value={p}>
                                            {p.split(/[/\\]/).filter(Boolean).pop() ?? p}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {loading ? (
                                <p className="text-xs text-slate-500">Cargando federation...</p>
                            ) : (
                                <>
                                    {federationName && (
                                        <p className="text-xs text-slate-400">
                                            Este MFE: <span className="font-mono text-slate-200">{federationName}</span>
                                        </p>
                                    )}
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={e => setEnabled(e.target.checked)}
                                            className="accent-nexus-neon"
                                        />
                                        <span className="text-sm text-slate-300">Usar Vite wrapper en las ejecuciones</span>
                                    </label>

                                    <div className="flex gap-3 flex-wrap">
                                        <div className="flex-1 min-w-[160px]">
                                            <label className="block text-xs text-slate-400 mb-1">Base URL <span className="text-slate-500">(opcional)</span></label>
                                            <input
                                                type="text"
                                                value={base}
                                                onChange={e => setBase(e.target.value)}
                                                placeholder="/my-app/"
                                                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-nexus-neon focus:outline-none"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-[160px]">
                                            <label className="block text-xs text-slate-400 mb-1">Host <span className="text-slate-500">(server/preview)</span></label>
                                            <input
                                                type="text"
                                                value={host}
                                                onChange={e => setHost(e.target.value)}
                                                placeholder="0.0.0.0"
                                                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-nexus-neon focus:outline-none"
                                            />
                                        </div>
                                        <div className="flex items-end pb-0.5">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={sourcemap}
                                                    onChange={e => setSourcemap(e.target.checked)}
                                                    className="accent-nexus-neon"
                                                />
                                                <span className="text-sm text-slate-300">sourcemap</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-400 mb-2">Remotes (URL local por MFE)</p>
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {remoteList.map(r => {
                                                const isEnabled = !disabledRemotes.has(r.name);
                                                return (
                                                    <div key={r.name} className={`flex items-center gap-2 ${!isEnabled ? 'opacity-50' : ''}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isEnabled}
                                                            onChange={() => toggleRemote(r.name)}
                                                            className="accent-nexus-neon shrink-0"
                                                            title={isEnabled ? 'Deshabilitar remote' : 'Habilitar remote'}
                                                        />
                                                        <span className="w-36 shrink-0 text-xs font-mono text-slate-400 truncate" title={r.name}>
                                                            {r.name}
                                                        </span>
                                                        <input
                                                            type="text"
                                                            value={remotes[r.name] ?? r.default_url}
                                                            onChange={e => setRemoteUrl(r.name, e.target.value)}
                                                            disabled={!isEnabled}
                                                            className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-nexus-neon focus:outline-none disabled:cursor-not-allowed"
                                                            placeholder={r.default_url || 'http://localhost:PORT/.../remoteEntry.js'}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeRemote(r.name)}
                                                            className="p-1 text-slate-500 hover:text-nexus-danger rounded transition-colors shrink-0"
                                                            title="Quitar"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {Object.entries(remotes)
                                                .filter(([name]) => !remoteList.some(r => r.name === name))
                                                .map(([name, url]) => {
                                                    const isEnabled = !disabledRemotes.has(name);
                                                    return (
                                                        <div key={name} className={`flex items-center gap-2 ${!isEnabled ? 'opacity-50' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isEnabled}
                                                                onChange={() => toggleRemote(name)}
                                                                className="accent-nexus-neon shrink-0"
                                                                title={isEnabled ? 'Deshabilitar remote' : 'Habilitar remote'}
                                                            />
                                                            <span className="w-36 shrink-0 text-xs font-mono text-slate-400 truncate" title={name}>
                                                                {name}
                                                            </span>
                                                            <input
                                                                type="text"
                                                                value={url}
                                                                onChange={e => setRemoteUrl(name, e.target.value)}
                                                                disabled={!isEnabled}
                                                                className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-nexus-neon focus:outline-none disabled:cursor-not-allowed"
                                                                placeholder="http://localhost:PORT/.../remoteEntry.js"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeRemote(name)}
                                                                className="p-1 text-slate-500 hover:text-nexus-danger rounded transition-colors shrink-0"
                                                                title="Quitar"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                        <div className="mt-2 flex gap-2 flex-wrap items-center">
                                            <input
                                                type="text"
                                                value={newRemoteName}
                                                onChange={e => setNewRemoteName(e.target.value)}
                                                placeholder="Nombre MFE"
                                                className="w-36 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none"
                                            />
                                            <input
                                                type="text"
                                                value={newRemoteUrl}
                                                onChange={e => setNewRemoteUrl(e.target.value)}
                                                placeholder="http://localhost:PORT/.../remoteEntry.js"
                                                className="flex-1 min-w-[200px] bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={addManualRemote}
                                                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-nexus-neon hover:bg-nexus-neon/10 rounded-lg transition-colors"
                                            >
                                                <Plus size={12} /> Añadir
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-1.5 text-sm font-bold bg-nexus-neon text-nexus-darker rounded-lg hover:bg-opacity-90 transition-colors"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

export function getViteWrapperConfig(projectPath: string): ViteWrapperConfig | null {
    try {
        const raw = localStorage.getItem(storageKey(projectPath));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ViteWrapperConfig;
        if (!parsed.enabled) return null;
        // Filter out disabled remotes so generate_vite_wrapper leaves their original URLs
        const disabled = new Set(parsed.disabledRemotes ?? []);
        if (disabled.size > 0) {
            const filteredRemotes = Object.fromEntries(
                Object.entries(parsed.remotes).filter(([name]) => !disabled.has(name))
            );
            return { ...parsed, remotes: filteredRemotes };
        }
        return { ...parsed };
    } catch {
        return null;
    }
}
