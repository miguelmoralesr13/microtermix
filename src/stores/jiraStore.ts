import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { JiraConfig, JiraAccount, JiraIssue } from '../components/jiraApi';
import { emptyConfig } from '../components/jiraApi';
import type { BoardFilter } from '../components/jiraApi';

// ── Legacy key sync ────────────────────────────────────────────────────────────
function syncLegacyKeys(accounts: JiraAccount[], activeAccountId: string | null) {
    localStorage.setItem('microtermix-jira-accounts', JSON.stringify(accounts));
    if (activeAccountId) {
        localStorage.setItem('microtermix-jira-active', activeAccountId);
    } else {
        localStorage.removeItem('microtermix-jira-active');
    }
    const active = accounts.find(a => a.id === activeAccountId) ?? accounts[0];
    if (active?.config) {
        localStorage.setItem('microtermix-jira-config', JSON.stringify(active.config));
    }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StoriesSelection {
    epicKey: string | null;
    businessStoryKey?: string | null;
    storyKey: string | null;
}

export interface JiraStoreState {
    accounts: JiraAccount[];
    activeAccountId: string | null;
    boardFilter: BoardFilter;
    boardProjectKey: string;
    storiesSelection: StoriesSelection;
    pinnedEpics: string[];
    pinnedStories: string[];

    addAccount: (name: string, config?: Partial<JiraConfig>) => JiraAccount;
    updateAccount: (id: string, patch: Partial<Pick<JiraAccount, 'name' | 'config'>>) => void;
    removeAccount: (id: string) => void;
    setActiveAccount: (id: string | null) => void;
    hydrate: (accounts: JiraAccount[], activeAccountId: string | null) => void;
    getActiveConfig: () => JiraConfig;
    saveActiveConfig: (cfg: JiraConfig) => void;
    getActiveAccount: () => JiraAccount | undefined;
    setBoardFilter: (f: BoardFilter) => void;
    setBoardProjectKey: (key: string) => void;
    setStoriesSelection: (patch: Partial<StoriesSelection>) => void;
    clearStoriesDownstream: (from: 'epic' | 'story') => void;
    setPinnedEpics: (keys: string[]) => void;
    setPinnedStories: (keys: string[]) => void;
}

const DEFAULT_STATE = {
    accounts: [] as JiraAccount[],
    activeAccountId: null as string | null,
    boardFilter: { assignees: ['me'] } as BoardFilter,
    boardProjectKey: '',
    storiesSelection: { epicKey: null, businessStoryKey: null, storyKey: null },
    pinnedEpics: [] as string[],
    pinnedStories: [] as string[],
};

export const useJiraStore = create<JiraStoreState>()(
    devtools(
        persist(
            (set, get) => ({
                ...DEFAULT_STATE,

                addAccount: (name, config = {}) => {
                    const id = crypto.randomUUID();
                    const newAcc: JiraAccount = { id, name, config: { ...emptyConfig(), ...config } };
                    set(s => {
                        const accounts = [...s.accounts, newAcc];
                        const activeAccountId = s.activeAccountId ?? id;
                        syncLegacyKeys(accounts, activeAccountId);
                        return { accounts, activeAccountId };
                    });
                    return newAcc;
                },

                updateAccount: (id, patch) => {
                    set(s => {
                        const accounts = s.accounts.map(a => a.id === id ? { ...a, ...patch } : a);
                        syncLegacyKeys(accounts, s.activeAccountId);
                        return { accounts };
                    });
                },

                removeAccount: (id) => {
                    set(s => {
                        const accounts = s.accounts.filter(a => a.id !== id);
                        const activeAccountId = s.activeAccountId === id
                            ? (accounts[0]?.id ?? null)
                            : s.activeAccountId;
                        syncLegacyKeys(accounts, activeAccountId);
                        return { accounts, activeAccountId };
                    });
                },

                setActiveAccount: (id) => {
                    set(s => {
                        syncLegacyKeys(s.accounts, id);
                        return { activeAccountId: id };
                    });
                },

                hydrate: (accounts, activeAccountId) => {
                    const resolvedId = activeAccountId && accounts.some(a => a.id === activeAccountId)
                        ? activeAccountId
                        : accounts[0]?.id ?? null;
                    syncLegacyKeys(accounts, resolvedId);
                    set({ accounts, activeAccountId: resolvedId });
                },

                getActiveConfig: () => {
                    const { accounts, activeAccountId } = get();
                    const acc = accounts.find(a => a.id === activeAccountId) ?? accounts[0];
                    return acc ? { ...emptyConfig(), ...acc.config } : emptyConfig();
                },

                saveActiveConfig: (cfg) => {
                    const { accounts, activeAccountId } = get();
                    const targetId = activeAccountId ?? accounts[0]?.id;
                    if (targetId) {
                        set(s => {
                            const updated = s.accounts.map(a =>
                                a.id === targetId ? { ...a, config: cfg } : a
                            );
                            syncLegacyKeys(updated, s.activeAccountId);
                            return { accounts: updated };
                        });
                    } else {
                        const id = crypto.randomUUID();
                        const newAccounts = [{ id, name: 'Default', config: cfg }];
                        syncLegacyKeys(newAccounts, id);
                        set({ accounts: newAccounts, activeAccountId: id });
                    }
                },

                getActiveAccount: () => {
                    const { accounts, activeAccountId } = get();
                    return accounts.find(a => a.id === activeAccountId) ?? accounts[0];
                },

                setBoardFilter: (f) => set({ boardFilter: f }),
                setBoardProjectKey: (key) => set({ boardProjectKey: key }),

                setStoriesSelection: (patch) => {
                    set(s => ({ storiesSelection: { ...s.storiesSelection, ...patch } }));
                },

                clearStoriesDownstream: (from) => {
                    if (from === 'epic') {
                        set(s => ({
                            storiesSelection: {
                                ...s.storiesSelection,
                                storyKey: null,
                            },
                        }));
                    }
                },

                setPinnedEpics: (keys) => set({ pinnedEpics: keys }),
                setPinnedStories: (keys) => set({ pinnedStories: keys }),
            }),
            {
                name: 'microtermix-jira-store',
                partialize: (s) => ({
                    boardFilter: s.boardFilter,
                    boardProjectKey: s.boardProjectKey,
                    storiesSelection: s.storiesSelection,
                    pinnedEpics: s.pinnedEpics,
                    pinnedStories: s.pinnedStories,
                }),
            }
        ),
        { name: 'JiraStore' }
    )
);
