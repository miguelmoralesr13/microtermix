import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Cloud, Search, RefreshCw, GitBranch, Lock, Plus, Minus,
    AlertTriangle, Github, Gitlab, X, ChevronRight, ChevronDown,
    Folder, FolderOpen, FileText, GitCommit, ArrowLeftRight,
} from 'lucide-react';
import {
    fetchRepoBranches, fetchRemoteBranchComparison,
    GithubRepo, RemoteCompareFile,
} from '../../services/githubApi';
import { fetchUserGitlabProjects, GitlabProject } from '../../services/gitlabApi';
import { useGitStore } from '../../stores/gitStore';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { ReadOnlyDiff, Hunk } from './utils/diffRenderer';
import { parseUnifiedPatch } from './utils/parseUnifiedPatch';

// ── Normalised types ──────────────────────────────────────────────────────────

interface NormalizedRepo {
    id: string | number;
    name: string;
    fullName: string;
    description: string | null;
    isPrivate: boolean;
    language?: string | null;
    provider: 'github' | 'gitlab';
    owner?: string;
    repoSlug?: string;
    projectId?: number;
    apiBase?: string;
}

interface NormalizedBranch {
    name: string;
    protected?: boolean;
}

interface TreeFile {
    path: string;
    diffStatus?: 'added' | 'modified' | 'removed' | 'renamed';
    patch?: string;
    additions?: number;
    deletions?: number;
}

interface TreeNode {
    name: string;
    path: string;
    isDir: boolean;
    children: TreeNode[];
    diffStatus?: TreeFile['diffStatus'];
    patch?: string;
    additions?: number;
    deletions?: number;
}

interface NormalizedFile {
    filename: string;
    previousFilename?: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

interface NormalizedComparison {
    aheadBy: number;
    behindBy: number;
    totalCommits: number;
    status: string;
    files: NormalizedFile[];
}

// ── API helpers ───────────────────────────────────────────────────────────────

function normGithubRepo(r: GithubRepo): NormalizedRepo {
    const [owner, repoSlug] = r.full_name.split('/');
    return { id: r.full_name, name: r.name, fullName: r.full_name, description: r.description, isPrivate: r.private, language: r.language, provider: 'github', owner, repoSlug };
}

function normGitlabProject(p: GitlabProject, apiBase: string): NormalizedRepo {
    return { id: p.path_with_namespace, name: p.name, fullName: p.path_with_namespace, description: p.description, isPrivate: p.visibility === 'private', provider: 'gitlab', projectId: p.id, apiBase };
}

async function githubFetchTree(owner: string, repo: string, branch: string, token: string, apiBase?: string): Promise<{ files: TreeFile[]; truncated: boolean }> {
    const base = apiBase || 'https://api.github.com';
    const res = await fetch(`${base}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data: { truncated: boolean; tree: { path: string; type: string }[] } = await res.json();
    return {
        files: data.tree.filter(t => t.type === 'blob').map(t => ({ path: t.path })),
        truncated: data.truncated,
    };
}

async function githubFetchContent(owner: string, repo: string, path: string, branch: string, token: string, apiBase?: string): Promise<string> {
    const base = apiBase || 'https://api.github.com';
    const res = await fetch(`${base}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data: { content?: string; encoding?: string; message?: string; size?: number } = await res.json();
    if (data.message) throw new Error(data.message);
    if (data.size && data.size > 500_000) throw new Error('Archivo demasiado grande para mostrar (>500KB)');
    if (data.encoding === 'base64' && data.content) return atob(data.content.replace(/\n/g, ''));
    return data.content || '';
}

async function gitlabFetchTree(projectId: number, branch: string, token: string, apiBase: string): Promise<TreeFile[]> {
    const base = (apiBase || 'https://gitlab.com').replace(/\/$/, '');
    const files: TreeFile[] = [];
    for (let page = 1; page <= 10; page++) {
        const res = await fetch(`${base}/api/v4/projects/${projectId}/repository/tree?recursive=true&ref=${encodeURIComponent(branch)}&per_page=100&page=${page}`, {
            headers: { 'PRIVATE-TOKEN': token },
        });
        if (!res.ok) break;
        const data: { path: string; type: string }[] = await res.json();
        files.push(...data.filter(f => f.type === 'blob').map(f => ({ path: f.path })));
        if (data.length < 100) break;
    }
    return files;
}

async function gitlabFetchContent(projectId: number, path: string, branch: string, token: string, apiBase: string): Promise<string> {
    const base = (apiBase || 'https://gitlab.com').replace(/\/$/, '');
    const res = await fetch(`${base}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(branch)}`, {
        headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) throw new Error(`GitLab API ${res.status}`);
    return res.text();
}

async function gitlabFetchBranches(projectId: number, token: string, apiBase: string): Promise<NormalizedBranch[]> {
    const base = (apiBase || 'https://gitlab.com').replace(/\/$/, '');
    const res = await fetch(`${base}/api/v4/projects/${projectId}/repository/branches?per_page=100`, {
        headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) throw new Error(`GitLab API ${res.status}`);
    const data: { name: string; protected: boolean }[] = await res.json();
    return data.map(b => ({ name: b.name, protected: b.protected }));
}

async function gitlabFetchComparison(projectId: number, base: string, head: string, token: string, apiBase: string): Promise<NormalizedComparison> {
    const glBase = (apiBase || 'https://gitlab.com').replace(/\/$/, '');
    const res = await fetch(`${glBase}/api/v4/projects/${projectId}/repository/compare?from=${encodeURIComponent(base)}&to=${encodeURIComponent(head)}&unidiff=true`, {
        headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) throw new Error(`GitLab API ${res.status}`);
    const data: { commits: unknown[]; diffs: { diff: string; new_path: string; old_path: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean }[] } = await res.json();
    const files: NormalizedFile[] = data.diffs.map(d => {
        const lines = (d.diff || '').split('\n');
        let additions = 0, deletions = 0;
        for (const l of lines) {
            if (l.startsWith('+') && !l.startsWith('+++')) additions++;
            else if (l.startsWith('-') && !l.startsWith('---')) deletions++;
        }
        let status = 'modified';
        if (d.new_file) status = 'added';
        else if (d.deleted_file) status = 'removed';
        else if (d.renamed_file) status = 'renamed';
        return { filename: d.new_path, previousFilename: d.renamed_file ? d.old_path : undefined, status, additions, deletions, changes: additions + deletions, patch: d.diff || undefined };
    });
    return { aheadBy: data.commits.length, behindBy: 0, totalCommits: data.commits.length, status: data.commits.length > 0 ? 'ahead' : 'identical', files };
}

/** Fetches ALL repos visible to the user without aggressive ownership filtering. */
async function githubFetchAllRepos(token: string, apiBase: string): Promise<NormalizedRepo[]> {
    const base = (apiBase || 'https://api.github.com').replace(/\/$/, '');
    const all: NormalizedRepo[] = [];
    for (let page = 1; page <= 5; page++) {
        const res = await fetch(`${base}/user/repos?sort=pushed&per_page=100&page=${page}`, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`GitHub API ${res.status}: ${body || res.statusText}`);
        }
        const data: GithubRepo[] = await res.json();
        all.push(...data.map(normGithubRepo));
        if (data.length < 100) break;
    }
    return all;
}

// ── Tree builder ──────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = { removed: 4, added: 3, modified: 2, renamed: 1 };

type DiffStatus = TreeFile['diffStatus'];

function propagateDiffStatus(nodes: TreeNode[]): DiffStatus {
    let dominant: DiffStatus;
    for (const node of nodes) {
        const status: DiffStatus = node.isDir ? propagateDiffStatus(node.children) : node.diffStatus;
        if (status) {
            if (node.isDir) node.diffStatus = status;
            if (!dominant || (STATUS_PRIORITY[status] ?? 0) > (STATUS_PRIORITY[dominant] ?? 0)) dominant = status;
        }
    }
    return dominant;
}

function buildTree(files: TreeFile[]): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();

    for (const file of files) {
        const parts = file.path.split('/');
        for (let i = 0; i < parts.length; i++) {
            const path = parts.slice(0, i + 1).join('/');
            const isLast = i === parts.length - 1;
            if (!nodeMap.has(path)) {
                nodeMap.set(path, {
                    name: parts[i],
                    path,
                    isDir: !isLast,
                    children: [],
                    ...(isLast ? { diffStatus: file.diffStatus, patch: file.patch, additions: file.additions, deletions: file.deletions } : {}),
                });
            } else if (!isLast) {
                nodeMap.get(path)!.isDir = true;
            }
        }
    }

    const roots: TreeNode[] = [];
    for (const [path, node] of nodeMap) {
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) {
            roots.push(node);
        } else {
            const parent = nodeMap.get(path.substring(0, lastSlash));
            if (parent) parent.children.push(node);
            else roots.push(node);
        }
    }

    const sort = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const n of nodes) if (n.isDir) sort(n.children);
    };
    sort(roots);
    return roots;
}

// ── Status dot ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = { added: 'bg-emerald-400', modified: 'bg-amber-400', removed: 'bg-red-400', renamed: 'bg-blue-400' };

function DiffDot({ status }: { status?: string }) {
    if (!status) return null;
    return <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_COLOR[status] ?? 'bg-slate-400')} />;
}

// ── Tree node ────────────────────────────────────────────────────────────────��

interface TreeItemProps {
    node: TreeNode;
    depth: number;
    expanded: Set<string>;
    onToggle: (p: string) => void;
    selectedPath: string | null;
    onSelect: (n: TreeNode) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({ node, depth, expanded, onToggle, selectedPath, onSelect }) => {
    const isOpen = expanded.has(node.path);
    const isSelected = !node.isDir && selectedPath === node.path;

    return (
        <>
            <button
                onClick={() => node.isDir ? onToggle(node.path) : onSelect(node)}
                style={{ paddingLeft: `${6 + depth * 14}px` }}
                className={cn(
                    'w-full flex items-center gap-1.5 py-[3px] pr-3 text-[11px] transition-colors text-left select-none',
                    isSelected
                        ? 'bg-sky-600/20 text-slate-100'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                )}
            >
                {node.isDir ? (
                    <>
                        {isOpen ? <ChevronDown size={10} className="shrink-0 text-slate-500" /> : <ChevronRight size={10} className="shrink-0 text-slate-500" />}
                        {isOpen ? <FolderOpen size={11} className="shrink-0 text-amber-400/80" /> : <Folder size={11} className="shrink-0 text-amber-400/60" />}
                    </>
                ) : (
                    <>
                        <span className="w-2.5 shrink-0" />
                        <FileText size={11} className="shrink-0 text-slate-600" />
                    </>
                )}
                <span className="truncate flex-1 font-mono">{node.name}</span>
                <DiffDot status={node.diffStatus} />
            </button>

            {node.isDir && isOpen && node.children.map(child => (
                <TreeItem key={child.path} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
        </>
    );
};

// ── File content viewer ───────────────────────────────────────────────────────

const FileContentViewer: React.FC<{ content: string }> = ({ content }) => {
    const allLines = content.split('\n');
    const lines = allLines.slice(0, 2000);
    return (
        <div className="font-mono text-[11px] text-slate-300 leading-5">
            {lines.map((line, i) => (
                <div key={i} className="flex hover:bg-slate-800/20 min-w-0">
                    <span className="select-none w-10 shrink-0 text-right pr-3 text-slate-700 border-r border-slate-800/60">{i + 1}</span>
                    <span className="pl-3 whitespace-pre overflow-x-auto">{line || ' '}</span>
                </div>
            ))}
            {allLines.length > 2000 && (
                <div className="px-4 py-2 text-slate-600 text-xs italic">
                    … {allLines.length - 2000} líneas más no mostradas
                </div>
            )}
        </div>
    );
};

// ── Repo dropdown ─────────────────────────────────────────────────────────────

interface RepoPickerProps {
    repos: NormalizedRepo[];
    loading: boolean;
    selected: NormalizedRepo | null;
    search: string;
    onSearchChange: (v: string) => void;
    onSelect: (r: NormalizedRepo) => void;
    onRefresh: () => void;
}

const RepoPicker: React.FC<RepoPickerProps> = ({ repos, loading, selected, search, onSearchChange, onSelect, onRefresh }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (open) setTimeout(() => searchRef.current?.focus(), 50);
    }, [open]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return q ? repos.filter(r => r.fullName.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)) : repos;
    }, [repos, search]);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-md text-[11px] font-mono max-w-[220px] transition-colors"
            >
                <span className="truncate flex-1">{selected ? selected.name : 'Seleccionar repo…'}</span>
                <ChevronDown size={10} className="shrink-0 text-slate-500" />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-20">
                    <div className="p-2 border-b border-slate-800 flex items-center gap-1.5">
                        <div className="relative flex-1">
                            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                ref={searchRef}
                                value={search}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder="Buscar repositorio…"
                                className="w-full bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 pl-7 pr-2 py-1.5 focus:outline-none focus:border-sky-500/50"
                                onKeyDown={e => e.key === 'Escape' && setOpen(false)}
                            />
                        </div>
                        <button onClick={onRefresh} className="text-slate-500 hover:text-slate-300 p-1.5 rounded hover:bg-slate-800 transition-colors">
                            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-xs">
                                <RefreshCw size={12} className="animate-spin" /> Cargando…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="py-6 text-center text-slate-600 text-xs">Sin resultados</div>
                        ) : filtered.map(r => (
                            <button
                                key={String(r.id)}
                                onClick={() => { onSelect(r); setOpen(false); onSearchChange(''); }}
                                className={cn(
                                    'w-full text-left px-3 py-2 text-xs transition-colors flex items-start gap-2 border-b border-slate-800/50 last:border-0',
                                    selected?.id === r.id
                                        ? 'bg-sky-600/15 text-slate-200'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                )}
                            >
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="font-semibold text-slate-200 truncate">{r.name}</span>
                                    <span className="text-[9px] text-slate-600 truncate font-mono mt-0.5">{r.fullName}</span>
                                </div>
                                {r.language && <span className="text-[9px] text-slate-600 shrink-0 mt-0.5">{r.language}</span>}
                                {r.isPrivate && <Lock size={9} className="text-slate-600 shrink-0 mt-0.5" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Branch dropdown with search ───────────────────────────────────────────────

interface BranchPickerProps {
    branches: NormalizedBranch[];
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    exclude?: string;
}

const BranchPicker: React.FC<BranchPickerProps> = ({ branches, value, onChange, placeholder = 'Rama…', className, exclude }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        if (open) { setSearch(''); setTimeout(() => searchRef.current?.focus(), 50); }
    }, [open]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        const list = exclude ? branches.filter(b => b.name !== exclude) : branches;
        return q ? list.filter(b => b.name.toLowerCase().includes(q)) : list;
    }, [branches, search, exclude]);

    const selected = branches.find(b => b.name === value);

    return (
        <div ref={ref} className={cn('relative', className)}>
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'flex items-center gap-1.5 h-7 px-2.5 border rounded-md text-[11px] font-mono max-w-[180px] w-44 transition-colors text-left',
                    value
                        ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                        : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'
                )}
            >
                {selected?.protected && <Lock size={9} className="text-amber-500/70 shrink-0" />}
                <span className="truncate flex-1">{value || placeholder}</span>
                <ChevronDown size={10} className="shrink-0 text-slate-500" />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-20">
                    <div className="p-1.5 border-b border-slate-800">
                        <div className="relative">
                            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                ref={searchRef}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Filtrar ramas…"
                                className="w-full bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-300 pl-6 pr-2 py-1 focus:outline-none focus:border-sky-500/50"
                                onKeyDown={e => e.key === 'Escape' && setOpen(false)}
                            />
                        </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="py-4 text-center text-slate-600 text-xs">Sin resultados</div>
                        ) : filtered.map(b => (
                            <button
                                key={b.name}
                                onClick={() => { onChange(b.name); setOpen(false); }}
                                className={cn(
                                    'w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors flex items-center gap-1.5 border-b border-slate-800/40 last:border-0',
                                    b.name === value
                                        ? 'bg-sky-600/15 text-sky-300'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                )}
                            >
                                {b.protected && <Lock size={9} className="text-amber-500/70 shrink-0" />}
                                <span className="truncate">{b.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export interface CloudRepoExplorerProps {
    onClose: () => void;
}

export const CloudRepoExplorer: React.FC<CloudRepoExplorerProps> = ({ onClose }) => {
    const accounts = useGitStore(s => s.accounts);
    const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '');
    const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

    const [repos, setRepos] = useState<NormalizedRepo[]>([]);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [repoError, setRepoError] = useState<string | null>(null);
    const [repoSearch, setRepoSearch] = useState('');
    const [selectedRepo, setSelectedRepo] = useState<NormalizedRepo | null>(null);

    const [branches, setBranches] = useState<NormalizedBranch[]>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [branch1, setBranch1] = useState('');
    const [branch2, setBranch2] = useState('');

    const [repoFiles, setRepoFiles] = useState<TreeFile[]>([]);
    const [loadingTree, setLoadingTree] = useState(false);
    const [treeError, setTreeError] = useState<string | null>(null);
    const [treeTruncated, setTreeTruncated] = useState(false);

    const [comparison, setComparison] = useState<NormalizedComparison | null>(null);
    const [loadingComparison, setLoadingComparison] = useState(false);
    const [compareError, setCompareError] = useState<string | null>(null);

    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);
    const [rightTab, setRightTab] = useState<'file' | 'diff'>('file');

    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

    const isCompareMode = !!branch2 && branch1 !== branch2;

    // ── Data loading ────────────────��─────────────────────────────────────────

    const loadRepos = useCallback(async () => {
        if (!selectedAccount) return;
        setLoadingRepos(true);
        setRepoError(null);
        setRepos([]);
        setSelectedRepo(null);
        setBranches([]);
        setBranch1(''); setBranch2('');
        setRepoFiles([]);
        setComparison(null);
        setSelectedNode(null);
        try {
            if (selectedAccount.provider === 'github') {
                const data = await githubFetchAllRepos(selectedAccount.token, selectedAccount.url);
                setRepos(data);
            } else {
                const base = (selectedAccount.url || 'https://gitlab.com').replace(/\/$/, '');
                const data = await fetchUserGitlabProjects(selectedAccount.url, selectedAccount.token);
                setRepos(data.map(p => normGitlabProject(p, base)));
            }
        } catch (e: any) {
            setRepoError(e.message || 'Error al cargar repositorios');
        } finally {
            setLoadingRepos(false);
        }
    }, [selectedAccount]);

    useEffect(() => { loadRepos(); }, [loadRepos]);

    useEffect(() => {
        if (!selectedRepo || !selectedAccount) return;
        setBranches([]);
        setBranch1(''); setBranch2('');
        setRepoFiles([]);
        setComparison(null);
        setSelectedNode(null);
        setLoadingBranches(true);
        (async () => {
            try {
                let data: NormalizedBranch[];
                if (selectedRepo.provider === 'github' && selectedRepo.owner && selectedRepo.repoSlug) {
                    data = await fetchRepoBranches(selectedRepo.owner, selectedRepo.repoSlug, selectedAccount.token, selectedAccount.url || undefined);
                } else if (selectedRepo.provider === 'gitlab' && selectedRepo.projectId) {
                    data = await gitlabFetchBranches(selectedRepo.projectId, selectedAccount.token, selectedRepo.apiBase || '');
                } else return;
                setBranches(data);
                const main = data.find(b => b.name === 'main' || b.name === 'master') ?? data[0];
                if (main) setBranch1(main.name);
            } catch { /* silently */ }
            finally { setLoadingBranches(false); }
        })();
    }, [selectedRepo, selectedAccount]);

    useEffect(() => {
        if (!branch1 || !selectedRepo || !selectedAccount) return;
        setRepoFiles([]);
        setTreeError(null);
        setTreeTruncated(false);
        setSelectedNode(null);
        setExpandedDirs(new Set());
        setLoadingTree(true);
        (async () => {
            try {
                if (selectedRepo.provider === 'github' && selectedRepo.owner && selectedRepo.repoSlug) {
                    const { files, truncated } = await githubFetchTree(selectedRepo.owner, selectedRepo.repoSlug, branch1, selectedAccount.token, selectedAccount.url || undefined);
                    setRepoFiles(files);
                    setTreeTruncated(truncated);
                } else if (selectedRepo.provider === 'gitlab' && selectedRepo.projectId) {
                    const files = await gitlabFetchTree(selectedRepo.projectId, branch1, selectedAccount.token, selectedRepo.apiBase || '');
                    setRepoFiles(files);
                }
            } catch (e: any) { setTreeError(e.message); }
            finally { setLoadingTree(false); }
        })();
    }, [branch1, selectedRepo, selectedAccount]);

    useEffect(() => {
        if (!branch1 || !branch2 || branch1 === branch2 || !selectedRepo || !selectedAccount) {
            if (!branch2) setComparison(null);
            return;
        }
        setComparison(null);
        setCompareError(null);
        setSelectedNode(null);
        setExpandedDirs(new Set());
        setLoadingComparison(true);
        (async () => {
            try {
                if (selectedRepo.provider === 'github' && selectedRepo.owner && selectedRepo.repoSlug) {
                    const data = await fetchRemoteBranchComparison(selectedRepo.owner, selectedRepo.repoSlug, branch1, branch2, selectedAccount.token, selectedAccount.url || undefined);
                    setComparison({
                        aheadBy: data.aheadBy, behindBy: data.behindBy, totalCommits: data.totalCommits, status: data.status,
                        files: data.files.map((f: RemoteCompareFile) => ({ filename: f.filename, previousFilename: f.previousFilename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes, patch: f.patch })),
                    });
                } else if (selectedRepo.provider === 'gitlab' && selectedRepo.projectId) {
                    const data = await gitlabFetchComparison(selectedRepo.projectId, branch1, branch2, selectedAccount.token, selectedRepo.apiBase || '');
                    setComparison(data);
                }
            } catch (e: any) { setCompareError(e.message); }
            finally { setLoadingComparison(false); }
        })();
    }, [branch1, branch2, selectedRepo, selectedAccount]);

    useEffect(() => {
        if (!selectedNode || selectedNode.isDir || !selectedAccount || !selectedRepo || !branch1) {
            setFileContent(null);
            return;
        }
        setFileContent(null);
        setContentError(null);
        setLoadingContent(true);
        const refBranch = isCompareMode && branch2 ? branch2 : branch1;
        (async () => {
            try {
                let content: string;
                if (selectedRepo.provider === 'github' && selectedRepo.owner && selectedRepo.repoSlug) {
                    content = await githubFetchContent(selectedRepo.owner, selectedRepo.repoSlug, selectedNode.path, refBranch, selectedAccount.token, selectedAccount.url || undefined);
                } else if (selectedRepo.provider === 'gitlab' && selectedRepo.projectId) {
                    content = await gitlabFetchContent(selectedRepo.projectId, selectedNode.path, refBranch, selectedAccount.token, selectedRepo.apiBase || '');
                } else return;
                setFileContent(content);
            } catch (e: any) { setContentError(e.message); }
            finally { setLoadingContent(false); }
        })();
    }, [selectedNode, selectedAccount, selectedRepo, branch1, branch2, isCompareMode]);

    // ── Trees ─────────────────────────────────────────────────────────────────

    const singleTree = useMemo(() => buildTree(repoFiles), [repoFiles]);

    const compareTree = useMemo(() => {
        if (!comparison) return singleTree;
        const changedMap = new Map<string, { diffStatus: TreeFile['diffStatus']; patch?: string; additions?: number; deletions?: number }>();
        for (const f of comparison.files) {
            changedMap.set(f.filename, { diffStatus: f.status as TreeFile['diffStatus'], patch: f.patch, additions: f.additions, deletions: f.deletions });
        }
        const allFiles: TreeFile[] = repoFiles.map(f => ({ path: f.path, ...(changedMap.get(f.path) ?? {}) }));
        for (const [path, info] of changedMap) {
            if (info.diffStatus === 'added' && !repoFiles.some(f => f.path === path)) {
                allFiles.push({ path, ...info });
            }
        }
        const tree = buildTree(allFiles);
        propagateDiffStatus(tree);
        return tree;
    }, [comparison, repoFiles, singleTree]);

    const activeTree = isCompareMode ? compareTree : singleTree;

    const hunks = useMemo((): Hunk[] => {
        if (!selectedNode?.patch) return [];
        return parseUnifiedPatch(selectedNode.patch);
    }, [selectedNode]);

    const toggleDir = useCallback((path: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    }, []);

    const handleSelectNode = useCallback((node: TreeNode) => {
        setSelectedNode(node);
        setRightTab(isCompareMode && node.diffStatus ? 'diff' : 'file');
    }, [isCompareMode]);

    const handleClearBranch2 = () => {
        setBranch2('');
        setComparison(null);
        setSelectedNode(null);
        setExpandedDirs(new Set());
    };

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    // ── Render ────────────────────────────────────────────────────────────────

    const treeLoading = isCompareMode ? loadingComparison : loadingTree;
    const treeErr = isCompareMode ? compareError : treeError;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">

            {/* Header row 1 */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-800 shrink-0">
                <Cloud size={14} className="text-sky-400 shrink-0" />
                <span className="font-bold text-sm text-slate-200">Cloud Explorer</span>
                <div className="w-px h-4 bg-slate-700 mx-0.5" />
                <div className="flex items-center gap-1.5">
                    {accounts.map(a => (
                        <button
                            key={a.id}
                            onClick={() => setSelectedAccountId(a.id)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                                selectedAccountId === a.id
                                    ? 'bg-sky-600/20 border-sky-500/40 text-sky-300'
                                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                            )}
                        >
                            {a.provider === 'github' ? <Github size={11} /> : <Gitlab size={11} />}
                            {a.alias}
                        </button>
                    ))}
                    {accounts.length === 0 && (
                        <span className="text-xs text-slate-500">Sin cuentas configuradas</span>
                    )}
                </div>
                <div className="flex-1" />
                {repoError && (
                    <span className="text-[10px] text-red-400 flex items-center gap-1">
                        <AlertTriangle size={10} /> {repoError}
                    </span>
                )}
                <span className={cn(
                    'text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border',
                    isCompareMode
                        ? 'bg-sky-600/15 border-sky-500/30 text-sky-400'
                        : 'bg-slate-800 border-slate-700 text-slate-500'
                )}>
                    {isCompareMode ? 'Compare' : 'Browse'}
                </span>
                <button onClick={onClose} className="ml-1 text-slate-500 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800">
                    <X size={14} />
                </button>
            </div>

            {/* Header row 2 */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-800 bg-slate-900/40 shrink-0 flex-wrap">
                <RepoPicker
                    repos={repos}
                    loading={loadingRepos}
                    selected={selectedRepo}
                    search={repoSearch}
                    onSearchChange={setRepoSearch}
                    onSelect={r => { setSelectedRepo(r); }}
                    onRefresh={loadRepos}
                />

                {selectedRepo && (
                    <>
                        <div className="w-px h-4 bg-slate-700 mx-1" />
                        <GitBranch size={11} className="text-slate-500 shrink-0" />

                        <BranchPicker
                            branches={branches}
                            value={branch1}
                            onChange={v => { setBranch1(v); setBranch2(''); setComparison(null); }}
                            placeholder="Rama base…"
                        />

                        <div className="flex items-center gap-1.5">
                            <ArrowLeftRight size={11} className={cn('shrink-0 transition-colors', isCompareMode ? 'text-sky-500' : 'text-slate-600')} />
                            <BranchPicker
                                branches={branches}
                                value={branch2}
                                onChange={setBranch2}
                                placeholder="Comparar con…"
                                exclude={branch1}
                                className={branch2 ? '[&>button]:bg-sky-900/20 [&>button]:border-sky-700/50 [&>button]:text-sky-300' : ''}
                            />
                            {branch2 && (
                                <Button variant="ghost" size="icon-xs" onClick={handleClearBranch2}
                                    className="h-7 w-7 text-slate-500 hover:text-red-400 hover:bg-red-900/20 shrink-0">
                                    <X size={11} />
                                </Button>
                            )}
                        </div>

                        {loadingBranches && <RefreshCw size={11} className="animate-spin text-slate-500 shrink-0" />}
                    </>
                )}
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Left: File tree */}
                <div className="w-72 shrink-0 flex flex-col border-r border-slate-800 min-h-0 bg-slate-950">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                            {isCompareMode ? 'Archivos modificados' : 'Archivos'}
                        </span>
                        <span className="ml-auto text-[10px] text-slate-700">
                            {repoFiles.length > 0 ? repoFiles.length : ''}
                            {isCompareMode && comparison ? ` · ${comparison.files.length} cambios` : ''}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto py-1">
                        {!selectedRepo ? (
                            <div className="flex items-center justify-center py-16 text-slate-700 text-xs text-center px-4">
                                Seleccioná un repositorio para explorar
                            </div>
                        ) : treeLoading ? (
                            <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-xs">
                                <RefreshCw size={12} className="animate-spin" />
                                {isCompareMode ? 'Comparando ramas…' : 'Cargando árbol…'}
                            </div>
                        ) : treeErr ? (
                            <div className="px-3 py-4 flex items-start gap-2 text-red-400 text-xs">
                                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                <span>{treeErr}</span>
                            </div>
                        ) : activeTree.length === 0 ? (
                            <div className="py-16 text-center text-slate-700 text-xs">
                                {isCompareMode ? 'Sin diferencias entre ramas' : 'Sin archivos'}
                            </div>
                        ) : (
                            <>
                                {treeTruncated && (
                                    <div className="px-3 py-1.5 text-[10px] text-amber-400/70 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-1.5">
                                        <AlertTriangle size={9} className="shrink-0" />
                                        Árbol truncado (repo muy grande)
                                    </div>
                                )}
                                {activeTree.map(node => (
                                    <TreeItem
                                        key={node.path}
                                        node={node}
                                        depth={0}
                                        expanded={expandedDirs}
                                        onToggle={toggleDir}
                                        selectedPath={selectedNode?.path ?? null}
                                        onSelect={handleSelectNode}
                                    />
                                ))}
                            </>
                        )}
                    </div>

                    {isCompareMode && comparison && !loadingComparison && (
                        <div className="border-t border-slate-800 px-3 py-2 shrink-0 flex items-center gap-3 text-[10px]">
                            {comparison.aheadBy > 0 && (
                                <span className="flex items-center gap-0.5 text-emerald-400">
                                    <Plus size={8} /> {comparison.aheadBy} ahead
                                </span>
                            )}
                            {comparison.behindBy > 0 && (
                                <span className="flex items-center gap-0.5 text-amber-400">
                                    <Minus size={8} /> {comparison.behindBy} behind
                                </span>
                            )}
                            <span className="flex items-center gap-1 text-slate-600 ml-auto">
                                <GitCommit size={9} /> {comparison.totalCommits}
                            </span>
                        </div>
                    )}
                </div>

                {/* Right: Content */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {!selectedNode ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-700">
                            <FileText size={36} className="opacity-15" />
                            <span className="text-sm">
                                {!selectedRepo ? 'Seleccioná un repositorio' : 'Hacé click en un archivo para verlo'}
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center border-b border-slate-800 bg-slate-900/40 shrink-0 pl-1 pr-4">
                                <button
                                    onClick={() => setRightTab('file')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors',
                                        rightTab === 'file' ? 'border-microtermix-accent text-microtermix-accent' : 'border-transparent text-slate-500 hover:text-slate-300'
                                    )}
                                >
                                    <FileText size={11} />
                                    Archivo
                                </button>
                                {isCompareMode && selectedNode.diffStatus && (
                                    <button
                                        onClick={() => setRightTab('diff')}
                                        className={cn(
                                            'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors',
                                            rightTab === 'diff' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                                        )}
                                    >
                                        <ArrowLeftRight size={11} />
                                        Diff
                                    </button>
                                )}
                                <div className="flex-1" />
                                <span className="font-mono text-[10px] text-slate-500 truncate max-w-[50%]">
                                    {selectedNode.path}
                                </span>
                                {selectedNode.diffStatus && (
                                    <>
                                        <div className="w-px h-3 bg-slate-700 mx-2" />
                                        <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded', {
                                            added: 'bg-emerald-500/15 text-emerald-400',
                                            removed: 'bg-red-500/15 text-red-400',
                                            renamed: 'bg-blue-500/15 text-blue-400',
                                            modified: 'bg-amber-500/15 text-amber-400',
                                        }[selectedNode.diffStatus] ?? 'bg-slate-500/15 text-slate-500')}>
                                            {selectedNode.diffStatus}
                                        </span>
                                    </>
                                )}
                                {selectedNode.additions !== undefined && (
                                    <span className="ml-2 text-emerald-400 text-[10px] font-bold tabular-nums">+{selectedNode.additions}</span>
                                )}
                                {selectedNode.deletions !== undefined && (
                                    <span className="ml-1 text-red-400 text-[10px] font-bold tabular-nums">-{selectedNode.deletions}</span>
                                )}
                            </div>

                            <div className="flex-1 overflow-auto">
                                {rightTab === 'file' ? (
                                    loadingContent ? (
                                        <div className="flex items-center justify-center gap-2 h-full text-slate-500 text-sm">
                                            <RefreshCw size={14} className="animate-spin" /> Cargando archivo…
                                        </div>
                                    ) : contentError ? (
                                        <div className="flex items-center gap-2 px-6 py-6 text-red-400 text-sm">
                                            <AlertTriangle size={14} /> {contentError}
                                        </div>
                                    ) : fileContent !== null ? (
                                        <FileContentViewer content={fileContent} />
                                    ) : null
                                ) : (
                                    hunks.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                                            {selectedNode.patch === undefined
                                                ? 'No hay diff disponible (binario o archivo muy grande)'
                                                : 'Sin cambios de texto'}
                                        </div>
                                    ) : (
                                        <ReadOnlyDiff hunks={hunks} />
                                    )
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
