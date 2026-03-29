import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SonarMetrics {
    qualityGate: 'OK' | 'ERROR' | 'NONE';
    reliability: string;
    security: string;
    maintainability: string;
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    coverage: number;
    duplications: number;
}

export interface SonarProjectLink {
    projectKey: string;
    token?: string;
}

export interface SonarConfig {
    serverUrl: string;
    token: string;
    authType: 'basic' | 'bearer';
    organization?: string;
}

export const DEFAULT_SONAR_CONFIG: SonarConfig = {
    serverUrl: 'https://sonarcloud.io',
    token: '',
    authType: 'basic',
    organization: '',
};

interface SonarStore {
    config: SonarConfig;
    projectLinks: Record<string, SonarProjectLink>; // projectPath -> link
    
    setConfig: (patch: Partial<SonarConfig>) => void;
    linkProject: (path: string, link: SonarProjectLink) => void;
    hydrate: (config: Partial<SonarConfig>) => void;
}

export const useSonarStore = create<SonarStore>()(
    persist(
        (set) => ({
            config: { ...DEFAULT_SONAR_CONFIG },
            projectLinks: {},

            setConfig: (patch) =>
                set((state) => ({ config: { ...state.config, ...patch } })),

            linkProject: (path, link) =>
                set((state) => ({
                    projectLinks: { ...state.projectLinks, [path]: link }
                })),

            hydrate: (cfg) =>
                set((state) => ({ config: { ...state.config, ...cfg } })),
        }),
        {
            name: 'microtermix-sonar-storage',
        }
    )
);
