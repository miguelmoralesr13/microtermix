import React, { useState, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Sidebar } from './layout/Sidebar';
import { Header } from './layout/Header';
import { ProjectListPane } from './services/ProjectListPane';
import { MultiExecutionBar } from './services/MultiExecutionBar';
import { TerminalTabsBar } from './services/TerminalTabsBar';
import { TerminalArea } from './services/TerminalArea';
import { GitPanel } from './GitPanel';
import { JiraPanel } from './JiraPanel';
import { ProcessesPanel } from './ProcessesPanel';
import { ProxyPanel } from './ProxyPanel';
import { FileServerPanel } from './FileServerPanel';
import { CommandsPanel } from './CommandsPanel';
import { TestsPanel } from './TestsPanel';
import { SonarPanel } from './SonarPanel';
import { CloudWatchPanel } from './CloudWatchPanel';
import { HttpPanel } from './http/HttpPanel';
import { JenkinsPanel } from './JenkinsPanel';
import { LibCipherPanel } from './LibCipherPanel';
import { ViteWrapperModal, getViteWrapperConfig, type ProxyCandidateItem } from './ViteWrapperModal';
import { ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
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
    const { state, setTargetTerminalTab, updateProcessStatus, applyWorkspaceConfig, setWorkspacePath, scanWorkspace, executeProjectScript } = useWorkspace();
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
        const list = arr.length > 0 ? arr : ['dev'];
        if (!list.includes('none')) list.unshift('none');
        return list;
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

        await Promise.all(selectedProjects.map(async (projectPath) => {
            await handlePlayScript(projectPath, multiScript);
        }));
    };

    const handlePlayScript = async (projectPath: string, script: string) => {
        if (!script) return;
        const compositeServiceId = `${projectPath}::${script} `;
        const existing = state.activeProcesses[compositeServiceId];
        if (existing?.status === 'running') return;

        await executeProjectScript(projectPath, script, {
            globalEnvName
        });
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

        await Promise.all(projectsToRestart.map(async (projectPath) => {
            await executeProjectScript(projectPath, scriptToRestart, {
                globalEnvName
            });
        }));
    };

    // ─── Terminal Tab Management ─────────────────────────────────────────────
    const handleTabRestart = async (e: React.MouseEvent, serviceId: string) => {
        e.preventDefault(); e.stopPropagation();
        const pState = state.activeProcesses[serviceId];
        if (!pState?.script) return;
        const projectPath = serviceId.split('::')[0];

        await invoke('kill_service', { serviceId });
        setTimeout(async () => {
            await executeProjectScript(projectPath, pState.script as string, {
                globalEnvName,
                incrementRestart: true
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
                vitePreviewOpen,
                activeTerminalTab,
                state.projects.map(p => p.path as string),
                state.savedCommands,
                state.savedCommandSteps,
            );
            await invoke('write_workspace_config_in_folder', {
                workspacePath: state.currentPath,
                content: JSON.stringify(config, null, 2),
            });
        } catch (e) {
            console.error('Save workspace config failed', e);
        }
    };

    // ─── Auto-save: escribe nexus-workspace.json automáticamente 1.5s después del último cambio ──
    const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        if (!state.currentPath) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                const config = buildWorkspaceConfigFromCurrentState(
                    state.currentPath!,
                    selectedProjects,
                    multiScript,
                    globalEnvName,
                    vitePreviewOpen,
                    activeTerminalTab,
                    state.projects.map(p => p.path as string),
                    state.savedCommands,
                    state.savedCommandSteps,
                );
                await invoke('write_workspace_config_in_folder', {
                    workspacePath: state.currentPath,
                    content: JSON.stringify(config, null, 2),
                });
            } catch (_) { /* silencioso — no interrumpir UX */ }
        }, 1500);
        return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    }, [
        selectedProjects, multiScript, globalEnvName, vitePreviewOpen,
        activeTerminalTab, state.currentPath, state.savedCommands, state.savedCommandSteps
    ]);

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
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col  h-full overflow-hidden">
                <Header
                    onSaveConfig={handleSaveWorkspaceConfig}
                    onLoadConfigApplyCurrent={handleLoadConfigApplyCurrent}
                    onLoadWorkspaceConfig={handleLoadWorkspaceConfig}
                />

                <div className="flex-1 min-h-0 flex bg-slate-900 overflow-hidden w-full relative">
                    {state.activeView === 'services' && (
                        <>
                            <ProjectListPane
                                projects={state.projects}
                                selectedProjects={selectedProjects}
                                onSelectAll={() => setSelectedProjects(state.projects.map(p => p.path as string))}
                                onDeselectAll={() => setSelectedProjects([])}
                                onToggleSelect={toggleProjectSelect}
                                onPlayScript={handlePlayScript}
                            />

                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                <MultiExecutionBar
                                    allScripts={allScripts}
                                    multiScript={multiScript}
                                    onScriptChange={setMultiScript}
                                    allEnvs={allEnvs}
                                    globalEnvName={globalEnvName}
                                    onEnvChange={setGlobalEnvName}
                                    onPlay={handleBatchPlay}
                                    onStop={handleBatchStop}
                                    onRestart={handleBatchRestart}
                                    onOpenViteWrapper={async () => {
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
                                    selectedCount={selectedProjects.length}
                                />

                                {viteWrapperModalOpen && (
                                    <ViteWrapperModal
                                        onClose={() => setViteWrapperModalOpen(false)}
                                        workspacePath={state.currentPath || ''}
                                        candidates={viteWrapperCandidates}
                                    />
                                )}

                                {processIds.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm bg-slate-900/50">
                                        <p>No active terminals. Start a service from the left panel.</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950/50 relative">
                                        <TerminalTabsBar
                                            processIds={processIds}
                                            activeProcesses={state.activeProcesses}
                                            activeTerminalTab={activeTerminalTab}
                                            onTabSelect={setActiveTerminalTab}
                                            onTabStop={async (e, serviceId) => {
                                                e.stopPropagation();
                                                await invoke('kill_service', { serviceId });
                                                updateProcessStatus(serviceId, 'stopped');
                                            }}
                                            onTabRestart={(e, serviceId) => { e.stopPropagation(); handleTabRestart(e, serviceId); }}
                                            onTabClose={async (e, serviceId) => {
                                                e.stopPropagation();
                                                await invoke('kill_service', { serviceId });
                                                updateProcessStatus(serviceId, 'idle');
                                                if (activeTerminalTab === serviceId) {
                                                    const remaining = processIds.filter(id => id !== serviceId);
                                                    setActiveTerminalTab(remaining.length > 0 ? remaining[0] : null);
                                                }
                                            }}
                                        />

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

                                        <TerminalArea
                                            processIds={processIds}
                                            activeProcesses={state.activeProcesses}
                                            activeTerminalTab={activeTerminalTab}
                                        />
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

                    {state.activeView === 'commands' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <CommandsPanel />
                        </div>
                    )}

                    {state.activeView === 'tests' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <TestsPanel />
                        </div>
                    )}

                    {state.activeView === 'sonar' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <SonarPanel />
                        </div>
                    )}

                    {state.activeView === 'cloudwatch' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <CloudWatchPanel />
                        </div>
                    )}

                    {state.activeView === 'http' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <HttpPanel />
                        </div>
                    )}

                    {state.activeView === 'jenkins' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <JenkinsPanel />
                        </div>
                    )}

                    {state.activeView === 'lib-cipher' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <LibCipherPanel />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
