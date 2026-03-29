import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { ZeplinState, ZeplinAccount, ZeplinLog } from '../types/zeplin';

interface ZeplinStoreState {
    accounts: ZeplinAccount[];
    activeAccountId: string | null;
    currentProjectId: string | null;
    selectedScreenId: string | null;
    selectedFlowId: string | null;
    logs: ZeplinLog[];
    
    // Actions
    addAccount: (name: string, token: string) => ZeplinAccount;
    removeAccount: (id: string) => void;
    setActiveAccount: (id: string | null) => void;
    setCurrentProjectId: (id: string | null) => void;
    setSelectedScreenId: (id: string | null) => void;
    setSelectedFlowId: (id: string | null) => void;
    addLog: (log: ZeplinLog) => void;
    clearLogs: () => void;
}

export const useZeplinStore = create<ZeplinStoreState>()(
    devtools(
        persist(
            (set) => ({
                accounts: [],
                activeAccountId: null,
                currentProjectId: null,
                selectedScreenId: null,
                selectedFlowId: null,
                logs: [],

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

                setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
                setSelectedScreenId: (selectedScreenId) => set({ selectedScreenId }),
                setSelectedFlowId: (selectedFlowId) => set({ selectedFlowId }),
                addLog: (log) => set(s => ({ logs: [log, ...s.logs].slice(0, 50) })),
                clearLogs: () => set({ logs: [] }),
            }),
            {
                name: 'microtermix-zeplin-store',
                partialize: (s) => ({
                    accounts: s.accounts,
                    activeAccountId: s.activeAccountId,
                    currentProjectId: s.currentProjectId,
                }),
            }
        ),
        { name: 'ZeplinStore' }
    )
);
