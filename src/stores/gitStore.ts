import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

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

export interface GitRepoData {
    isGitRepo: 'initialized' | 'empty_repo' | 'not_initialized' | null;
    branches: {
        local: { name: string; active: boolean }[];
        remote: string[];
        stashes: string[];
    };
    status: {
        files: GitStatusEntry[];
        currentBranch: string;
        isMergeInProgress: boolean;
    };
    timeline: {
        commits: RawCommit[];
        localHashes: string[];
    };
    aheadBehind: AheadBehind | null;
    loading: {
        repo: boolean;
        branches: boolean;
        status: boolean;
        timeline: boolean;
        aheadBehind: boolean;
    };
    lastFetched: {
        branches?: number;
        status?: number;
        timeline?: number;
        aheadBehind?: number;
    };
    errors: {
        branches?: string;
        status?: string;
        timeline?: string;
    };
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

interface GitStore {
    repos: Record<string, GitRepoData>;
    ui: GitUi;

    // Cuentas en memoria — NO persisten en Zustand, solo en nexus-workspace.json
    accounts: GitAccount[];
    repoAccounts: Record<string, string>; // repoPath → accountId

    addAccount:       (a: Omit<GitAccount, 'id'>) => string;
    updateAccount:    (id: string, patch: Partial<Omit<GitAccount, 'id'>>) => void;
    removeAccount:    (id: string) => void;
    setRepoAccount:   (repoPath: string, accountId: string | null) => void;
    getActiveAccount: (repoPath: string) => GitAccount | undefined;

    cloneFavorites: CloneFavorite[];
    addCloneFavorite: (f: CloneFavorite) => void;
    removeCloneFavorite: (id: string) => void;

    setUi: (patch: Partial<GitUi>) => void;
    ensureRepo: (path: string) => void;

    fetchRepo: (path: string) => Promise<void>;
    fetchBranches: (path: string, force?: boolean) => Promise<void>;
    fetchStatus: (path: string, force?: boolean) => Promise<void>;
    fetchTimeline: (path: string, force?: boolean) => Promise<void>;
    fetchAheadBehind: (path: string, force?: boolean) => Promise<void>;
    fetchAll: (path: string, force?: boolean) => Promise<void>;
    invalidate: (path: string, slice?: 'branches' | 'status' | 'timeline' | 'aheadBehind') => void;
}

// ── Stale times (ms) ──────────────────────────────────────────────────────────

const STALE: Record<'branches' | 'status' | 'timeline' | 'aheadBehind', number> = {
    branches: 60_000,
    status: 30_000,
    timeline: 60_000,
    aheadBehind: 30_000,
};

// ── Default repo state ────────────────────────────────────────────────────────

export const EMPTY_REPO_DATA: GitRepoData = {
    isGitRepo: null,
    branches: { local: [], remote: [], stashes: [] },
    status: { files: [], currentBranch: '', isMergeInProgress: false },
    timeline: { commits: [], localHashes: [] },
    aheadBehind: null,
    loading: { repo: false, branches: false, status: false, timeline: false, aheadBehind: false },
    lastFetched: {},
    errors: {},
};

export const defaultRepoData = (): GitRepoData => ({
    isGitRepo: null,
    branches: { local: [], remote: [], stashes: [] },
    status: { files: [], currentBranch: '', isMergeInProgress: false },
    timeline: { commits: [], localHashes: [] },
    aheadBehind: null,
    loading: { repo: false, branches: false, status: false, timeline: false, aheadBehind: false },
    lastFetched: {},
    errors: {},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStale(repo: GitRepoData, slice: 'branches' | 'status' | 'timeline' | 'aheadBehind'): boolean {
    const t = repo.lastFetched[slice];
    return t === undefined || (Date.now() - t) > STALE[slice];
}

function patchRepo(
    set: (fn: (s: GitStore) => Partial<GitStore>) => void,
    path: string,
    patch: Partial<GitRepoData> | ((prev: GitRepoData) => Partial<GitRepoData>)
) {
    set(s => {
        const prev = s.repos[path] ?? defaultRepoData();
        return {
            repos: {
                ...s.repos,
                [path]: {
                    ...prev,
                    ...(typeof patch === 'function' ? patch(prev) : patch),
                },
            },
        };
    });
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

export function parseStatusLines(stdout: string): GitStatusEntry[] {
    return stdout.split('\n').filter(l => l.trim()).map(line => {
        const stateCode = line.substring(0, 2);
        let file = line.substring(3).trim();
        if (file.includes('->')) file = file.split('->').pop()!.trim();
        if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
        const isConflicted = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(stateCode);
        const isStaged = (stateCode[0] !== ' ' && stateCode[0] !== '?') && !isConflicted;
        const isUnstaged = ((stateCode[1] !== ' ' && stateCode[1] !== '?') || stateCode === '??') && !isConflicted;
        return { file, stateCode, isStaged, isUnstaged, isConflicted };
    });
}

export function parseCommitLog(stdout: string): RawCommit[] {
    return stdout.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split('|');
        const hash = parts[0] ?? '';
        const parentsRaw = parts[1] ?? '';
        const author = parts[2] ?? '';
        const date = parts[3] ?? '';
        const message = parts[4] ?? '';
        const refs = parts.slice(5).join('|');
        const parents = parentsRaw.trim().split(' ').filter(Boolean).map(p => p.slice(0, 7));
        return { hash, shortHash: hash.slice(0, 7), parents, author, date, message, refs };
    });
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGitStore = create<GitStore>()(
    devtools(
        persist(
            (set, get) => ({
                repos: {},
                ui: {
                    activeTab: null,
                    sidebarWidth: 230,
                    stagingWidth: 280,
                    branchFilter: 'all',
                },

                accounts: [],
                repoAccounts: {},
                cloneFavorites: [],

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

                ensureRepo: (path) => {
                    if (!get().repos[path]) {
                        set(s => ({ repos: { ...s.repos, [path]: defaultRepoData() } }));
                    }
                },

                fetchRepo: async (path) => {
                    patchRepo(set, path, r => ({ loading: { ...r.loading, repo: true }, isGitRepo: null }));
                    try {
                        const res: { isGitRepo: boolean; hasCommits: boolean } =
                            await invoke('git_is_repo_native', { projectPath: path });
                        if (res.isGitRepo) {
                            patchRepo(set, path, { isGitRepo: res.hasCommits ? 'initialized' : 'empty_repo' });
                        } else {
                            patchRepo(set, path, { isGitRepo: 'not_initialized' });
                        }
                    } catch {
                        patchRepo(set, path, { isGitRepo: 'not_initialized' });
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, repo: false } }));
                    }
                },

                fetchBranches: async (path, force = false) => {
                    const repo = get().repos[path] ?? defaultRepoData();
                    if (!force && !isStale(repo, 'branches')) return;

                    patchRepo(set, path, r => ({ loading: { ...r.loading, branches: true } }));
                    try {
                        const res: { local: { name: string; active: boolean }[]; remote: string[]; stashes: string[] } =
                            await invoke('git_branches_native', { projectPath: path });

                        patchRepo(set, path, r => ({
                            branches: { local: res.local, remote: res.remote, stashes: res.stashes },
                            errors: { ...r.errors, branches: undefined },
                            lastFetched: { ...r.lastFetched, branches: Date.now() },
                        }));
                    } catch (e: any) {
                        patchRepo(set, path, r => ({
                            errors: { ...r.errors, branches: String(e) },
                        }));
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, branches: false } }));
                    }
                },

                fetchStatus: async (path, force = false) => {
                    const repo = get().repos[path] ?? defaultRepoData();
                    if (!force && !isStale(repo, 'status')) return;

                    patchRepo(set, path, r => ({ loading: { ...r.loading, status: true } }));
                    try {
                        const res: {
                            files: GitStatusEntry[];
                            currentBranch: string;
                            isMergeInProgress: boolean;
                        } = await invoke('git_status_native', { projectPath: path });

                        patchRepo(set, path, r => ({
                            status: { files: res.files, currentBranch: res.currentBranch, isMergeInProgress: res.isMergeInProgress },
                            errors: { ...r.errors, status: undefined },
                            lastFetched: { ...r.lastFetched, status: Date.now() },
                        }));
                    } catch (e: any) {
                        patchRepo(set, path, r => ({
                            errors: { ...r.errors, status: String(e) },
                        }));
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, status: false } }));
                    }
                },

                fetchTimeline: async (path, force = false) => {
                    const repo = get().repos[path] ?? defaultRepoData();
                    if (!force && !isStale(repo, 'timeline')) return;

                    patchRepo(set, path, r => ({ loading: { ...r.loading, timeline: true } }));
                    try {
                        const res: { commits: RawCommit[]; localHashes: string[] } =
                            await invoke('git_log_native', { projectPath: path });

                        patchRepo(set, path, r => ({
                            timeline: { commits: res.commits, localHashes: res.localHashes },
                            errors: { ...r.errors, timeline: undefined },
                            lastFetched: { ...r.lastFetched, timeline: Date.now() },
                        }));
                    } catch (e: any) {
                        patchRepo(set, path, r => ({
                            errors: { ...r.errors, timeline: String(e) },
                        }));
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, timeline: false } }));
                    }
                },

                fetchAheadBehind: async (path, force = false) => {
                    const repo = get().repos[path] ?? defaultRepoData();
                    if (!force && !isStale(repo, 'aheadBehind')) return;

                    patchRepo(set, path, r => ({ loading: { ...r.loading, aheadBehind: true } }));
                    try {
                        const res: AheadBehind = await invoke('git_ahead_behind_native', { projectPath: path });
                        patchRepo(set, path, r => ({
                            aheadBehind: res,
                            lastFetched: { ...r.lastFetched, aheadBehind: Date.now() },
                            loading: { ...r.loading, aheadBehind: false },
                        }));
                    } catch {
                        // Silently ignore — offline or no remote
                        patchRepo(set, path, r => ({
                            aheadBehind: null,
                            lastFetched: { ...r.lastFetched, aheadBehind: Date.now() },
                            loading: { ...r.loading, aheadBehind: false },
                        }));
                    }
                },

                fetchAll: async (path, force = false) => {
                    const { fetchBranches, fetchStatus, fetchTimeline } = get();
                    await Promise.all([
                        fetchBranches(path, force),
                        fetchStatus(path, force),
                        fetchTimeline(path, force),
                    ]);
                },

                invalidate: (path, slice) => {
                    if (slice) {
                        patchRepo(set, path, r => ({
                            lastFetched: { ...r.lastFetched, [slice]: undefined },
                        }));
                    } else {
                        patchRepo(set, path, { lastFetched: {} });
                    }
                },
            }),
            {
                name: 'nexus-git-store',
                partialize: (s) => ({
                    ui: s.ui,
                    cloneFavorites: s.cloneFavorites,
                    repos: Object.fromEntries(
                        Object.entries(s.repos).map(([k, v]) => [
                            k,
                            {
                                ...v,
                                isGitRepo: null,
                                loading: { repo: false, branches: false, status: false, timeline: false, aheadBehind: false },
                                lastFetched: {},
                            },
                        ])
                    ),
                }),
            }
        ),
        { name: 'GitStore' }
    )
);
