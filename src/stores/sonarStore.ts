import { create } from 'zustand';

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
    setConfig: (patch: Partial<SonarConfig>) => void;
    hydrate: (cfg: SonarConfig) => void;
}

export const useSonarStore = create<SonarStore>()((set) => ({
    config: { ...DEFAULT_SONAR_CONFIG },

    setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),

    hydrate: (cfg) =>
        set({ config: { ...DEFAULT_SONAR_CONFIG, ...cfg } }),
}));
