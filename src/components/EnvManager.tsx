import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { X, Plus, Trash2, RefreshCw, Copy, ChevronDown, FileCode, Upload } from 'lucide-react';
import { useProjectEnvs } from './useProjectEnvs';
import { useToolStore } from '../stores/toolStore';
import { JdkManagerModal } from './JdkManagerModal';
import { useWorkspace } from '../context/WorkspaceContext';
import { parseInlineEnvsFromScripts } from '../utils/parseInlineEnvs';
import { useJdks } from '../hooks/queries/useToolQueries';

/** Parsea contenido tipo .env (KEY=value, líneas vacías y # se ignoran). */
function parseEnvFileContent(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
            val = val.slice(1, -1);
        if (key) out[key] = val;
    }
    return out;
}

interface EnvManagerProps {
    projectPath: string;
    scripts?: string[];
    onClose: () => void;
    embedded?: boolean;
}

export const EnvManager: React.FC<EnvManagerProps> = ({ projectPath, onClose, embedded = false }) => {
    const { state } = useWorkspace();
    const project = state.projects.find(p => (p.path as string) === projectPath);
    const isJava = project?.project_type === 'java';

    const {
        activeEnv, envNames, store,
        setActiveEnv, addEnv, removeEnv,
        setEnvVar, deleteEnvVar,
        copyEnvVars, overwriteEnvVars,
        reloadFromFiles,
    } = useProjectEnvs(projectPath);

    const { projectJdks, setProjectJdk } = useToolStore();
    const { data: jdks = [], isLoading: loadingJdks } = useJdks();
    const [jdkModalOpen, setJdkModalOpen] = useState(false);

    const [scriptBodies, setScriptBodies] = useState<string[]>([]);
    const [newKey, setNewKey] = useState('');
    const [newVal, setNewVal] = useState('');
    const [newEnvName, setNewEnvName] = useState('');
    const [addingEnv, setAddingEnv] = useState(false);
    const [copyMenuOpen, setCopyMenuOpen] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        invoke<string[]>('get_project_script_bodies', { projectPath })
            .then(setScriptBodies)
            .catch(() => setScriptBodies([]));
    }, [projectPath]);

    const vars = store.envs[activeEnv] ?? {};
    const otherEnvs = envNames.filter(e => e !== activeEnv);

    const handleAddVar = () => {
        if (!newKey.trim()) return;
        setEnvVar(activeEnv, newKey.trim(), newVal);
        setNewKey(''); setNewVal('');
    };

    const handleReload = () => {
        setReloading(true);
        reloadFromFiles();
        setTimeout(() => setReloading(false), 800);
    };

    const handleLoadFromScripts = () => {
        const fromScripts = parseInlineEnvsFromScripts(scriptBodies);
        Object.entries(fromScripts).forEach(([key, value]) => {
            setEnvVar(activeEnv, key, value);
        });
    };

    const loadVarsFromFileContent = (text: string) => {
        const parsed = parseEnvFileContent(text);
        Object.entries(parsed).forEach(([key, value]) => {
            setEnvVar(activeEnv, key, value);
        });
    };

    const readFileAndLoadEnv = (text: string) => {
        if (!text || typeof text !== 'string') return;
        loadVarsFromFileContent(text);
    };

    const handleOpenFileDialog = async () => {
        try {
            const selected = await openDialog({
                multiple: false,
                directory: false,
                filters: [
                    { name: 'Env', extensions: ['env'] },
                    { name: 'Todos', extensions: ['*'] },
                ],
                title: 'Seleccionar archivo .env',
            });
            if (selected === null || Array.isArray(selected)) return;
            const content = await invoke<string>('read_file_at_path', { path: selected });
            readFileAndLoadEnv(content);
        } catch (err) {
            console.error('Error al leer archivo:', err);
        }
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingFile(false);
        const file = e.dataTransfer.files?.[0] ?? (e.dataTransfer.items?.[0] && typeof e.dataTransfer.items[0].getAsFile === 'function' ? e.dataTransfer.items[0].getAsFile() : null);
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => console.error('Error leyendo archivo arrastrado');
        reader.onload = () => {
            const text = reader.result;
            if (typeof text === 'string') readFileAndLoadEnv(text);
        };
        reader.readAsText(file);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => console.error('Error leyendo archivo');
        reader.onload = () => {
            const text = reader.result;
            if (typeof text === 'string') readFileAndLoadEnv(text);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const ENV_COLORS: Record<string, string> = {
        dev: '#4ade80',
        qa: '#60a5fa',
        uat: '#f472b6',
        staging: '#fb923c',
        production: '#f87171',
        prod: '#f87171',
        test: '#a78bfa',
        local: '#34d399',
    };
    const envColor = (name: string) => ENV_COLORS[name] ?? '#94a3b8';

    const innerContent = (
        <div className={embedded ? "h-full flex flex-col" : "bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"} onClick={embedded ? undefined : e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-bold text-slate-100">Variables de Entorno</h2>
                            <p className="text-[10px] text-slate-500 truncate font-mono">{projectPath}</p>
                        </div>
                        {scriptBodies.length > 0 && (
                            <button
                                onClick={handleLoadFromScripts}
                                title="Cargar variables desde los comandos del proyecto (ej: PORT=4000 npx nodemon)"
                                className="p-1.5 text-slate-500 hover:text-microtermix-neon hover:bg-slate-800 rounded transition-colors"
                            >
                                <FileCode size={14} />
                            </button>
                        )}
                        <button
                            onClick={handleReload}
                            disabled={reloading}
                            title="Re-leer archivos .env"
                            className="p-1.5 text-slate-500 hover:text-microtermix-neon hover:bg-slate-800 rounded transition-colors"
                        >
                            <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
                        </button>
                        {!embedded && (
                            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Row 1 — Env Tabs (scrollable, tabs only) */}
                    <div className="flex items-center gap-1 px-4 pt-2 pb-0 bg-slate-950/40 overflow-x-auto shrink-0 scrollbar-hide">
                        {envNames.map(name => (
                            <button
                                key={name}
                                onClick={() => setActiveEnv(name)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors border-b-2 ${activeEnv === name ? 'border-transparent text-slate-950' : 'border-transparent text-slate-400 hover:text-slate-200'
                                    }`}
                                style={activeEnv === name ? { backgroundColor: envColor(name) } : {}}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: envColor(name) }} />
                                {name}
                                {name !== 'dev' && envNames.length > 1 && (
                                    <span
                                        onClick={e => { e.stopPropagation(); removeEnv(name); }}
                                        className="ml-0.5 hover:text-red-700"
                                    >×</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Row 2 — Action bar (no overflow, so dropdowns render freely) */}
                    <div className="relative flex items-center gap-2 px-4 py-1.5 border-b border-slate-800 bg-slate-950/40 shrink-0">
                        {/* Java Version Selector */}
                        {isJava && (
                            <div className="flex items-center gap-2 mr-2 border-r border-slate-800 pr-3">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">JDK:</span>
                                <select
                                    value={projectJdks[projectPath] || ''}
                                    onChange={(e) => setProjectJdk(projectPath, e.target.value || null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-microtermix-neon transition-colors"
                                >
                                    <option value="">Default (System)</option>
                                    {jdks.map(jdk => (
                                        <option key={jdk.path} value={jdk.path}>{jdk.name} ({jdk.version})</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => setJdkModalOpen(true)}
                                    title="Gestionar JDKs"
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-400 border border-slate-700 rounded-lg hover:border-microtermix-neon hover:text-microtermix-neon transition-colors"
                                >
                                    <Plus size={12} />
                                    <span className="font-bold">{loadingJdks ? 'Cargando...' : 'Descargar JDK'}</span>
                                </button>
                            </div>
                        )}

                        {/* Copiar desde */}
                        {otherEnvs.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setCopyMenuOpen(o => !o)}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-400 border border-slate-700 rounded-lg hover:border-slate-500 hover:text-slate-200 transition-colors"
                                >
                                    <Copy size={11} /> Copiar desde <ChevronDown size={10} />
                                </button>
                                {copyMenuOpen && (
                                    <div className="absolute left-0 top-full mt-1 z-30 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl text-xs overflow-hidden" style={{ minWidth: 220 }}>
                                        <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-700">
                                            Copiar al ambiente <strong className="text-slate-300">{activeEnv}</strong>
                                        </div>
                                        {otherEnvs.map(src => (
                                            <div key={src} className="border-b border-slate-700/50 last:border-0">
                                                <button
                                                    onClick={() => { copyEnvVars(src, activeEnv); setCopyMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-slate-200 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                                                >
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: envColor(src) }} />
                                                    <div>
                                                        <div className="font-medium">Merge desde <strong>{src}</strong></div>
                                                        <div className="text-[10px] text-slate-500">Agrega variables sin pisar las existentes</div>
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={() => { overwriteEnvVars(src, activeEnv); setCopyMenuOpen(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-slate-400 hover:bg-slate-700 flex items-center gap-2 text-[11px] transition-colors bg-slate-800/50"
                                                >
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 opacity-50" style={{ backgroundColor: envColor(src) }} />
                                                    Reemplazar todo con <strong className="text-slate-300">{src}</strong>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Add new env */}
                        {addingEnv ? (
                            <div className="flex items-center gap-1">
                                <input
                                    autoFocus
                                    value={newEnvName}
                                    onChange={e => setNewEnvName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { addEnv(newEnvName); setNewEnvName(''); setAddingEnv(false); }
                                        if (e.key === 'Escape') { setAddingEnv(false); setNewEnvName(''); }
                                    }}
                                    placeholder="nombre del ambiente..."
                                    className="w-36 bg-slate-950 border border-microtermix-neon/50 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                                />
                                <button onClick={() => { addEnv(newEnvName); setNewEnvName(''); setAddingEnv(false); }}
                                    className="text-microtermix-success hover:bg-slate-700 p-1 rounded text-xs">✓</button>
                                <button onClick={() => { setAddingEnv(false); setNewEnvName(''); }}
                                    className="text-slate-500 hover:bg-slate-700 p-1 rounded text-xs">✗</button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAddingEnv(true)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-slate-500 hover:text-microtermix-neon hover:bg-slate-800 rounded-lg border border-dashed border-slate-700 transition-colors"
                            >
                                <Plus size={11} /> Nuevo ambiente
                            </button>
                        )}

                        {/* Close dropdown on outside click */}
                        {copyMenuOpen && (
                            <div className="fixed inset-0 z-20" onClick={() => setCopyMenuOpen(false)} />
                        )}
                    </div>

                    {/* Cargar variables desde archivo: diálogo (Tauri) + arrastrar */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(true); }}
                        onDragLeave={() => setIsDraggingFile(false)}
                        onDrop={handleFileDrop}
                        onClick={handleOpenFileDialog}
                        className={`mx-4 mt-2 mb-1 py-3 px-4 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors ${isDraggingFile ? 'border-microtermix-neon bg-microtermix-neon/10 text-microtermix-neon' : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'}`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".env,.env.*,.env.local,text/plain,*/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <Upload size={16} className="inline-block mr-1.5 align-middle" />
                        <span className="text-[11px]">
                            Haz clic para elegir un archivo .env o arrástralo aquí
                        </span>
                    </div>

                    {/* Variables Table */}
                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 z-10">
                                <tr>
                                    <th className="text-left px-4 py-2 font-medium text-slate-500 w-2/5">VARIABLE</th>
                                    <th className="text-left px-4 py-2 font-medium text-slate-500">VALOR</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(vars).map(([key, val]) => (
                                    <tr key={key} className="border-b border-slate-800/60 hover:bg-slate-800/30 group">
                                        <td className="px-4 py-1.5">
                                            <input
                                                value={key}
                                                readOnly
                                                className="w-full bg-transparent font-mono text-microtermix-neon/80 focus:outline-none"
                                            />
                                        </td>
                                        <td className="px-4 py-1.5">
                                            <input
                                                value={val}
                                                onChange={e => setEnvVar(activeEnv, key, e.target.value)}
                                                className="w-full bg-transparent text-slate-200 focus:outline-none focus:text-white font-mono focus:bg-slate-800/60 rounded px-1 -mx-1 transition-colors"
                                            />
                                        </td>
                                        <td className="px-2">
                                            <button
                                                onClick={() => deleteEnvVar(activeEnv, key)}
                                                className="p-1 text-slate-700 hover:text-microtermix-danger hover:bg-slate-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Add new variable row */}
                                <tr className="border-b border-slate-800/60">
                                    <td className="px-4 py-2">
                                        <input
                                            value={newKey}
                                            onChange={e => setNewKey(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddVar()}
                                            placeholder="NUEVA_VARIABLE"
                                            className="w-full bg-slate-800/40 border border-dashed border-slate-700 rounded px-2 py-1 font-mono text-slate-400 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon focus:text-slate-200 transition-colors"
                                        />
                                    </td>
                                    <td className="px-4 py-2" colSpan={2}>
                                        <div className="flex gap-2">
                                            <input
                                                value={newVal}
                                                onChange={e => setNewVal(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddVar()}
                                                placeholder="valor"
                                                className="flex-1 bg-slate-800/40 border border-dashed border-slate-700 rounded px-2 py-1 text-slate-400 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon focus:text-slate-200 transition-colors"
                                            />
                                            <button
                                                onClick={handleAddVar}
                                                disabled={!newKey.trim()}
                                                className="px-3 py-1 bg-microtermix-neon text-microtermix-darker rounded font-bold hover:bg-opacity-80 disabled:opacity-30 transition-colors"
                                            >
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {Object.keys(vars).length === 0 && (
                            <div className="text-center text-slate-600 py-10 text-sm">
                                Sin variables en <strong className="text-slate-500">{activeEnv}</strong>. Agrega una arriba.
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
                        <span className="text-[10px] text-slate-600">
                            {Object.keys(vars).length} variables · Se guardan automáticamente
                        </span>
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 text-xs bg-microtermix-neon text-microtermix-darker font-bold rounded-lg hover:bg-opacity-80 transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
    );

    return (
        <>
            {embedded ? innerContent : (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                >
                    {innerContent}
                </div>
            )}
            <JdkManagerModal
                open={jdkModalOpen}
                onOpenChange={setJdkModalOpen}
                projectPath={projectPath}
            />
        </>
    );
};
