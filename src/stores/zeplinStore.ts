import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { ZeplinState, ZeplinAccount, ZeplinProject, ZeplinScreen, ZeplinFlow, ZeplinSection, ZeplinLog } from '../types/zeplin';

interface ZeplinStoreState extends ZeplinState {
    // Actions
    addAccount: (name: string, token: string) => ZeplinAccount;
    removeAccount: (id: string) => void;
    setActiveAccount: (id: string | null) => void;
    
    setProjects: (projects: ZeplinProject[]) => void;
    setCurrentProject: (project: ZeplinProject | null) => void;
    setScreens: (screens: ZeplinScreen[]) => void;
    setFlows: (flows: ZeplinFlow[]) => void;
    setSections: (sections: ZeplinSection[]) => void;
    setSelectedScreenId: (id: string | null) => void;
    setSelectedFlowId: (id: string | null) => void;
    setLoading: (isLoading: boolean) => void;
    addLog: (log: ZeplinLog) => void;
    clearLogs: () => void;
    
    getActiveAccount: () => ZeplinAccount | undefined;
}

const DEFAULT_STATE: ZeplinState = {
    accounts: [],
    activeAccountId: null,
    projects: [],
    currentProject: null,
    screens: [],
    flows: [],
    sections: [],
    selectedScreenId: null,
    selectedFlowId: null,
    logs: [],
    isLoading: false,
};

export const useZeplinStore = create<ZeplinStoreState>()(
    devtools(
        persist(
            (set, get) => ({
                ...DEFAULT_STATE,

                addAccount: (name, token) => {
                    const id = crypto.randomUUID();
                    const newAcc: ZeplinAccount = { id, name, token };
                    set(s => ({
                        accounts: [...s.accounts, newAcc],
                        activeAccountId: s.activeAccountId ?? id,
                    }));
                    return newAcc;
                },

                removeAccount: (id) => {
                    set(s => {
                        const accounts = s.accounts.filter(a => a.id !== id);
                        const activeAccountId = s.activeAccountId === id
                            ? (accounts[0]?.id ?? null)
                            : s.activeAccountId;
                        return { accounts, activeAccountId };
                    });
                },

                setActiveAccount: (id) => {
                    set({ activeAccountId: id });
                },

                setProjects: (projects) => set({ projects }),
                setCurrentProject: (currentProject) => set({ currentProject }),
                setScreens: (screens) => set({ screens }),
                setFlows: (flows) => set({ flows }),
                setSections: (sections) => set({ sections }),
                setSelectedScreenId: (selectedScreenId) => set({ selectedScreenId }),
                setSelectedFlowId: (selectedFlowId) => set({ selectedFlowId }),
                setLoading: (isLoading) => set({ isLoading }),
                addLog: (log) => set(s => ({ logs: [log, ...s.logs].slice(0, 50) })),
                clearLogs: () => set({ logs: [] }),

                getActiveAccount: () => {
                    const { accounts, activeAccountId } = get();
                    return accounts.find(a => a.id === activeAccountId) ?? accounts[0];
                },
            }),
            {
                name: 'microtermix-zeplin-store',
                partialize: (s) => ({
                    accounts: s.accounts,
                    activeAccountId: s.activeAccountId,
                    currentProject: s.currentProject,
                }),
            }
        ),
        { name: 'ZeplinStore' }
    )
);
