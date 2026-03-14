# Pull Requests Sidebar Section — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsible "Pull Requests" section to GitSidebar that lists open PRs/MRs from GitHub or GitLab, with a modal to create new ones.

**Architecture:** New `PRSection` component embedded at the bottom of `GitSidebar`'s scroll area, lazy-loads on first expand. `CreatePRModal` handles both GitHub PRs and GitLab MRs via the active account's provider. No gitStore changes — PR data is ephemeral local state.

**Tech Stack:** React 19, TypeScript, Tauri invoke (git_execute), Lucide icons, TailwindCSS v4, existing `githubApi.ts` + `gitlabApi.ts`.

---

### Task 1: Enrich GithubPR interface and fetchGithubPRs

**Files:**
- Modify: `src/services/githubApi.ts`

The existing `GithubPR` interface is missing `head`, `base`, `draft`, `labels`, `requested_reviewers` — all returned by the API already, we just need to declare them.

Also enrich `fetchGithubPRs` to accept an optional `apiUrl` param (for GitHub Enterprise support).

**Step 1: Open the file and locate GithubPR interface**

Find around line 47:
```ts
export interface GithubPR {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string; avatar_url: string };
    created_at: string;
    body: string;
}
```

**Step 2: Replace with enriched interface**

```ts
export interface GithubPR {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string; avatar_url: string };
    created_at: string;
    updated_at: string;
    body: string;
    draft: boolean;
    head: { ref: string; sha: string };
    base: { ref: string };
    labels: { id: number; name: string; color: string }[];
    requested_reviewers: { login: string; avatar_url: string }[];
    mergeable_state?: string;
}
```

**Step 3: Enrich fetchGithubPRs to support custom apiUrl and state filter**

Find the existing `fetchGithubPRs` function and replace it:
```ts
export async function fetchGithubPRs(
    projectPath: string,
    token: string,
    apiUrl?: string,
    state: 'open' | 'closed' | 'all' = 'open'
): Promise<GithubPR[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const response = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/pulls?state=${state}&per_page=50`,
        { headers }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    return response.json();
}
```

**Step 4: Add createGithubPR enrichment — add `draft` and `reviewers` support**

Find the existing `createGithubPR` and replace:
```ts
export async function createGithubPR(
    projectPath: string,
    token: string,
    title: string,
    head: string,
    base: string,
    body: string,
    draft = false,
    reviewers: string[] = [],
    apiUrl?: string,
): Promise<GithubPR> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    if (!token) throw new Error("GitHub token is required to create a Pull Request.");
    const baseUrl = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
    };
    const response = await fetch(`${baseUrl}/repos/${info.owner}/${info.repo}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, head, base, body, draft }),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(`GitHub API Error: ${response.status} ${errData?.message || response.statusText}`);
    }
    const pr: GithubPR = await response.json();
    // Request reviewers if provided
    if (reviewers.length > 0) {
        await fetch(`${baseUrl}/repos/${info.owner}/${info.repo}/pulls/${pr.number}/requested_reviewers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ reviewers }),
        }).catch(() => null); // non-fatal
    }
    return pr;
}
```

**Step 5: Verify build**
```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Expected: `✓ built`

---

### Task 2: Add GitLab MR types and API functions

**Files:**
- Modify: `src/services/gitlabApi.ts`

GitLab calls PRs "Merge Requests". We need fetch + create functions. GitLab identifies repos by numeric project ID or URL-encoded path — we extract the path from the git remote URL.

**Step 1: Add GitlabMR interface at the top of gitlabApi.ts after existing interfaces**

```ts
export interface GitlabMR {
    id: number;
    iid: number;               // MR number within the project
    title: string;
    state: 'opened' | 'closed' | 'merged' | 'locked';
    web_url: string;
    author: { name: string; username: string; avatar_url: string };
    created_at: string;
    updated_at: string;
    description: string | null;
    draft: boolean;
    source_branch: string;
    target_branch: string;
    labels: string[];
    reviewers: { name: string; username: string }[];
    merge_status: string;
    head_pipeline?: { status: string };
}
```

**Step 2: Add helper to extract GitLab project path from remote URL**

```ts
// Cache projectPath → gitlab namespace/repo
const gitlabPathCache = new Map<string, string>();

async function getGitlabProjectPath(projectPath: string): Promise<string | null> {
    if (gitlabPathCache.has(projectPath)) return gitlabPathCache.get(projectPath)!;
    try {
        const result: any = await invoke('git_execute', {
            projectPath,
            args: ['remote', 'get-url', 'origin'],
        });
        if (!result.success) return null;
        const url = result.stdout.trim();
        // Matches git@gitlab.com:group/repo.git or https://gitlab.com/group/repo.git
        const match = url.match(/gitlab[^/]*[:/](.+?)(\.git)?$/i);
        if (!match) return null;
        const path = match[1];
        gitlabPathCache.set(projectPath, path);
        return path;
    } catch {
        return null;
    }
}
```

**Step 3: Add fetchGitlabMRs function**

```ts
export async function fetchGitlabMRs(
    projectPath: string,
    token: string,
    apiUrl?: string,
    state: 'opened' | 'closed' | 'merged' | 'all' = 'opened'
): Promise<GitlabMR[]> {
    const glPath = await getGitlabProjectPath(projectPath);
    if (!glPath) throw new Error("Could not determine GitLab project from 'origin' remote.");
    const base = (apiUrl || 'https://gitlab.com').replace(/\/$/, '');
    const encoded = encodeURIComponent(glPath);
    const response = await fetch(
        `${base}/api/v4/projects/${encoded}/merge_requests?state=${state}&per_page=50&order_by=updated_at`,
        { headers: { 'PRIVATE-TOKEN': token } }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status} ${response.statusText}`);
    return response.json();
}
```

**Step 4: Add createGitlabMR function**

```ts
export async function createGitlabMR(
    projectPath: string,
    token: string,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    description = '',
    draft = false,
    apiUrl?: string,
): Promise<GitlabMR> {
    const glPath = await getGitlabProjectPath(projectPath);
    if (!glPath) throw new Error("Could not determine GitLab project from 'origin' remote.");
    if (!token) throw new Error("GitLab token is required to create a Merge Request.");
    const base = (apiUrl || 'https://gitlab.com').replace(/\/$/, '');
    const encoded = encodeURIComponent(glPath);
    const mrTitle = draft ? `Draft: ${title}` : title;
    const response = await fetch(`${base}/api/v4/projects/${encoded}/merge_requests`, {
        method: 'POST',
        headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: mrTitle,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            description,
        }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(`GitLab API Error: ${response.status} ${err?.message || response.statusText}`);
    }
    return response.json();
}
```

**Step 5: Add invoke import at the top of gitlabApi.ts (needed for getGitlabProjectPath)**

Add: `import { invoke } from '@tauri-apps/api/core';`

**Step 6: Verify build**
```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

---

### Task 3: Create PRSection component

**Files:**
- Create: `src/components/PRSection.tsx`

This is the collapsible section that lives inside `GitSidebar`. It receives `projectPath` and `account` (from gitStore). On first expand it fetches PRs. Each row opens the PR URL in the browser. The `+` in the header opens `CreatePRModal`.

**Step 1: Create the file with this full content**

```tsx
import React, { useState, useCallback } from 'react';
import { GitPullRequest, RefreshCw, Plus, ExternalLink, Folder, GitMerge, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchGithubPRs, type GithubPR } from '../services/githubApi';
import { fetchGitlabMRs, type GitlabMR } from '../services/gitlabApi';
import type { GitAccount } from '../stores/gitStore';
import { CreatePRModal } from './CreatePRModal';

// Normalized PR shape shared between GitHub and GitLab
export interface NormalizedPR {
    id: number;
    number: number;
    title: string;
    htmlUrl: string;
    author: string;
    authorAvatar?: string;
    baseBranch: string;
    headBranch: string;
    draft: boolean;
    ciStatus: 'success' | 'failure' | 'pending' | 'none';
    createdAt: string;
    provider: 'github' | 'gitlab';
}

function normalizeGithubPR(pr: GithubPR): NormalizedPR {
    let ciStatus: NormalizedPR['ciStatus'] = 'none';
    if (pr.mergeable_state === 'clean') ciStatus = 'success';
    else if (pr.mergeable_state === 'dirty' || pr.mergeable_state === 'blocked') ciStatus = 'failure';
    else if (pr.mergeable_state === 'unstable') ciStatus = 'pending';
    return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        htmlUrl: pr.html_url,
        author: pr.user.login,
        authorAvatar: pr.user.avatar_url,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        draft: pr.draft,
        ciStatus,
        createdAt: pr.created_at,
        provider: 'github',
    };
}

function normalizeGitlabMR(mr: GitlabMR): NormalizedPR {
    let ciStatus: NormalizedPR['ciStatus'] = 'none';
    if (mr.head_pipeline?.status === 'success') ciStatus = 'success';
    else if (mr.head_pipeline?.status === 'failed') ciStatus = 'failure';
    else if (mr.head_pipeline?.status === 'running' || mr.head_pipeline?.status === 'pending') ciStatus = 'pending';
    return {
        id: mr.id,
        number: mr.iid,
        title: mr.title,
        htmlUrl: mr.web_url,
        author: mr.author.username,
        authorAvatar: mr.author.avatar_url,
        baseBranch: mr.target_branch,
        headBranch: mr.source_branch,
        draft: mr.draft,
        ciStatus,
        createdAt: mr.created_at,
        provider: 'gitlab',
    };
}

function CiDot({ status }: { status: NormalizedPR['ciStatus'] }) {
    if (status === 'success') return <CheckCircle size={10} className="text-green-400 shrink-0" />;
    if (status === 'failure') return <XCircle size={10} className="text-red-400 shrink-0" />;
    if (status === 'pending') return <Clock size={10} className="text-yellow-400 shrink-0 animate-pulse" />;
    return null;
}

interface PRSectionProps {
    projectPath: string;
    account: GitAccount | undefined;
    activeBranch: string;
    branches: string[];
}

export const PRSection: React.FC<PRSectionProps> = ({ projectPath, account, activeBranch, branches }) => {
    const [expanded, setExpanded] = useState(false);
    const [prs, setPrs] = useState<NormalizedPR[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetched, setFetched] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    const fetchPRs = useCallback(async () => {
        if (!account) return;
        setLoading(true);
        setError(null);
        try {
            if (account.provider === 'github') {
                const data = await fetchGithubPRs(projectPath, account.token, account.url || undefined);
                setPrs(data.map(normalizeGithubPR));
            } else {
                const data = await fetchGitlabMRs(projectPath, account.token, account.url || undefined);
                setPrs(data.map(normalizeGitlabMR));
            }
            setFetched(true);
        } catch (e: any) {
            setError(e.message || 'Error fetching PRs');
        } finally {
            setLoading(false);
        }
    }, [projectPath, account]);

    const handleToggle = () => {
        const next = !expanded;
        setExpanded(next);
        if (next && !fetched) fetchPRs();
    };

    const label = account?.provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests';

    return (
        <>
            {/* Section header — same style as SectionHeader in GitSidebar */}
            <div
                className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-slate-800 text-xs font-bold text-slate-400 uppercase group transition-colors"
                onClick={handleToggle}
            >
                <div className="flex items-center gap-2">
                    <GitPullRequest size={11} className="text-slate-500" />
                    {label}
                    <span className="bg-slate-800 text-slate-500 px-1.5 rounded text-[10px]">
                        {fetched ? prs.length : '•'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {expanded && (
                        <>
                            <button
                                onClick={e => { e.stopPropagation(); setShowCreate(true); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-microtermix-neon transition-all rounded hover:bg-slate-700"
                                title={`Nuevo ${label.slice(0, -1)}`}
                            >
                                <Plus size={11} />
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); fetchPRs(); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-all rounded hover:bg-slate-700"
                                title="Refrescar"
                            >
                                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </>
                    )}
                    <Folder size={12} className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </div>
            </div>

            {/* Content */}
            {expanded && (
                <div className="mb-2">
                    {!account && (
                        <div className="px-4 py-2 text-[11px] text-slate-600 italic flex items-center gap-1.5">
                            <AlertCircle size={11} />
                            Configura una cuenta para ver PRs
                        </div>
                    )}

                    {account && loading && (
                        <div className="flex justify-center py-3">
                            <RefreshCw size={14} className="animate-spin text-slate-600" />
                        </div>
                    )}

                    {account && error && (
                        <div className="px-4 py-2 text-[11px] text-red-400 flex items-start gap-1.5">
                            <AlertCircle size={11} className="mt-0.5 shrink-0" />
                            <span className="break-all">{error}</span>
                        </div>
                    )}

                    {account && !loading && !error && fetched && prs.length === 0 && (
                        <div className="px-4 py-2 text-[11px] text-slate-600 italic">
                            No hay {label.toLowerCase()} abiertos.
                        </div>
                    )}

                    {account && !loading && prs.map(pr => (
                        <PRRow key={pr.id} pr={pr} />
                    ))}

                    {account && !loading && !fetched && !error && (
                        <div className="px-4 py-1 text-[11px] text-slate-600 italic">Cargando...</div>
                    )}
                </div>
            )}

            {showCreate && account && (
                <CreatePRModal
                    projectPath={projectPath}
                    account={account}
                    activeBranch={activeBranch}
                    branches={branches}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchPRs(); }}
                />
            )}
        </>
    );
};

// ── PR row ─────────────────────────────────────────────────────────────────────

const PRRow: React.FC<{ pr: NormalizedPR }> = ({ pr }) => (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white group transition-colors">
        <GitMerge size={11} className={`shrink-0 ${pr.draft ? 'text-slate-600' : 'text-purple-400'}`} />
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
                <span className="text-slate-600 shrink-0">#{pr.number}</span>
                <span className="truncate">{pr.title}</span>
                {pr.draft && <span className="shrink-0 text-[9px] bg-slate-700 text-slate-400 px-1 rounded">draft</span>}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-600 mt-0.5">
                <span className="truncate max-w-[80px]">{pr.headBranch}</span>
                <span>→</span>
                <span className="truncate max-w-[60px]">{pr.baseBranch}</span>
                <CiDot status={pr.ciStatus} />
            </div>
        </div>
        <a
            href={pr.htmlUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-all shrink-0"
            title="Abrir en navegador"
        >
            <ExternalLink size={11} />
        </a>
    </div>
);
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

---

### Task 4: Create CreatePRModal component

**Files:**
- Create: `src/components/CreatePRModal.tsx`

Modal with two zones: required fields always visible, advanced section toggled with a chevron. Works for both GitHub and GitLab.

**Step 1: Create the file**

```tsx
import React, { useState } from 'react';
import { X, GitPullRequest, ChevronDown, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react';
import { createGithubPR } from '../services/githubApi';
import { createGitlabMR } from '../services/gitlabApi';
import type { GitAccount } from '../stores/gitStore';

interface CreatePRModalProps {
    projectPath: string;
    account: GitAccount;
    activeBranch: string;
    branches: string[];
    onClose: () => void;
    onCreated: () => void;
}

export const CreatePRModal: React.FC<CreatePRModalProps> = ({
    projectPath, account, activeBranch, branches, onClose, onCreated,
}) => {
    const isGitlab = account.provider === 'gitlab';
    const label = isGitlab ? 'Merge Request' : 'Pull Request';

    const [title, setTitle] = useState('');
    const [head, setHead] = useState(activeBranch);
    const [base, setBase] = useState(() => {
        // Prefer main or master as default target
        const preferred = ['main', 'master', 'develop'];
        return preferred.find(b => branches.includes(b) && b !== activeBranch)
            ?? branches.find(b => b !== activeBranch)
            ?? '';
    });
    const [description, setDescription] = useState('');
    const [draft, setDraft] = useState(false);
    const [reviewers, setReviewers] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdUrl, setCreatedUrl] = useState<string | null>(null);

    const allBranches = [...new Set([...branches, activeBranch])].sort();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) { setError('El título es requerido.'); return; }
        if (!head) { setError('Selecciona la rama origen.'); return; }
        if (!base) { setError('Selecciona la rama destino.'); return; }
        if (head === base) { setError('La rama origen y destino deben ser diferentes.'); return; }

        setLoading(true);
        setError(null);
        try {
            let url: string;
            if (isGitlab) {
                const mr = await createGitlabMR(
                    projectPath, account.token, title.trim(),
                    head, base, description, draft, account.url || undefined,
                );
                url = mr.web_url;
            } else {
                const reviewerList = reviewers.split(',').map(r => r.trim()).filter(Boolean);
                const pr = await createGithubPR(
                    projectPath, account.token, title.trim(),
                    head, base, description, draft, reviewerList, account.url || undefined,
                );
                url = pr.html_url;
            }
            setCreatedUrl(url);
            onCreated();
        } catch (e: any) {
            setError(e.message || 'Error al crear el PR');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 w-[520px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <GitPullRequest size={15} className="text-purple-400" />
                        <h2 className="text-sm font-bold text-white">Nuevo {label}</h2>
                        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                            {account.alias} · {isGitlab ? 'GitLab' : 'GitHub'}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Success state */}
                {createdUrl ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-green-900/30 border border-green-700/40 flex items-center justify-center">
                            <GitPullRequest size={22} className="text-green-400" />
                        </div>
                        <div>
                            <p className="text-white font-semibold mb-1">{label} creado</p>
                            <p className="text-slate-400 text-xs">{title}</p>
                        </div>
                        <a
                            href={createdUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-900/30 border border-purple-700/40 text-purple-300 text-sm hover:bg-purple-900/50 transition-colors"
                        >
                            <ExternalLink size={13} /> Abrir en navegador
                        </a>
                        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4">
                        {/* Required: Title */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-400">Título <span className="text-red-400">*</span></label>
                            <input
                                autoFocus
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={`Título del ${label}...`}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                        </div>

                        {/* Required: Branches */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-400">Rama origen <span className="text-red-400">*</span></label>
                                <select
                                    value={head}
                                    onChange={e => setHead(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                                >
                                    {allBranches.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-400">Rama destino <span className="text-red-400">*</span></label>
                                <select
                                    value={base}
                                    onChange={e => setBase(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                                >
                                    {allBranches.filter(b => b !== head).map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Advanced toggle */}
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(v => !v)}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Opciones avanzadas
                        </button>

                        {/* Advanced fields */}
                        {showAdvanced && (
                            <div className="space-y-3 pl-3 border-l border-slate-800">
                                {/* Description */}
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">Descripción</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={4}
                                        placeholder="Describe los cambios..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                                    />
                                </div>

                                {/* Draft toggle */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={draft}
                                        onChange={e => setDraft(e.target.checked)}
                                        className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900"
                                    />
                                    <span className="text-xs text-slate-400">
                                        Crear como borrador (Draft)
                                        {isGitlab && <span className="text-slate-600 ml-1">— añade "Draft:" al título</span>}
                                    </span>
                                </label>

                                {/* Reviewers — GitHub only */}
                                {!isGitlab && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-slate-400">Reviewers</label>
                                        <input
                                            value={reviewers}
                                            onChange={e => setReviewers(e.target.value)}
                                            placeholder="usuario1, usuario2 (separados por coma)"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        {/* Footer */}
                        <div className="flex justify-end gap-2 pt-2 pb-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !title.trim()}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
                            >
                                {loading && <RefreshCw size={11} className="animate-spin" />}
                                Crear {label}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

---

### Task 5: Wire PRSection into GitSidebar

**Files:**
- Modify: `src/components/GitSidebar.tsx`

**Step 1: Add imports at the top of GitSidebar.tsx**

After the existing imports, add:
```ts
import { PRSection } from './PRSection';
import { useGitStore } from '../stores/gitStore';
```

Note: `useGitStore` is already imported. Only add `PRSection`.

**Step 2: Read active account in the component body**

After `const activeBranch = localBranches.find(b => b.active);` add:
```ts
const getActiveAccount = useGitStore(s => s.getActiveAccount);
const activeAccount = getActiveAccount(projectPath);

// All local branch names for CreatePRModal branch selectors
const allLocalBranchNames = localBranches.map(b => b.name);
```

**Step 3: Render PRSection inside the scroll area, after Stashes section**

Find the closing `</div>` of the stashes section and add `PRSection` right after it, before the outer `</div>` that closes the scroll area:

```tsx
{/* Pull Requests / Merge Requests */}
<PRSection
    projectPath={projectPath}
    account={activeAccount}
    activeBranch={activeBranch?.name ?? ''}
    branches={allLocalBranchNames}
/>
```

**Step 4: Verify build**
```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

**Step 5: Commit**
```bash
git add src/services/githubApi.ts src/services/gitlabApi.ts src/components/PRSection.tsx src/components/CreatePRModal.tsx src/components/GitSidebar.tsx
git commit -m "feat(git): add Pull Requests section to GitSidebar with create modal"
```
