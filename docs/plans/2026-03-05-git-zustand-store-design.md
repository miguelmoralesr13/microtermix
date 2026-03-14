# Git Panel — Zustand Store Design

**Date:** 2026-03-05
**Status:** Approved

## Problem

The Git panel has 4 components that each manage their own fetch logic independently:

- `GitPanel` — checks if path is a git repo (2 sequential git commands)
- `GitSidebar` — loads branches + remote branches + stashes (3 sequential git commands)
- `GitStagingPanel` — loads status + current branch + merge state (3 separate effects)
- `GitTimeline` — loads log + unpushed commits (2 sequential git commands)

Issues caused:
1. **Slow initial load** — sequential git spawns (~50-100ms each on Windows) add up to 500-800ms
2. **No caching** — switching between project tabs re-fetches everything from scratch
3. **No persistence** — closing and reopening the app loses all cached data
4. **Cascading refreshKeys** — `statusRefreshKey`, `branchRefreshKey`, `timelineRefreshKey` are bumped manually and can cause redundant fetches

## Solution

A single `useGitStore` (Zustand) store keyed by `projectPath`, with:
- **Parallel fetches** via `Promise.all` within each fetch action
- **Stale-while-revalidate** — cached data shown immediately, background refresh when stale
- **Full persistence** via `zustand/middleware` `persist` to `localStorage`

## Store Shape

```ts
interface GitStatusEntry {
  file: string;
  stateCode: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isConflicted: boolean;
}

interface RawCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  date: string;
  message: string;
  refs: string;
}

interface GitRepoData {
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
    localHashes: string[]; // string[] (not Set) for JSON serialization
  };

  loading: {
    repo: boolean;
    branches: boolean;
    status: boolean;
    timeline: boolean;
  };

  lastFetched: {
    branches?: number;   // unix ms
    status?: number;
    timeline?: number;
  };
}

interface GitStore {
  repos: Record<string, GitRepoData>;

  ui: {
    activeTab: string | null;
    activeSubTab: 'git' | 'remote';
    sidebarWidth: number;
    stagingWidth: number;
    branchFilter: 'all' | 'local' | 'remote';
  };

  // Actions
  setUi(patch: Partial<GitStore['ui']>): void;
  fetchRepo(path: string): Promise<void>;
  fetchBranches(path: string): Promise<void>;
  fetchStatus(path: string): Promise<void>;
  fetchTimeline(path: string): Promise<void>;
  fetchAll(path: string): Promise<void>;
  invalidate(path: string, slice?: 'branches' | 'status' | 'timeline'): void;
}
```

## Stale Times

| Slice     | Stale after |
|-----------|-------------|
| branches  | 60s         |
| status    | 30s         |
| timeline  | 60s         |

If `now - lastFetched[slice] < staleTime`, the fetch action is a no-op (returns immediately). To force a refresh, call `invalidate(path, slice)` first — this sets `lastFetched[slice] = undefined`.

## Fetch Parallelization

### `fetchBranches(path)` — was 3 sequential awaits
```ts
const [localRes, remoteRes, stashRes] = await Promise.all([
  invoke('git_execute', { args: ['branch'] }),
  invoke('git_execute', { args: ['branch', '-r'] }),
  invoke('git_execute', { args: ['stash', 'list'] }),
]);
```

### `fetchStatus(path)` — was 3 separate effects
```ts
const [statusRes, branchRes, mergeRes] = await Promise.all([
  invoke('git_execute', { args: ['status', '-s', '-u'] }),
  invoke('git_execute', { args: ['branch', '--show-current'] }),
  invoke('git_execute', { args: ['rev-parse', '-q', '--verify', 'MERGE_HEAD'] }),
]);
```

### `fetchTimeline(path)` — was 2 sequential awaits
```ts
const [logRes, unpushedRes] = await Promise.all([
  invoke('git_execute', { args: ['log', 'HEAD', '--date-order', '--pretty=format:%H|%p|%an|%ar|%s|%D', '-n', '100'] }),
  invoke('git_execute', { args: ['log', '@{u}..HEAD', '--pretty=format:%H'] }),
]);
```

### `fetchAll(path)` — runs all 3 in parallel
```ts
await Promise.all([
  this.fetchBranches(path),
  this.fetchStatus(path),
  this.fetchTimeline(path),
]);
```

## Persistence

- Zustand `persist` middleware, key: `microtermix-git-store`, storage: `localStorage`
- `loading` fields are excluded from persistence (always start as `false`)
- On app open: cached data renders immediately → `fetchAll` runs in background → data updates in place
- A subtle "Actualizando..." badge shows while any `loading.*` is `true`

## Component Changes

### `GitPanel.tsx`
- Remove: `statusRefreshKey`, `branchRefreshKey`, `timelineRefreshKey`, `isGitRepo` state, `checkRepo` effect
- Remove: `sidebarWidth`/`stagingWidth` local state (move to `store.ui`)
- Add: reads `ui` and `repos[activeTab]` from store
- `handleBranchRefresh` → `invalidate(path)` + `fetchAll(path)`
- `handleStatusRefresh` → `invalidate(path, 'status')` + `fetchStatus(path)`
- `handleTimelineRefresh` → `invalidate(path, 'timeline')` + `fetchTimeline(path)`

### `GitSidebar.tsx`
- Remove: all local state (`localBranches`, `remoteBranches`, `stashes`, `loading`) and `loadSidebarData`
- Add: reads `repos[projectPath].branches` and `repos[projectPath].loading.branches` from store
- Refresh button → `invalidate(path, 'branches')` + `fetchBranches(path)`

### `GitStagingPanel.tsx`
- Remove: `files`, `loading`, `error`, `currentBranch`, `isMergeInProgress` local state and all fetch effects
- Remove: `refreshKey` prop
- Add: reads `repos[projectPath].status` from store
- After commit/stage/unstage operations → `invalidate(path, 'status')` + `fetchStatus(path)`

### `GitTimeline.tsx`
- Remove: `rawCommits`, `localHashes`, `loading`, `error` local state and `loadTimeline`
- Remove: `refreshKey` prop
- Add: reads `repos[projectPath].timeline` from store
- Refresh button → `invalidate(path, 'timeline')` + `fetchTimeline(path)`

## Files

| File | Action |
|------|--------|
| `src/stores/gitStore.ts` | Create — Zustand store |
| `src/components/GitPanel.tsx` | Modify — use store for UI state + orchestration |
| `src/components/GitSidebar.tsx` | Modify — read branches from store |
| `src/components/GitStagingPanel.tsx` | Modify — read status from store, remove refreshKey prop |
| `src/components/GitTimeline.tsx` | Modify — read timeline from store, remove refreshKey prop |

## Dependencies to Install

```bash
npm install zustand
```
