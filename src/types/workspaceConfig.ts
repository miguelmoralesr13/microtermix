import type { CommandStep } from './commands';
import type { GitAccount } from '../stores/gitStore';
import { useGitStore } from '../stores/gitStore';
import type { JiraAccount } from '../components//jira/jiraApi';
import { useJiraStore } from '../stores/jiraStore';
import type { SonarAccount, SonarProjectLink } from '../stores/sonarStore';
import { useSonarStore } from '../stores/sonarStore';
import type { SsmTunnel } from '../stores/awsStore';
import { useAwsStore } from '../stores/awsStore';
import type { JenkinsConfig } from '../services/jenkinsApi';
import { useJenkinsStore } from '../stores/jenkinsStore';

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
    /** Rutas completas de todos los proyectos en el workspace (para proyectos fuera de la raíz). */
    allProjectPaths?: string[];
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
    jenkinsAccounts?: JenkinsConfig[];
    jenkinsActiveAccountId?: string | null;
    sonarActiveAccountId?: string | null;
    sonarAccounts?: SonarAccount[];
    sonarProjectLinks?: Record<string, SonarProjectLink>;
    ssmTunnels?: SsmTunnel[];
    visibleUtilities?: Record<string, boolean>;
}

export const WORKSPACE_CONFIG_FILENAME = 'microtermix.json';


/** Obtiene un identificador persistente para un path. */
export function getProjectIdentifier(path: string, workspacePath: string): string {
    if (!path) return '';
    // Si está dentro de la raíz del workspace, usamos el path relativo para portabilidad
    if (path.startsWith(workspacePath)) {
        let rel = path.substring(workspacePath.length);
        // Normalizar separadores y quitar leading slash
        rel = rel.replace(/\\/g, '/');
        if (rel.startsWith('/')) rel = rel.substring(1);
        return rel || '.';
    }
    // Si es externo, no hay de otra que usar el path absoluto
    return path.replace(/\\/g, '/');
}

/** Resuelve un identificador al path completo en el workspace actual. */
export function resolveIdentifierToPath(id: string, projectPaths: string[], workspacePath: string): string | undefined {
    // 1. Intentar match exacto (por si el ID es un path absoluto o relativo exacto)
    const exactMatch = projectPaths.find(p => p.replace(/\\/g, '/') === id.replace(/\\/g, '/'));
    if (exactMatch) return exactMatch;

    // 2. Intentar match por path relativo (si el ID es relativo a la raíz)
    const relMatch = projectPaths.find(p => {
        const pId = getProjectIdentifier(p, workspacePath);
        return pId === id;
    });
    if (relMatch) return relMatch;

    // 3. Fallback: match por folder name (legacy o por si acaso)
    return projectPaths.find(p => getFolderName(p) === id);
}

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
                .map((id) => resolveIdentifierToPath(id, projectPaths, workspacePath))
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
                const resolved = resolveIdentifierToPath(config.activeTerminalTabId, projectPaths, workspacePath);
                if (resolved) {
                    localStorage.setItem(`microtermix-active-terminal-tab-${pathKey}`, resolved);
                }
            }
        } catch (_) { }
    }
    if (config.projectEnvs) {
        for (const [id, value] of Object.entries(config.projectEnvs)) {
            try {
                const resolved = resolveIdentifierToPath(id, projectPaths, workspacePath);
                if (resolved) {
                    localStorage.setItem(`microtermix-envs-${pathKeyFor(resolved)}`, JSON.stringify(value));
                }
            } catch (_) { }
        }
    }
    if (config.projectViteWrapper) {
        for (const [id, value] of Object.entries(config.projectViteWrapper)) {
            try {
                const resolved = resolveIdentifierToPath(id, projectPaths, workspacePath);
                if (resolved) {
                    localStorage.setItem(`microtermix-vite-wrapper-${pathKeyFor(resolved)}`, JSON.stringify(value));
                }
            } catch (_) { }
        }
    }
    
    // Restaurar asignaciones de cuentas Git (id -> fullPath)
    if (config.repoAccounts) {
        for (const [id, accountId] of Object.entries(config.repoAccounts)) {
            const resolvedPath = resolveIdentifierToPath(id, projectPaths, workspacePath);
            if (resolvedPath) {
                useGitStore.getState().setRepoAccount(resolvedPath, accountId);
            }
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
    visibleUtilities: Record<string, boolean> = {},
): MicrotermixConfig {
    const pathKey = (p: string) => p.replace(/[/\\:]/g, '_');
    const projectEnvs: Record<string, { activeEnv: string; envs: Record<string, Record<string, string>> }> = {};
    const projectViteWrapper: Record<string, { enabled: boolean; remotes: Record<string, string> }> = {};

    for (const p of projectPaths) {
        const id = getProjectIdentifier(p, workspacePath);
        try {
            const raw = localStorage.getItem(`microtermix-envs-${pathKey(p)}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                projectEnvs[id] = parsed;
            }
        } catch (_) { }
        try {
            const raw = localStorage.getItem(`microtermix-vite-wrapper-${pathKey(p)}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                projectViteWrapper[id] = parsed;
            }
        } catch (_) { }
    }

    return {
        version: 1,
        workspacePath,
        selectedProjects: selectedProjects.map(p => getProjectIdentifier(p, workspacePath)),
        allProjectPaths: projectPaths,
        multiScript,
        globalEnvName,
        gitAccounts: useGitStore.getState().accounts,
        repoAccounts: Object.fromEntries(
            Object.entries(useGitStore.getState().repoAccounts)
                .map(([path, id]) => [getProjectIdentifier(path, workspacePath), id])
        ),
        vitePreviewOpen,
        savedCommands,
        savedCommandSteps: Object.keys(savedCommandSteps).length ? savedCommandSteps : undefined,
        savedCommandTypes: Object.keys(savedCommandTypes).length ? savedCommandTypes : undefined,
        pipelines: pipelines.length ? pipelines : undefined,
        activeTerminalTabId: activeTerminalTabId ? getProjectIdentifier(activeTerminalTabId, workspacePath) : undefined,
        projectEnvs: Object.keys(projectEnvs).length ? projectEnvs : undefined,
        projectViteWrapper: Object.keys(projectViteWrapper).length ? projectViteWrapper : undefined,
        jiraAccounts: useJiraStore.getState().accounts,
        jiraActiveAccountId: useJiraStore.getState().activeAccountId,
        jenkinsAccounts: useJenkinsStore.getState().accounts,
        jenkinsActiveAccountId: useJenkinsStore.getState().activeAccountId,
        sonarAccounts: useSonarStore.getState().accounts,
        sonarActiveAccountId: useSonarStore.getState().activeAccountId,
        sonarProjectLinks: useSonarStore.getState().projectLinks,
        ssmTunnels: useAwsStore.getState().ssm.tunnels,
        visibleUtilities: Object.keys(visibleUtilities).length ? visibleUtilities : undefined,
    };
}
