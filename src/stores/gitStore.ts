import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GitAccount as GitAccountDomain } from '../git/domain/GitAccount';
import type { GitStatusEntry as GitStatusEntryDomain } from '../git/domain/GitStatusEntry';
import type { GitCommit as RawCommitDomain } from '../git/domain/GitCommit';
import type { GitAheadBehind as AheadBehindDomain } from '../git/domain/GitAheadBehind';

// Re-export domain types for backward compatibility
// Components expect: GitStatusEntry, RawCommit, AheadBehind, BranchFilter, GitAccount, CloneFavorite, GitUi
export type GitStatusEntry = GitStatusEntryDomain;
export type RawCommit = RawCommitDomain;
export type AheadBehind = AheadBehindDomain;
export type GitAccount = GitAccountDomain;

// CloneFavorite keeps 'private' field (not isPrivate) for backward compatibility
export interface CloneFavorite {
    id: string;
    name: string;
    fullName: string;
    cloneUrl: string;
    htmlUrl: string;
    provider: 'github' | 'gitlab';
    private: boolean; // Note: kept as 'private' for backward compatibility
}

export type BranchFilter = 'all' | 'local' | 'remote';

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
                set(s => ({ accounts: [...s.accounts, { ...a, id } as GitAccount] }));
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
