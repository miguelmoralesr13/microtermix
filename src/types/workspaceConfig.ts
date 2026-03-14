import type { CommandStep } from './commands';
import type { GitAccount } from '../stores/gitStore';
import { useGitStore } from '../stores/gitStore';
import type { JiraAccount } from '../components/jiraApi';
import { useJiraStore } from '../stores/jiraStore';
import type { SonarConfig } from '../stores/sonarStore';
import { useSonarStore } from '../stores/sonarStore';

export interface PipelineStepConfig {
    /** folderName::script (the space at end is handled by execution logic) */
    serviceId: string;
    condition?: {
        type: 'WaitPort' | 'WaitLog';
        value: string | number;
    };
}

export interface PipelineConfig {
    id: string;
    name: string;
    steps: PipelineStepConfig[];
}

/**
 * Configuración del workspace que se guarda en microtermix.json en la carpeta del workspace.
 * Los proyectos se identifican solo por nombre de carpeta (no rutas) para evitar conflictos entre máquinas/rutas.
 */
export interface MicrotermixConfig {
    version?: number;
    workspacePath?: string;
    /** Nombres de carpeta de proyectos seleccionados (no rutas completas). */
    selectedProjects?: string[];
    multiScript?: string;
    globalEnvName?: string;
    gitAccounts?:  GitAccount[];
    repoAccounts?: Record<string, string>; // folderName → accountId
    vitePreviewOpen?: boolean;
    savedCommands?: Record<string, string>;
    savedCommandSteps?: Record<string, CommandStep[]>;
    savedCommandTypes?: Record<string, string>;
    pipelines?: PipelineConfig[];
    /** Nombre de carpeta del tab de terminal activo. */
    activeTerminalTabId?: string | null;
    /** Por proyecto: key = nombre de carpeta del proyecto */
    projectEnvs?: Record<string, { activeEnv: string; envs: Record<string, Record<string, string>> }>;
    /** Por proyecto: key = nombre de carpeta del proyecto */
    projectViteWrapper?: Record<string, { enabled: boolean; remotes: Record<string, string> }>;
    // Nuevos campos:
    jiraAccounts?: JiraAccount[];
    jiraActiveAccountId?: string | null;
    sonarConfig?: SonarConfig;
}

export const WORKSPACE_CONFIG_FILENAME = 'nexus-workspace.json';


/** Obtiene solo el nombre de la carpeta del proyecto (último segmento del path). */
export function getFolderName(path: string): string {
    const segments = path.replace(/\/+$/, '').split(/[/\\]/).filter(Boolean);
    return segments.length ? segments[segments.length - 1] : path;
}

/** Resuelve un nombre de carpeta al path del proyecto en el workspace actual (primer match). */
export function resolveFolderNameToPath(folderName: string, projectPaths: string[]): string | undefined {
    return projectPaths.find((p) => getFolderName(p) === folderName);
}

/**
 * Aplica la config al localStorage. projectPaths son los paths actuales del workspace para
 * resolver nombres de carpeta (config) a paths (localStorage).
 */
export function applyWorkspaceConfigToStorage(
    config: MicrotermixConfig,
    workspacePath: string,
    projectPaths: string[],
): void {
    const pathKey = workspacePath.replace(/[/\\:]/g, '_');
    const pathKeyFor = (p: string) => p.replace(/[/\\:]/g, '_');

    if (config.selectedProjects != null && config.selectedProjects.length > 0) {
        try {
            const resolved = config.selectedProjects
                .map((name) => resolveFolderNameToPath(name, projectPaths))
                .filter((p): p is string => p != null);
            if (resolved.length) {
                localStorage.setItem(`microtermix-selected-projects-${pathKey}`, JSON.stringify(resolved));
            }
        } catch (_) { }
    }
    if (config.multiScript != null) {
        try {
            localStorage.setItem('microtermix-multi-script', config.multiScript);
        } catch (_) { }
    }
    if (config.globalEnvName != null) {
        try {
            localStorage.setItem('microtermix-multi-env-name', config.globalEnvName);
        } catch (_) { }
    }
    if (config.vitePreviewOpen != null) {
        try {
            localStorage.setItem('microtermix-vite-preview-open', config.vitePreviewOpen ? '1' : '0');
        } catch (_) { }
    }
    if (config.activeTerminalTabId != null) {
        try {
            if (config.activeTerminalTabId) {
                const resolved = resolveFolderNameToPath(config.activeTerminalTabId, projectPaths);
                if (resolved) {
                    localStorage.setItem(`microtermix-active-terminal-tab-${pathKey}`, resolved);
                }
            }
        } catch (_) { }
    }
    if (config.projectEnvs) {
        for (const [folderName, value] of Object.entries(config.projectEnvs)) {
            try {
                const resolved = resolveFolderNameToPath(folderName, projectPaths);
                if (resolved) {
                    localStorage.setItem(`microtermix-envs-${pathKeyFor(resolved)}`, JSON.stringify(value));
                }
            } catch (_) { }
        }
    }
    if (config.projectViteWrapper) {
        for (const [folderName, value] of Object.entries(config.projectViteWrapper)) {
            try {
                const resolved = resolveFolderNameToPath(folderName, projectPaths);
                if (resolved) {
                    localStorage.setItem(`microtermix-vite-wrapper-${pathKeyFor(resolved)}`, JSON.stringify(value));
                }
            } catch (_) { }
        }
    }
    if (config.savedCommands || config.savedCommandSteps || config.savedCommandTypes) {
        try {
            const current = localStorage.getItem('microtermix-settings');
            const parsed = current ? JSON.parse(current) : {};
            if (config.savedCommands) parsed.savedCommands = config.savedCommands;
            if (config.savedCommandSteps) parsed.savedCommandSteps = config.savedCommandSteps;
            if (config.savedCommandTypes) parsed.savedCommandTypes = config.savedCommandTypes;
            localStorage.setItem('microtermix-settings', JSON.stringify(parsed));
        } catch (_) { }
    }
}

export function buildWorkspaceConfigFromCurrentState(
    workspacePath: string,
    selectedProjects: string[],
    multiScript: string,
    globalEnvName: string,
    vitePreviewOpen: boolean,
    activeTerminalTabId: string | null,
    projectPaths: string[],
    savedCommands: Record<string, string> = {},
    savedCommandSteps: Record<string, CommandStep[]> = {},
    savedCommandTypes: Record<string, string> = {},
    pipelines: PipelineConfig[] = [],
): MicrotermixConfig {
    const pathKey = (p: string) => p.replace(/[/\\:]/g, '_');
    const projectEnvs: Record<string, { activeEnv: string; envs: Record<string, Record<string, string>> }> = {};
    const projectViteWrapper: Record<string, { enabled: boolean; remotes: Record<string, string> }> = {};

    for (const p of projectPaths) {
        const folderName = getFolderName(p);
        try {
            const raw = localStorage.getItem(`microtermix-envs-${pathKey(p)}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                projectEnvs[folderName] = parsed;
            }
        } catch (_) { }
        try {
            const raw = localStorage.getItem(`microtermix-vite-wrapper-${pathKey(p)}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                projectViteWrapper[folderName] = parsed;
            }
        } catch (_) { }
    }

    return {
        version: 1,
        workspacePath,
        selectedProjects: selectedProjects.map(getFolderName),
        multiScript,
        globalEnvName,
        gitAccounts: useGitStore.getState().accounts,
        repoAccounts: Object.fromEntries(
            Object.entries(useGitStore.getState().repoAccounts)
                .map(([path, id]) => [getFolderName(path), id])
        ),
        vitePreviewOpen,
        savedCommands,
        savedCommandSteps: Object.keys(savedCommandSteps).length ? savedCommandSteps : undefined,
        savedCommandTypes: Object.keys(savedCommandTypes).length ? savedCommandTypes : undefined,
        pipelines: pipelines.length ? pipelines : undefined,
        activeTerminalTabId: activeTerminalTabId ? getFolderName(activeTerminalTabId) : undefined,
        projectEnvs: Object.keys(projectEnvs).length ? projectEnvs : undefined,
        projectViteWrapper: Object.keys(projectViteWrapper).length ? projectViteWrapper : undefined,
        jiraAccounts: useJiraStore.getState().accounts,
        jiraActiveAccountId: useJiraStore.getState().activeAccountId,
        sonarConfig: useSonarStore.getState().config,
    };
}
