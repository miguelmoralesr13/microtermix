import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { NexusWorkspaceConfig } from '../types/workspaceConfig';
import { applyWorkspaceConfigToStorage } from '../types/workspaceConfig';

export interface Project {
    name: String;
    path: String;
    project_type: String;
    scripts?: string[];
}

export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer';
export type ProcessStatus = 'idle' | 'running' | 'error' | 'stopped';

export interface ProcessState {
    status: ProcessStatus;
    script?: string;
    envJson?: string;
    logs?: string[];
    restarts?: number;
}

export interface Environment {
    name: string;
    variables: Record<string, string>;
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
    environments: Environment[];
    activeEnvironment: string;
    gitConfig: GitConfig;
    /** Se incrementa al aplicar una config cargada; ServiceManager relee localStorage cuando cambia */
    configAppliedTrigger: number;
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
    addEnvironment: (env: Environment) => void;
    setActiveEnvironment: (name: string) => void;
    setGitConfig: (config: GitConfig) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<WorkspaceState>(() => {
        const savedSettings = localStorage.getItem('nexus-workspace-settings');
        let currentPath = '';
        let environments = [{ name: 'local', variables: { 'NODE_ENV': 'development', 'PORT': '3000' } }];
        let activeEnvironment = 'local';

        let gitConfig: GitConfig = { provider: 'none', url: '', token: '' };
        const savedGitSettings = localStorage.getItem('nexus-git-settings');
        if (savedGitSettings) {
            try {
                const parsed = JSON.parse(savedGitSettings);
                gitConfig = parsed;
            } catch (e) { }
        }

        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.currentPath) currentPath = parsed.currentPath;
                if (parsed.environments) environments = parsed.environments;
                if (parsed.activeEnvironment) activeEnvironment = parsed.activeEnvironment;
            } catch (e) { }
        }

        return {
            currentPath,
            projects: [],
            activeProcesses: {},
            activeView: 'services',
            targetTerminalTab: null,
            environments,
            activeEnvironment,
            gitConfig,
            configAppliedTrigger: 0
        };
    });

    React.useEffect(() => {
        localStorage.setItem('nexus-git-settings', JSON.stringify(state.gitConfig));
    }, [state.gitConfig]);

    React.useEffect(() => {
        const settings = {
            currentPath: state.currentPath,
            environments: state.environments,
            activeEnvironment: state.activeEnvironment
        };
        localStorage.setItem('nexus-workspace-settings', JSON.stringify(settings));
    }, [state.currentPath, state.environments, state.activeEnvironment]);

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
            ...(config.environments?.length && { environments: config.environments }),
            ...(config.activeEnvironment != null && { activeEnvironment: config.activeEnvironment }),
            ...(config.gitConfig != null && { gitConfig: config.gitConfig as GitConfig }),
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

    const updateProcessStatus = (serviceId: string, status: ProcessStatus, script?: string, envJson?: string, incrementRestart?: boolean) => {
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
    };

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

    const addEnvironment = (env: Environment) => {
        setState(prev => ({
            ...prev,
            environments: [...prev.environments.filter(e => e.name !== env.name), env]
        }));
    };

    const setActiveEnvironment = (name: string) => {
        setState(prev => ({ ...prev, activeEnvironment: name }));
    };

    const setGitConfig = (config: GitConfig) => {
        setState(prev => ({ ...prev, gitConfig: config }));
    };

    return (
        <WorkspaceContext.Provider value={{
            state, setWorkspacePath, scanWorkspace, applyWorkspaceConfig, openFolderInThisWindow, openFolderInNewWindow,
            updateProcessStatus, appendProcessLog, setActiveView, setTargetTerminalTab, addEnvironment, setActiveEnvironment, setGitConfig
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
