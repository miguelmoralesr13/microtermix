import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CommandStep } from '../types/commands';

import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { NexusWorkspaceConfig } from '../types/workspaceConfig';
import { applyWorkspaceConfigToStorage } from '../types/workspaceConfig';
import { parseInlineEnvs } from '../utils/parseInlineEnvs';
import { getViteWrapperConfig } from '../components/ViteWrapperModal';

export interface Project {
    name: String;
    path: String;
    project_type: String;
    scripts?: string[];
}

export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'commands' | 'tests' | 'sonar' | 'cloudwatch';
export type ProcessStatus = 'idle' | 'running' | 'error' | 'stopped';

export interface ProcessState {
    status: ProcessStatus;
    script?: string;
    envJson?: string;
    logs?: string[];
    restarts?: number;
}

export interface GitConfig {
    provider: 'gitlab' | 'github' | 'bitbucket' | 'none';
    url: string;
    token: string;
}

export interface WorkspaceState {
    currentPath: string;
    projects: Project[];
    activeProcesses: Record<string, ProcessState>;
    activeView: AppView;
    targetTerminalTab: string | null;
    gitConfig: GitConfig;
    /** Se incrementa al aplicar una config cargada; ServiceManager relee localStorage cuando cambia */
    configAppliedTrigger: number;
    savedCommands: Record<string, string>;
    savedCommandSteps: Record<string, CommandStep[]>;
}

interface WorkspaceContextType {
    state: WorkspaceState;
    setWorkspacePath: (path: string) => void;
    scanWorkspace: (path: string) => Promise<Project[]>;
    applyWorkspaceConfig: (config: NexusWorkspaceConfig, workspacePath: string, projectPaths: string[]) => void;
    /** Abre el diálogo de carpeta y, si el usuario elige una, la abre en esta ventana. */
    openFolderInThisWindow: () => Promise<void>;
    /** Abre el diálogo de carpeta y, si el usuario elige una, abre una nueva ventana con ese workspace. */
    openFolderInNewWindow: () => Promise<void>;
    updateProcessStatus: (serviceId: string, status: ProcessStatus, script?: string, envJson?: string, incrementRestart?: boolean) => void;
    appendProcessLog: (serviceId: string, logLine: string) => void;
    setActiveView: (view: AppView) => void;
    setTargetTerminalTab: (tabId: string | null) => void;
    setGitConfig: (config: GitConfig) => void;
    addSavedCommand: (name: string, command: string, steps?: CommandStep[]) => void;
    removeSavedCommand: (name: string) => void;
    /**
     * Centralized execution logic for a project script.
     * Takes care of checking multi-execution "buildFirst", fetching envs from localStorage,
     * applying vite wrapper logic, and invoking Tauri.
     */
    executeProjectScript: (
        projectPath: string,
        rawScript: string,
        options?: {
            globalEnvName?: string;
            incrementRestart?: boolean;
        }
    ) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<WorkspaceState>(() => {
        const savedSettings = localStorage.getItem('nexus-workspace-settings');
        let currentPath = '';

        let gitConfig: GitConfig = { provider: 'none', url: '', token: '' };
        const savedGitSettings = localStorage.getItem('nexus-git-settings');
        if (savedGitSettings) {
            try {
                const parsed = JSON.parse(savedGitSettings);
                gitConfig = parsed;
            } catch (e) { }
        }

        let savedCommands: Record<string, string> = {};
        let savedCommandSteps: Record<string, CommandStep[]> = {};

        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.currentPath) currentPath = parsed.currentPath;
                if (parsed.savedCommands) savedCommands = parsed.savedCommands;
                if (parsed.savedCommandSteps) savedCommandSteps = parsed.savedCommandSteps;
            } catch (e) { }
        }

        return {
            currentPath,
            projects: [],
            activeProcesses: {},
            activeView: 'services',
            targetTerminalTab: null,
            gitConfig,
            savedCommands,
            savedCommandSteps,
            configAppliedTrigger: 0
        };
    });

    React.useEffect(() => {
        localStorage.setItem('nexus-git-settings', JSON.stringify(state.gitConfig));
    }, [state.gitConfig]);

    // Persist savedCommands and savedCommandSteps whenever they change
    React.useEffect(() => {
        try {
            const current = localStorage.getItem('nexus-workspace-settings');
            const parsed = current ? JSON.parse(current) : {};
            parsed.savedCommands = state.savedCommands;
            parsed.savedCommandSteps = state.savedCommandSteps;
            localStorage.setItem('nexus-workspace-settings', JSON.stringify(parsed));
        } catch (_) { }
    }, [state.savedCommands, state.savedCommandSteps]);

    React.useEffect(() => {
        const settings = { currentPath: state.currentPath, savedCommands: state.savedCommands };
        localStorage.setItem('nexus-workspace-settings', JSON.stringify(settings));
    }, [state.currentPath]);

    const activeProcessesRef = React.useRef(state.activeProcesses);
    React.useEffect(() => {
        activeProcessesRef.current = state.activeProcesses;
    }, [state.activeProcesses]);



    const setWorkspacePath = (path: string) => {
        setState(prev => ({ ...prev, currentPath: path }));
    };

    const applyWorkspaceConfig = useCallback((config: NexusWorkspaceConfig, workspacePath: string, projectPaths: string[]) => {
        applyWorkspaceConfigToStorage(config, workspacePath, projectPaths);
        setState(prev => ({
            ...prev,
            configAppliedTrigger: prev.configAppliedTrigger + 1,
            ...(config.gitConfig != null && { gitConfig: config.gitConfig as GitConfig }),
            ...(config.savedCommands != null && { savedCommands: config.savedCommands }),
            ...(config.savedCommandSteps != null && { savedCommandSteps: config.savedCommandSteps }),
        }));
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

    const updateProcessStatus = useCallback((serviceId: string, status: ProcessStatus, script?: string, envJson?: string, incrementRestart?: boolean) => {
        setState(prev => {
            const existing = prev.activeProcesses[serviceId] || {};

            // solo al cerrar (idle) quitamos la pestaña; 'stopped' la mantiene
            if (status === 'idle') {
                const newProcs = { ...prev.activeProcesses };
                delete newProcs[serviceId];
                return { ...prev, activeProcesses: newProcs };
            }

            let newLogs = existing.logs;
            let restarts = existing.restarts || 0;

            if (status === 'running' && (!existing.logs || incrementRestart)) {
                newLogs = [];
                if (incrementRestart) restarts += 1;
            }

            return {
                ...prev,
                activeProcesses: {
                    ...prev.activeProcesses,
                    [serviceId]: {
                        status,
                        script: script ?? existing.script,
                        envJson: envJson ?? existing.envJson,
                        logs: newLogs,
                        restarts
                    }
                }
            };
        });
    }, []);

    const appendProcessLog = useCallback((serviceId: string, logLine: string) => {
        setState(prev => {
            const existing = prev.activeProcesses[serviceId];
            const base = existing ?? { status: 'running' as ProcessStatus, script: undefined, envJson: undefined, logs: [] as string[] };
            const currentLogs = base.logs || [];
            if (currentLogs.length > 0 && currentLogs[currentLogs.length - 1] === logLine) return prev;
            return {
                ...prev,
                activeProcesses: {
                    ...prev.activeProcesses,
                    [serviceId]: {
                        ...base,
                        logs: [...currentLogs, logLine].slice(-1000)
                    }
                }
            };
        });
    }, []);

    // Listener: proceso terminó de forma natural (el proceso hijo salió solo)
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        listen<string>('service-stopped', (event) => {
            updateProcessStatus(event.payload, 'stopped');
        }).then(fn => {
            if (cancelled) fn();
            else unlisten = fn;
        });
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [updateProcessStatus]);

    // Listener global: una sola inscripción; si el cleanup corre antes de .then(), desregistramos al resolver
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        listen<{ service_id: string; line: string; is_error: boolean }>('service-logs', (event) => {
            const { service_id, line, is_error } = event.payload;
            const color = is_error ? '\x1b[31m' : '\x1b[37m';
            const formattedLine = `${color}${line}\x1b[0m`;
            appendProcessLog(service_id, formattedLine);
        }).then(fn => {
            if (cancelled) fn();
            else unlisten = fn;
        });
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [appendProcessLog]);

    const setActiveView = (view: AppView) => {
        setState(prev => ({ ...prev, activeView: view }));
    };

    const setTargetTerminalTab = (tabId: string | null) => {
        setState(prev => ({ ...prev, targetTerminalTab: tabId }));
    };

    const setGitConfig = (config: GitConfig) => {
        setState(prev => ({ ...prev, gitConfig: config }));
    };

    const addSavedCommand = (name: string, command: string, steps?: CommandStep[]) => {
        setState(prev => ({
            ...prev,
            savedCommands: { ...prev.savedCommands, [name]: command },
            savedCommandSteps: steps
                ? { ...prev.savedCommandSteps, [name]: steps }
                : prev.savedCommandSteps,
        }));
    };

    const removeSavedCommand = (name: string) => {
        setState(prev => {
            const nextCmds = { ...prev.savedCommands };
            delete nextCmds[name];
            const nextSteps = { ...prev.savedCommandSteps };
            delete nextSteps[name];
            return { ...prev, savedCommands: nextCmds, savedCommandSteps: nextSteps };
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

        // Check if rawScript is actually a saved named command
        let actualScript = rawScript.trim();
        if (state.savedCommands && state.savedCommands[actualScript]) {
            actualScript = state.savedCommands[actualScript];
        }

        // Load envs FIRST so we can build a display string showing them at {{ENVS}} position
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
                } else if (targetEnv !== 'none' && parsed.activeEnv && parsed.envs && parsed.envs[parsed.activeEnv]) {
                    // El env solicitado no existe en este proyecto → fallback al env activo del proyecto
                    configuredEnv = parsed.envs[parsed.activeEnv];
                }
            }
        } catch (err) { }

        // Reemplazar {{ENVS}} con los valores reales para cross-env inline.
        // Si no hay envs, eliminar "cross-env {{ENVS}}" del comando.
        const envString = Object.entries(configuredEnv).map(([k, v]) => `${k}=${v}`).join(' ');
        const builtScript = envString
            ? actualScript.replace(/\{\{ENVS\}\}/g, envString).trim()
            : actualScript.replace(/cross-env\s+\{\{ENVS\}\}\s*/g, '').replace(/\{\{ENVS\}\}\s*/g, '').trim();

        // parseInlineEnvs extrae vars KEY=VAL que estén al inicio del comando (compat. con comandos sin cross-env)
        const { command: scriptToRun, env: inlineEnvs } = parseInlineEnvs(builtScript);
        const baseScript = scriptToRun || builtScript;

        const effectiveScript = buildFirst ? `npm run build && ${baseScript}` : baseScript;

        try {
            const envVarsJson = JSON.stringify({ ...configuredEnv, ...inlineEnvs });
            const viteConfig = getViteWrapperConfig(projectPath);
            const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;
            const viteWrapperRemotes = useViteWrapper ? viteConfig!.remotes : undefined;

            updateProcessStatus(compositeServiceId, 'running', rawScript, envVarsJson, incrementRestart);
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
    }, [updateProcessStatus, state.savedCommands]);

    return (
        <WorkspaceContext.Provider value={{
            state, setWorkspacePath, scanWorkspace, applyWorkspaceConfig, openFolderInThisWindow, openFolderInNewWindow,
            updateProcessStatus, appendProcessLog, setActiveView, setTargetTerminalTab, setGitConfig,
            executeProjectScript, addSavedCommand, removeSavedCommand
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
