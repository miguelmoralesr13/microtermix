import React, { useState, useMemo, useEffect } from 'react';
import { Play, Plus, Edit2, Trash2, ChevronRight, TerminalSquare } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { CommandBuilderModal } from './services/CommandBuilderModal';
import type { CommandStep } from '../types/commands';

export const CommandsPanel: React.FC = () => {
    const {
        state,
        addSavedCommand,
        removeSavedCommand,
        executeProjectScript,
        setActiveView,
        setTargetTerminalTab,
    } = useWorkspace();

    const savedCommandNames = Object.keys(state.savedCommands || {});

    const [selectedCommand, setSelectedCommand] = useState<string>('');
    const [selectedProjectPath, setSelectedProjectPath] = useState<string>(() =>
        state.projects.length > 0 ? state.projects[0].path as string : ''
    );
    const [selectedEnv, setSelectedEnv] = useState<string>(() =>
        localStorage.getItem('nexus-multi-env-name') || 'none'
    );
    const [envVarsPreview, setEnvVarsPreview] = useState<Record<string, string>>({});
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editingCommandName, setEditingCommandName] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    // Update selected project if projects load after mount
    useEffect(() => {
        if (!selectedProjectPath && state.projects.length > 0) {
            setSelectedProjectPath(state.projects[0].path as string);
        }
    }, [state.projects, selectedProjectPath]);

    // Available envs for the selected project
    const projectEnvOptions = useMemo(() => {
        if (!selectedProjectPath) return ['none'];
        try {
            const key = `nexus-envs-${selectedProjectPath.replace(/[/\\:]/g, '_')}`;
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.envs && Object.keys(parsed.envs).length > 0) {
                    return ['none', ...Object.keys(parsed.envs)];
                }
            }
        } catch (_) { }
        return ['none'];
    }, [selectedProjectPath]);

    // Load env vars when project or env changes
    useEffect(() => {
        if (!selectedProjectPath || selectedEnv === 'none') {
            setEnvVarsPreview({});
            return;
        }
        try {
            const key = `nexus-envs-${selectedProjectPath.replace(/[/\\:]/g, '_')}`;
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.envs && parsed.envs[selectedEnv]) {
                    setEnvVarsPreview(parsed.envs[selectedEnv]);
                    return;
                }
            }
        } catch (_) { }
        setEnvVarsPreview({});
    }, [selectedProjectPath, selectedEnv]);

    const handleProjectChange = (path: string) => {
        setSelectedProjectPath(path);
        // Mantener el env seleccionado si existe en el nuevo proyecto; si no, caer a 'none'
        const key = `nexus-envs-${path.replace(/[/\\:]/g, '_')}`;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.envs && parsed.envs[selectedEnv]) return; // el env sigue válido
            }
        } catch (_) { }
        setSelectedEnv('none');
    };

    // Package scripts for the selected project
    const selectedProject = state.projects.find(p => (p.path as string) === selectedProjectPath);
    const projectScripts = selectedProject?.scripts || [];

    // Command preview (resolved command string without {{ENVS}})
    const commandPreview = useMemo(() => {
        if (!selectedCommand) return '';
        const saved = (state.savedCommands || {})[selectedCommand];
        if (saved) return saved.replace(/\{\{ENVS\}\}\s*/g, '').trim();
        return selectedCommand; // package script — already the full command
    }, [selectedCommand, state.savedCommands]);

    const handleExecute = async () => {
        if (!selectedCommand || !selectedProjectPath) return;
        setRunning(true);
        try {
            const serviceId = `${selectedProjectPath}::${selectedCommand} `;
            setTargetTerminalTab(serviceId);
            await executeProjectScript(selectedProjectPath, selectedCommand, {
                globalEnvName: selectedEnv,
            });
            setActiveView('services');
        } finally {
            setRunning(false);
        }
    };

    const handleEditCommand = (name: string) => {
        setEditingCommandName(name);
        setBuilderOpen(true);
    };

    const handleDeleteCommand = (name: string) => {
        removeSavedCommand(name);
        if (selectedCommand === name) setSelectedCommand('');
    };

    const handleBuilderSave = (name: string, command: string, steps: CommandStep[]) => {
        if (editingCommandName && editingCommandName !== name) {
            removeSavedCommand(editingCommandName);
        }
        addSavedCommand(name, command, steps);
        setSelectedCommand(name);
        setBuilderOpen(false);
        setEditingCommandName(null);
    };

    // Initial steps for edit mode — fallback to a single command step from the raw string
    const editingInitialSteps = useMemo((): CommandStep[] | undefined => {
        if (!editingCommandName) return undefined;
        const savedSteps = (state.savedCommandSteps || {})[editingCommandName];
        if (savedSteps && savedSteps.length > 0) return savedSteps;
        const rawCmd = (state.savedCommands || {})[editingCommandName];
        if (rawCmd) {
            return [{ id: 'fallback-0', type: 'command' as const, value: rawCmd }];
        }
        return undefined;
    }, [editingCommandName, state.savedCommandSteps, state.savedCommands]);

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TerminalSquare size={16} className="text-nexus-neon" />
                    <h2 className="text-sm font-bold text-slate-200">Commands</h2>
                    {savedCommandNames.length > 0 && (
                        <span className="text-[10px] bg-nexus-neon/10 text-nexus-neon px-1.5 py-0.5 rounded-full font-mono">
                            {savedCommandNames.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => { setEditingCommandName(null); setBuilderOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-nexus-neon/10 hover:bg-nexus-neon/20 text-nexus-neon text-xs font-semibold rounded border border-nexus-neon/30 hover:border-nexus-neon/50 transition-colors"
                >
                    <Plus size={13} /> New Command
                </button>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* ── Left: Commands list ─────────────────────────────────── */}
                <div className="w-60 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950/30">
                    {/* Saved commands */}
                    <div className="shrink-0 px-3 py-2 border-b border-slate-800/60 bg-slate-950/50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Saved ({savedCommandNames.length})
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {savedCommandNames.length === 0 && (
                            <div className="px-3 py-6 text-center">
                                <TerminalSquare size={22} className="text-slate-700 mx-auto mb-2" />
                                <p className="text-xs text-slate-600">No saved commands yet.</p>
                                <p className="text-[10px] text-slate-700 mt-1">Click "New Command" to create one.</p>
                            </div>
                        )}

                        {savedCommandNames.map(name => (
                            <div
                                key={name}
                                onClick={() => setSelectedCommand(name)}
                                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                                    selectedCommand === name
                                        ? 'bg-nexus-neon/10 border-nexus-neon'
                                        : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                                }`}
                            >
                                <ChevronRight
                                    size={12}
                                    className={selectedCommand === name ? 'text-nexus-neon' : 'text-slate-600'}
                                />
                                <span className={`flex-1 text-xs font-medium truncate ${selectedCommand === name ? 'text-nexus-neon' : 'text-slate-300'}`}>
                                    {name}
                                </span>
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEditCommand(name); }}
                                        className="p-1 text-slate-500 hover:text-nexus-neon rounded transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 size={11} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCommand(name); }}
                                        className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Package scripts for selected project */}
                        {projectScripts.length > 0 && (
                            <>
                                <div className="shrink-0 px-3 py-2 mt-1 border-y border-slate-800/60 bg-slate-950/50">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">pkg scripts</p>
                                    <p className="text-[9px] text-slate-600 truncate mt-0.5">{selectedProject?.name as string}</p>
                                </div>
                                {projectScripts.map(script => (
                                    <div
                                        key={script}
                                        onClick={() => setSelectedCommand(script)}
                                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                                            selectedCommand === script
                                                ? 'bg-nexus-neon/10 border-nexus-neon'
                                                : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                    >
                                        <span className="text-[9px] font-mono font-bold px-1 rounded bg-slate-800 text-slate-500 shrink-0">npm</span>
                                        <span className={`text-xs truncate ${selectedCommand === script ? 'text-nexus-neon' : 'text-slate-400'}`}>
                                            {script.replace(/^npm run /, '')}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}

                        {selectedProjectPath && projectScripts.length === 0 && (
                            <div className="px-3 py-3 mt-2 border-t border-slate-800/60">
                                <p className="text-[10px] text-slate-600 text-center">No package scripts found</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Execution area ───────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-y-auto p-5 gap-5">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Execute</h3>

                    <div className="space-y-4">
                        {/* Command */}
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Command</label>
                            <select
                                value={selectedCommand}
                                onChange={e => setSelectedCommand(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 focus:border-nexus-neon rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none transition-colors"
                            >
                                <option value="">-- Select a command --</option>
                                {savedCommandNames.length > 0 && (
                                    <optgroup label="Saved Commands">
                                        {savedCommandNames.map(n => <option key={n} value={n}>{n}</option>)}
                                    </optgroup>
                                )}
                                {projectScripts.length > 0 && (
                                    <optgroup label="Package Scripts">
                                        {projectScripts.map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        {/* Project */}
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project</label>
                            <select
                                value={selectedProjectPath}
                                onChange={e => handleProjectChange(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 focus:border-nexus-neon rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none transition-colors"
                            >
                                <option value="">-- Select a project --</option>
                                {state.projects.map(p => (
                                    <option key={p.path as string} value={p.path as string}>{p.name as string}</option>
                                ))}
                            </select>
                        </div>

                        {/* Environment */}
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Environment</label>
                            <select
                                value={selectedEnv}
                                onChange={e => setSelectedEnv(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 focus:border-nexus-neon rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none transition-colors"
                            >
                                {projectEnvOptions.map(env => (
                                    <option key={env} value={env}>{env === 'none' ? 'None (no env)' : env}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Env vars preview */}
                    {Object.keys(envVarsPreview).length > 0 && (
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                Variables — <span className="text-nexus-neon normal-case">{selectedEnv}</span>
                            </label>
                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs max-h-44 overflow-y-auto space-y-1">
                                {Object.entries(envVarsPreview).map(([k, v]) => (
                                    <div key={k} className="flex gap-1.5 items-start">
                                        <span className="text-nexus-neon shrink-0">{k}</span>
                                        <span className="text-slate-600">=</span>
                                        <span className="text-slate-300 break-all">{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedEnv !== 'none' && Object.keys(envVarsPreview).length === 0 && (
                        <div className="text-[11px] text-slate-600 italic">
                            No variables found for environment "{selectedEnv}" in this project.
                        </div>
                    )}

                    {/* Command preview */}
                    {commandPreview && (
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Preview</label>
                            <pre className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono break-all whitespace-pre-wrap">
                                {commandPreview}
                            </pre>
                        </div>
                    )}

                    {/* Run button */}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleExecute}
                            disabled={!selectedCommand || !selectedProjectPath || running}
                            className="flex items-center gap-2 px-5 py-2 bg-nexus-neon text-slate-900 font-bold text-sm rounded-lg hover:bg-[#00ffd5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Play size={14} fill="currentColor" />
                            {running ? 'Running...' : 'Run'}
                        </button>
                    </div>

                    {!selectedCommand && (
                        <p className="text-xs text-slate-600">Select a command from the list or the dropdown above.</p>
                    )}
                </div>
            </div>

            {/* Builder modal */}
            {builderOpen && (
                <CommandBuilderModal
                    onClose={() => { setBuilderOpen(false); setEditingCommandName(null); }}
                    onSave={handleBuilderSave}
                    initialName={editingCommandName || undefined}
                    initialSteps={editingInitialSteps}
                />
            )}
        </div>
    );
};
