import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { CommandStep } from '../types/commands';

import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import type { MicrotermixConfig, PipelineConfig, PipelineStepConfig } from '../types/workspaceConfig';
import { applyWorkspaceConfigToStorage, resolveIdentifierToPath, buildWorkspaceConfigFromCurrentState } from '../types/workspaceConfig';
import { parseInlineEnvs } from '../utils/parseInlineEnvs';
import { ScriptProcessorFactory, finalizeBuiltScript } from '../utils/scriptProcessorFactory';
import { getViteWrapperConfig } from '../components/project/ViteWrapperModal';
import { useGitStore } from '../stores/gitStore';
import { useJiraStore } from '../stores/jiraStore';
import { useSonarStore } from '../stores/sonarStore';
import { useProcessStore, batchedAppendLogs } from '../stores/processStore';
import { useToolStore } from '../stores/toolStore';
import { useUIStore } from '../stores/uiStore';
import { useAwsStore } from '../stores/awsStore';
import { useJenkinsStore } from '../stores/jenkinsStore';

export interface Project {
    name: String;
    path: String;
    project_type: String;
    framework?: string;
    build_system?: string;
    scripts?: string[];
}

export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'tests' | 'sonar' | 'cloudwatch' | 'http' | 'jenkins' | 'lib-cipher' | 'mocks' | 'json-processor' | 'regex' | 'notes' | 'swagger' | 'designer' | 'semgrep' | 'system' | 'zeplin';


export interface WorkspaceState {
    currentPath: string;
    projects: Project[];
    activeView: AppView;
    targetTerminalTab: string | null;
    configAppliedTrigger: number;
    savedCommands: Record<string, string>;
    savedCommandSteps: Record<string, CommandStep[]>;
    savedCommandTypes: Record<string, string>;
    pipelines: PipelineConfig[];
}

interface WorkspaceContextType {
    state: WorkspaceState;
    setWorkspacePath: (path: string) => void;
    scanWorkspace: (path: string) => Promise<Project[]>;
    applyWorkspaceConfig: (config: MicrotermixConfig, workspacePath: string, projectPaths: string[]) => void;
    openFolderInThisWindow: () => Promise<void>;
    openFolderInNewWindow: () => Promise<void>;
    addProjectsFromPaths: (paths: string[], silent?: boolean) => Promise<void>;
    removeProjectsByPath: (paths: string[]) => void;
    setActiveView: (view: AppView) => void;
    setTargetTerminalTab: (tabId: string | null) => void;
    addSavedCommand: (name: string, command: string, steps?: CommandStep[], projectType?: string) => void;
    removeSavedCommand: (name: string) => void;
    saveWorkspaceConfig: () => Promise<void>;
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

// Helper to create a stable ID from a path
const getPathHash = (path: string) => {
    if (!path) return 'default';
    return path.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const updateProcessStatusStore = useProcessStore(s => s.updateProcessStatus);
    const executingServiceIdsRef = React.useRef<Set<string>>(new Set());

    // We'll use a temporary state during boot until path is confirmed
    const [isInitialized, setIsInitialized] = useState(false);

    // ─── Stores for Auto-save ───────────────────────────────────────────
    const uiStore = useUIStore();
    const gitStore = useGitStore();
    const jiraStore = useJiraStore();
    const sonarStore = useSonarStore();
    const jenkinsStore = useJenkinsStore();
    const processStoreTerminalTab = useProcessStore(s => s.activeTerminalTab);

    // Initial Path Recovery from Backend (Tauri)
    useEffect(() => {
        const init = async () => {
            const label = getCurrentWindow().label;
            try {
                // If this is a new window, the backend has a path pending for us
                const initialPath = await invoke<string | null>('get_initial_workspace_for_window', { windowLabel: label });
                if (initialPath) {
                    setWorkspacePath(initialPath);
                    await scanWorkspace(initialPath);
                } else {
                    const savedGlobal = localStorage.getItem('microtermix-settings');
                    if (savedGlobal) {
                        try {
                            const parsed = JSON.parse(savedGlobal);
                            if (parsed.currentPath) {
                                setWorkspacePath(parsed.currentPath);
                                await scanWorkspace(parsed.currentPath);
                            }
                        } catch (e) { }
                    }
                }
            } catch (e) {
                console.error("[Workspace] Boot recovery failed", e);
            } finally {
                setIsInitialized(true);
            }
        };
        init();
    }, []);

    const [state, setState] = useState<WorkspaceState>(() => {
        // Initial boot: try to get path from global settings
        const savedGlobal = localStorage.getItem('microtermix-settings');
        let currentPath = '';
        if (savedGlobal) {
            try { currentPath = JSON.parse(savedGlobal).currentPath || ''; } catch (e) { }
        }

        return {
            currentPath,
            projects: [],
            activeView: 'services',
            targetTerminalTab: null,
            savedCommands: {},
            savedCommandSteps: {},
            savedCommandTypes: {},
            pipelines: [],
            configAppliedTrigger: 0
        };
    });

    // Dynamic storage key based on the project path itself
    const STORAGE_KEY = useMemo(() => `microtermix-ws-data-${getPathHash(state.currentPath)}`, [state.currentPath]);

    // Effect to load project-specific settings when path changes
    useEffect(() => {
        if (!state.currentPath) return;

        const projectSettings = localStorage.getItem(STORAGE_KEY);
        if (projectSettings) {
            try {
                const parsed = JSON.parse(projectSettings);
                setState(prev => ({
                    ...prev,
                    savedCommands: parsed.savedCommands || {},
                    savedCommandSteps: parsed.savedCommandSteps || {},
                    savedCommandTypes: parsed.savedCommandTypes || {},
                }));
            } catch (e) { }
        }
        setIsInitialized(true);
    }, [STORAGE_KEY]);

    // Save project-specific settings
    useEffect(() => {
        if (!isInitialized || !state.currentPath) return;

        const data = {
            savedCommands: state.savedCommands,
            savedCommandSteps: state.savedCommandSteps,
            savedCommandTypes: state.savedCommandTypes,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        // Also update the "last used path" globally
        localStorage.setItem('microtermix-settings', JSON.stringify({ currentPath: state.currentPath }));
    }, [STORAGE_KEY, state.savedCommands, state.savedCommandSteps, state.savedCommandTypes, isInitialized]);

    // ─── Global Auto-save (microtermix.json) ──────────────────────────────
    const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!state.currentPath || state.projects.length === 0) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                const config = buildWorkspaceConfigFromCurrentState(
                    state.currentPath,
                    uiStore.selectedProjects,
                    uiStore.multiScript,
                    uiStore.globalEnvName,
                    uiStore.vitePreviewOpen,
                    processStoreTerminalTab,
                    state.projects.map(p => p.path as string),
                    state.savedCommands,
                    state.savedCommandSteps,
                    state.savedCommandTypes,
                    state.pipelines,
                    uiStore.visibleUtilities,
                );

                await invoke('write_workspace_config_in_folder', {
                    workspacePath: state.currentPath,
                    content: JSON.stringify(config, null, 2),
                });
            } catch (e) {
                console.error('[Workspace] Auto-save failed', e);
            }
        }, 1500);

        return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    }, [
        state.currentPath, state.projects, state.savedCommands, state.savedCommandSteps, state.pipelines,
        uiStore.selectedProjects, uiStore.multiScript, uiStore.globalEnvName, uiStore.vitePreviewOpen,
        uiStore.visibleUtilities,
        processStoreTerminalTab,
        gitStore.accounts, gitStore.repoAccounts,
        jiraStore.accounts, jiraStore.activeAccountId,
        jenkinsStore.accounts, jenkinsStore.activeAccountId,
        sonarStore.config
    ]);

    const setWorkspacePath = (path: string) => {
        setState(prev => ({ ...prev, currentPath: path }));
    };

    const applyWorkspaceConfig = useCallback((config: MicrotermixConfig, workspacePath: string, projectPaths: string[]) => {
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
            Object.entries(config.repoAccounts).forEach(([id, accountId]) => {
                const fullPath = resolveIdentifierToPath(id, projectPaths, workspacePath);
                if (fullPath) gitStore.setRepoAccount(fullPath, accountId);
            });
        }

        // Hidratar cuentas de Jira desde workspace JSON
        if (config.jiraAccounts != null) {
            useJiraStore.getState().hydrate(
                config.jiraAccounts,
                config.jiraActiveAccountId ?? null,
            );
        }

        // Hidratar config de Sonar de workspace JSON
        if (config.sonarConfig != null) {
            useSonarStore.getState().hydrate(config.sonarConfig);
        }

        // Hidratar túneles SSM del workspace JSON
        if (config.ssmTunnels != null) {
            useAwsStore.getState().hydrateTunnels(config.ssmTunnels);
        }

        if (config.visibleUtilities) {
            uiStore.setVisibleUtilities(config.visibleUtilities);
        }

        if (config.jenkinsAccounts) {
            useJenkinsStore.getState().hydrate(config.jenkinsAccounts, config.jenkinsActiveAccountId || null);
        }
    }, [uiStore]);

    const scanWorkspace = useCallback(async (path: string): Promise<Project[]> => {
        try {
            // 1. Escanear la raíz (comportamiento original)
            const rootProjects: Project[] = await invoke('scan_projects', { rootPath: path });

            let finalProjects = [...rootProjects];

            // 2. Identificar y actualizar proyectos externos
            // Los proyectos externos son los que NO empiezan con la ruta raíz
            const currentProjects = state.projects;
            const externalPaths = currentProjects
                .map(p => p.path as string)
                .filter(p => !p.startsWith(path));

            if (externalPaths.length > 0) {
                const updatedExternal: Project[] = [];
                for (const extPath of externalPaths) {
                    try {
                        const found: Project[] = await invoke('scan_path', { path: extPath });
                        // scan_path devuelve un array, pero como es una ruta de proyecto directo, 
                        // tomamos el primero que coincida con la ruta exacta.
                        const p = found.find(f => f.path === extPath);
                        if (p) updatedExternal.push(p);
                    } catch (e) {
                        console.warn(`Could not refresh external project at ${extPath}`, e);
                        // Si falla (ej: carpeta borrada), podrías decidir si mantenerlo o no.
                        // Por ahora mantendremos el anterior si el escaneo falla pero existía.
                        const old = currentProjects.find(cp => cp.path === extPath);
                        if (old) updatedExternal.push(old);
                    }
                }
                finalProjects = [...finalProjects, ...updatedExternal];
            }

            setState(prev => ({ ...prev, projects: finalProjects, currentPath: path }));
            return finalProjects;
        } catch (e) {
            console.error('Failed to scan workspace', e);
            return [];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openFolderInThisWindow = useCallback(async () => {
        try {
            const selected = await openDialog({ directory: true, multiple: false, title: 'Seleccionar carpeta del workspace' });
            if (selected !== null && !Array.isArray(selected)) {
                // Save the new path to our GLOBAL storage before reloading
                const globalData = { currentPath: selected };
                localStorage.setItem('microtermix-settings', JSON.stringify(globalData));

                // Hard reload to clear all stores and re-initialize with the new path
                window.location.reload();
            }
        } catch (e) {
            console.error('Open folder failed', e);
        }
    }, []);

    const openFolderInNewWindow = useCallback(async () => {
        try {
            const selected = await openDialog({ directory: true, multiple: false, title: 'Seleccionar carpeta para nueva ventana' });
            if (selected !== null && !Array.isArray(selected)) {
                console.log("[Workspace] Opening in new window:", selected);
                await invoke('open_new_workspace', { path: selected });
            }
        } catch (e) {
            console.error('Open in new window failed', e);
            toast.error("Error al abrir nueva ventana");
        }
    }, []);

    const addProjectsFromPaths = useCallback(async (paths: string[], silent = false) => {
        try {
            const allFound: Project[] = [];
            for (const path of paths) {
                const found: Project[] = await invoke('scan_path', { path });
                allFound.push(...found);
            }

            if (allFound.length === 0) {
                if (!silent) toast.error("No se detectaron proyectos válidos en las rutas soltadas");
                return;
            }

            setState(prev => {
                const existingPaths = new Set(prev.projects.map(p => p.path as string));
                const newOnes = allFound.filter(p => !existingPaths.has(p.path as string));

                if (newOnes.length === 0) {
                    if (!silent && paths.length > 0) toast.info("Los proyectos soltados ya están en el workspace");
                    return prev;
                }

                const updated = [...prev.projects, ...newOnes];

                if (!silent) toast.success(`Añadidos ${newOnes.length} proyectos nuevos`);
                return { ...prev, projects: updated };
            });
        } catch (e) {
            console.error('Failed to add projects from paths', e);
            if (!silent) toast.error("Error al escanear rutas soltadas");
        }
    }, [state.projects]);

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
        const actualScriptBase = rawScript.trim();
        // Normalización estricta del ID para evitar duplicados por espacios extra
        const compositeServiceId = `${projectPath}::${actualScriptBase} `;

        let actualScript = actualScriptBase;
        if (state.savedCommands && state.savedCommands[actualScript]) {
            actualScript = state.savedCommands[actualScript];
        }

        let configuredEnv: Record<string, string> = {};
        try {
            const rawStore = localStorage.getItem(`microtermix-envs-${projectPath.replace(/[/\\:]/g, '_')}`);
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

        // Preparar strings de reemplazo según lenguaje (Limpiando comentarios y escapando valores)
        const sanitizeEnvValue = (val: string) => {
            // Quitar comentarios de shell al final de la línea
            const cleanVal = val.split('#')[0].trim();
            // Envolver en comillas simples para el shell, escapando comillas simples internas si existen
            return `'${cleanVal.replace(/'/g, "'\\''")}'`;
        };

        const validEnvEntries = Object.entries(configuredEnv)
            .filter(([k]) => k.trim() && !k.includes('#'));

        const envString = validEnvEntries
            .map(([k, v]) => `${k}=${sanitizeEnvValue(v)}`)
            .join(' ');

        const javaPropertyString = validEnvEntries
            .map(([k, v]) => `-D${k}=${sanitizeEnvValue(v)}`)
            .join(' ');

        // Construcción del script utilizando el patrón Factory/Strategy
        const processor = ScriptProcessorFactory.getProcessor(project?.project_type?.toLowerCase());
        let builtScript = processor.process(actualScript, envString, javaPropertyString);
        builtScript = finalizeBuiltScript(builtScript);

        const { command: scriptToRun, env: inlineEnvs } = parseInlineEnvs(builtScript);
        const baseScript = scriptToRun || builtScript;
        const effectiveScript = buildFirst ? `npm run build && ${baseScript}` : baseScript;

        const envVarsJson = JSON.stringify({ ...configuredEnv, ...inlineEnvs });
        const viteConfig = getViteWrapperConfig(projectPath);
        const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;

        const customJavaHome = useToolStore.getState().projectJdks[projectPath];

        // Prevención de doble ejecución atómica
        if (executingServiceIdsRef.current.has(compositeServiceId)) {
            console.warn(`[Workspace] Execution already in progress for ${compositeServiceId}, skipping duplicate.`);
            return;
        }
        executingServiceIdsRef.current.add(compositeServiceId);

        try {
            updateProcessStatusStore(compositeServiceId, 'running', actualScriptBase, envVarsJson, incrementRestart);
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
        } finally {
            // Liberar el bloqueo después de un pequeño margen para permitir que el estado de Zustand se estabilice
            setTimeout(() => {
                executingServiceIdsRef.current.delete(compositeServiceId);
            }, 500);
        }
    }, [updateProcessStatusStore, state.savedCommands, state.projects]);

    const saveWorkspaceConfig = useCallback(async () => {
        if (!state.currentPath) return;
        try {
            const config = buildWorkspaceConfigFromCurrentState(
                state.currentPath,
                uiStore.selectedProjects,
                uiStore.multiScript,
                uiStore.globalEnvName,
                uiStore.vitePreviewOpen,
                processStoreTerminalTab,
                state.projects.map(p => p.path as string),
                state.savedCommands,
                state.savedCommandSteps,
                state.savedCommandTypes,
                state.pipelines,
                uiStore.visibleUtilities,
            );
            await invoke('write_workspace_config_in_folder', {
                workspacePath: state.currentPath,
                content: JSON.stringify(config, null, 2),
            });
        } catch (e) {
            console.error('[Workspace] Save failed', e);
        }
    }, [
        state.currentPath, state.projects, state.savedCommands, state.savedCommandSteps, state.pipelines,
        uiStore.selectedProjects, uiStore.multiScript, uiStore.globalEnvName, uiStore.vitePreviewOpen,
        uiStore.visibleUtilities,
        processStoreTerminalTab
    ]);

    const executePipeline = useCallback(async (pipeline: PipelineConfig) => {
        try {
            const resolvedSteps = pipeline.steps.map((step: PipelineStepConfig) => {
                const parts = step.serviceId.split('::');
                const id = parts[0];
                const script = parts.slice(1).join('::');
                const fullPath = resolveIdentifierToPath(id, state.projects.map(p => p.path as string), state.currentPath);
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
    }, [state.projects, state.currentPath]);

    const removeProjectsByPath = useCallback((pathsToRemove: string[]) => {
        setState(prev => {
            const updated = prev.projects.filter(p => !pathsToRemove.includes(p.path as string));
            return { ...prev, projects: updated };
        });
        toast.success(`Se han eliminado ${pathsToRemove.length} proyectos del workspace`);
    }, []);

    return (
        <WorkspaceContext.Provider value={{
            state, setWorkspacePath, scanWorkspace, applyWorkspaceConfig, openFolderInThisWindow, openFolderInNewWindow,
            addProjectsFromPaths,
            removeProjectsByPath,
            setActiveView, setTargetTerminalTab,
            executeProjectScript, addSavedCommand, removeSavedCommand,
            saveWorkspaceConfig,
            executePipeline
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

export { WorkspaceContext };
