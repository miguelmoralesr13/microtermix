import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CommandStep } from '../types/commands';

import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { NexusWorkspaceConfig, PipelineConfig, PipelineStepConfig } from '../types/workspaceConfig';
import { applyWorkspaceConfigToStorage, resolveFolderNameToPath } from '../types/workspaceConfig';
import { parseInlineEnvs } from '../utils/parseInlineEnvs';
import { getViteWrapperConfig } from '../components/ViteWrapperModal';
import { useGitStore } from '../stores/gitStore';
import { useProcessStore, batchedAppendLogs } from '../stores/processStore';
import { useToolStore } from '../stores/toolStore';

export interface Project {
    name: String;
    path: String;
    project_type: String;
    framework?: string;
    build_system?: string;
    scripts?: string[];
}

export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'commands' | 'tests' | 'sonar' | 'cloudwatch' | 'http' | 'jenkins' | 'lib-cipher' | 'mocks' | 'json-processor' | 'notes' | 'swagger' | 'pipelines';

export interface WorkspaceState {
    currentPath: string;
    projects: Project[];
    activeView: AppView;
    targetTerminalTab: string | null;
    configAppliedTrigger: number;
    savedCommands: Record<string, string>;
    savedCommandSteps: Record<string, CommandStep[]>;
    savedCommandTypes: Record<string, string>; // name -> project_type
    pipelines: PipelineConfig[];
}

interface WorkspaceContextType {
    state: WorkspaceState;
    setWorkspacePath: (path: string) => void;
    scanWorkspace: (path: string) => Promise<Project[]>;
    applyWorkspaceConfig: (config: NexusWorkspaceConfig, workspacePath: string, projectPaths: string[]) => void;
    openFolderInThisWindow: () => Promise<void>;
    openFolderInNewWindow: () => Promise<void>;
    setActiveView: (view: AppView) => void;
    setTargetTerminalTab: (tabId: string | null) => void;
    addSavedCommand: (name: string, command: string, steps?: CommandStep[], projectType?: string) => void;
    removeSavedCommand: (name: string) => void;
    executePipeline: (pipeline: PipelineConfig) => Promise<void>;
    executeProjectScript: (
        projectPath: string,
        rawScript: string,
        options?: {
            globalEnvName?: string;
            buildFirst?: boolean;
            incrementRestart?: boolean;
        }
    ) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const updateProcessStatusStore = useProcessStore(s => s.updateProcessStatus);

    const [state, setState] = useState<WorkspaceState>(() => {
        const savedSettings = localStorage.getItem('nexus-workspace-settings');
        let currentPath = '';
        let savedCommands: Record<string, string> = {};
        let savedCommandSteps: Record<string, CommandStep[]> = {};
        let savedCommandTypes: Record<string, string> = {};

        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.currentPath) currentPath = parsed.currentPath;
                if (parsed.savedCommands) savedCommands = parsed.savedCommands;
                if (parsed.savedCommandSteps) savedCommandSteps = parsed.savedCommandSteps;
                if (parsed.savedCommandTypes) savedCommandTypes = parsed.savedCommandTypes;
            } catch (e) { }
        }

        return {
            currentPath,
            projects: [],
            activeView: 'services',
            targetTerminalTab: null,
            savedCommands,
            savedCommandSteps,
            savedCommandTypes,
            pipelines: [],
            configAppliedTrigger: 0
        };
    });

    React.useEffect(() => {
        try {
            const current = localStorage.getItem('nexus-workspace-settings');
            const parsed = current ? JSON.parse(current) : {};
            parsed.savedCommands = state.savedCommands;
            parsed.savedCommandSteps = state.savedCommandSteps;
            parsed.savedCommandTypes = state.savedCommandTypes;
            localStorage.setItem('nexus-workspace-settings', JSON.stringify(parsed));
        } catch (_) { }
    }, [state.savedCommands, state.savedCommandSteps, state.savedCommandTypes]);

    React.useEffect(() => {
        try {
            const current = localStorage.getItem('nexus-workspace-settings');
            const parsed = current ? JSON.parse(current) : {};
            parsed.currentPath = state.currentPath;
            localStorage.setItem('nexus-workspace-settings', JSON.stringify(parsed));
        } catch (_) { }
    }, [state.currentPath]);

    const setWorkspacePath = (path: string) => {
        setState(prev => ({ ...prev, currentPath: path }));
    };

    const applyWorkspaceConfig = useCallback((config: NexusWorkspaceConfig, workspacePath: string, projectPaths: string[]) => {
        applyWorkspaceConfigToStorage(config, workspacePath, projectPaths);
        setState(prev => ({
            ...prev,
            configAppliedTrigger: prev.configAppliedTrigger + 1,
            ...(config.savedCommands != null && { savedCommands: config.savedCommands }),
            ...(config.savedCommandSteps != null && { savedCommandSteps: config.savedCommandSteps }),
            ...(config.savedCommandTypes != null && { savedCommandTypes: config.savedCommandTypes }),
            ...(config.pipelines != null && { pipelines: config.pipelines }),
        }));

        const gitStore = useGitStore.getState();
        if (config.gitAccounts && config.gitAccounts.length > 0) {
            config.gitAccounts.forEach(a => {
                const exists = gitStore.accounts.find(x => x.id === a.id);
                if (exists) {
                    gitStore.updateAccount(a.id, a);
                } else {
                    useGitStore.setState(s => ({
                        accounts: [...s.accounts.filter(x => x.id !== a.id), a],
                    }));
                }
            });
        }
        if (config.repoAccounts) {
            Object.entries(config.repoAccounts).forEach(([folderName, accountId]) => {
                const fullPath = resolveFolderNameToPath(folderName, projectPaths);
                if (fullPath) gitStore.setRepoAccount(fullPath, accountId);
            });
        }
    }, []);

    const scanWorkspace = async (path: string): Promise<Project[]> => {
        try {
            const projects: Project[] = await invoke('scan_projects', { rootPath: path });
            setState(prev => ({ ...prev, projects, currentPath: path }));
            return projects;
        } catch (e) {
            console.error('Failed to scan workspace', e);
            return [];
        }
    };

    const openFolderInThisWindow = useCallback(async () => {
        try {
            const selected = await openDialog({ directory: true, multiple: false, title: 'Seleccionar carpeta del workspace' });
            if (selected !== null && !Array.isArray(selected)) {
                await scanWorkspace(selected);
            }
        } catch (e) {
            console.error('Open folder failed', e);
        }
    }, []);

    const openFolderInNewWindow = useCallback(async () => {
        try {
            const selected = await openDialog({ directory: true, multiple: false, title: 'Seleccionar carpeta para nueva ventana' });
            if (selected !== null && !Array.isArray(selected)) {
                await invoke('open_new_workspace', { path: selected });
            }
        } catch (e) {
            console.error('Open in new window failed', e);
        }
    }, []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        listen<string>('service-stopped', (event) => {
            updateProcessStatusStore(event.payload, 'stopped');
        }).then(fn => {
            if (cancelled) fn();
            else unlisten = fn;
        });
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [updateProcessStatusStore]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        listen<{ service_id: string; line: string; is_error: boolean }>('service-logs', (event) => {
            const { service_id, line } = event.payload;
            batchedAppendLogs(service_id, line);
        }).then(fn => {
            if (cancelled) fn();
            else unlisten = fn;
        });
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, []);

    const setActiveView = (view: AppView) => {
        setState(prev => ({ ...prev, activeView: view }));
    };

    const setTargetTerminalTab = (tabId: string | null) => {
        setState(prev => ({ ...prev, targetTerminalTab: tabId }));
    };

    const addSavedCommand = (name: string, command: string, steps?: CommandStep[], projectType?: string) => {
        setState(prev => ({
            ...prev,
            savedCommands: { ...prev.savedCommands, [name]: command },
            savedCommandSteps: steps
                ? { ...prev.savedCommandSteps, [name]: steps }
                : prev.savedCommandSteps,
            savedCommandTypes: projectType
                ? { ...prev.savedCommandTypes, [name]: projectType }
                : prev.savedCommandTypes,
        }));
    };

    const removeSavedCommand = (name: string) => {
        setState(prev => {
            const nextCmds = { ...prev.savedCommands };
            delete nextCmds[name];
            const nextSteps = { ...prev.savedCommandSteps };
            delete nextSteps[name];
            const nextTypes = { ...prev.savedCommandTypes };
            delete nextTypes[name];
            return { ...prev, savedCommands: nextCmds, savedCommandSteps: nextSteps, savedCommandTypes: nextTypes };
        });
    };

    const executeProjectScript = useCallback(async (
        projectPath: string,
        rawScript: string,
        options?: {
            globalEnvName?: string;
            buildFirst?: boolean;
            incrementRestart?: boolean;
        }
    ) => {
        const { globalEnvName = 'none', buildFirst = false, incrementRestart = false } = options || {};
        const compositeServiceId = `${projectPath}::${rawScript} `;

        let actualScript = rawScript.trim();
        if (state.savedCommands && state.savedCommands[actualScript]) {
            actualScript = state.savedCommands[actualScript];
        }

        let configuredEnv: Record<string, string> = {};
        try {
            const rawStore = localStorage.getItem(`nexus-envs-${projectPath.replace(/[/\\:]/g, '_')}`);
            if (rawStore) {
                const parsed = JSON.parse(rawStore);
                let targetEnv = globalEnvName;
                if (targetEnv === 'none' && parsed.activeEnv && parsed.activeEnv !== 'none') {
                    targetEnv = parsed.activeEnv;
                }
                if (targetEnv !== 'none' && parsed.envs && parsed.envs[targetEnv]) {
                    configuredEnv = parsed.envs[targetEnv];
                }
            }
        } catch (err) { }

        // Find the project to know its type
        const project = state.projects.find(p => p.path === projectPath);
        const isNodeLike = project?.project_type === 'node' || project?.project_type === 'bun';
        const isJava = project?.project_type === 'java';
        const isPython = project?.project_type === 'python';

        // Preparar strings de reemplazo según lenguaje
        const envString = Object.entries(configuredEnv).map(([k, v]) => `${k}=${v}`).join(' ');
        const javaPropertyString = Object.entries(configuredEnv).map(([k, v]) => `-D${k}=${v}`).join(' ');
        
        let builtScript = actualScript;
        
        if (isNodeLike) {
            // Para Node, preferimos cross-env si no está presente
            if (builtScript.includes('{{ENVS}}') && !builtScript.includes('cross-env')) {
                builtScript = builtScript.replace(/\{\{ENVS\}\}/g, 'npx cross-env {{ENVS}}');
            }
            builtScript = envString
                ? builtScript.replace(/\{\{ENVS\}\}/g, envString).trim()
                : builtScript.replace(/npx\s+cross-env\s+\{\{ENVS\}\}\s*/g, '').replace(/cross-env\s+\{\{ENVS\}\}\s*/g, '').replace(/\{\{ENVS\}\}\s*/g, '').trim();
        } else if (isJava) {
            // Para Java (Maven/Gradle), intentamos inyectar -D properties de forma inteligente
            if (builtScript.includes('{{ENVS}}')) {
                const firstWord = builtScript.trim().split(' ')[0];
                if (['mvn', 'gradle', './gradlew', 'gradlew.bat'].includes(firstWord)) {
                    // Insertar justo después del comando base: "mvn -Dport=3000 clean install"
                    builtScript = builtScript.replace(firstWord, `${firstWord} ${javaPropertyString}`);
                    builtScript = builtScript.replace(/\{\{ENVS\}\}\s*/g, '');
                } else {
                    builtScript = builtScript.replace(/\{\{ENVS\}\}/g, javaPropertyString);
                }
            }
        } else if (isPython) {
            // Para Python/Unix, inyección simple KEY=VAL cmd
            builtScript = builtScript.replace(/\{\{ENVS\}\}/g, envString).trim();
        } else {
            // Genérico: eliminar marcadores (el backend inyectará las variables vía OS env vars)
            builtScript = builtScript.replace(/npx\s+cross-env\s+\{\{ENVS\}\}\s*/g, '')
                                     .replace(/cross-env\s+\{\{ENVS\}\}\s*/g, '')
                                     .replace(/\{\{ENVS\}\}\s*/g, '').trim();
        }

        const { command: scriptToRun, env: inlineEnvs } = parseInlineEnvs(builtScript);
        const baseScript = scriptToRun || builtScript;
        const effectiveScript = buildFirst ? `npm run build && ${baseScript}` : baseScript;

        try {
            const envVarsJson = JSON.stringify({ ...configuredEnv, ...inlineEnvs });
            const viteConfig = getViteWrapperConfig(projectPath);
            const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;

            const customJavaHome = useToolStore.getState().projectJdks[projectPath];

            updateProcessStatusStore(compositeServiceId, 'running', rawScript, envVarsJson, incrementRestart);
            await invoke('execute_service_script', {
                serviceId: compositeServiceId,
                projectPath,
                script: effectiveScript,
                envVarsJson,
                useViteWrapper: useViteWrapper || undefined,
                viteWrapperRemotes: viteConfig?.remotes,
                viteWrapperBase: viteConfig?.base,
                viteWrapperSourcemap: viteConfig?.sourcemap,
                viteWrapperHost: viteConfig?.host,
                customJavaHome,
            });
        } catch (e) {
            console.error(`Execution failed for ${compositeServiceId}`, e);
            updateProcessStatusStore(compositeServiceId, 'error');
        }
    }, [updateProcessStatusStore, state.savedCommands]);

    const executePipeline = useCallback(async (pipeline: PipelineConfig) => {
        try {
            const resolvedSteps = pipeline.steps.map((step: PipelineStepConfig) => {
                const [folderName, script] = step.serviceId.split('::');
                const fullPath = resolveFolderNameToPath(folderName, state.projects.map(p => p.path as string));
                return {
                    service_id: `${fullPath}::${script} `,
                    condition: step.condition ? {
                        [step.condition.type]: step.condition.value
                    } : null
                };
            });

            await invoke('execute_pipeline', {
                pipelineId: pipeline.id,
                steps: resolvedSteps
            });
        } catch (e) {
            console.error('Failed to execute pipeline', e);
        }
    }, [state.projects]);

    return (
        <WorkspaceContext.Provider value={{
            state, setWorkspacePath, scanWorkspace, applyWorkspaceConfig, openFolderInThisWindow, openFolderInNewWindow,
            setActiveView, setTargetTerminalTab,
            executeProjectScript, addSavedCommand, removeSavedCommand, executePipeline
        }}>
            {children}
        </WorkspaceContext.Provider>
    );
};

export const useWorkspace = () => {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }
    return context;
};
