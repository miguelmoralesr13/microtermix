import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ViteWrapperConfig, ViteFederationInfo, ViteRemoteEntry, ProxyCandidateItem } from '../project/ViteWrapperModal';

const STORAGE_PREFIX = 'microtermix-vite-wrapper-';
function storageKey(p: string) {
    return `${STORAGE_PREFIX}${p.replace(/[/\\:]/g, '_')}`;
}

function loadSaved(projectPath: string): Partial<ViteWrapperConfig> {
    try {
        const raw = localStorage.getItem(storageKey(projectPath));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function persist(projectPath: string, config: ViteWrapperConfig) {
    localStorage.setItem(storageKey(projectPath), JSON.stringify(config));
}

interface ViteWrapperTabProps {
    projectPath: string;
    /** Called once we know whether this project has a vite config */
    onDetected?: (hasVite: boolean) => void;
}

export const ViteWrapperTab: React.FC<ViteWrapperTabProps> = ({ projectPath, onDetected = () => {} }) => {
    const { state } = useWorkspace();
    const [loading, setLoading] = useState(true);
    const [noViteConfig, setNoViteConfig] = useState(false);
    const [federationName, setFederationName] = useState('');
    const [remoteList, setRemoteList] = useState<ViteRemoteEntry[]>([]);
    const [enabled, setEnabled] = useState(false);
    const [remotes, setRemotes] = useState<Record<string, string>>({});
    const [disabledRemotes, setDisabledRemotes] = useState<Set<string>>(new Set());
    const [base, setBase] = useState('');
    const [sourcemap, setSourcemap] = useState(false);
    const [host, setHost] = useState('');
    const [newRemoteName, setNewRemoteName] = useState('');
    const [newRemoteUrl, setNewRemoteUrl] = useState('');

    useEffect(() => {
        setLoading(true);
        const candidatesPromise = state.currentPath
            ? invoke<ProxyCandidateItem[]>('get_proxy_candidates', { workspacePath: state.currentPath })
            : Promise.resolve([] as ProxyCandidateItem[]);

        Promise.all([
            invoke<ViteFederationInfo>('parse_vite_federation', { projectPath }),
            candidatesPromise,
        ])
            .then(([info, candidates]) => {
                setFederationName(info.federation_name);
                const namesInWorkspace = new Set(candidates.map(c => c.display_name));
                const filtered = namesInWorkspace.size > 0
                    ? info.remotes.filter(r => namesInWorkspace.has(r.name))
                    : info.remotes;
                setRemoteList(filtered);

                const saved = loadSaved(projectPath);
                setEnabled(!!saved.enabled);
                setDisabledRemotes(new Set(saved.disabledRemotes ?? []));
                setBase(saved.base ?? '');
                setSourcemap(!!saved.sourcemap);
                setHost(saved.host ?? '');

                const merged: Record<string, string> = {};
                filtered.forEach(r => {
                    merged[r.name] = saved.remotes?.[r.name] ?? r.default_url;
                });
                if (saved.remotes) {
                    Object.entries(saved.remotes).forEach(([k, v]) => {
                        if (filtered.some(r => r.name === k) && !(k in merged)) merged[k] = v;
                    });
                }
                setRemotes(merged);
                onDetected(true);
            })
            .catch(() => {
                setNoViteConfig(true);
                onDetected(false);
            })
            .finally(() => setLoading(false));
    }, [projectPath]);

    const save = useCallback((patch: Partial<{
        enabled: boolean; remotes: Record<string, string>;
        disabledRemotes: Set<string>; base: string; sourcemap: boolean; host: string;
    }>) => {
        const next: ViteWrapperConfig = {
            enabled: patch.enabled ?? enabled,
            remotes: patch.remotes ?? remotes,
            disabledRemotes: [...(patch.disabledRemotes ?? disabledRemotes)],
            base: (patch.base ?? base) || undefined,
            sourcemap: (patch.sourcemap ?? sourcemap) || undefined,
            host: (patch.host ?? host) || undefined,
        };
        persist(projectPath, next);
    }, [projectPath, enabled, remotes, disabledRemotes, base, sourcemap, host]);

    const toggle = (field: 'enabled' | 'sourcemap', value: boolean) => {
        if (field === 'enabled') { setEnabled(value); save({ enabled: value }); }
        else { setSourcemap(value); save({ sourcemap: value }); }
    };

    const setRemoteUrl = (name: string, url: string) => {
        const next = { ...remotes, [name]: url };
        setRemotes(next);
        save({ remotes: next });
    };

    const toggleRemote = (name: string) => {
        const next = new Set(disabledRemotes);
        if (next.has(name)) next.delete(name); else next.add(name);
        setDisabledRemotes(next);
        save({ disabledRemotes: next });
    };

    const removeRemote = (name: string) => {
        const next = { ...remotes };
        delete next[name];
        setRemotes(next);
        save({ remotes: next });
    };

    const addManualRemote = () => {
        const name = newRemoteName.trim();
        const url = newRemoteUrl.trim();
        if (!name || !url) return;
        const next = { ...remotes, [name]: url };
        setRemotes(next);
        save({ remotes: next });
        setNewRemoteName('');
        setNewRemoteUrl('');
    };

    const allRemoteEntries = [
        ...remoteList,
        ...Object.keys(remotes)
            .filter(k => !remoteList.some(r => r.name === k))
            .map(k => ({ name: k, default_url: '' })),
    ];

    if (loading) {
        return <div className="p-6 text-xs text-slate-500">Detectando vite config...</div>;
    }

    if (noViteConfig) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                <div className="text-slate-600 text-4xl">⚡</div>
                <p className="text-sm font-bold text-slate-400">No se encontró vite.config</p>
                <p className="text-xs text-slate-600 max-w-xs">
                    Este proyecto no tiene <span className="font-mono text-slate-500">vite.config.js</span>, <span className="font-mono text-slate-500">.ts</span> o <span className="font-mono text-slate-500">.mjs</span> en su raíz.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-5 space-y-5">
            {federationName && (
                <p className="text-xs text-slate-400">
                    Federation name: <span className="font-mono text-slate-200">{federationName}</span>
                </p>
            )}

            {/* Enable toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => toggle('enabled', e.target.checked)}
                    className="accent-microtermix-neon"
                />
                <span className="text-sm text-slate-300">Usar Vite wrapper en las ejecuciones</span>
            </label>

            {/* Base / Host / Sourcemap */}
            <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Base URL <span className="normal-case">(opcional)</span></label>
                    <input
                        type="text"
                        value={base}
                        onChange={e => { setBase(e.target.value); save({ base: e.target.value }); }}
                        placeholder="/my-app/"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-microtermix-neon focus:outline-none"
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Host</label>
                    <input
                        type="text"
                        value={host}
                        onChange={e => { setHost(e.target.value); save({ host: e.target.value }); }}
                        placeholder="0.0.0.0"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-microtermix-neon focus:outline-none"
                    />
                </div>
                <div className="flex items-end pb-0.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={sourcemap}
                            onChange={e => toggle('sourcemap', e.target.checked)}
                            className="accent-microtermix-neon"
                        />
                        <span className="text-sm text-slate-300">sourcemap</span>
                    </label>
                </div>
            </div>

            {/* Remotes */}
            <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Remotes (URL local por MFE)</p>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                    {allRemoteEntries.map(r => {
                        const isEnabled = !disabledRemotes.has(r.name);
                        return (
                            <div key={r.name} className={`flex items-center gap-2 ${!isEnabled ? 'opacity-50' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => toggleRemote(r.name)}
                                    className="accent-microtermix-neon shrink-0"
                                />
                                <span className="w-36 shrink-0 text-xs font-mono text-slate-400 truncate" title={r.name}>
                                    {r.name}
                                </span>
                                <input
                                    type="text"
                                    value={remotes[r.name] ?? r.default_url}
                                    onChange={e => setRemoteUrl(r.name, e.target.value)}
                                    disabled={!isEnabled}
                                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:border-microtermix-neon focus:outline-none disabled:cursor-not-allowed"
                                    placeholder={r.default_url || 'http://localhost:PORT/.../remoteEntry.js'}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeRemote(r.name)}
                                    className="p-1 text-slate-600 hover:text-rose-400 rounded transition-colors shrink-0"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Add remote */}
                <div className="mt-3 flex gap-2 flex-wrap items-center">
                    <input
                        type="text"
                        value={newRemoteName}
                        onChange={e => setNewRemoteName(e.target.value)}
                        placeholder="Nombre MFE"
                        className="w-36 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-microtermix-neon"
                    />
                    <input
                        type="text"
                        value={newRemoteUrl}
                        onChange={e => setNewRemoteUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addManualRemote()}
                        placeholder="http://localhost:PORT/.../remoteEntry.js"
                        className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-microtermix-neon"
                    />
                    <button
                        type="button"
                        onClick={addManualRemote}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-microtermix-neon hover:bg-microtermix-neon/10 rounded-lg transition-colors"
                    >
                        <Plus size={12} /> Añadir
                    </button>
                </div>
            </div>
        </div>
    );
};
