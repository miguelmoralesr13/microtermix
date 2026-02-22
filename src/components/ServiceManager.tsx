import React, { useState, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ProjectRow } from './ProjectRow';
import { TerminalView } from './TerminalView';
import { GitPanel } from './GitPanel';
import { JiraPanel } from './JiraPanel';
import { ProcessesPanel } from './ProcessesPanel';
import { ProxyPanel } from './ProxyPanel';
import { FileServerPanel } from './FileServerPanel';
import { ViteWrapperModal, getViteWrapperConfig, type ProxyCandidateItem } from './ViteWrapperModal';
import { GitBranch, Trello, Server, RotateCcw, X, Play, Square, Activity, Globe, FileCode, FolderOpen, FolderPlus, SquareStack, ChevronDown, ChevronRight, Save, Upload } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { parseInlineEnvs } from '../utils/parseInlineEnvs';
import { buildWorkspaceConfigFromCurrentState } from '../types/workspaceConfig';

const ACTIVE_TERMINAL_STORAGE_KEY = 'nexus-active-terminal-tab';

function activeTerminalKey(workspacePath: string): string {
    return `${ACTIVE_TERMINAL_STORAGE_KEY}-${(workspacePath || '').replace(/[/\\:]/g, '_')}`;
}

const SELECTED_PROJECTS_STORAGE_KEY = 'nexus-selected-projects';

function selectedProjectsKey(workspacePath: string): string {
    return `${SELECTED_PROJECTS_STORAGE_KEY}-${(workspacePath || '').replace(/[/\\:]/g, '_')}`;
}

export const ServiceManager: React.FC = () => {
    const { state, setActiveView, setTargetTerminalTab, updateProcessStatus, applyWorkspaceConfig, setWorkspacePath, scanWorkspace, openFolderInThisWindow, openFolderInNewWindow } = useWorkspace();
    const [activeTerminalTab, setActiveTerminalTabState] = useState<string | null>(null);
    const processIds = Object.keys(state.activeProcesses);

    const setActiveTerminalTab = React.useCallback((id: string | null) => {
        setActiveTerminalTabState(id);
        if (id) {
            try {
                localStorage.setItem(activeTerminalKey(state.currentPath || ''), id);
            } catch (_) { }
        }
    }, [state.currentPath]);

    // ─── Multi-Execution State ───────────────────────────────────────────────
    const allScripts = useMemo(() => {
        const scripts = new Set<string>();
        state.projects.forEach(p => {
            if (p.scripts) p.scripts.forEach(s => scripts.add(s));
        });
        return Array.from(scripts);
    }, [state.projects]);

    const allEnvs = useMemo(() => {
        const envs = new Set<string>();
        state.projects.forEach(p => {
            try {
                const rawStore = localStorage.getItem(`nexus-envs-${(p.path as string).replace(/[/\\:]/g, '_')}`);
                if (rawStore) {
                    const parsed = JSON.parse(rawStore);
                    if (parsed.envs) {
                        Object.keys(parsed.envs).forEach(e => envs.add(e));
                    }
                }
            } catch (err) { }
        });
        const arr = Array.from(envs);
        return arr.length > 0 ? arr : ['dev'];
    }, [state.projects]);

    const [multiScript, setMultiScript] = useState<string>(() => localStorage.getItem('nexus-multi-script') || '');
    const [globalEnvName, setGlobalEnvName] = useState<string>(() => localStorage.getItem('nexus-multi-env-name') || 'dev');
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const restoredSelectedRef = React.useRef(false);
    const [viteWrapperModalOpen, setViteWrapperModalOpen] = useState(false);
    const [viteWrapperCandidates, setViteWrapperCandidates] = useState<ProxyCandidateItem[]>([]);
    const [vitePreviewOpen, setVitePreviewOpen] = useState(() => {
        try { return localStorage.getItem('nexus-vite-preview-open') === '1'; } catch { return false; }
    });

    React.useEffect(() => {
        if (!multiScript && allScripts.length > 0) setMultiScript(allScripts[0]);
    }, [allScripts, multiScript]);

    React.useEffect(() => {
        if (!globalEnvName && allEnvs.length > 0) setGlobalEnvName(allEnvs[0]);
    }, [allEnvs, globalEnvName]);

    React.useEffect(() => {
        if (multiScript) localStorage.setItem('nexus-multi-script', multiScript);
    }, [multiScript]);

    React.useEffect(() => {
        if (globalEnvName) localStorage.setItem('nexus-multi-env-name', globalEnvName);
    }, [globalEnvName]);

    React.useEffect(() => {
        try { localStorage.setItem('nexus-vite-preview-open', vitePreviewOpen ? '1' : '0'); } catch (_) { }
    }, [vitePreviewOpen]);

    // Releer desde localStorage cuando se aplica una config cargada
    React.useEffect(() => {
        const path = state.currentPath || '';
        try {
            const raw = localStorage.getItem(selectedProjectsKey(path));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setSelectedProjects(parsed);
            }
        } catch (_) { }
        const ms = localStorage.getItem('nexus-multi-script');
        if (ms != null) setMultiScript(ms);
        const ge = localStorage.getItem('nexus-multi-env-name');
        if (ge != null) setGlobalEnvName(ge);
        const vp = localStorage.getItem('nexus-vite-preview-open');
        if (vp !== null) setVitePreviewOpen(vp === '1');
    }, [state.configAppliedTrigger, state.currentPath]);

    const projectPaths = useMemo(() => new Set(state.projects.map(p => p.path as string)), [state.projects]);

    React.useEffect(() => {
        restoredSelectedRef.current = false;
    }, [state.currentPath]);

    React.useEffect(() => {
        if (state.projects.length === 0 || restoredSelectedRef.current) return;
        try {
            const raw = localStorage.getItem(selectedProjectsKey(state.currentPath || ''));
            if (!raw) return;
            const saved: string[] = JSON.parse(raw);
            if (!Array.isArray(saved)) return;
            const valid = saved.filter(p => projectPaths.has(p));
            if (valid.length > 0) {
                setSelectedProjects(valid);
                restoredSelectedRef.current = true;
            }
        } catch (_) { }
    }, [state.projects.length, state.currentPath, projectPaths]);

    React.useEffect(() => {
        if (selectedProjects.length === 0) return;
        try {
            localStorage.setItem(selectedProjectsKey(state.currentPath || ''), JSON.stringify(selectedProjects));
        } catch (_) { }
    }, [selectedProjects, state.currentPath]);

    const toggleProjectSelect = (path: string) => {
        setSelectedProjects(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
    };

    const handleBatchPlay = async () => {
        if (selectedProjects.length === 0 || !multiScript) return;

        const { command: scriptToRun } = parseInlineEnvs(multiScript);
        const effectiveScript = scriptToRun || multiScript;

        await Promise.all(selectedProjects.map(async (projectPath) => {
            const compositeServiceId = `${projectPath}::${multiScript} `;
            const existing = state.activeProcesses[compositeServiceId];
            if (existing?.status === 'running') return;

            try {
                let configuredEnv: Record<string, string> = {};
                try {
                    const rawStore = localStorage.getItem(`nexus-envs-${projectPath.replace(/[/\\:]/g, '_')}`);
                    if (rawStore) {
                        const parsed = JSON.parse(rawStore);
                        const envName = parsed.activeEnv || globalEnvName;
                        if (parsed.envs && parsed.envs[envName]) {
                            configuredEnv = parsed.envs[envName];
                        }
                    }
                } catch (err) { }

                const envVarsJson = JSON.stringify(configuredEnv);
                const viteConfig = getViteWrapperConfig(projectPath);
                const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;
                const viteWrapperRemotes = useViteWrapper ? viteConfig!.remotes : undefined;

                updateProcessStatus(compositeServiceId, 'running', multiScript, envVarsJson);
                await invoke('execute_service_script', {
                    serviceId: compositeServiceId,
                    projectPath,
                    script: effectiveScript,
                    envVarsJson,
                    useViteWrapper: useViteWrapper || undefined,
                    viteWrapperRemotes,
                });
            } catch (e) {
                console.error(`Execution failed for ${compositeServiceId}`, e);
                updateProcessStatus(compositeServiceId, 'error');
            }
        }));
    };

    const handleBatchStop = async () => {
        if (selectedProjects.length === 0) return;
        await Promise.all(selectedProjects.map(async (projectPath) => {
            const compositeServiceId = `${projectPath}::${multiScript} `;
            try {
                await invoke('kill_service', { serviceId: compositeServiceId });
                updateProcessStatus(compositeServiceId, 'idle');
            } catch (e) { }
        }));
    };

    const handleBatchRestart = async () => {
        if (selectedProjects.length === 0 || !multiScript) return;
        const projectsToRestart = [...selectedProjects];
        const scriptToRestart = multiScript;
        await handleBatchStop();
        await new Promise(r => setTimeout(r, 400));
        // Re-ejecutar con la misma selección y script (ya guardados)
        const { command: scriptToRun } = parseInlineEnvs(scriptToRestart);
        const effectiveScript = scriptToRun || scriptToRestart;
        await Promise.all(projectsToRestart.map(async (projectPath) => {
            const compositeServiceId = `${projectPath}::${scriptToRestart} `;
            try {
                let configuredEnv: Record<string, string> = {};
                try {
                    const rawStore = localStorage.getItem(`nexus-envs-${projectPath.replace(/[/\\:]/g, '_')}`);
                    if (rawStore) {
                        const parsed = JSON.parse(rawStore);
                        const envName = parsed.activeEnv || globalEnvName;
                        if (parsed.envs && parsed.envs[envName]) configuredEnv = parsed.envs[envName];
                    }
                } catch (err) { }
                const envVarsJson = JSON.stringify(configuredEnv);
                const viteConfig = getViteWrapperConfig(projectPath);
                const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;
                const viteWrapperRemotes = useViteWrapper ? viteConfig!.remotes : undefined;
                updateProcessStatus(compositeServiceId, 'running', scriptToRestart, envVarsJson);
                await invoke('execute_service_script', {
                    serviceId: compositeServiceId,
                    projectPath,
                    script: effectiveScript,
                    envVarsJson,
                    useViteWrapper: useViteWrapper || undefined,
                    viteWrapperRemotes,
                });
            } catch (e) {
                console.error(`Restart failed for ${compositeServiceId}`, e);
                updateProcessStatus(compositeServiceId, 'error');
            }
        }));
    };

    // ─── Terminal Tab Management ─────────────────────────────────────────────
    const handleTabRestart = async (e: React.MouseEvent, serviceId: string) => {
        e.preventDefault(); e.stopPropagation();
        const pState = state.activeProcesses[serviceId];
        if (!pState?.script) return;

        const { command: scriptToRun } = parseInlineEnvs(pState.script);
        const effectiveScript = scriptToRun || pState.script;
        const envVarsJson = pState.envJson || '{}';

        await invoke('kill_service', { serviceId });
        updateProcessStatus(serviceId, 'running', pState.script, envVarsJson, true);
        setTimeout(async () => {
            const projectPath = serviceId.split('::')[0];
            const viteConfig = getViteWrapperConfig(projectPath);
            const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;
            const viteWrapperRemotes = useViteWrapper ? viteConfig!.remotes : undefined;
            await invoke('execute_service_script', {
                serviceId, projectPath,
                script: effectiveScript,
                envVarsJson,
                useViteWrapper: useViteWrapper || undefined,
                viteWrapperRemotes,
            });
        }, 500);
    };

    React.useEffect(() => {
        if (state.targetTerminalTab) {
            setActiveTerminalTabState(state.targetTerminalTab);
            setTargetTerminalTab(null);
        }
    }, [state.targetTerminalTab, setTargetTerminalTab]);

    React.useEffect(() => {
        if (processIds.length === 0) return;
        const valid = activeTerminalTab && processIds.includes(activeTerminalTab);
        if (valid) return;
        try {
            const saved = localStorage.getItem(activeTerminalKey(state.currentPath || ''));
            if (saved && processIds.includes(saved)) {
                setActiveTerminalTabState(saved);
                return;
            }
        } catch (_) { }
        setActiveTerminalTab(processIds[0]);
    }, [processIds, state.currentPath, activeTerminalTab]);

    const handleSaveWorkspaceConfig = async () => {
        if (!state.currentPath) return;
        try {
            const config = buildWorkspaceConfigFromCurrentState(
                state.currentPath,
                selectedProjects,
                multiScript,
                globalEnvName,
                state.environments,
                state.activeEnvironment,
                state.gitConfig,
                vitePreviewOpen,
                activeTerminalTab,
                state.projects.map(p => p.path as string),
            );
            await invoke('write_workspace_config_in_folder', {
                workspacePath: state.currentPath,
                content: JSON.stringify(config, null, 2),
            });
        } catch (e) {
            console.error('Save workspace config failed', e);
        }
    };

    const handleLoadWorkspaceConfig = async () => {
        try {
            const filePath = await open({
                directory: false,
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
                title: 'Seleccionar archivo de configuración (nexus-workspace.json)',
            });
            if (filePath === null || Array.isArray(filePath)) return;
            const content = await invoke<string>('read_file_at_path', { path: filePath });
            const config = JSON.parse(content || '{}');
            if (!config || typeof config !== 'object') return;

            const folder = await open({
                directory: true,
                multiple: false,
                title: 'Seleccionar carpeta del workspace donde aplicar la config',
            });
            if (folder === null || Array.isArray(folder)) return;

            await invoke('write_workspace_config_in_folder', { workspacePath: folder, content });
            setWorkspacePath(folder);
            const projects = await scanWorkspace(folder);
            const projectPaths = projects.map((p) => p.path as string);
            applyWorkspaceConfig(config, folder, projectPaths);
        } catch (e) {
            console.error('Load workspace config failed', e);
        }
    };

    const handleLoadConfigApplyCurrent = async () => {
        if (!state.currentPath) return;
        try {
            const filePath = await open({
                directory: false,
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
                title: 'Seleccionar archivo de configuración',
            });
            if (filePath === null || Array.isArray(filePath)) return;
            const content = await invoke<string>('read_file_at_path', { path: filePath });
            const config = JSON.parse(content || '{}');
            if (!config || typeof config !== 'object') return;
            const projectPaths = state.projects.map((p) => p.path as string);
            applyWorkspaceConfig(config, state.currentPath, projectPaths);
            await invoke('write_workspace_config_in_folder', {
                workspacePath: state.currentPath,
                content: JSON.stringify(config, null, 2),
            });
        } catch (e) {
            console.error('Load and apply config failed', e);
        }
    };

    // ─── Layout ─────────────────────────────────────────────────────────────
    return (
        <div className="flex w-full h-full bg-nexus-dark text-slate-200 overflow-hidden">
            {/* Nav Sidebar (Icons) — compacto */}
            <div className="w-12 h-full bg-slate-950 flex flex-col items-center py-2 border-r border-slate-800 shrink-0 gap-1 relative z-20">
                <div
                    onClick={() => setActiveView('services')}
                    className={`p-2 rounded-md cursor-pointer transition-colors ${state.activeView === 'services' ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Services & Terminals"
                >
                    <Server size={20} />
                </div>
                <div
                    onClick={() => setActiveView('git')}
                    className={`p-2 rounded-md cursor-pointer transition-colors ${state.activeView === 'git' ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Git"
                >
                    <GitBranch size={20} />
                </div>
                <div
                    onClick={() => setActiveView('jira')}
                    className={`p-2 rounded-md cursor-pointer transition-colors ${state.activeView === 'jira' ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Jira"
                >
                    <Trello size={20} />
                </div>
                <div
                    onClick={() => setActiveView('processes')}
                    className={`p-2 rounded-md cursor-pointer transition-colors ${state.activeView === 'processes' ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Procesos en escucha"
                >
                    <Activity size={20} />
                </div>
                <div
                    onClick={() => setActiveView('proxy')}
                    className={`p-2 rounded-md cursor-pointer transition-colors ${state.activeView === 'proxy' ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Proxy reverso"
                >
                    <Globe size={20} />
                </div>
                <div
                    onClick={() => setActiveView('fileServer')}
                    className={`p-2 rounded-md cursor-pointer transition-colors ${state.activeView === 'fileServer' ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Servidor de archivos"
                >
                    <FolderOpen size={20} />
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col  h-full overflow-hidden">
                <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 bg-slate-950/50 relative z-10 w-full gap-4">
                    {/* Izquierda: Path del Workspace + Refresh */}
                    <div className="flex-1 flex justify-start items-center min-w-0 gap-2">
                        <span className="text-xs text-slate-500 font-mono truncate max-w-sm lg:max-w-md bg-slate-900/50 px-3 py-1.5 rounded-md border border-slate-800" title={state.currentPath}>
                            {state.currentPath || 'No Workspace Loaded'}
                        </span>
                        {state.currentPath && (
                            <button
                                type="button"
                                onClick={() => scanWorkspace(state.currentPath!)}
                                className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors hover:rotate-[-90deg] active:rotate-[-180deg]"
                                title="Refrescar proyectos del workspace"
                            >
                                <RotateCcw size={14} />
                            </button>
                        )}
                    </div>

                    {/* Centro: Título */}
                    <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-nexus-neon to-nexus-accent capitalize shrink-0 text-center flex-none">
                        Microtermix {state.activeView === 'services' ? '- Services & Terminals' : state.activeView === 'processes' ? '- Procesos en escucha' : state.activeView === 'proxy' ? '- Proxy reverso' : state.activeView === 'fileServer' ? '- Servidor de archivos' : `- ${state.activeView}`}
                    </h1>

                    {/* Derecha: Botones de Configuración */}
                    <div className="flex-1 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={openFolderInThisWindow}
                            className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors"
                            title="Abrir otra carpeta en esta ventana"
                        >
                            <FolderPlus size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={openFolderInNewWindow}
                            className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors"
                            title="Abrir carpeta en nueva ventana"
                        >
                            <SquareStack size={14} />
                        </button>
                        {state.currentPath && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSaveWorkspaceConfig}
                                    className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors"
                                    title="Guardar config en carpeta del workspace (nexus-workspace.json)"
                                >
                                    <Save size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleLoadConfigApplyCurrent}
                                    className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors"
                                    title="Cargar config y aplicar al workspace actual"
                                >
                                    <Upload size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleLoadWorkspaceConfig}
                                    className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors"
                                    title="Cargar config y elegir carpeta (sobrescribe y abre ese workspace)"
                                >
                                    <FolderOpen size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 min-h-0 flex bg-slate-900 overflow-hidden w-full relative">
                    {state.activeView === 'services' && (
                        <>
                            {/* Left Pane: Projects List */}
                            <div className="w-[22rem] flex flex-col border-r border-slate-800 bg-slate-950/30 overflow-hidden shrink-0">
                                <div className="px-3 py-2 border-b border-slate-800 bg-slate-900 flex justify-between items-center shrink-0 gap-2">
                                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">Proyectos ({state.projects.length})</h2>
                                    {selectedProjects.length > 0 ? (
                                        <button onClick={() => setSelectedProjects([])} className="text-[10px] text-slate-400 hover:text-slate-200 whitespace-nowrap">
                                            Deseleccionar
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setSelectedProjects(state.projects.map(p => p.path as string))}
                                            className="text-[10px] text-nexus-neon hover:text-nexus-neon/80 whitespace-nowrap"
                                        >
                                            Seleccionar todos
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto scrollbar-hide">
                                    {state.projects.length === 0 ? (
                                        <div className="p-6 text-center text-slate-500 text-sm">No projects found.</div>
                                    ) : (
                                        state.projects.map(project => (
                                            <ProjectRow
                                                key={project.path as string}
                                                project={project}
                                                isSelected={selectedProjects.includes(project.path as string)}
                                                onToggleSelect={() => toggleProjectSelect(project.path as string)}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right Pane: Multi-Execution & Terminals */}
                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                {/* Multi-Execution: una línea compacta */}
                                <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 shrink-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-slate-500 text-[10px] uppercase tracking-wider shrink-0">Comando</span>
                                        <select
                                            value={multiScript}
                                            onChange={e => setMultiScript(e.target.value)}
                                            className="w-40 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-nexus-neon focus:outline-none"
                                        >
                                            {allScripts.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <span className="text-slate-500 text-[10px] uppercase tracking-wider shrink-0">ENV</span>
                                        <select
                                            value={globalEnvName}
                                            onChange={e => setGlobalEnvName(e.target.value)}
                                            title={`Fallback env: ${globalEnvName}`}
                                            className="w-20 bg-slate-950 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-nexus-neon focus:outline-none capitalize"
                                        >
                                            {allEnvs.map(env => <option key={env} value={env}>{env}</option>)}
                                        </select>
                                        <div className="flex items-center gap-1 ml-1 border-l border-slate-700 pl-2">
                                            <button
                                                onClick={handleBatchPlay}
                                                disabled={selectedProjects.length === 0}
                                                className="flex items-center gap-1 px-2 py-1 bg-nexus-success text-slate-900 rounded text-[11px] font-bold hover:bg-opacity-80 transition-colors disabled:opacity-50"
                                                title="Ejecutar en proyectos seleccionados"
                                            >
                                                <Play size={12} /><span>Run ({selectedProjects.length})</span>
                                            </button>
                                            <button
                                                onClick={handleBatchStop}
                                                disabled={selectedProjects.length === 0}
                                                className="flex items-center gap-1 px-2 py-1 bg-nexus-danger/20 border border-nexus-danger/50 text-nexus-danger rounded text-[11px] font-bold hover:bg-nexus-danger hover:text-white transition-colors disabled:opacity-50"
                                                title="Parar"
                                            >
                                                <Square size={12} />
                                            </button>
                                            <button
                                                onClick={handleBatchRestart}
                                                disabled={selectedProjects.length === 0}
                                                className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-100 rounded text-[11px] font-bold hover:bg-slate-600 transition-colors disabled:opacity-50"
                                                title="Reiniciar"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!state.currentPath) return;
                                                    try {
                                                        const list = await invoke<ProxyCandidateItem[]>('get_proxy_candidates', { workspacePath: state.currentPath });
                                                        setViteWrapperCandidates(list.map(p => ({ project_path: p.project_path, display_name: p.display_name })));
                                                        setViteWrapperModalOpen(true);
                                                    } catch (_) {
                                                        setViteWrapperCandidates([]);
                                                        setViteWrapperModalOpen(true);
                                                    }
                                                }}
                                                className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-nexus-neon border border-slate-600 hover:border-nexus-neon/50 rounded text-[11px] transition-colors"
                                                title="Vite wrapper (remotes MFE)"
                                            >
                                                <FileCode size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {viteWrapperModalOpen && (
                                    <ViteWrapperModal
                                        onClose={() => setViteWrapperModalOpen(false)}
                                        workspacePath={state.currentPath || ''}
                                        candidates={viteWrapperCandidates}
                                    />
                                )}

                                {/* Terminals Section */}
                                {processIds.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm bg-slate-900/50">
                                        <p>No active terminals. Start a service from the left panel.</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950/50 relative">
                                        {/* Terminal Tabs Header — compacto, tamaño fijo, scroll solo al rebasar */}
                                        <div className="flex bg-slate-900/95 border-b border-slate-800 shrink-0 min-h-[40px] overflow-x-auto overflow-y-hidden">
                                            <div className="flex shrink-0 items-center gap-0.5 py-1 px-1">
                                                {processIds.map(serviceId => {
                                                    const procStatus = state.activeProcesses[serviceId]?.status;
                                                    const isRunning = procStatus === 'running';
                                                    const isError = procStatus === 'error';
                                                    const isStopped = procStatus === 'stopped';
                                                    const isActive = activeTerminalTab === serviceId;
                                                    const tabLabel = serviceId.split('::')[0].split(/[/\\]/).pop() ?? 'term';
                                                    const scriptLabel = serviceId.includes('::') ? serviceId.split('::')[1]?.trim() : '';

                                                    const tabStyle = isActive
                                                        ? isError
                                                            ? 'border-nexus-danger/50 bg-nexus-danger/10 text-nexus-danger shadow-sm'
                                                            : isStopped
                                                                ? 'border-slate-600 bg-slate-800/80 text-slate-400 shadow-sm'
                                                                : 'border-nexus-neon/50 bg-nexus-darker text-slate-100 shadow-sm'
                                                        : isError
                                                            ? 'border-slate-700/80 text-slate-400 hover:bg-nexus-danger/10 hover:text-nexus-danger hover:border-nexus-danger/30'
                                                            : isStopped
                                                                ? 'border-slate-700/80 text-slate-500 hover:bg-slate-800 hover:text-slate-400 hover:border-slate-600'
                                                                : 'border-slate-700/80 text-slate-500 hover:bg-slate-800 hover:text-slate-300 hover:border-slate-600';

                                                    return (
                                                        <div
                                                            key={serviceId}
                                                            onClick={() => setActiveTerminalTab(serviceId)}
                                                            className={`group flex shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 min-w-[100px] max-w-[180px] cursor-pointer transition-all duration-150 ${tabStyle}`}
                                                        >
                                                            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                                                <span className="truncate text-xs font-semibold" title={tabLabel}>{tabLabel}</span>
                                                                {scriptLabel && (
                                                                    <span className="truncate text-[10px] opacity-80" title={scriptLabel}>{scriptLabel}</span>
                                                                )}
                                                                {isRunning && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-nexus-success animate-pulse" />}
                                                                {isError && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-nexus-danger" />}
                                                                {isStopped && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-slate-500" title="Parado" />}
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-600/50 pl-2">
                                                                {isRunning && (
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            await invoke('kill_service', { serviceId });
                                                                            updateProcessStatus(serviceId, 'stopped');
                                                                        }}
                                                                        className="rounded p-0.5 text-slate-500 hover:text-amber-400 hover:bg-slate-700 transition-colors"
                                                                        title="Parar proceso (mantener pestaña)"
                                                                    >
                                                                        <Square size={12} />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleTabRestart(e, serviceId); }}
                                                                    className={`rounded p-0.5 transition-colors ${isError ? 'text-nexus-danger hover:bg-nexus-danger/20' : 'text-slate-500 hover:text-nexus-success hover:bg-slate-700'}`}
                                                                    title="Reiniciar"
                                                                >
                                                                    <RotateCcw size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        await invoke('kill_service', { serviceId });
                                                                        updateProcessStatus(serviceId, 'idle');
                                                                        if (activeTerminalTab === serviceId) {
                                                                            const remaining = processIds.filter(id => id !== serviceId);
                                                                            setActiveTerminalTab(remaining.length > 0 ? remaining[0] : null);
                                                                        }
                                                                    }}
                                                                    className="rounded p-0.5 text-slate-500 hover:text-nexus-danger hover:bg-slate-700 transition-colors"
                                                                    title="Cerrar pestaña"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Vite wrapper preview (proyecto del tab activo) */}
                                        {activeTerminalTab && (() => {
                                            const projectPath = activeTerminalTab.split('::')[0];
                                            const viteConfig = getViteWrapperConfig(projectPath);
                                            const remotes = viteConfig?.remotes && Object.keys(viteConfig.remotes).length > 0 ? viteConfig.remotes : null;
                                            if (!remotes) return null;
                                            return (
                                                <div className="shrink-0 border-b border-slate-800 bg-slate-900/80">
                                                    <button
                                                        type="button"
                                                        onClick={() => setVitePreviewOpen(o => !o)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
                                                    >
                                                        {vitePreviewOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        <FileCode size={12} />
                                                        <span>Vite wrapper (remotes para este proyecto)</span>
                                                    </button>
                                                    {vitePreviewOpen && (
                                                        <div className="px-3 pb-2 pt-0">
                                                            <pre className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-700 rounded-lg p-2 overflow-x-auto overflow-y-auto max-h-32">
                                                                {JSON.stringify(remotes, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Terminal Viewports */}
                                        <div className="flex-1 flex flex-col p-2 overflow-hidden bg-nexus-darker relative">
                                            {processIds.map(serviceId => (
                                                <div
                                                    key={`${serviceId}-${state.activeProcesses[serviceId]?.restarts || 0}`}
                                                    className={`absolute inset-2 ${activeTerminalTab === serviceId ? 'visible opacity-100 z-10' : 'invisible opacity-0 z-0'}`}
                                                >
                                                    <TerminalView serviceId={serviceId} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {state.activeView === 'git' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <GitPanel />
                        </div>
                    )}

                    {state.activeView === 'jira' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <JiraPanel />
                        </div>
                    )}

                    {state.activeView === 'processes' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <ProcessesPanel />
                        </div>
                    )}

                    {state.activeView === 'proxy' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <ProxyPanel />
                        </div>
                    )}

                    {state.activeView === 'fileServer' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <FileServerPanel />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
