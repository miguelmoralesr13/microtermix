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
    metricsCache: Record<string, SonarMetrics>;    // projectPath -> metrics
    
    setConfig: (patch: Partial<SonarConfig>) => void;
    linkProject: (path: string, link: SonarProjectLink) => void;
    setMetrics: (path: string, metrics: SonarMetrics) => void;
    clearCache: (path: string) => void;
}

export const useSonarStore = create<SonarStore>()(
    persist(
        (set) => ({
            config: { ...DEFAULT_SONAR_CONFIG },
            projectLinks: {},
            metricsCache: {},

            setConfig: (patch) =>
                set((state) => ({ config: { ...state.config, ...patch } })),

            linkProject: (path, link) =>
                set((state) => ({
                    projectLinks: { ...state.projectLinks, [path]: link }
                })),

            setMetrics: (path, metrics) =>
                set((state) => ({
                    metricsCache: { ...state.metricsCache, [path]: metrics }
                })),

            clearCache: (path) =>
                set((state) => {
                    const newMetrics = { ...state.metricsCache };
                    delete newMetrics[path];
                    return { metricsCache: newMetrics };
                }),
        }),
        {
            name: 'microtermix-sonar-storage',
        }
    )
);
