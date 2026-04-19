import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitStatusEntry {
    file: string;
    stateCode: string;
    isStaged: boolean;
    isUnstaged: boolean;
    isConflicted: boolean;
}

export interface RawCommit {
    hash: string;
    shortHash: string;
    parents: string[];
    author: string;
    date: string;
    message: string;
    refs: string;
}

export interface AheadBehind {
    ahead: number;
    behind: number;
    hasUpstream: boolean;
}

export type BranchFilter = 'all' | 'local' | 'remote';

export interface GitAccount {
    id: string;
    alias: string;
    provider: 'github' | 'gitlab';
    url: string;
    token: string;
}

export interface CloneFavorite {
    id: string; // full_name or path_with_namespace
    name: string;
    fullName: string;
    cloneUrl: string;
    htmlUrl: string;
    provider: 'github' | 'gitlab';
    private: boolean;
}

export interface GitUi {
    activeTab: string | null;
    sidebarWidth: number;
    stagingWidth: number;
    branchFilter: BranchFilter;
}

interface GitState {
    ui: GitUi;
    accounts: GitAccount[];
    repoAccounts: Record<string, string>; // repoPath → accountId
    cloneFavorites: CloneFavorite[];
}

interface GitActions {
    addAccount: (a: Omit<GitAccount, 'id'>) => string;
    updateAccount: (id: string, patch: Partial<Omit<GitAccount, 'id'>>) => void;
    removeAccount: (id: string) => void;
    setRepoAccount: (repoPath: string, accountId: string | null) => void;
    getActiveAccount: (repoPath: string) => GitAccount | undefined;
    addCloneFavorite: (f: CloneFavorite) => void;
    removeCloneFavorite: (id: string) => void;
    setUi: (patch: Partial<GitUi>) => void;
    hydrate: (accounts: GitAccount[], repoAccounts: Record<string, string>) => void;
}

export const useGitStore = create<GitState & GitActions>()(
    devtools(
        (set, get) => ({
            ui: {
                activeTab: null,
                sidebarWidth: 230,
                stagingWidth: 280,
                branchFilter: 'all',
            },

            accounts: [],
            repoAccounts: {},
            cloneFavorites: [],

            hydrate: (accounts, repoAccounts) => {
                set({ accounts, repoAccounts });
            },

            addAccount: (a) => {
                const id = crypto.randomUUID();
                set(s => ({ accounts: [...s.accounts, { ...a, id }] }));
                return id;
            },

            updateAccount: (id, patch) => {
                set(s => ({
                    accounts: s.accounts.map(acc => acc.id === id ? { ...acc, ...patch } : acc),
                }));
            },

            removeAccount: (id) => {
                set(s => ({
                    accounts: s.accounts.filter(acc => acc.id !== id),
                    repoAccounts: Object.fromEntries(
                        Object.entries(s.repoAccounts).filter(([, v]) => v !== id)
                    ),
                }));
            },

            setRepoAccount: (repoPath, accountId) => {
                set(s => {
                    const next = { ...s.repoAccounts };
                    if (accountId === null) {
                        delete next[repoPath];
                    } else {
                        next[repoPath] = accountId;
                    }
                    return { repoAccounts: next };
                });
            },

            getActiveAccount: (repoPath) => {
                const s = get();
                const id = s.repoAccounts[repoPath];
                return id ? s.accounts.find(a => a.id === id) : undefined;
            },

            addCloneFavorite: (f) => {
                set(s => ({
                    cloneFavorites: s.cloneFavorites.some(x => x.id === f.id)
                        ? s.cloneFavorites
                        : [...s.cloneFavorites, f],
                }));
            },

            removeCloneFavorite: (id) => {
                set(s => ({ cloneFavorites: s.cloneFavorites.filter(f => f.id !== id) }));
            },

            setUi: (patch) => set(s => ({ ui: { ...s.ui, ...patch } })),
        }),
        { name: 'GitStore' }
    )
);
