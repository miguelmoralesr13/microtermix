import React, { useState, useMemo, useEffect } from 'react';
import { Play, Plus, Edit2, Trash2, ChevronRight, TerminalSquare, Cpu, Check } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { CommandBuilderModal } from './services/CommandBuilderModal';
import type { CommandStep } from '../types/commands';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const CommandsPanel: React.FC = () => {
    const {
        state,
        addSavedCommand,
        removeSavedCommand,
        executeProjectScript,
        setActiveView,
        setTargetTerminalTab,
    } = useWorkspace();

    const [selectedProjectPath, setSelectedProjectPath] = useState<string>(() =>
        state.projects.length > 0 ? state.projects[0].path as string : ''
    );
    const [selectedCommand, setSelectedCommand] = useState<string>('');
    const [selectedEnv, setSelectedEnv] = useState<string>(() =>
        localStorage.getItem('nexus-multi-env-name') || 'none'
    );
    const [envVarsPreview, setEnvVarsPreview] = useState<Record<string, string>>({});
    const [filterByType, setFilterByType] = useState<boolean>(true);
    const [multiProjectRun, setMultiProjectRun] = useState<boolean>(false);
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editingCommandName, setEditingCommandName] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    const JAVA_PRESETS = [
        { name: 'Mvn: Clean & Install', cmd: 'mvn clean install -DskipTests' },
        { name: 'Mvn: Spring Boot Run', cmd: 'mvn spring-boot:run' },
        { name: 'Mvn: Package', cmd: 'mvn package' },
        { name: 'Mvn: Test', cmd: 'mvn test' },
        { name: 'Gradle: Build', cmd: './gradlew build' },
        { name: 'Gradle: BootRun', cmd: './gradlew bootRun' },
        { name: 'Gradle: Clean', cmd: './gradlew clean' },
        { name: 'Jar: Run (target)', cmd: 'java -jar target/*.jar' },
        { name: 'Jar: Run (build/libs)', cmd: 'java -jar build/libs/*.jar' },
        { name: 'Java: Compile & Run', cmd: 'javac Main.java && java Main' },
    ];

    // Update selected project if projects load after mount
    useEffect(() => {
        if (!selectedProjectPath && state.projects.length > 0) {
            setSelectedProjectPath(state.projects[0].path as string);
        }
    }, [state.projects, selectedProjectPath]);

    const selectedProject = state.projects.find(p => (p.path as string) === selectedProjectPath);
    const isJavaSelected = selectedProject?.project_type === 'java';
    const buildSystem = selectedProject?.build_system;

    const filteredJavaPresets = useMemo(() => {
        if (!isJavaSelected) return [];
        if (buildSystem === 'maven') {
            return JAVA_PRESETS.filter(p => p.name.startsWith('Mvn:') || p.name.startsWith('Jar: Run (target)'));
        }
        if (buildSystem === 'gradle') {
            return JAVA_PRESETS.filter(p => p.name.startsWith('Gradle:') || p.name.startsWith('Jar: Run (build/libs)'));
        }
        return JAVA_PRESETS;
    }, [isJavaSelected, buildSystem]);

    const filteredSavedCommandNames = useMemo(() => {
        const type = String(selectedProject?.project_type || '');
        return Object.keys(state.savedCommands || {}).filter(name => {
            const savedType = state.savedCommandTypes?.[name];
            if (!savedType) return true; // Global
            return savedType === type;
        });
    }, [state.savedCommands, state.savedCommandTypes, selectedProject?.project_type]);

    // Smart filter: If filter enabled, show only projects of the same type as selected
    const filteredProjects = useMemo(() => {
        if (!filterByType || !selectedProject) return state.projects;
        return state.projects.filter(p => p.project_type === selectedProject.project_type);
    }, [state.projects, selectedProject, filterByType]);

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

    const handleExecuteMulti = async () => {
        if (!selectedCommand || filteredProjects.length === 0) return;
        setRunning(true);
        try {
            // Ejecutar en paralelo en todos los proyectos filtrados
            await Promise.all(filteredProjects.map(p => 
                executeProjectScript(p.path as string, selectedCommand, {
                    globalEnvName: selectedEnv,
                })
            ));
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

    const handleBuilderSave = (name: string, command: string, steps: CommandStep[], projectType?: string) => {
        if (editingCommandName && editingCommandName !== name) {
            removeSavedCommand(editingCommandName);
        }
        addSavedCommand(name, command, steps, projectType);
        setSelectedCommand(name);
        setBuilderOpen(false);
        setEditingCommandName(null);
    };

    // Initial steps for edit mode — fallback to a single command step from the raw string
    const editingInitialSteps = useMemo(() => {
        if (!editingCommandName) return undefined;
        const savedSteps = (state.savedCommandSteps || {})[editingCommandName];
        if (savedSteps) return savedSteps;
        const rawCmd = (state.savedCommands || {})[editingCommandName];
        if (rawCmd) return [{ id: 'init', type: 'command', value: rawCmd }] as CommandStep[];
        return undefined;
    }, [editingCommandName, state.savedCommandSteps, state.savedCommands]);

    return (
        <div className="h-full flex flex-col bg-[#020617] text-slate-300">
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TerminalSquare size={16} className="text-nexus-neon" />
                    <h2 className="text-sm font-bold text-slate-200">Commands</h2>
                    {filteredSavedCommandNames.length > 0 && (
                        <span className="text-[10px] bg-nexus-neon/10 text-nexus-neon px-1.5 py-0.5 rounded-full font-mono">
                            {filteredSavedCommandNames.length}
                        </span>
                    )}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingCommandName(null); setBuilderOpen(true); }}
                    className="h-8 gap-1.5 border-slate-700 hover:border-nexus-neon hover:text-nexus-neon transition-colors"
                >
                    <Plus size={14} /> New Command
                </Button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* ── Left: Commands list ─────────────────────────────────── */}
                <div className="w-60 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950/30">
                    {/* Saved commands */}
                    <div className="shrink-0 px-3 py-2 border-b border-slate-800/60 bg-slate-950/50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Saved ({filteredSavedCommandNames.length})
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {filteredSavedCommandNames.length === 0 && (
                            <div className="px-3 py-6 text-center">
                                <TerminalSquare size={22} className="text-slate-700 mx-auto mb-2" />
                                <p className="text-xs text-slate-600">No saved commands yet.</p>
                                <p className="text-[10px] text-slate-700 mt-1">Click "New Command" to create one.</p>
                            </div>
                        )}

                        {filteredSavedCommandNames.map(name => (
                            <div
                                key={name}
                                onClick={() => setSelectedCommand(name)}
                                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                                    selectedCommand === name
                                        ? 'bg-nexus-neon/5 border-nexus-neon text-white'
                                        : 'border-transparent hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold truncate">{name}</p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEditCommand(name); }}
                                        className="p-1 hover:text-nexus-neon"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCommand(name); }}
                                        className="p-1 hover:text-red-400"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                    <ChevronRight size={14} className="text-slate-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Right: Execution area ───────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-y-auto p-5 gap-6">
                    {/* Java Presets Section (Only if Java project selected) */}
                    {isJavaSelected && (
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <Cpu size={12} className="text-orange-400" /> Quick Java Commands
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {filteredJavaPresets.map(preset => (
                                    <button
                                        key={preset.name}
                                        onClick={() => {
                                            // Encontrar si ya existe este comando o agregarlo temporalmente
                                            if (!state.savedCommands?.[preset.name]) {
                                                addSavedCommand(preset.name, preset.cmd, [], 'java');
                                            }
                                            setSelectedCommand(preset.name);
                                        }}
                                        className={`flex flex-col items-start p-2 rounded-lg border transition-all text-left ${
                                            selectedCommand === preset.name 
                                            ? 'bg-orange-500/10 border-orange-500/50 text-orange-400' 
                                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        <span className="text-[10px] font-bold truncate w-full">{preset.name}</span>
                                        <span className="text-[8px] font-mono opacity-50 truncate w-full mt-0.5">{preset.cmd}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Execute</h3>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={filterByType} 
                                        onChange={e => setFilterByType(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${filterByType ? 'bg-nexus-neon border-nexus-neon text-slate-900' : 'border-slate-700 bg-slate-950 group-hover:border-slate-500'}`}>
                                        {filterByType && <Check size={10} strokeWidth={4} />}
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Sync Filter</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={multiProjectRun} 
                                        onChange={e => setMultiProjectRun(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${multiProjectRun ? 'bg-orange-500 border-orange-500 text-slate-900' : 'border-slate-700 bg-slate-950 group-hover:border-slate-500'}`}>
                                        {multiProjectRun && <Check size={10} strokeWidth={4} />}
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Batch Mode</span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Command */}
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Command</label>
                                <Select value={selectedCommand || undefined} onValueChange={(v) => v != null && setSelectedCommand(v)}>
                                    <SelectTrigger className="w-full bg-slate-950 border-slate-700 focus:ring-nexus-neon h-9 text-xs">
                                        <SelectValue placeholder="-- Select command --" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filteredSavedCommandNames.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel>Saved Commands</SelectLabel>
                                                {filteredSavedCommandNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                                            </SelectGroup>
                                        )}
                                        {projectScripts.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel>Package Scripts</SelectLabel>
                                                {projectScripts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                            </SelectGroup>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Project */}
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                    {multiProjectRun ? `Projects (${filteredProjects.length})` : 'Project'}
                                </label>
                                {multiProjectRun ? (
                                    <div className="w-full bg-slate-950 border border-orange-500/30 rounded-md h-9 px-3 flex items-center gap-2 overflow-hidden">
                                        <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-400 border-orange-500/20">ALL {selectedProject?.project_type?.toUpperCase() || 'MATCHING'}</Badge>
                                        <span className="text-[10px] text-slate-500 truncate italic">Runs on {filteredProjects.length} projects</span>
                                    </div>
                                ) : (
                                    <Select value={selectedProjectPath || undefined} onValueChange={(v) => v != null && handleProjectChange(v)}>
                                        <SelectTrigger className="w-full bg-slate-950 border-slate-700 focus:ring-nexus-neon h-9 text-xs">
                                            <SelectValue placeholder="-- Select project --" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filteredProjects.map(p => (
                                                <SelectItem key={p.path as string} value={p.path as string}>{p.name as string}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>

                        {/* Environment */}
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Environment</label>
                            <Select value={selectedEnv || undefined} onValueChange={(v) => v != null && setSelectedEnv(v)}>
                                <SelectTrigger className="w-full bg-slate-950 border-slate-700 focus:ring-nexus-neon h-9 text-xs">
                                    <SelectValue placeholder="-- Select environment --" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projectEnvOptions.map(env => (
                                        <SelectItem key={env} value={env}>{env === 'none' ? 'None (no env)' : env}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                                        <span className="text-slate-300 break-all">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
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
                    <div className="flex gap-3 pt-1">
                        {multiProjectRun ? (
                            <Button
                                onClick={handleExecuteMulti}
                                disabled={!selectedCommand || filteredProjects.length === 0 || running}
                                className="flex-1 flex items-center gap-2 h-10 bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-sm disabled:opacity-40"
                            >
                                <Play size={14} fill="currentColor" />
                                {running ? 'Batch Running...' : `Batch Run on ${filteredProjects.length} Projects`}
                            </Button>
                        ) : (
                            <Button
                                onClick={handleExecute}
                                disabled={!selectedCommand || !selectedProjectPath || running}
                                className="flex-1 flex items-center gap-2 h-10 bg-nexus-neon hover:bg-[#00ffd5] text-slate-900 font-bold text-sm disabled:opacity-40"
                            >
                                <Play size={14} fill="currentColor" />
                                {running ? 'Running...' : 'Run Command'}
                            </Button>
                        )}
                    </div>

                    {!selectedCommand && (
                        <p className="text-xs text-slate-600">Select a command from the list or the dropdown above.</p>
                    )}
                </div>
            </div>

            <CommandBuilderModal
                open={builderOpen}
                onOpenChange={(open) => { setBuilderOpen(open); if (!open) setEditingCommandName(null); }}
                onSave={handleBuilderSave}
                initialName={editingCommandName || undefined}
                initialSteps={editingInitialSteps}
            />
        </div>
    );
};
