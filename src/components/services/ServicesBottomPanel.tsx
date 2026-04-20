import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Wand2, Package, Layers, ChevronUp, ChevronDown, Plus, Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CommandBuilderModal } from './CommandBuilderModal';
import { PackageExplorer } from './PackageExplorer';
import { ViteWrapperTab } from './ViteWrapperTab';
import { useWorkspace } from '../../context/WorkspaceContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BottomTab = 'commands' | 'deps' | 'vite';

export interface BottomPanelHandle {
    openTab: (tab: BottomTab) => void;
}

interface ServicesBottomPanelProps {
    selectedProjects: string[];
    activeProjectPath: string | null;
    onScriptChange: (val: string) => void;
    onRunScript: (path: string, script: string) => void;
}

// ── Commands tab ──────────────────────────────────────────────────────────────

interface CommandsTabProps {
    onScriptChange: (val: string) => void;
    onRunScript: (path: string, script: string) => void;
    selectedProjects: string[];
}

function CommandsTab({ onScriptChange, onRunScript, selectedProjects }: CommandsTabProps) {
    const { state, addSavedCommand, removeSavedCommand } = useWorkspace();
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editName, setEditName] = useState<string | undefined>();
    const [editSteps, setEditSteps] = useState<any[] | undefined>();

    const commands = state.savedCommands ?? {};
    const commandTypes = state.savedCommandTypes ?? {};
    const commandSteps = state.savedCommandSteps ?? {};
    const entries = Object.entries(commands);

    const TYPE_COLORS: Record<string, string> = {
        java:   'text-orange-400 bg-orange-400/10 border-orange-400/20',
        node:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
        python: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
        go:     'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
        rust:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
    };

    const openEdit = (name: string) => {
        setEditName(name);
        setEditSteps(commandSteps[name] ?? []);
        setBuilderOpen(true);
    };

    const openNew = () => {
        setEditName(undefined);
        setEditSteps(undefined);
        setBuilderOpen(true);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header row */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/40 shrink-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    Comandos ({entries.length})
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={openNew}
                    className="h-5 text-[9px] gap-1 border-microtermix-neon/30 text-microtermix-neon hover:bg-microtermix-neon/10 px-2"
                >
                    <Plus size={9} />
                    Nuevo
                </Button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-px scrollbar-thin">
                {entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-3 gap-1.5">
                        <Wand2 size={16} className="text-slate-700" />
                        <p className="text-[10px] text-slate-600 text-center">
                            Sin comandos guardados
                        </p>
                    </div>
                ) : (
                    entries.map(([name, cmd]) => {
                        const type = commandTypes[name];
                        const colorCls = type ? (TYPE_COLORS[type] ?? 'text-slate-400 bg-slate-400/10 border-slate-400/20') : null;

                        return (
                            <div
                                key={name}
                                className="group flex items-center gap-1.5 px-2 py-1 rounded-md border border-transparent hover:border-slate-700/40 hover:bg-slate-900/40 transition-all cursor-default"
                            >
                                {/* Name + type */}
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <span className="text-[10px] font-semibold text-slate-200 truncate">{name}</span>
                                    {type && (
                                        <span className={cn('text-[7px] font-bold px-1 py-0 rounded border uppercase tracking-wide shrink-0', colorCls)}>
                                            {type}
                                        </span>
                                    )}
                                </div>

                                {/* Command preview */}
                                <span className="text-[8px] font-mono text-slate-600 truncate max-w-[100px] hidden sm:block">{cmd}</span>

                                {/* Actions */}
                                <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    {selectedProjects.length > 0 && (
                                        <button
                                            onClick={() => {
                                                selectedProjects.forEach(p => onRunScript(p, cmd));
                                                onScriptChange(name);
                                            }}
                                            title="Ejecutar en proyectos seleccionados"
                                            className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                                        >
                                            <Play size={10} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => openEdit(name)}
                                        title="Editar"
                                        className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                                    >
                                        <Wand2 size={10} />
                                    </button>
                                    {removeSavedCommand && (
                                        <button
                                            onClick={() => removeSavedCommand(name)}
                                            title="Eliminar"
                                            className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <CommandBuilderModal
                open={builderOpen}
                onOpenChange={setBuilderOpen}
                initialName={editName}
                initialSteps={editSteps}
                onSave={(name, cmd, steps, projectType) => {
                    addSavedCommand(name, cmd, steps, projectType);
                    onScriptChange(name);
                    setBuilderOpen(false);
                }}
            />
        </div>
    );
}

// ── Deps tab ──────────────────────────────────────────────────────────────────

function DepsTab({ projectPath }: { projectPath: string }) {
    const { state } = useWorkspace();
    const project = state.projects.find(p => p.path === projectPath);
    if (!project) return (
        <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-slate-600">Proyecto no encontrado</p>
        </div>
    );

    const rawType = String(project.project_type || '').toLowerCase();
    const isBun = rawType.includes('bun');
    const isGradle = rawType.includes('gradle');
    const isMaven = rawType.includes('maven');
    const isPython = rawType.includes('python');
    const isRust = rawType.includes('rust');
    const isGo = rawType.includes('go');
    const projectType = rawType.includes('java') ? 'java'
        : rawType.includes('node') || isBun ? (isBun ? 'bun' : 'node')
        : isPython ? 'python'
        : isRust ? 'rust'
        : isGo ? 'go'
        : rawType || 'node';
    const packageManager = isBun ? 'bun' : isGradle ? 'gradle' : isMaven ? 'maven' : isPython ? 'pip' : isRust ? 'cargo' : isGo ? 'go' : 'npm';

    return (
        <PackageExplorer
            projectPath={String(project.path)}
            projectType={projectType}
            packageManager={packageManager}
        />
    );
}

// ── Vite tab ──────────────────────────────────────────────────────────────────

function ViteTab({ projectPath }: { projectPath: string }) {
    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center px-3 py-1 border-b border-slate-800/40 shrink-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Vite MFE Config</span>
            </div>
            <div className="flex-1 overflow-y-auto">
                <ViteWrapperTab projectPath={projectPath} />
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
    { id: 'commands' as BottomTab, label: 'Comandos', icon: Wand2 },
    { id: 'deps'     as BottomTab, label: 'Deps', icon: Package },
    { id: 'vite'     as BottomTab, label: 'Vite MFE', icon: Layers },
] as const;

const DEFAULT_HEIGHT = 180;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 420;
const STORAGE_KEY = 'microtermix-bottom-panel-height';
const EXPANDED_KEY = 'microtermix-bottom-panel-expanded';

export const ServicesBottomPanel = forwardRef<BottomPanelHandle, ServicesBottomPanelProps>(({
    selectedProjects,
    activeProjectPath,
    onScriptChange,
    onRunScript,
}, ref) => {
    const [activeTab, setActiveTab] = useState<BottomTab>('commands');
    const [expanded, setExpanded] = useState(() =>
        localStorage.getItem(EXPANDED_KEY) === 'true'
    );
    const [panelHeight, setPanelHeight] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parseInt(saved, 10))) : DEFAULT_HEIGHT;
    });

    useImperativeHandle(ref, () => ({
        openTab: (tab: BottomTab) => {
            setActiveTab(tab);
            setExpanded(true);
        },
    }), []);

    const isDragging = useRef(false);
    const startY = useRef(0);
    const startH = useRef(0);

    useEffect(() => {
        localStorage.setItem(EXPANDED_KEY, String(expanded));
    }, [expanded]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(panelHeight));
    }, [panelHeight]);

    const handleDragStart = (e: React.MouseEvent) => {
        isDragging.current = true;
        startY.current = e.clientY;
        startH.current = panelHeight;
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    };

    const handleDragMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = startY.current - e.clientY;
        setPanelHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH.current + delta)));
    };

    const handleDragEnd = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
    };

    const projectPath = activeProjectPath ?? selectedProjects[0] ?? null;
    const canShowDeps = !!projectPath;
    const canShowVite = !!projectPath;

    const handleTabClick = (id: BottomTab) => {
        if (!expanded) setExpanded(true);
        else if (activeTab === id) setExpanded(false);
        setActiveTab(id);
    };

    return (
        <div className="shrink-0 border-t border-slate-800/60 bg-slate-950/90 flex flex-col">
            {/* Drag handle */}
            {expanded && (
                <div
                    className="h-[2px] bg-slate-800/40 hover:bg-microtermix-neon/40 cursor-ns-resize transition-colors shrink-0 group"
                    onMouseDown={handleDragStart}
                >
                    <div className="h-full w-full group-hover:shadow-[0_0_4px_rgba(56,189,248,0.4)]" />
                </div>
            )}

            {/* Tab strip — compact */}
            <div className="flex items-center gap-0 px-1.5 shrink-0 bg-slate-900/50 border-b border-slate-800/40">
                {TABS.map(({ id, label, icon: Icon }) => {
                    const disabled = (id === 'deps' && !canShowDeps) || (id === 'vite' && !canShowVite);
                    const isActive = activeTab === id && expanded;
                    return (
                        <button
                            key={id}
                            disabled={disabled}
                            onClick={() => handleTabClick(id)}
                            className={cn(
                                'flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium transition-all border-t-2 border-transparent',
                                isActive
                                    ? 'border-microtermix-neon text-slate-200 bg-slate-900/40'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]',
                                disabled && 'opacity-20 cursor-not-allowed pointer-events-none'
                            )}
                        >
                            <Icon size={11} />
                            {label}
                        </button>
                    );
                })}

                <div className="flex-1" />

                {projectPath && (
                    <span className="text-[8px] font-mono text-slate-600 truncate max-w-[90px] hidden md:block">
                        {projectPath.split(/[/\\]/).pop()}
                    </span>
                )}

                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setExpanded(e => !e)}
                    className="text-slate-600 hover:text-slate-300 ml-1 h-5 w-5"
                    title={expanded ? 'Colapsar' : 'Expandir'}
                >
                    {expanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                </Button>
            </div>

            {/* Content */}
            {expanded && (
                <div style={{ height: panelHeight }} className="overflow-hidden flex flex-col bg-slate-950/80">
                    {activeTab === 'commands' && (
                        <CommandsTab
                            onScriptChange={onScriptChange}
                            onRunScript={onRunScript}
                            selectedProjects={selectedProjects}
                        />
                    )}
                    {activeTab === 'deps' && projectPath && (
                        <DepsTab projectPath={projectPath} />
                    )}
                    {activeTab === 'vite' && projectPath && (
                        <ViteTab projectPath={projectPath} />
                    )}
                </div>
            )}
        </div>
    );
});

ServicesBottomPanel.displayName = 'ServicesBottomPanel';
