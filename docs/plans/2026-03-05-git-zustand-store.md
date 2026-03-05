# Git Panel — Zustand Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all local state and fetch logic in the Git panel components with a single Zustand store that caches data per project path, fetches in parallel, and persists to localStorage.

**Architecture:** A single `useGitStore` (Zustand + persist middleware) holds `repos[projectPath]` with branches/status/timeline data plus `ui` for panel preferences. Components read from the store and call store actions instead of managing their own `useState`/`useEffect` fetch logic. Stale-while-revalidate: cached data renders immediately, background refresh updates in place.

**Tech Stack:** Zustand 5, `zustand/middleware` (persist, devtools), Tauri `invoke`, React 19, TypeScript

---

## Task 1: Install Zustand

**Files:**
- Modify: `package.json` (via npm)

**Step 1: Install**

```bash
npm install zustand
```

**Step 2: Verify it installed**

```bash
cat package.json | grep zustand
```

Expected: `"zustand": "^5.x.x"` in dependencies.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zustand dependency"
```

---

## Task 2: Create `src/stores/gitStore.ts`

**Files:**
- Create: `src/stores/gitStore.ts`

**Step 1: Create the store**

```ts
// src/stores/gitStore.ts
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
        localHashes: string[]; // string[] not Set — must be JSON-serializable for persist
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
}

export type BranchFilter = 'all' | 'local' | 'remote';

interface GitUi {
    activeTab: string | null;
    activeSubTab: 'git' | 'remote';
    sidebarWidth: number;
    stagingWidth: number;
    branchFilter: BranchFilter;
}

interface GitStore {
    repos: Record<string, GitRepoData>;
    ui: GitUi;

    // ── Actions ───────────────────────────────────────────────────────────────
    setUi: (patch: Partial<GitUi>) => void;
    ensureRepo: (path: string) => void;

    fetchRepo:      (path: string) => Promise<void>;
    fetchBranches:  (path: string, force?: boolean) => Promise<void>;
    fetchStatus:    (path: string, force?: boolean) => Promise<void>;
    fetchTimeline:  (path: string, force?: boolean) => Promise<void>;
    fetchAll:       (path: string, force?: boolean) => Promise<void>;
    invalidate:     (path: string, slice?: 'branches' | 'status' | 'timeline') => void;
}

// ── Stale times (ms) ──────────────────────────────────────────────────────────

const STALE: Record<'branches' | 'status' | 'timeline', number> = {
    branches: 60_000,
    status:   30_000,
    timeline: 60_000,
};

// ── Default repo state ────────────────────────────────────────────────────────

export const defaultRepoData = (): GitRepoData => ({
    isGitRepo: null,
    branches: { local: [], remote: [], stashes: [] },
    status: { files: [], currentBranch: '', isMergeInProgress: false },
    timeline: { commits: [], localHashes: [] },
    loading: { repo: false, branches: false, status: false, timeline: false },
    lastFetched: {},
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
    set(s => ({
        repos: {
            ...s.repos,
            [path]: {
                ...( s.repos[path] ?? defaultRepoData() ),
                ...(typeof patch === 'function' ? patch(s.repos[path] ?? defaultRepoData()) : patch),
            },
        },
    }));
}

// ── Parse helpers (pure functions, easy to test) ──────────────────────────────

export function parseStatusLines(stdout: string): GitStatusEntry[] {
    return stdout.split('\n').filter(l => l.trim()).map(line => {
        const stateCode = line.substring(0, 2);
        let file = line.substring(3).trim();
        if (file.includes('->')) file = file.split('->').pop()!.trim();
        if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
        const isConflicted = ['DD','AU','UD','UA','DU','AA','UU'].includes(stateCode);
        const isStaged = (stateCode[0] !== ' ' && stateCode[0] !== '?') && !isConflicted;
        const isUnstaged = (stateCode[1] !== ' ' && stateCode[1] !== '?' || stateCode === '??') && !isConflicted;
        return { file, stateCode, isStaged, isUnstaged, isConflicted };
    });
}

export function parseCommitLog(stdout: string): RawCommit[] {
    return stdout.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split('|');
        const hash       = parts[0] ?? '';
        const parentsRaw = parts[1] ?? '';
        const author     = parts[2] ?? '';
        const date       = parts[3] ?? '';
        const message    = parts[4] ?? '';
        const refs       = parts.slice(5).join('|');
        const parents    = parentsRaw.trim().split(' ').filter(Boolean).map(p => p.slice(0, 7));
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
                    activeTab:    null,
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

                // ── fetchRepo ─────────────────────────────────────────────────
                fetchRepo: async (path) => {
                    patchRepo(set, path, r => ({ loading: { ...r.loading, repo: true } }));
                    try {
                        const res: any = await invoke('git_execute', {
                            projectPath: path, args: ['rev-parse', '--is-inside-work-tree'],
                        });
                        if (res.success && res.stdout.trim() === 'true') {
                            const headRes: any = await invoke('git_execute', {
                                projectPath: path, args: ['rev-parse', 'HEAD'],
                            });
                            patchRepo(set, path, {
                                isGitRepo: headRes.success ? 'initialized' : 'empty_repo',
                            });
                        } else {
                            patchRepo(set, path, { isGitRepo: 'not_initialized' });
                        }
                    } catch {
                        patchRepo(set, path, { isGitRepo: 'not_initialized' });
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, repo: false } }));
                    }
                },

                // ── fetchBranches ─────────────────────────────────────────────
                fetchBranches: async (path, force = false) => {
                    const repo = get().repos[path] ?? defaultRepoData();
                    if (!force && !isStale(repo, 'branches')) return;

                    patchRepo(set, path, r => ({ loading: { ...r.loading, branches: true } }));
                    try {
                        const [localRes, remoteRes, stashRes]: any[] = await Promise.all([
                            invoke('git_execute', { projectPath: path, args: ['branch'] }),
                            invoke('git_execute', { projectPath: path, args: ['branch', '-r'] }),
                            invoke('git_execute', { projectPath: path, args: ['stash', 'list'] }),
                        ]);

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

                        patchRepo(set, path, {
                            branches: { local, remote, stashes },
                            lastFetched: { ...( get().repos[path]?.lastFetched ?? {} ), branches: Date.now() },
                        });
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, branches: false } }));
                    }
                },

                // ── fetchStatus ───────────────────────────────────────────────
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

                        const files = statusRes.success ? parseStatusLines(statusRes.stdout) : [];
                        const currentBranch = branchRes.success ? branchRes.stdout.trim() : '';
                        const isMergeInProgress = mergeRes.success;

                        patchRepo(set, path, {
                            status: { files, currentBranch, isMergeInProgress },
                            lastFetched: { ...(get().repos[path]?.lastFetched ?? {}), status: Date.now() },
                        });
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, status: false } }));
                    }
                },

                // ── fetchTimeline ─────────────────────────────────────────────
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

                        const commits = logRes.success ? parseCommitLog(logRes.stdout) : [];
                        const localHashes = unpushedRes.success && unpushedRes.stdout.trim()
                            ? unpushedRes.stdout.trim().split('\n').filter(Boolean)
                            : [];

                        patchRepo(set, path, {
                            timeline: { commits, localHashes },
                            lastFetched: { ...(get().repos[path]?.lastFetched ?? {}), timeline: Date.now() },
                        });
                    } finally {
                        patchRepo(set, path, r => ({ loading: { ...r.loading, timeline: false } }));
                    }
                },

                // ── fetchAll ──────────────────────────────────────────────────
                fetchAll: async (path, force = false) => {
                    const { fetchBranches, fetchStatus, fetchTimeline } = get();
                    await Promise.all([
                        fetchBranches(path, force),
                        fetchStatus(path, force),
                        fetchTimeline(path, force),
                    ]);
                },

                // ── invalidate ────────────────────────────────────────────────
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
                // Exclude loading flags from persistence — they always start false
                partialize: (s) => ({
                    ui: s.ui,
                    repos: Object.fromEntries(
                        Object.entries(s.repos).map(([k, v]) => [
                            k,
                            { ...v, loading: { repo: false, branches: false, status: false, timeline: false } },
                        ])
                    ),
                }),
            }
        ),
        { name: 'GitStore' }
    )
);
```

**Step 2: Build to check types**

```bash
npm run build
```

Expected: no TypeScript errors in `src/stores/gitStore.ts`.

**Step 3: Commit**

```bash
git add src/stores/gitStore.ts
git commit -m "feat: add gitStore Zustand store with parallel fetches and persist"
```

---

## Task 3: Migrate `GitPanel.tsx`

**Files:**
- Modify: `src/components/GitPanel.tsx`

Replace all local state that belongs in the store. Local state that stays: `activeDiffFile`, `selectedCommit`, `isConfigModalOpen` (these are purely ephemeral UI state not worth persisting).

**Step 1: Replace imports and state at the top of `GitPanel`**

Remove these lines (roughly lines 17–48):
```ts
const STORAGE_SIDEBAR = 'nexus-git-sidebar-width';
const STORAGE_STAGING = 'nexus-git-staging-width';
const STORAGE_GIT_TAB = 'nexus-git-active-tab';
const STORAGE_GIT_SUBTAB = 'nexus-git-active-subtab';
const MIN_PANEL = 150;
const MAX_PANEL = 800;
const DEFAULT_SIDEBAR = 230;
const DEFAULT_STAGING = 280;
```

And the useState/useEffect block that manages those keys:
```ts
const [activeGitTab, setActiveGitTab] = useState<string | null>(...)
const [activeSubTab, setActiveSubTab] = useState<'git' | 'remote'>(...)
const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
const [stagingWidth, setStagingWidth] = useState(DEFAULT_STAGING);
const [statusRefreshKey, setStatusRefreshKey] = useState(0);
const [branchRefreshKey, setBranchRefreshKey] = useState(0);
const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');
const [isGitRepo, setIsGitRepo] = useState<...>(null);
// ... plus all 4 useEffect for localStorage + checkRepo useEffect
```

Replace with:
```ts
import { useGitStore } from '../stores/gitStore';

// Keep only:
const MIN_PANEL = 150;
const MAX_PANEL = 800;

export const GitPanel: React.FC = () => {
    const { state } = useWorkspace();
    const ui           = useGitStore(s => s.ui);
    const setUi        = useGitStore(s => s.setUi);
    const fetchRepo    = useGitStore(s => s.fetchRepo);
    const fetchAll     = useGitStore(s => s.fetchAll);
    const fetchStatus  = useGitStore(s => s.fetchStatus);
    const fetchTimeline = useGitStore(s => s.fetchTimeline);
    const fetchBranches = useGitStore(s => s.fetchBranches);
    const invalidate   = useGitStore(s => s.invalidate);
    const ensureRepo   = useGitStore(s => s.ensureRepo);
    const repoData     = useGitStore(s => s.repos[ui.activeTab ?? '']);

    const [activeDiffFile, setActiveDiffFile]   = useState<...>(null);
    const [selectedCommit, setSelectedCommit]   = useState<...>(null);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
```

**Step 2: Replace `checkRepo` effect with store call**

Remove the `useEffect` that calls `checkRepo`. Replace with:
```ts
useEffect(() => {
    if (!ui.activeTab) return;
    ensureRepo(ui.activeTab);
    fetchRepo(ui.activeTab).then(() => {
        const repo = useGitStore.getState().repos[ui.activeTab!];
        if (repo?.isGitRepo === 'initialized') {
            fetchAll(ui.activeTab!, false);
        }
    });
}, [ui.activeTab]);
```

**Step 3: Replace `handleTabChange`**

```ts
const handleTabChange = (path: string) => {
    setUi({ activeTab: path });
    setActiveDiffFile(null);
    setSelectedCommit(null);
    // Show cached data immediately, refresh if stale
    ensureRepo(path);
    fetchRepo(path).then(() => {
        const repo = useGitStore.getState().repos[path];
        if (repo?.isGitRepo === 'initialized') {
            fetchAll(path, false); // respects stale times — no-op if fresh
        }
    });
};
```

**Step 4: Replace the three refresh handlers**

```ts
const handleStatusRefresh = () => {
    if (ui.activeTab) { invalidate(ui.activeTab, 'status'); fetchStatus(ui.activeTab, true); }
};
const handleTimelineRefresh = () => {
    if (ui.activeTab) { invalidate(ui.activeTab, 'timeline'); fetchTimeline(ui.activeTab, true); }
};
const handleBranchRefresh = () => {
    if (ui.activeTab) {
        invalidate(ui.activeTab);
        fetchAll(ui.activeTab, true);
    }
};
```

**Step 5: Replace resize handlers to use store**

```ts
const resizeSidebar = useCallback((delta: number) => {
    setUi({ sidebarWidth: Math.min(MAX_PANEL, Math.max(MIN_PANEL, ui.sidebarWidth + delta)) });
}, [ui.sidebarWidth]);
const resizeStaging = useCallback((delta: number) => {
    setUi({ stagingWidth: Math.min(MAX_PANEL, Math.max(MIN_PANEL, ui.stagingWidth - delta)) });
}, [ui.stagingWidth]);
```

**Step 6: Update JSX references**

In the JSX, replace all references:
- `activeGitTab` → `ui.activeTab`
- `activeSubTab` → `ui.activeSubTab`
- `setActiveSubTab(x)` → `setUi({ activeSubTab: x })`
- `sidebarWidth` → `ui.sidebarWidth`
- `stagingWidth` → `ui.stagingWidth`
- `branchFilter` → `ui.branchFilter`
- `setBranchFilter(x)` → `setUi({ branchFilter: x })`
- `isGitRepo` → `repoData?.isGitRepo ?? null`
- `refreshKey={statusRefreshKey}` → remove (GitStagingPanel no longer needs it)
- `refreshKey={branchRefreshKey}` → remove (GitSidebar no longer needs it)
- `refreshKey={timelineRefreshKey}` → remove (GitTimeline no longer needs it)
- `onStatusRefresh={handleStatusRefresh}` → keep (still needed for operations)
- `onTimelineRefresh={handleTimelineRefresh}` → keep

**Step 7: Add "Actualizando" badge in header**

In the header area, add:
```tsx
{repoData && Object.values(repoData.loading).some(Boolean) && (
    <span className="flex items-center gap-1 text-[10px] text-slate-500 animate-pulse">
        <RefreshCw size={10} className="animate-spin" /> Actualizando...
    </span>
)}
```

**Step 8: Build and fix any remaining type errors**

```bash
npm run build
```

**Step 9: Commit**

```bash
git add src/components/GitPanel.tsx
git commit -m "feat: migrate GitPanel to useGitStore"
```

---

## Task 4: Migrate `GitSidebar.tsx`

**Files:**
- Modify: `src/components/GitSidebar.tsx`

**Step 1: Remove local state and fetch logic**

Remove:
```ts
const [localBranches, setLocalBranches] = useState<...>([]);
const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
const [stashes, setStashes] = useState<string[]>([]);
const [loading, setLoading] = useState(false);
// loadSidebarData function
// useEffect that calls loadSidebarData
```

Also remove `refreshKey` and `onBranchFilterChange` from the props interface (branchFilter now comes from store).

**Step 2: Replace with store reads**

```ts
import { useGitStore, defaultRepoData } from '../stores/gitStore';

export const GitSidebar: React.FC<{ projectPath: string; onRefreshRequest?: () => void }> = ({
    projectPath, onRefreshRequest
}) => {
    const repo        = useGitStore(s => s.repos[projectPath] ?? defaultRepoData());
    const branchFilter = useGitStore(s => s.ui.branchFilter);
    const setUi       = useGitStore(s => s.setUi);

    const { local, remote, stashes } = repo.branches;
    const loading = repo.loading.branches;

    // branchSearch stays as local state — it's ephemeral
    const [branchSearch, setBranchSearch] = useState('');
    const [showLocal, setShowLocal] = useState(true);
    const [showRemote, setShowRemote] = useState(false);
    const [showStashes, setShowStashes] = useState(true);
    const [showPushModal, setShowPushModal] = useState(false);
```

**Step 3: Update refresh button handler**

The refresh button currently calls `loadSidebarData`. Replace with:
```ts
const handleRefresh = () => {
    onRefreshRequest?.();  // GitPanel.handleBranchRefresh → invalidate + fetchAll
};
```

**Step 4: Update branchFilter references**

- `branchFilter` is now from store (no prop)
- `onBranchFilterChange(f)` → `setUi({ branchFilter: f })`
- `localBranches` → `local`
- `remoteBranches` → `remote`

**Step 5: Build and fix types**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/components/GitSidebar.tsx
git commit -m "feat: migrate GitSidebar to useGitStore"
```

---

## Task 5: Migrate `GitStagingPanel.tsx` - COMPLETED
## Task 6: Migrate `GitTimeline.tsx` - COMPLETED

**Files:**
- Modify: `src/components/GitStagingPanel.tsx`

**Step 1: Update props interface — remove `refreshKey`, `onStatusRefresh`, `onTimelineRefresh`**

```ts
// Before
interface GitStagingPanelProps {
    projectPath: string;
    refreshKey?: number;
    onDiffRequest?: (...) => void;
    onStatusRefresh?: () => void;
    onTimelineRefresh?: () => void;
}

// After
interface GitStagingPanelProps {
    projectPath: string;
    onDiffRequest?: (file: string, mode: 'staged' | 'unstaged' | 'conflicted', line?: number) => void;
}
```

**Step 2: Remove local fetch state and effects**

Remove:
```ts
const [files, setFiles] = useState<GitStatusEntry[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [isMergeInProgress, setIsMergeInProgress] = useState(false);
const [currentBranch, setCurrentBranch] = useState('');
// checkMergeStatus callback
// loadStatus callback
// useEffect for loadStatus
// useEffect for checkMergeStatus
// useEffect for currentBranch fetch
```

**Step 3: Replace with store reads**

```ts
import { useGitStore, defaultRepoData } from '../stores/gitStore';

export const GitStagingPanel: React.FC<GitStagingPanelProps> = ({ projectPath, onDiffRequest }) => {
    const repo        = useGitStore(s => s.repos[projectPath] ?? defaultRepoData());
    const fetchStatus = useGitStore(s => s.fetchStatus);
    const fetchTimeline = useGitStore(s => s.fetchTimeline);
    const invalidate  = useGitStore(s => s.invalidate);

    const { files, currentBranch, isMergeInProgress } = repo.status;
    const loading = repo.loading.status;

    // These stay as local state — ephemeral UI only
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitting, setIsCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedForRollback, setSelectedForRollback] = useState<Set<string>>(new Set());
```

**Step 4: Update mutation handlers to invalidate + refresh**

After any operation that mutates git state (stage/unstage/discard/commit/abort-merge), replace:
```ts
if (onStatusRefresh) onStatusRefresh();
else await loadStatus();
```
With:
```ts
invalidate(projectPath, 'status');
fetchStatus(projectPath, true);
```

And replace:
```ts
if (onTimelineRefresh) onTimelineRefresh();
```
With:
```ts
invalidate(projectPath, 'timeline');
fetchTimeline(projectPath, true);
```

The `handleStageToggleAll`, `handleToggleNode`, `handleDiscardNode`, `handleDiscardSelected`, `handleCommit`, `handleAbortMerge` all need this update.

**Step 5: Build and fix types**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/components/GitStagingPanel.tsx
git commit -m "feat: migrate GitStagingPanel to useGitStore"
```

---

## Task 6: Migrate `GitTimeline.tsx`

**Files:**
- Modify: `src/components/GitTimeline.tsx`

**Step 1: Remove `refreshKey` from props**

```ts
// Before
interface GitTimelineProps {
    projectPath: string;
    refreshKey?: number;
    onCommitSelect?: (...) => void;
}

// After
interface GitTimelineProps {
    projectPath: string;
    onCommitSelect?: (hash: string, message: string, author: string, date: string) => void;
}
```

**Step 2: Remove local fetch state and logic**

Remove:
```ts
const [rawCommits, setRawCommits] = useState<RawCommit[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [localHashes, setLocalHashes] = useState<Set<string>>(new Set());
// loadTimeline useCallback
// useEffect that calls loadTimeline on refreshKey change
```

Also remove the duplicate type definitions for `RawCommit` — it's now exported from `gitStore.ts`. Update the import.

**Step 3: Replace with store reads**

```ts
import { useGitStore, defaultRepoData, RawCommit } from '../stores/gitStore';

export const GitTimeline: React.FC<GitTimelineProps> = ({ projectPath, onCommitSelect }) => {
    const { state } = useWorkspace();
    const repo          = useGitStore(s => s.repos[projectPath] ?? defaultRepoData());
    const fetchTimeline = useGitStore(s => s.fetchTimeline);
    const invalidate    = useGitStore(s => s.invalidate);

    const { commits: rawCommits, localHashes: localHashesArr } = repo.timeline;
    const loading = repo.loading.timeline;
    // Convert string[] back to Set for O(1) lookup in render
    const localHashes = useMemo(() => new Set(localHashesArr), [localHashesArr]);
```

**Step 4: Update refresh button**

```ts
// Before
<button onClick={loadTimeline} ...>

// After
<button onClick={() => { invalidate(projectPath, 'timeline'); fetchTimeline(projectPath, true); }} ...>
```

**Step 5: Update `handleEditSave` and `handleDelete` to refresh after mutation**

Both currently call `await loadTimeline()`. Replace with:
```ts
invalidate(projectPath, 'timeline');
await fetchTimeline(projectPath, true);
```

**Step 6: The `currentUser` fetch stays as a local `useEffect`** — it reads git config, not commit data, so it's fine to keep local.

**Step 7: The `commitStatuses` (CI status) stays local** — it's derived from GitHub API, not git, and is ephemeral.

**Step 8: Handle the `error` state** — since loading errors now go to... nowhere in the store. Add a local `error` state that gets set if `repo.timeline.commits` is empty AND `repo.loading.timeline === false` AND `repo.lastFetched.timeline` exists. Or simpler: add an `errors` field to the store.

Simplest approach — add error tracking to `GitRepoData` and store in Task 2 update:

In `src/stores/gitStore.ts`, add to `GitRepoData`:
```ts
errors: {
    branches?: string;
    status?: string;
    timeline?: string;
};
```

Initialize as `errors: {}` in `defaultRepoData()`.

In `fetchTimeline`, if `logRes.success === false`:
```ts
patchRepo(set, path, { errors: { ...get().repos[path]?.errors, timeline: logRes.stderr } });
```

Then in GitTimeline read `repo.errors?.timeline`.

**Step 9: Build and fix types**

```bash
npm run build
```

**Step 10: Commit**

```bash
git add src/components/GitTimeline.tsx src/stores/gitStore.ts
git commit -m "feat: migrate GitTimeline to useGitStore"
```

---

## Task 7: Final cleanup and verify

**Step 1: Remove now-unused localStorage keys**

Search for any remaining manual localStorage usage in Git components that the store now handles:
```bash
grep -n "STORAGE_GIT\|STORAGE_SIDEBAR\|STORAGE_STAGING\|nexus-git" src/components/Git*.tsx
```

Remove any leftover constants or effects that the store now covers.

**Step 2: Remove `refreshKey` prop from GitPanel JSX call sites**

Verify `GitPanel.tsx` no longer passes `refreshKey` to children:
```bash
grep -n "refreshKey" src/components/GitPanel.tsx
```

Expected: no matches.

**Step 3: Full build**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

**Step 4: Manual smoke test checklist**

- [ ] Open git panel → data loads from cache immediately (if app was opened before), then refreshes
- [ ] Switch between project tabs → cached data shows instantly, no full-blank loading flash
- [ ] Stage a file → status panel updates automatically
- [ ] Make a commit → timeline and status both refresh
- [ ] Close and reopen app → last repo tab is restored, cached data visible while refreshing
- [ ] Check Zustand devtools in browser devtools → store visible under "GitStore"

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Git panel Zustand migration — parallel fetches, stale-while-revalidate, persistence"
```
