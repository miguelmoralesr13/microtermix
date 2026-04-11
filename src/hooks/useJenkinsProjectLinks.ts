import { useState, useCallback, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobLink {
    /** Ruta absoluta del proyecto local, e.g. /Users/miguel/projects/portal-front */
    projectPath: string;
    /** Nombre display del proyecto local */
    projectName: string;
    /** URL canónica del Job en Jenkins, e.g. https://jenkins.example.com/job/portal-front/ */
    jobUrl: string;
    /** Nombre display del Job en Jenkins */
    jobName: string;
    jobDisplayName?: string;
    jobFullName?: string;
    /** ID de la cuenta Jenkins a la que pertenece el job */
    accountId: string;
    /** Color del último build (para mostrar estado visual) */
    color?: string;
    /** Número del último build */
    lastBuildNumber?: number;
    /** Timestamp del último build */
    lastBuildTimestamp?: number;
    /** Resultado del último build */
    lastBuildResult?: string | null;
    /** Si el último build está corriendo */
    lastBuildBuilding?: boolean;
    /** Fecha en que se creó el vínculo */
    linkedAt: number;
}

// ── Storage key helpers ───────────────────────────────────────────────────────

const STORAGE_PREFIX = 'microtermix-jenkins-links';

function getStorageKey(workspacePath: string): string {
    const hash = workspacePath.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `${STORAGE_PREFIX}-${hash}`;
}

function loadLinks(workspacePath: string): Record<string, JobLink> {
    if (!workspacePath) return {};
    try {
        const raw = localStorage.getItem(getStorageKey(workspacePath));
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
}

function saveLinks(workspacePath: string, links: Record<string, JobLink>): void {
    if (!workspacePath) return;
    try {
        localStorage.setItem(getStorageKey(workspacePath), JSON.stringify(links));
    } catch { /* ignore */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseJenkinsProjectLinksResult {
    /** Todos los vínculos del workspace actual */
    links: JobLink[];
    /** Vínculo como Record, accesible por projectPath */
    linksMap: Record<string, JobLink>;
    /** Crea o sobreescribe un vínculo para un proyecto */
    linkProject: (link: Omit<JobLink, 'linkedAt'>) => void;
    /** Elimina el vínculo de un proyecto */
    unlinkProject: (projectPath: string) => void;
    /** Actualiza campos de un vínculo existente (por ejemplo, tras un poll de status) */
    updateLinkStatus: (projectPath: string, status: Partial<Pick<JobLink, 'color' | 'lastBuildNumber' | 'lastBuildTimestamp' | 'lastBuildResult' | 'lastBuildBuilding'>>) => void;
    /** True si ese proyecto ya tiene un vínculo */
    isLinked: (projectPath: string) => boolean;
    /** Devuelve el vínculo de un proyecto específico */
    getLinkForProject: (projectPath: string) => JobLink | undefined;
}

export function useJenkinsProjectLinks(): UseJenkinsProjectLinksResult {
    const { state } = useWorkspace();
    const workspacePath = state.currentPath;

    const [linksMap, setLinksMap] = useState<Record<string, JobLink>>(() =>
        loadLinks(workspacePath)
    );

    // Re-load when workspace changes
    useEffect(() => {
        setLinksMap(loadLinks(workspacePath));
    }, [workspacePath]);

    const persist = useCallback((next: Record<string, JobLink>) => {
        saveLinks(workspacePath, next);
        setLinksMap(next);
    }, [workspacePath]);

    const linkProject = useCallback((link: Omit<JobLink, 'linkedAt'>) => {
        setLinksMap(prev => {
            const next = { ...prev, [link.projectPath]: { ...link, linkedAt: Date.now() } };
            saveLinks(workspacePath, next);
            return next;
        });
    }, [workspacePath]);

    const unlinkProject = useCallback((projectPath: string) => {
        setLinksMap(prev => {
            const next = { ...prev };
            delete next[projectPath];
            saveLinks(workspacePath, next);
            return next;
        });
    }, [workspacePath]);

    const updateLinkStatus = useCallback((
        projectPath: string,
        status: Partial<Pick<JobLink, 'color' | 'lastBuildNumber' | 'lastBuildTimestamp' | 'lastBuildResult' | 'lastBuildBuilding'>>
    ) => {
        setLinksMap(prev => {
            if (!prev[projectPath]) return prev;
            const next = { ...prev, [projectPath]: { ...prev[projectPath], ...status } };
            saveLinks(workspacePath, next);
            return next;
        });
    }, [workspacePath]);

    const isLinked = useCallback((projectPath: string) => !!linksMap[projectPath], [linksMap]);

    const getLinkForProject = useCallback((projectPath: string) => linksMap[projectPath], [linksMap]);

    return {
        links: Object.values(linksMap),
        linksMap,
        linkProject,
        unlinkProject,
        updateLinkStatus,
        isLinked,
        getLinkForProject,
    };
}
