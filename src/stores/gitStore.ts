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
    loading: {
        repo: boolean;
        branches: boolean;
        status: boolean;
        timeline: boolean;
    };
    lastFetched: {
        branches?: number;
        status?: number;
        timeline?: number;
    };
    errors: {
        branches?: string;
        status?: string;
        timeline?: string;
    };
}

export type BranchFilter = 'all' | 'local' | 'remote';

export interface GitUi {
    activeTab: string | null;
    activeSubTab: 'git' | 'remote';
    sidebarWidth: number;
    stagingWidth: number;
    branchFilter: BranchFilter;
}

interface GitStore {
    repos: Record<string, GitRepoData>;
    ui: GitUi;

    setUi: (patch: Partial<GitUi>) => void;
    ensureRepo: (path: string) => void;

    fetchRepo: (path: string) => Promise<void>;
    fetchBranches: (path: string, force?: boolean) => Promise<void>;
    fetchStatus: (path: string, force?: boolean) => Promise<void>;
    fetchTimeline: (path: string, force?: boolean) => Promise<void>;
    fetchAll: (path: string, force?: boolean) => Promise<void>;
    invalidate: (path: string, slice?: 'branches' | 'status' | 'timeline') => void;
}

// ── Stale times (ms) ──────────────────────────────────────────────────────────

const STALE: Record<'branches' | 'status' | 'timeline', number> = {
    branches: 60_000,
    status: 30_000,
    timeline: 60_000,
};

// ── Default repo state ────────────────────────────────────────────────────────

export const EMPTY_REPO_DATA: GitRepoData = {
    isGitRepo: null,
    branches: { local: [], remote: [], stashes: [] },
    status: { files: [], currentBranch: '', isMergeInProgress: false },
    timeline: { commits: [], localHashes: [] },
    loading: { repo: false, branches: false, status: false, timeline: false },
    lastFetched: {},
    errors: {},
};

export const defaultRepoData = (): GitRepoData => ({
    isGitRepo: null,
    branches: { local: [], remote: [], stashes: [] },
    status: { files: [], currentBranch: '', isMergeInProgress: false },
    timeline: { commits: [], localHashes: [] },
    loading: { repo: false, branches: false, status: false, timeline: false },
    lastFetched: {},
    errors: {},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStale(repo: GitRepoData, slice: 'branches' | 'status' | 'timeline'): boolean {
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
                    activeSubTab: 'git',
                    sidebarWidth: 230,
                    stagingWidth: 280,
                    branchFilter: 'all',
                },

                setUi: (patch) => set(s => ({ ui: { ...s.ui, ...patch } })),

                ensureRepo: (path) => {
                    if (!get().repos[path]) {
                        set(s => ({ repos: { ...s.repos, [path]: defaultRepoData() } }));
                    }
                },

                fetchRepo: async (path) => {
                    patchRepo(set, path, r => ({ loading: { ...r.loading, repo: true } }));
                    try {
                        const [workTreeRes, headRes]: any[] = await Promise.all([
                            invoke('git_execute', { projectPath: path, args: ['rev-parse', '--is-inside-work-tree'] }),
                            invoke('git_execute', { projectPath: path, args: ['rev-parse', 'HEAD'] }),
                        ]);
                        if (workTreeRes.success && workTreeRes.stdout.trim() === 'true') {
                            patchRepo(set, path, { isGitRepo: headRes.success ? 'initialized' : 'empty_repo' });
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
                        const [localRes, remoteRes, stashRes]: any[] = await Promise.all([
                            invoke('git_execute', { projectPath: path, args: ['branch', '--no-color'] }),
                            invoke('git_execute', { projectPath: path, args: ['branch', '-r'] }),
                            invoke('git_execute', { projectPath: path, args: ['stash', 'list'] }),
                        ]);

                        if (!localRes.success && !remoteRes.success) {
                            patchRepo(set, path, r => ({
                                errors: { ...r.errors, branches: localRes.stderr },
                            }));
                            return;
                        }

                        const local = localRes.success
                            ? localRes.stdout.split('\n').filter((l: string) => l.trim()).map((l: string) => ({
                                active: l.startsWith('*'),
                                name: l.replace('*', '').trim(),
                            }))
                            : [];

                        const remote = remoteRes.success
                            ? remoteRes.stdout.split('\n')
                                .filter((l: string) => l.trim() && !l.includes('->'))
                                .map((l: string) => l.trim())
                            : [];

                        const stashes = stashRes.success
                            ? stashRes.stdout.split('\n').filter((l: string) => l.trim())
                            : [];

                        patchRepo(set, path, r => ({
                            branches: { local, remote, stashes },
                            errors: { ...r.errors, branches: undefined },
                            lastFetched: { ...r.lastFetched, branches: Date.now() },
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
                        const [statusRes, branchRes, mergeRes]: any[] = await Promise.all([
                            invoke('git_execute', { projectPath: path, args: ['status', '-s', '-u'] }),
                            invoke('git_execute', { projectPath: path, args: ['branch', '--show-current'] }),
                            invoke('git_execute', { projectPath: path, args: ['rev-parse', '-q', '--verify', 'MERGE_HEAD'] }),
                        ]);

                        if (!statusRes.success) {
                            patchRepo(set, path, r => ({
                                errors: { ...r.errors, status: statusRes.stderr },
                            }));
                            return;
                        }

                        const files = parseStatusLines(statusRes.stdout);
                        const currentBranch = branchRes.success ? branchRes.stdout.trim() : '';
                        const isMergeInProgress = mergeRes.success;

                        patchRepo(set, path, r => ({
                            status: { files, currentBranch, isMergeInProgress },
                            errors: { ...r.errors, status: undefined },
                            lastFetched: { ...r.lastFetched, status: Date.now() },
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
                        const [logRes, unpushedRes]: any[] = await Promise.all([
                            invoke('git_execute', {
                                projectPath: path,
                                args: ['log', 'HEAD', '--date-order',
                                    '--pretty=format:%H|%p|%an|%ar|%s|%D', '-n', '100'],
                            }),
                            invoke('git_execute', {
                                projectPath: path,
                                args: ['log', '@{u}..HEAD', '--pretty=format:%H'],
                            }),
                        ]);

                        if (!logRes.success) {
                            patchRepo(set, path, r => ({
                                errors: { ...r.errors, timeline: logRes.stderr },
                            }));
                            return;
                        }

                        const commits = parseCommitLog(logRes.stdout);
                        const localHashes = unpushedRes.success && unpushedRes.stdout.trim()
                            ? unpushedRes.stdout.trim().split('\n').filter(Boolean)
                            : [];

                        patchRepo(set, path, r => ({
                            timeline: { commits, localHashes },
                            errors: { ...r.errors, timeline: undefined },
                            lastFetched: { ...r.lastFetched, timeline: Date.now() },
                        }));
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, timeline: false } }));
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
                    repos: Object.fromEntries(
                        Object.entries(s.repos).map(([k, v]) => [
                            k,
                            {
                                ...v,
                                loading: { repo: false, branches: false, status: false, timeline: false },
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
