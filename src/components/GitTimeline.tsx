import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Search, X, GitMerge, GitBranch, Tag, Archive, User, Pencil, Trash2, Check, AlertTriangle } from 'lucide-react';
import { useGitStore, EMPTY_REPO_DATA, RawCommit } from '../stores/gitStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_H = 34;
const COL_W = 16;
const MAX_COLS = 4;   // Never show more than 4 lanes
const NODE_R = 5;

const LANE_COLORS = [
    '#4ade80', // green  (main)
    '#60a5fa', // blue
    '#f472b6', // pink
    '#facc15', // yellow
];

const laneColor = (col: number) => LANE_COLORS[Math.min(col, LANE_COLORS.length - 1)];

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode extends RawCommit {
    col: number;
    rowIndex: number;
    isMerge: boolean;
}

interface GraphEdge {
    fromRow: number; toRow: number;
    fromCol: number; toCol: number;
    color: string;
}

interface ParsedRef {
    label: string;
    type: 'head' | 'local' | 'remote' | 'tag' | 'stash';
}

interface GitTimelineProps {
    projectPath: string;
    onCommitSelect?: (hash: string, message: string, author: string, date: string) => void;
}

// ── Ref parsing & badges ──────────────────────────────────────────────────────

function parseRefs(refs: string): ParsedRef[] {
    if (!refs.trim()) return [];
    return refs.split(',').map(r => r.trim()).filter(Boolean).map(r => {
        if (r.startsWith('HEAD -> ')) return { label: r.slice(8), type: 'head' as const };
        if (r === 'HEAD') return { label: 'HEAD', type: 'head' as const };
        if (r.startsWith('tag: ')) return { label: r.slice(5), type: 'tag' as const };
        if (r.startsWith('refs/stash')) return { label: 'stash', type: 'stash' as const };
        if (r.includes('/')) return { label: r, type: 'remote' as const };
        return { label: r, type: 'local' as const };
    });
}

function RefBadge({ ref }: { ref: ParsedRef }) {
    const cls: Record<ParsedRef['type'], string> = {
        head: 'bg-nexus-neon/20 text-nexus-neon border-nexus-neon/40',
        local: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        remote: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        tag: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
        stash: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
    };
    const icon: Record<ParsedRef['type'], React.ReactNode> = {
        head: <span className="font-bold text-[8px]">H</span>,
        local: <GitBranch size={8} />, remote: <GitBranch size={8} />,
        tag: <Tag size={8} />, stash: <Archive size={8} />,
    };
    return (
        <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded border text-[9px] font-mono font-medium leading-4 ${cls[ref.type]}`}>
            {icon[ref.type]}
            <span className="max-w-[100px] truncate">{ref.label}</span>
        </span>
    );
}

// ── Graph algorithm ───────────────────────────────────────────────────────────

function computeGraph(commits: RawCommit[]): { nodes: GraphNode[], edges: GraphEdge[] } {
    // Short-hash lookup  
    const hashToRow = new Map<string, number>();
    commits.forEach((c, i) => {
        hashToRow.set(c.shortHash, i);
        hashToRow.set(c.hash, i);
        hashToRow.set(c.hash.slice(0, 7), i);
    });

    // activeLanes[col] = short-hash the lane is tracking, or null if free
    const activeLanes: (string | null)[] = [];
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (let i = 0; i < commits.length; i++) {
        const c = commits[i];

        // Find the lane already tracking this commit
        let col = activeLanes.findIndex(h => h && (h === c.shortHash || c.hash.startsWith(h) || h.startsWith(c.shortHash)));
        if (col === -1) {
            const free = activeLanes.findIndex(h => h === null);
            col = free === -1 ? Math.min(activeLanes.length, MAX_COLS - 1) : free;
        }

        // Cap column
        col = Math.min(col, MAX_COLS - 1);

        nodes.push({ ...c, col, rowIndex: i, isMerge: c.parents.length > 1 });

        // Release this lane
        activeLanes[col] = null;

        c.parents.forEach((pShort, pIdx) => {
            const parentRow = hashToRow.get(pShort);

            if (pIdx === 0) {
                // Primary parent: keep the same lane
                activeLanes[col] = pShort;
                // Draw straight edge if parent exists in our list
                if (parentRow !== undefined) {
                    edges.push({ fromRow: i, toRow: parentRow, fromCol: col, toCol: col, color: laneColor(col) });
                }
            } else {
                // Merge parent: open new lane (or find existing one tracking it)
                let mergeLane = activeLanes.findIndex(h => h && (h === pShort || pShort.startsWith(h) || h.startsWith(pShort)));
                if (mergeLane === -1) {
                    const free = activeLanes.findIndex(h => h === null);
                    mergeLane = free === -1 ? Math.min(activeLanes.length, MAX_COLS - 1) : free;
                    mergeLane = Math.min(mergeLane, MAX_COLS - 1);
                    activeLanes[mergeLane] = pShort;
                }
                if (parentRow !== undefined) {
                    edges.push({ fromRow: i, toRow: parentRow, fromCol: col, toCol: mergeLane, color: laneColor(mergeLane) });
                }
            }
        });
    }

    return { nodes, edges };
}

// ── Main Component ─────────────────────────────────────────────────────────────

type Filter = 'all' | 'mine' | 'merges' | 'tags';

export const GitTimeline: React.FC<GitTimelineProps> = ({ projectPath, onCommitSelect }) => {
    const repo = useGitStore(s => s.repos[projectPath] ?? EMPTY_REPO_DATA);
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = getActiveAccount(projectPath);
    const fetchTimeline = useGitStore(s => s.fetchTimeline);
    const invalidate = useGitStore(s => s.invalidate);

    const { commits: rawCommits, localHashes: localHashesArr } = repo.timeline;
    const loading = repo.loading.timeline;
    const error = repo.errors?.timeline || null;
    const localHashes = useMemo(() => new Set(localHashesArr), [localHashesArr]);

    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [timelineView, setTimelineView] = useState<'local' | 'all'>('all');
    const [currentUser, setCurrentUser] = useState('');
    const [editingHash, setEditingHash] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [deletingHash, setDeletingHash] = useState<string | null>(null);
    const [deleteWorking, setDeleteWorking] = useState(false);
    const [commitStatuses, setCommitStatuses] = useState<Record<string, 'pending' | 'success' | 'failure' | 'error' | null>>({});

    // Load git user
    useEffect(() => {
        if (!projectPath) return;
        invoke<any>('git_execute', { projectPath, args: ['config', 'user.name'] }).then(r => {
            setCurrentUser(r?.stdout?.trim() ?? '');
        }).catch(() => { });
    }, [projectPath]);

    // Fetch GitHub CI Statuses — deferred so the timeline renders first before network calls start
    useEffect(() => {
        if (rawCommits.length > 0) {
            const token = activeAccount?.token;
            if (token && activeAccount?.provider === 'github') {
                // Only check top 5 commits to reduce concurrent fetch calls
                const topHashes = rawCommits.slice(0, 5).map(c => c.hash);
                const timer = setTimeout(() => {
                    import('../services/githubApi').then(({ fetchGithubCommitStatus }) => {
                        Promise.allSettled(
                            topHashes.map(h => fetchGithubCommitStatus(projectPath, token, h).then(res => ({ hash: h, state: res?.state || null })))
                        ).then(results => {
                            const newStatuses: Record<string, any> = {};
                            results.forEach(r => {
                                if (r.status === 'fulfilled' && r.value.state) {
                                    newStatuses[r.value.hash] = r.value.state;
                                }
                            });
                            if (Object.keys(newStatuses).length > 0) {
                                setCommitStatuses(prev => ({ ...prev, ...newStatuses }));
                            }
                        });
                    });
                }, 1500);
                return () => clearTimeout(timer);
            }
        }
    }, [rawCommits, projectPath, activeAccount?.token, activeAccount?.provider]);

    const visibleCommits = useMemo(() =>
        timelineView === 'local'
            ? rawCommits.filter(c => localHashes.has(c.hash))
            : rawCommits,
        [timelineView, rawCommits, localHashes]);

    const { nodes, edges } = useMemo(() => computeGraph(visibleCommits), [visibleCommits]);
    const totalCols = useMemo(() => Math.min(Math.max(...nodes.map(n => n.col), 0) + 1, MAX_COLS), [nodes]);
    const svgW = totalCols * COL_W + 8;

    // ── Edit commit message (any local commit) ────────────────────────────────
    const handleEditSave = useCallback(async (n: GraphNode) => {
        if (!editValue.trim() || editValue === n.message) { setEditingHash(null); return; }
        setEditSaving(true);
        try {
            const res: any = await invoke('git_reword_commit', {
                projectPath,
                commitHash: n.hash,
                newMessage: editValue.trim(),
            });
            if (!res?.success) {
                alert('Error al editar el mensaje:\n' + (res?.stderr ?? ''));
            } else {
                setEditingHash(null);
                invalidate(projectPath, 'timeline');
                await fetchTimeline(projectPath, true);
            }
        } catch (e: any) {
            alert('Error al editar: ' + (e?.toString() ?? ''));
        } finally {
            setEditSaving(false);
        }
    }, [editValue, projectPath, fetchTimeline, invalidate]);


    // ── Delete commit ──────────────────────────────────────────────────────────
    const handleDelete = useCallback(async (n: GraphNode) => {
        setDeleteWorking(true);
        try {
            const isHead = nodes[0]?.hash === n.hash;
            if (isHead) {
                await invoke('git_execute', { projectPath, args: ['reset', '--soft', 'HEAD~1'] });
            } else {
                const parent = n.parents[0];
                if (!parent) { alert('No se puede determinar el padre del commit.'); setDeleteWorking(false); return; }
                const res: any = await invoke('git_execute', {
                    projectPath, args: ['rebase', '--onto', parent, n.shortHash]
                });
                if (!res?.success) {
                    alert('Error al eliminar commit:\n' + (res?.stderr ?? ''));
                    setDeleteWorking(false);
                    return;
                }
            }
            setDeletingHash(null);
            setSelectedHash(null);
            invalidate(projectPath, 'timeline');
            await fetchTimeline(projectPath, true);
        } catch (e: any) {
            alert('Error al eliminar: ' + (e?.toString() ?? ''));
        } finally {
            setDeleteWorking(false);
        }
    }, [nodes, projectPath, fetchTimeline, invalidate]);

    const searchLower = searchText.trim().toLowerCase();

    const isMatch = useCallback((n: GraphNode): boolean => {
        if (filter === 'mine' && currentUser && !n.author.toLowerCase().includes(currentUser.toLowerCase())) return false;
        if (filter === 'merges' && !n.isMerge) return false;
        if (filter === 'tags' && !n.refs.includes('tag: ')) return false;
        if (!searchLower) return true;
        return (
            n.message.toLowerCase().includes(searchLower) ||
            n.author.toLowerCase().includes(searchLower) ||
            n.shortHash.includes(searchLower)
        );
    }, [filter, searchLower, currentUser]);

    const filters: { id: Filter; label: string; icon?: React.ReactNode }[] = [
        { id: 'all', label: 'Todos' },
        { id: 'mine', label: 'Míos', icon: <User size={9} /> },
        { id: 'merges', label: 'Merges', icon: <GitMerge size={9} /> },
        { id: 'tags', label: 'Tags', icon: <Tag size={9} /> },
    ];

    if (loading) return (
        <div className="flex-1 flex items-center justify-center text-slate-500 gap-2">
            <RefreshCw size={16} className="animate-spin" /><span className="text-sm">Cargando...</span>
        </div>
    );

    if (error) return (
        <div className="flex-1 flex flex-col items-center justify-center text-nexus-danger gap-3 p-8 text-sm text-center">
            {error}
            <button onClick={() => { invalidate(projectPath, 'timeline'); fetchTimeline(projectPath, true); }} className="text-xs px-3 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">Reintentar</button>
        </div>
    );

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* ── Toolbar ── */}
            <div className="flex flex-col gap-2 px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-900/50 shrink-0">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                        placeholder="Buscar commit, autor, hash..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-7 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon transition-colors"
                    />
                    {searchText && (
                        <button onClick={() => setSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            <X size={12} />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    {/* View toggle: Locales / Todos */}
                    <button onClick={() => setTimelineView('local')}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${timelineView === 'local'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'}`}
                    >
                        Locales {localHashes.size > 0 && <span className="ml-0.5 opacity-70">({localHashes.size})</span>}
                    </button>
                    <button onClick={() => setTimelineView('all')}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${timelineView === 'all'
                            ? 'bg-slate-600/40 text-slate-200 border-slate-500'
                            : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'}`}
                    >
                        Todos
                    </button>
                    <div className="w-px h-3 bg-slate-700 mx-0.5" />
                    {filters.map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${filter === f.id
                                ? 'bg-nexus-neon text-nexus-darker border-transparent'
                                : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'
                                }`}
                        >
                            {f.icon}{f.label}
                        </button>
                    ))}
                    <button onClick={() => { invalidate(projectPath, 'timeline'); fetchTimeline(projectPath, true); }} className="ml-auto p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="Refrescar">
                        <RefreshCw size={12} />
                    </button>
                </div>
            </div>

            {/* ── Graph + Commits (single scrollable area) ── */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                {/* The key: one relative container so SVG and rows share the same coordinate space */}
                <div className="relative" style={{ height: nodes.length * ROW_H }}>

                    {/* SVG graph — absolutely positioned, pointer-events none */}
                    <svg
                        width={svgW}
                        height={nodes.length * ROW_H}
                        style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1 }}
                    >
                        {/* Edges */}
                        {edges.map((e, i) => {
                            const x1 = e.fromCol * COL_W + COL_W / 2 + 4;
                            const y1 = e.fromRow * ROW_H + ROW_H / 2;
                            const x2 = e.toCol * COL_W + COL_W / 2 + 4;
                            const y2 = e.toRow * ROW_H + ROW_H / 2;
                            const ym = (y1 + y2) / 2;
                            return (
                                <path key={i}
                                    d={`M${x1} ${y1} C${x1} ${ym},${x2} ${ym},${x2} ${y2}`}
                                    stroke={e.color} strokeWidth={1.5} fill="none" strokeOpacity={0.7}
                                />
                            );
                        })}
                        {/* Nodes */}
                        {nodes.map(n => {
                            const cx = n.col * COL_W + COL_W / 2 + 4;
                            const cy = n.rowIndex * ROW_H + ROW_H / 2;
                            const c = laneColor(n.col);
                            const sel = selectedHash === n.hash;
                            return (
                                <g key={n.hash}>
                                    {sel && <circle cx={cx} cy={cy} r={NODE_R + 3} fill={c} opacity={0.2} />}
                                    {n.isMerge
                                        ? <circle cx={cx} cy={cy} r={NODE_R} fill="none" stroke={c} strokeWidth={2} />
                                        : <circle cx={cx} cy={cy} r={NODE_R} fill={c} />
                                    }
                                </g>
                            );
                        })}
                    </svg>

                    {/* Commit rows — each absolutely positioned row */}
                    {nodes.map((n) => {
                        const matched = isMatch(n);
                        const refs = parseRefs(n.refs);
                        const isSelected = selectedHash === n.hash;
                        const isLocal = localHashes.has(n.hash);
                        const isEditing = editingHash === n.hash;
                        const isDeleting = deletingHash === n.hash;
                        return (
                            <div
                                key={n.hash}
                                style={{ position: 'absolute', top: n.rowIndex * ROW_H, left: 0, right: 0, height: ROW_H, paddingLeft: svgW }}
                                className={`flex items-center gap-2 pr-2 border-b border-slate-900/50 transition-colors group
                                    ${isEditing || isDeleting ? 'bg-slate-800/80' : isSelected ? 'bg-nexus-neon/8 border-nexus-neon/20' : 'hover:bg-slate-800/40'}
                                    ${!matched ? 'opacity-20 pointer-events-none' : ''}
                                `}
                            >
                                {/* Short hash */}
                                <span
                                    className="font-mono text-[10px] text-slate-500 shrink-0 w-14 cursor-pointer"
                                    onClick={() => { if (!isEditing && !isDeleting) { setSelectedHash(n.hash); onCommitSelect?.(n.hash, n.message, n.author, n.date); } }}
                                >{n.shortHash}</span>

                                {/* Ref badges */}
                                {refs.length > 0 && !isEditing && !isDeleting && (
                                    <div className="flex items-center gap-0.5 shrink-0 overflow-hidden" style={{ maxWidth: 140 }}>
                                        {refs.slice(0, 2).map((r, i) => <RefBadge key={i} ref={r} />)}
                                    </div>
                                )}

                                {/* CI Status Badge */}
                                {!isEditing && !isDeleting && commitStatuses[n.hash] && (
                                    <div className="shrink-0 ml-1 flex items-center" title={`CI Status: ${commitStatuses[n.hash]}`}>
                                        {commitStatuses[n.hash] === 'success' && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_theme(colors.emerald.500)]" />}
                                        {commitStatuses[n.hash] === 'failure' && <X size={10} strokeWidth={3} className="text-red-500" />}
                                        {commitStatuses[n.hash] === 'error' && <AlertTriangle size={10} className="text-red-500" />}
                                        {commitStatuses[n.hash] === 'pending' && <RefreshCw size={10} className="text-yellow-500 animate-spin" />}
                                    </div>
                                )}

                                {/* ── INLINE EDIT mode ── */}
                                {isEditing ? (
                                    <div className="flex-1 flex items-center gap-1.5">
                                        <input
                                            autoFocus
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleEditSave(n); if (e.key === 'Escape') setEditingHash(null); }}
                                            className="flex-1 bg-slate-900 border border-nexus-neon/50 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none"
                                        />
                                        <button onClick={() => handleEditSave(n)} disabled={editSaving} className="p-0.5 text-nexus-success hover:bg-slate-700 rounded" title="Guardar (Enter)">
                                            <Check size={13} />
                                        </button>
                                        <button onClick={() => setEditingHash(null)} className="p-0.5 text-slate-500 hover:bg-slate-700 rounded" title="Cancelar (Esc)">
                                            <X size={13} />
                                        </button>
                                    </div>
                                ) : isDeleting ? (
                                    /* ── DELETE CONFIRM mode ── */
                                    <div className="flex-1 flex items-center gap-2">
                                        <AlertTriangle size={12} className="text-nexus-danger shrink-0" />
                                        <span className="text-xs text-nexus-danger">¿Eliminar este commit?</span>
                                        <button onClick={() => handleDelete(n)} disabled={deleteWorking} className="px-2 py-0.5 text-[10px] rounded bg-nexus-danger/20 text-nexus-danger border border-nexus-danger/40 hover:bg-nexus-danger/30 font-bold disabled:opacity-50">
                                            {deleteWorking ? '...' : 'Eliminar'}
                                        </button>
                                        <button onClick={() => setDeletingHash(null)} className="px-2 py-0.5 text-[10px] rounded text-slate-400 border border-slate-700 hover:bg-slate-700">
                                            Cancelar
                                        </button>
                                    </div>
                                ) : (
                                    /* ── Normal mode ── */
                                    <>
                                        <span
                                            className={`flex-1 text-xs truncate cursor-pointer ${isSelected ? 'text-white font-medium' : 'text-slate-300 group-hover:text-white'}`}
                                            onClick={() => { setSelectedHash(n.hash); onCommitSelect?.(n.hash, n.message, n.author, n.date); }}
                                        >
                                            {n.message}
                                        </span>
                                        <span className="text-[10px] text-slate-600 shrink-0 truncate max-w-[80px] hidden lg:block">{n.author}</span>
                                        <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap hidden xl:block">{n.date}</span>

                                        {/* Action buttons — only on hover and only for local (unpushed) commits */}
                                        {isLocal && (
                                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={e => { e.stopPropagation(); setEditingHash(n.hash); setEditValue(n.message); }}
                                                    className="p-1 text-slate-500 hover:text-nexus-neon hover:bg-slate-700 rounded transition-colors"
                                                    title="Editar mensaje"
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setDeletingHash(n.hash); }}
                                                    className="p-1 text-slate-500 hover:text-nexus-danger hover:bg-slate-700 rounded transition-colors"
                                                    title="Eliminar commit (solo local)"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}

                </div>

                {nodes.length === 0 && (
                    <div className="text-center text-slate-600 py-12 text-sm">No hay commits en este repositorio.</div>
                )}
            </div>
        </div>
    );
};
