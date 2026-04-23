import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { Plus, Trash2, Eye, EyeOff, PanelRightClose, PanelRightOpen, Variable, Upload, Copy, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProjectEnvs } from '../project/useProjectEnvs';
import { useProcessStore } from '../../stores/processStore';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

// ── Storage key for collapsed state ──────────────────────────────────────────
const COLLAPSED_KEY = 'microtermix-env-panel-collapsed';

export interface EnvPanelHandle {
    expand: () => void;
}

// ── Run envs (what was used in this execution) ────────────────────────────────

function RunEnvsSection({ envs }: { envs: Record<string, string> }) {
    const [masked, setMasked] = useState(true);
    const entries = Object.entries(envs);
    if (!entries.length) return null;

    return (
        <div className="border-b border-slate-800/40 shrink-0">
            <div className="flex items-center justify-between px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-amber-400/70" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em]">
                        Runtime ({entries.length})
                    </span>
                </div>
                <button
                    onClick={() => setMasked(m => !m)}
                    className="text-slate-600 hover:text-slate-400 transition-colors p-0.5 rounded hover:bg-slate-800/50"
                >
                    {masked ? <Eye size={10} /> : <EyeOff size={10} />}
                </button>
            </div>
            <div className="px-2 pb-2 space-y-px max-h-[140px] overflow-y-auto scrollbar-thin">
                {entries.map(([k, v]) => (
                    <div key={k} className="flex gap-1.5 items-center py-0.5 px-1 rounded hover:bg-slate-900/40 group">
                        <span className="text-[10px] font-mono text-amber-400/80 truncate w-[80px] shrink-0 leading-tight">{k}</span>
                        <span className="text-[10px] font-mono text-slate-500 truncate flex-1 min-w-0 leading-tight">
                            {masked ? '••••••' : (v || <span className="italic text-slate-700">vacío</span>)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── .env file parser ─────────────────────────────────────────────────────────

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

// ── Compact env editor ────────────────────────────────────────────────────────

function CompactEnvManager({ projectPath }: { projectPath: string }) {
    const {
        store, activeEnv, envNames,
        setActiveEnv, addEnv, setEnvVar, deleteEnvVar,
        copyEnvVars, overwriteEnvVars, reloadFromFiles,
    } = useProjectEnvs(projectPath);

    const vars = store.envs[activeEnv] ?? {};
    const entries = Object.entries(vars);
    const otherEnvs = envNames.filter(e => e !== activeEnv);

    const [newKey, setNewKey] = useState('');
    const [newVal, setNewVal] = useState('');
    const [masked, setMasked] = useState(false);
    const [addingProfile, setAddingProfile] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [copyMenuOpen, setCopyMenuOpen] = useState(false);
    const [reloading, setReloading] = useState(false);

    const handleAddVar = () => {
        const k = newKey.trim();
        if (!k) return;
        setEnvVar(activeEnv, k, newVal);
        setNewKey('');
        setNewVal('');
    };

    const handleAddProfile = () => {
        const n = newProfileName.trim().toLowerCase();
        if (!n) return;
        addEnv(n);
        setNewProfileName('');
        setAddingProfile(false);
    };

    const handleImportFile = async () => {
        try {
            const selected = await openDialog({
                multiple: false,
                directory: false,
                filters: [{ name: 'Env', extensions: ['env'] }, { name: 'Todos', extensions: ['*'] }],
                title: 'Seleccionar archivo .env',
            });
            if (!selected || Array.isArray(selected)) return;
            const content = await invoke<string>('read_file_at_path', { path: selected });
            const parsed = parseEnvFileContent(content);
            Object.entries(parsed).forEach(([k, v]) => setEnvVar(activeEnv, k, v));
        } catch { /* user cancelled or error */ }
    };

    const handleReload = () => {
        setReloading(true);
        reloadFromFiles().finally(() => setTimeout(() => setReloading(false), 600));
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Profile selector row */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800/40 shrink-0">
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-1 h-1 rounded-full bg-emerald-400/70" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em]">Perfil</span>
                </div>
                <Select value={activeEnv} onValueChange={v => v && setActiveEnv(v)}>
                    <SelectTrigger
                        size="sm"
                        className="h-5 flex-1 min-w-0 text-[10px] bg-slate-950/50 border-slate-700/40 px-1.5 focus:ring-0 gap-0.5"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {envNames.map(n => (
                            <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <button
                    onClick={() => setAddingProfile(a => !a)}
                    title="Nuevo perfil"
                    className={cn(
                        'shrink-0 p-0.5 rounded transition-colors',
                        addingProfile
                            ? 'text-microtermix-neon bg-microtermix-neon/10'
                            : 'text-slate-600 hover:text-microtermix-neon hover:bg-slate-800/50'
                    )}
                >
                    <Plus size={10} />
                </button>

                <button
                    onClick={() => setMasked(m => !m)}
                    title={masked ? 'Mostrar valores' : 'Ocultar valores'}
                    className="shrink-0 p-0.5 rounded text-slate-600 hover:text-slate-400 hover:bg-slate-800/50 transition-colors"
                >
                    {masked ? <Eye size={10} /> : <EyeOff size={10} />}
                </button>
            </div>

            {/* Action row: import file + copy from env + reload */}
            <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-800/40 shrink-0 bg-slate-900/30">
                {/* Import from file */}
                <button
                    onClick={handleImportFile}
                    title="Importar desde archivo .env"
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-slate-500 hover:text-microtermix-neon hover:bg-slate-800/50 rounded transition-colors border border-slate-800/60 hover:border-microtermix-neon/30"
                >
                    <Upload size={9} />
                    <span>Importar .env</span>
                </button>

                {/* Copy from another environment */}
                {otherEnvs.length > 0 && (
                    <div className="relative">
                        <button
                            onClick={() => setCopyMenuOpen(o => !o)}
                            title="Copiar variables desde otro ambiente"
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-slate-500 hover:text-microtermix-neon hover:bg-slate-800/50 rounded transition-colors border border-slate-800/60 hover:border-microtermix-neon/30"
                        >
                            <Copy size={9} />
                            <span>Copiar desde</span>
                            <ChevronDown size={8} />
                        </button>
                        {copyMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setCopyMenuOpen(false)} />
                                <div className="absolute left-0 top-full mt-1 z-30 bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl text-xs overflow-hidden" style={{ minWidth: 180 }}>
                                    <div className="px-2.5 py-1.5 text-[9px] text-slate-500 uppercase tracking-wider border-b border-slate-800">
                                        → <strong className="text-slate-300">{activeEnv}</strong>
                                    </div>
                                    {otherEnvs.map(src => (
                                        <div key={src} className="border-b border-slate-800/50 last:border-0">
                                            <button
                                                onClick={() => { copyEnvVars(src, activeEnv); setCopyMenuOpen(false); }}
                                                className="w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-slate-800 flex flex-col gap-0.5 transition-colors"
                                            >
                                                <span className="font-medium">Merge desde <strong className="text-emerald-400">{src}</strong></span>
                                                <span className="text-[9px] text-slate-600">Agrega sin pisar existentes</span>
                                            </button>
                                            <button
                                                onClick={() => { overwriteEnvVars(src, activeEnv); setCopyMenuOpen(false); }}
                                                className="w-full text-left px-3 py-1.5 text-[10px] text-slate-500 hover:bg-slate-800 flex flex-col gap-0.5 transition-colors"
                                            >
                                                <span>Reemplazar con <strong className="text-slate-300">{src}</strong></span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Reload from .env files */}
                <button
                    onClick={handleReload}
                    title="Re-leer archivos .env del proyecto"
                    className="ml-auto p-0.5 text-slate-600 hover:text-slate-400 hover:bg-slate-800/50 rounded transition-colors"
                >
                    <RefreshCw size={9} className={reloading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* New profile input */}
            {addingProfile && (
                <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-800/40 shrink-0 bg-slate-900/30">
                    <Input
                        value={newProfileName}
                        onChange={e => setNewProfileName(e.target.value)}
                        placeholder="nombre perfil"
                        className="h-5 text-[10px] bg-slate-950/60 border-slate-700/40 px-1.5 flex-1"
                        autoFocus
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleAddProfile();
                            if (e.key === 'Escape') setAddingProfile(false);
                        }}
                    />
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleAddProfile}
                        className="h-5 w-5 shrink-0 text-microtermix-neon"
                    >
                        <Plus size={10} />
                    </Button>
                </div>
            )}

            {/* Vars list */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-px min-h-0 scrollbar-thin">
                {entries.length === 0 ? (
                    <p className="text-[10px] text-slate-700 italic py-4 text-center">Sin variables en "{activeEnv}"</p>
                ) : (
                    entries.map(([k, v]) => (
                        <div key={k} className="group flex items-center gap-1 py-[3px] rounded px-1 hover:bg-slate-800/30 transition-colors">
                            <span className="text-[10px] font-mono text-emerald-400/80 w-[72px] shrink-0 truncate leading-tight">{k}</span>
                            <span className="text-[10px] font-mono text-slate-500 flex-1 truncate min-w-0 leading-tight">
                                {masked ? '••••' : (v || <span className="italic text-slate-700">vacío</span>)}
                            </span>
                            <button
                                onClick={() => deleteEnvVar(activeEnv, k)}
                                className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 shrink-0 transition-all p-0.5 rounded hover:bg-red-400/10"
                            >
                                <Trash2 size={9} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Add var row */}
            <div className="border-t border-slate-800/40 px-2 py-1.5 shrink-0 bg-slate-900/20">
                <div className="flex gap-1">
                    <Input
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        placeholder="KEY"
                        className="h-[22px] text-[10px] font-mono bg-slate-950/60 border-slate-700/40 px-1.5 flex-1 min-w-0 uppercase"
                        onKeyDown={e => e.key === 'Enter' && handleAddVar()}
                    />
                    <Input
                        value={newVal}
                        onChange={e => setNewVal(e.target.value)}
                        placeholder="valor"
                        className="h-[22px] text-[10px] font-mono bg-slate-950/60 border-slate-700/40 px-1.5 flex-1 min-w-0"
                        onKeyDown={e => e.key === 'Enter' && handleAddVar()}
                    />
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleAddVar}
                        disabled={!newKey.trim()}
                        className="h-[22px] w-[22px] shrink-0 text-microtermix-neon hover:bg-microtermix-neon/10 disabled:opacity-30"
                    >
                        <Plus size={10} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface EnvSidePanelProps {
    activeTerminalTab: string | null;
    selectedProjects: string[];
    /** When set, this project path takes priority over activeTerminalTab */
    focusedProjectPath?: string | null;
}

export const EnvSidePanel = forwardRef<EnvPanelHandle, EnvSidePanelProps>(({
    activeTerminalTab,
    selectedProjects,
    focusedProjectPath,
}, ref) => {
    const [collapsed, setCollapsed] = useState(() =>
        localStorage.getItem(COLLAPSED_KEY) === 'true'
    );

    useImperativeHandle(ref, () => ({
        expand: () => {
            setCollapsed(false);
            localStorage.setItem(COLLAPSED_KEY, 'false');
        },
    }), []);

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            localStorage.setItem(COLLAPSED_KEY, String(!prev));
            return !prev;
        });
    };

    const projectPath = focusedProjectPath ?? activeTerminalTab?.split('::')[0] ?? selectedProjects[0] ?? null;
    const projectName = projectPath?.split(/[/\\]/).pop() ?? null;

    // Only associate the active terminal with this panel if it belongs to the same project
    const terminalBelongsToProject = activeTerminalTab != null && activeTerminalTab.split('::')[0] === projectPath;
    const script = terminalBelongsToProject ? (activeTerminalTab!.split('::')[1]?.trim() ?? null) : null;

    const process = useProcessStore(s =>
        terminalBelongsToProject && activeTerminalTab ? s.activeProcesses[activeTerminalTab] : null
    );

    const usedEnvs: Record<string, string> = React.useMemo(() => {
        if (!process?.envJson) return {};
        try { return JSON.parse(process.envJson) as Record<string, string>; }
        catch { return {}; }
    }, [process?.envJson]);

    // ── Collapsed state: thin vertical strip ──
    if (collapsed) {
        return (
            <div className="w-8 shrink-0 border-l border-slate-800/60 bg-slate-950/80 flex flex-col items-center">
                <button
                    onClick={toggleCollapsed}
                    className="mt-2 p-1.5 rounded-md text-slate-600 hover:text-microtermix-neon hover:bg-slate-800/50 transition-colors"
                    title="Expandir panel de entorno"
                >
                    <PanelRightOpen size={13} />
                </button>
                <div className="mt-3 flex flex-col items-center gap-1">
                    <Variable size={11} className="text-slate-700" />
                    {projectName && (
                        <span
                            className="text-[8px] text-slate-700 font-mono"
                            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                        >
                            {projectName}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // ── Expanded state ──
    return (
        <div className="w-[232px] shrink-0 h-full border-l border-slate-800/60 bg-slate-950/80 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-2.5 py-1.5 border-b border-slate-800/40 bg-slate-900/40 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Variable size={11} className="text-microtermix-neon/70 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em]">Entorno</span>
                    </div>
                    <button
                        onClick={toggleCollapsed}
                        className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
                        title="Colapsar panel"
                    >
                        <PanelRightClose size={12} />
                    </button>
                </div>
                {projectName && (
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] text-slate-200 truncate font-medium">{projectName}</span>
                        {process?.status === 'running' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                    </div>
                )}
                {script && (
                    <div className="text-[9px] text-slate-600 font-mono truncate mt-0.5">{script}</div>
                )}
            </div>

            {projectPath ? (
                <>
                    <RunEnvsSection envs={usedEnvs} />
                    <CompactEnvManager key={projectPath} projectPath={projectPath} />
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center px-4">
                    <p className="text-[10px] text-slate-700 text-center leading-relaxed">
                        Seleccioná un proyecto o abrí una terminal para ver las variables de entorno
                    </p>
                </div>
            )}
        </div>
    );
});

EnvSidePanel.displayName = 'EnvSidePanel';
