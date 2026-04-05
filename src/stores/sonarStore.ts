import { create } from 'zustand';

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
    accountId?: string;
    token?: string;
    customCommand?: string;
    includeProjectKey?: boolean;
    includeHostUrl?: boolean;
    includeToken?: boolean;
    includeOrganization?: boolean;
    includeBranch?: boolean;
    sources?: string;
    extraProps?: string;
    debug?: boolean;
    localAuditMode?: boolean;
    localAuditCommand?: string;
    localReportFile?: string;
}

export interface SonarAccount {
    id: string;
    name: string;
    serverUrl: string;
    token: string;
    authType: 'basic' | 'bearer';
    organization?: string;
}

export const DEFAULT_SONAR_ACCOUNT: SonarAccount = {
    id: 'default',
    name: 'SonarQube Cloud',
    serverUrl: 'https://sonarcloud.io',
    token: '',
    authType: 'basic',
    organization: '',
};

interface SonarStore {
    accounts: SonarAccount[];
    activeAccountId: string | null;
    projectLinks: Record<string, SonarProjectLink>; // projectPath -> link

    addAccount: (account: SonarAccount) => void;
    updateAccount: (id: string, patch: Partial<SonarAccount>) => void;
    removeAccount: (id: string) => void;
    setActiveAccount: (id: string | null) => void;
    linkProject: (path: string, link: SonarProjectLink) => void;
    hydrate: (accounts: SonarAccount[], activeId?: string | null, projectLinks?: Record<string, SonarProjectLink>) => void;
    
    // Helpers
    getActiveAccount: () => SonarAccount | undefined;
    getProjectAccount: (projectPath: string) => SonarAccount | undefined;
}

export const useSonarStore = create<SonarStore>((set, get) => ({
    accounts: [{ ...DEFAULT_SONAR_ACCOUNT }],
    activeAccountId: 'default',
    projectLinks: {},

    addAccount: (account) =>
        set((state) => ({ accounts: [...state.accounts, account] })),

    updateAccount: (id, patch) =>
        set((state) => ({
            accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

    removeAccount: (id) =>
        set((state) => {
            const newAccounts = state.accounts.filter((a) => a.id !== id);
            return {
                accounts: newAccounts,
                activeAccountId: state.activeAccountId === id 
                    ? (newAccounts[0]?.id || null) 
                    : state.activeAccountId,
            };
        }),

    setActiveAccount: (id) =>
        set({ activeAccountId: id }),

    linkProject: (path, link) =>
        set((state) => ({
            projectLinks: { ...state.projectLinks, [path]: link }
        })),

    hydrate: (accounts, activeId, projectLinks) =>
        set({ 
            accounts, 
            activeAccountId: activeId !== undefined ? activeId : (accounts[0]?.id || null),
            ...(projectLinks && { projectLinks })
        }),
        
    getActiveAccount: () => {
        const { accounts, activeAccountId } = get();
        return accounts.find(a => a.id === activeAccountId);
    },

    getProjectAccount: (projectPath) => {
        const { accounts, activeAccountId, projectLinks } = get();
        const link = projectLinks[projectPath];
        const accountId = link?.accountId || activeAccountId;
        return accounts.find(a => a.id === accountId);
    }
}));
