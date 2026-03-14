import React, { useState, useMemo, useCallback } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Sidebar } from './layout/Sidebar';
import { Header } from './layout/Header';
import { ServicesView } from './services/ServicesView';
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
import { MockPanel } from './mocks/MockPanel';
import { JsonProcessorPanel } from './json-processor/JsonProcessorPanel';
import { NotesPanel } from './notes/NotesPanel';
import { SwaggerPanel } from './swagger/SwaggerPanel';
import { PipelinesPanel } from './PipelinesPanel';
import { VisualDesigner } from './designer/VisualDesigner';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { buildWorkspaceConfigFromCurrentState } from '../types/workspaceConfig';
import { useGitStore } from '../stores/gitStore';
import { useJiraStore } from '../stores/jiraStore';
import { useSonarStore } from '../stores/sonarStore';
import { useProcessStore } from '../stores/processStore';

const ACTIVE_TERMINAL_STORAGE_KEY = 'nexus-active-terminal-tab';

function activeTerminalKey(workspacePath: string): string {
    return `${ACTIVE_TERMINAL_STORAGE_KEY}-${(workspacePath || '').replace(/[/\\:]/g, '_')}`;
}

const SELECTED_PROJECTS_STORAGE_KEY = 'nexus-selected-projects';

function selectedProjectsKey(workspacePath: string): string {
    return `${SELECTED_PROJECTS_STORAGE_KEY}-${(workspacePath || '').replace(/[/\\:]/g, '_')}`;
}

export const ServiceManager: React.FC = () => {
    const { state, setTargetTerminalTab, applyWorkspaceConfig, setWorkspacePath, scanWorkspace } = useWorkspace();
    
    // Zustand Store
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const activeTerminalTab = useProcessStore(s => s.activeTerminalTab);
    const setActiveTerminalTabStore = useProcessStore(s => s.setActiveTerminalTab);

    const gitAccounts = useGitStore(s => s.accounts);
    const gitRepoAccounts = useGitStore(s => s.repoAccounts);

    const jiraAccounts = useJiraStore(s => s.accounts);
    const jiraActiveAccountId = useJiraStore(s => s.activeAccountId);
    const sonarConfig = useSonarStore(s => s.config);

    const processIds = useMemo(() => Object.keys(activeProcesses), [activeProcesses]);

    const setActiveTerminalTab = useCallback((id: string | null) => {
        setActiveTerminalTabStore(id);
        if (id) {
            try {
                localStorage.setItem(activeTerminalKey(state.currentPath || ''), id);
            } catch (_) { }
        }
    }, [state.currentPath, setActiveTerminalTabStore]);

    const [multiScript, setMultiScript] = useState<string>(() => localStorage.getItem('nexus-multi-script') || '');
    const [globalEnvName, setGlobalEnvName] = useState<string>(() => localStorage.getItem('nexus-multi-env-name') || 'dev');
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const restoredSelectedRef = React.useRef(false);
    const [vitePreviewOpen, setVitePreviewOpen] = useState(() => {
        try { return localStorage.getItem('nexus-vite-preview-open') === '1'; } catch { return false; }
    });

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

    // ─── Terminal Tab Management ─────────────────────────────────────────────
    React.useEffect(() => {
        if (state.targetTerminalTab) {
            setActiveTerminalTabStore(state.targetTerminalTab);
            setTargetTerminalTab(null);
        }
    }, [state.targetTerminalTab, setTargetTerminalTab, setActiveTerminalTabStore]);

    React.useEffect(() => {
        if (processIds.length === 0) return;
        const isValid = activeTerminalTab && processIds.includes(activeTerminalTab);
        if (isValid) return;
        try {
            const saved = localStorage.getItem(activeTerminalKey(state.currentPath || ''));
            if (saved && processIds.includes(saved)) {
                setActiveTerminalTabStore(saved);
                return;
            }
        } catch (_) { }
        setActiveTerminalTab(processIds[0]);
    }, [processIds, state.currentPath, activeTerminalTab, setActiveTerminalTab]);

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
                state.savedCommandTypes,
                state.pipelines,
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
                    state.savedCommandTypes,
                    state.pipelines,
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
        activeTerminalTab, state.currentPath, state.savedCommands, state.savedCommandSteps, state.pipelines,
        gitAccounts, gitRepoAccounts,
        jiraAccounts, jiraActiveAccountId, sonarConfig,
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
                        <ServicesView
                            selectedProjects={selectedProjects}
                            setSelectedProjects={setSelectedProjects}
                            multiScript={multiScript}
                            setMultiScript={setMultiScript}
                            globalEnvName={globalEnvName}
                            setGlobalEnvName={setGlobalEnvName}
                            vitePreviewOpen={vitePreviewOpen}
                            setVitePreviewOpen={setVitePreviewOpen}
                        />
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

                    {state.activeView === 'mocks' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <MockPanel />
                        </div>
                    )}

                    {state.activeView === 'json-processor' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <JsonProcessorPanel />
                        </div>
                    )}

                    {state.activeView === 'notes' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <NotesPanel />
                        </div>
                    )}

                    {state.activeView === 'swagger' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <SwaggerPanel />
                        </div>
                    )}

                    {state.activeView === 'designer' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <VisualDesigner />
                        </div>
                    )}

                    {state.activeView === 'pipelines' && (
                        <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
                            <PipelinesPanel />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
