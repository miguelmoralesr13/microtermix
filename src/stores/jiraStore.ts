import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { JiraConfig, JiraAccount, JiraIssue } from '../components/jiraApi';
import { emptyConfig } from '../components/jiraApi';
import type { BoardFilter } from '../components/jiraApi';

// ── Legacy key sync ────────────────────────────────────────────────────────────
// jiraApi.ts reads from these keys synchronously inside jiraFetch().
// We keep them in sync so all existing API functions work without changes.
function syncLegacyKeys(accounts: JiraAccount[], activeAccountId: string | null) {
    localStorage.setItem('nexus-jira-accounts', JSON.stringify(accounts));
    if (activeAccountId) {
        localStorage.setItem('nexus-jira-active', activeAccountId);
    } else {
        localStorage.removeItem('nexus-jira-active');
    }
    // Also sync the flat config key that some components still read directly
    const active = accounts.find(a => a.id === activeAccountId) ?? accounts[0];
    if (active?.config) {
        localStorage.setItem('nexus-jira-config', JSON.stringify(active.config));
    }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StoriesSelection {
    epicKey: string | null;
    businessStoryKey?: string | null;
    storyKey: string | null;
    // Cached issue objects (populated after fetch, not persisted — too heavy)
    epic: JiraIssue | null;
    businessStory?: JiraIssue | null;
    story: JiraIssue | null;
}

export interface JiraStoreState {
    // ── Accounts (persisted) ──────────────────────────────────────────────────
    accounts: JiraAccount[];
    activeAccountId: string | null;

    // ── Board UI state (persisted) ────────────────────────────────────────────
    boardFilter: BoardFilter;
    boardProjectKey: string;

    // ── Stories UI state (persisted) ──────────────────────────────────────────
    storiesSelection: StoriesSelection;
    pinnedEpics: string[];
    pinnedStories: string[];

    // ── Account actions ───────────────────────────────────────────────────────
    addAccount: (name: string, config?: Partial<JiraConfig>) => JiraAccount;
    updateAccount: (id: string, patch: Partial<Pick<JiraAccount, 'name' | 'config'>>) => void;
    removeAccount: (id: string) => void;
    setActiveAccount: (id: string | null) => void;
    hydrate: (accounts: JiraAccount[], activeAccountId: string | null) => void;

    // ── Config helpers ────────────────────────────────────────────────────────
    getActiveConfig: () => JiraConfig;
    saveActiveConfig: (cfg: JiraConfig) => void;
    getActiveAccount: () => JiraAccount | undefined;

    // ── Board actions ─────────────────────────────────────────────────────────
    setBoardFilter: (f: BoardFilter) => void;
    setBoardProjectKey: (key: string) => void;

    // ── Stories actions ───────────────────────────────────────────────────────
    setStoriesSelection: (patch: Partial<StoriesSelection>) => void;
    clearStoriesDownstream: (from: 'epic' | 'story') => void;
    setPinnedEpics: (keys: string[]) => void;
    setPinnedStories: (keys: string[]) => void;
}

// ── Migration helper ───────────────────────────────────────────────────────────

function migrateFromLegacy(): Pick<JiraStoreState, 'accounts' | 'activeAccountId' | 'boardFilter' | 'boardProjectKey' | 'storiesSelection' | 'pinnedEpics' | 'pinnedStories'> | null {
    try {
        const accountsRaw = localStorage.getItem('nexus-jira-accounts');
        const activeRaw = localStorage.getItem('nexus-jira-active');
        const oldCfgRaw = localStorage.getItem('nexus-jira-config');

        let accounts: JiraAccount[] = [];
        let activeAccountId: string | null = null;

        if (accountsRaw) {
            accounts = JSON.parse(accountsRaw) as JiraAccount[];
            activeAccountId = activeRaw;
        } else if (oldCfgRaw) {
            const cfg = { ...emptyConfig(), ...JSON.parse(oldCfgRaw) };
            if (cfg.baseUrl) {
                const id = crypto.randomUUID();
                accounts = [{ id, name: 'Default', config: cfg }];
                activeAccountId = id;
            }
        }

        const boardFilterRaw = localStorage.getItem('nexus_jira_board_filter');
        const boardProjectKey = localStorage.getItem('nexus_jira_board_proj') ?? '';
        const boardFilter: BoardFilter = boardFilterRaw ? JSON.parse(boardFilterRaw) : { assignees: ['me'] };

        // Migrate epic/story keys (not full objects — they'll be re-fetched)
        const selEpicRaw = localStorage.getItem('nexus-jira-sel-epic');
        const selStoryRaw = localStorage.getItem('nexus-jira-sel-story');
        const selEpic: JiraIssue | null = selEpicRaw ? JSON.parse(selEpicRaw) : null;
        const selStory: JiraIssue | null = selStoryRaw ? JSON.parse(selStoryRaw) : null;

        const pinnedEpicsRaw = localStorage.getItem('nexus-jira-pinned-epics');
        const pinnedStoriesRaw = localStorage.getItem('nexus-jira-pinned-stories');

        return {
            accounts,
            activeAccountId: (activeAccountId && accounts.some(a => a.id === activeAccountId))
                ? activeAccountId
                : accounts[0]?.id ?? null,
            boardFilter,
            boardProjectKey,
            storiesSelection: {
                epicKey: selEpic?.key ?? null,
                storyKey: selStory?.key ?? null,
                epic: selEpic,
                story: selStory,
            },
            pinnedEpics: pinnedEpicsRaw ? JSON.parse(pinnedEpicsRaw) : [],
            pinnedStories: pinnedStoriesRaw ? JSON.parse(pinnedStoriesRaw) : [],
        };
    } catch {
        return null;
    }
}

// ── Default state ──────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
    accounts: [] as JiraAccount[],
    activeAccountId: null as string | null,
    boardFilter: { assignees: ['me'] } as BoardFilter,
    boardProjectKey: '',
    storiesSelection: { epicKey: null, businessStoryKey: null, storyKey: null, epic: null, businessStory: null, story: null },
    pinnedEpics: [] as string[],
    pinnedStories: [] as string[],
};

// ── Store ──────────────────────────────────────────────────────────────────────

export const useJiraStore = create<JiraStoreState>()(
    devtools(
        persist(
            (set, get) => ({
                ...DEFAULT_STATE,

                // ── Account actions ───────────────────────────────────────────

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

                // ── Config helpers ────────────────────────────────────────────

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

                // ── Board actions ─────────────────────────────────────────────

                setBoardFilter: (f) => set({ boardFilter: f }),
                setBoardProjectKey: (key) => set({ boardProjectKey: key }),

                // ── Stories actions ───────────────────────────────────────────

                setStoriesSelection: (patch) => {
                    set(s => ({ storiesSelection: { ...s.storiesSelection, ...patch } }));
                },

                clearStoriesDownstream: (from) => {
                    if (from === 'epic') {
                        set(s => ({
                            storiesSelection: {
                                ...s.storiesSelection,
                                storyKey: null, story: null,
                            },
                        }));
                    }
                },

                setPinnedEpics: (keys) => set({ pinnedEpics: keys }),
                setPinnedStories: (keys) => set({ pinnedStories: keys }),
            }),
            {
                name: 'nexus-jira-store',
                // Persist everything except the full issue objects in selection
                // (those are re-fetched; only keys are needed for persistence)
                // accounts and activeAccountId are persisted in nexus-workspace.json, not here
                partialize: (s) => ({
                    boardFilter: s.boardFilter,
                    boardProjectKey: s.boardProjectKey,
                    storiesSelection: {
                        epicKey: s.storiesSelection.epicKey,
                        businessStoryKey: s.storiesSelection.businessStoryKey,
                        storyKey: s.storiesSelection.storyKey,
                        epic: null,
                        businessStory: null,
                        story: null,
                    },
                    pinnedEpics: s.pinnedEpics,
                    pinnedStories: s.pinnedStories,
                }),
                // One-time migration from the old scattered localStorage keys
                merge: (persisted: any, current) => {
                    // If the persisted store already has data, use it
                    if (persisted?.accounts?.length > 0) {
                        return { ...current, ...persisted };
                    }
                    // Otherwise try to migrate from legacy keys
                    const legacy = migrateFromLegacy();
                    if (legacy) {
                        return { ...current, ...legacy };
                    }
                    return { ...current, ...persisted };
                },
            }
        ),
        { name: 'JiraStore' }
    )
);
