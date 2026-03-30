import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Search, X, GitBranch, Tag, Archive, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useGitStore, RawCommit } from '../../stores/gitStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { useGitTimeline, gitKeys } from '../../hooks/queries/useGitQueries';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmationDialog, ConfirmType } from '../ui/ConfirmationDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';

// ── Constants ──
const ROW_H = 34;
const COL_W = 16;
const MAX_COLS = 4;
const NODE_R = 5;
const LANE_COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#facc15'];
const laneColor = (col: number) => LANE_COLORS[Math.min(col, LANE_COLORS.length - 1)];

const AlertModal: React.FC<{ isOpen: boolean; title: string; message: string; onClose: () => void }> = ({ isOpen, title, message, onClose }) => (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-red-500 bg-opacity-10">
                        <AlertTriangle className="text-red-500" size={20} />
                    </div>
                    <DialogTitle className="text-slate-100 text-base font-bold uppercase tracking-tight">{title}</DialogTitle>
                </div>
                <div className="text-slate-400 text-sm font-mono bg-black/20 p-3 rounded border border-slate-800 whitespace-pre-wrap break-all mt-2">{message}</div>
            </DialogHeader>
            <DialogFooter className="mt-4"><Button onClick={onClose} className="bg-slate-800 text-white hover:bg-slate-700">Cerrar</Button></DialogFooter>
        </DialogContent>
    </Dialog>
);

// ── Types ──
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

// ── Ref parsing & badges ──
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
        head: 'bg-microtermix-neon/20 text-microtermix-neon border-microtermix-neon/40 hover:bg-microtermix-neon/30',
        local: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25',
        remote: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25',
        tag: 'bg-blue-500/15 text-blue-300 border-blue-400/30 hover:bg-blue-500/25',
        stash: 'bg-purple-500/15 text-purple-300 border-purple-400/30 hover:bg-purple-500/25',
    };
    const icon: Record<ParsedRef['type'], React.ReactNode> = {
        head: <span className="font-bold text-[8px]">H</span>,
        local: <GitBranch size={8} />, remote: <GitBranch size={8} />,
        tag: <Tag size={8} />, stash: <Archive size={8} />,
    };
    return (
        <Badge variant="outline" className={cn("gap-0.5 px-1 py-0 h-4 text-[9px] font-mono font-medium leading-none border shrink-0", cls[ref.type])}>
            {icon[ref.type]}
            <span className="max-w-[80px] truncate">{ref.label}</span>
        </Badge>
    );
}

// ── Graph algorithm ──
function computeGraph(commits: RawCommit[]): { nodes: GraphNode[], edges: GraphEdge[] } {
    const hashToRow = new Map<string, number>();
    commits.forEach((c, i) => {
        hashToRow.set(c.shortHash, i);
        hashToRow.set(c.hash, i);
        hashToRow.set(c.hash.slice(0, 7), i);
    });
    const activeLanes: (string | null)[] = [];
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (let i = 0; i < commits.length; i++) {
        const c = commits[i];
        let col = activeLanes.findIndex(h => h && (h === c.shortHash || c.hash.startsWith(h) || h.startsWith(c.shortHash)));
        if (col === -1) {
            const free = activeLanes.findIndex(h => h === null);
            col = free === -1 ? Math.min(activeLanes.length, MAX_COLS - 1) : free;
        }
        col = Math.min(col, MAX_COLS - 1);
        nodes.push({ ...c, col, rowIndex: i, isMerge: c.parents.length > 1 });
        activeLanes[col] = null;
        c.parents.forEach((pShort, pIdx) => {
            const parentRow = hashToRow.get(pShort);
            if (pIdx === 0) {
                activeLanes[col] = pShort;
                if (parentRow !== undefined) edges.push({ fromRow: i, toRow: parentRow, fromCol: col, toCol: col, color: laneColor(col) });
            } else {
                let mergeLane = activeLanes.findIndex(h => h && (h === pShort || pShort.startsWith(h) || h.startsWith(pShort)));
                if (mergeLane === -1) {
                    const free = activeLanes.findIndex(h => h === null);
                    mergeLane = free === -1 ? Math.min(activeLanes.length, MAX_COLS - 1) : free;
                    mergeLane = Math.min(mergeLane, MAX_COLS - 1);
                    activeLanes[mergeLane] = pShort;
                }
                if (parentRow !== undefined) edges.push({ fromRow: i, toRow: parentRow, fromCol: col, toCol: mergeLane, color: laneColor(mergeLane) });
            }
        });
    }
    return { nodes, edges };
}

type Filter = 'all' | 'mine' | 'merges' | 'tags';

export const GitTimeline: React.FC<GitTimelineProps> = ({ projectPath, onCommitSelect }) => {
    const queryClient = useQueryClient();
    const { data: timelineData, isLoading: loading, error } = useGitTimeline(projectPath);
    
    const rawCommits = timelineData?.commits || [];
    const localHashesArr = timelineData?.localHashes || [];
    const localHashes = useMemo(() => new Set(localHashesArr), [localHashesArr]);

    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = getActiveAccount(projectPath);

    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [timelineView, setTimelineView] = useState<'local' | 'all'>('all');
    const [currentUser, setCurrentUser] = useState('');
    const [deleteWorking, setDeleteWorking] = useState(false);
    const [commitStatuses, setCommitStatuses] = useState<Record<string, 'pending' | 'success' | 'failure' | 'error' | null>>({});

    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean; title: string; description: string; confirmLabel?: string; type?: ConfirmType; onConfirm: () => void }>({ isOpen: false, title: '', description: '', onConfirm: () => { } });

    useEffect(() => {
        if (!projectPath) return;
        invoke<any>('git_execute', { projectPath, args: ['config', 'user.name'] }).then(r => setCurrentUser(r?.stdout?.trim() ?? '')).catch(() => { });
    }, [projectPath]);

    useEffect(() => {
        if (rawCommits.length > 0 && activeAccount?.token && activeAccount?.provider === 'github') {
            const topHashes = rawCommits.slice(0, 5).map(c => c.hash);
            const timer = setTimeout(() => {
                import('../../services/githubApi').then(({ fetchGithubCommitStatus }) => {
                    Promise.allSettled(topHashes.map(h => fetchGithubCommitStatus(projectPath, activeAccount.token, h).then((res: any) => ({ hash: h, state: res?.state || null }))))
                    .then(results => {
                        const newStatuses: Record<string, any> = {};
                        results.forEach(r => { if (r.status === 'fulfilled' && r.value.state) newStatuses[r.value.hash] = r.value.state; });
                        if (Object.keys(newStatuses).length > 0) setCommitStatuses(prev => ({ ...prev, ...newStatuses }));
                    });
                });
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [rawCommits, projectPath, activeAccount]);

    const visibleCommits = useMemo(() =>
        timelineView === 'local' ? rawCommits.filter(c => localHashes.has(c.hash)) : rawCommits,
        [timelineView, rawCommits, localHashes]);

    const { nodes, edges } = useMemo(() => computeGraph(visibleCommits), [visibleCommits]);
    const totalCols = useMemo(() => Math.min(Math.max(...nodes.map(n => n.col), 0) + 1, MAX_COLS), [nodes]);
    const svgW = totalCols * COL_W + 8;

    const handleRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: gitKeys.repo(projectPath) });
    }, [projectPath, queryClient]);

    const handleEditSave = useCallback(async (n: GraphNode, newMessage: string) => {
        if (!newMessage.trim() || newMessage === n.message) return;
        try {
            const res: any = await invoke('git_reword_commit', { projectPath, commitHash: n.hash, newMessage: newMessage.trim() });
            if (!res?.success) setAlertState({ isOpen: true, title: 'Error al editar', message: res?.stderr ?? 'Unknown error' });
            else handleRefresh();
        } catch (e: any) { 
            setAlertState({ isOpen: true, title: 'Error', message: e?.toString() || 'Connection error' });
        }
    }, [projectPath, handleRefresh]);

    const handleDelete = useCallback(async (n: GraphNode) => {
        setConfirmState({
            isOpen: true,
            title: 'Eliminar Commit',
            description: `¿Estás seguro de que quieres eliminar el commit "${n.shortHash}"? Esto reescribirá la historia del repositorio.`,
            confirmLabel: 'Eliminar',
            type: 'danger',
            onConfirm: async () => {
                setDeleteWorking(true);
                try {
                    const isHead = nodes[0]?.hash === n.hash;
                    if (isHead) await invoke('git_execute', { projectPath, args: ['reset', '--soft', 'HEAD~1'] });
                    else {
                        const parent = n.parents[0];
                        if (!parent) { 
                            setAlertState({ isOpen: true, title: 'Error', message: 'No se puede determinar el padre del commit.' });
                            setDeleteWorking(false);
                            setConfirmState(s => ({ ...s, isOpen: false }));
                            return; 
                        }
                        const res: any = await invoke('git_execute', { projectPath, args: ['rebase', '--onto', parent, n.shortHash] });
                        if (!res?.success) {
                            setAlertState({ isOpen: true, title: 'Error al eliminar', message: res?.stderr ?? 'Unknown error' });
                            setDeleteWorking(false);
                            setConfirmState(s => ({ ...s, isOpen: false }));
                            return;
                        }
                    }
                    setSelectedHash(null);
                    handleRefresh();
                } catch (e: any) { 
                    setAlertState({ isOpen: true, title: 'Error', message: e?.toString() || 'Connection error' });
                } finally { 
                    setDeleteWorking(false); 
                    setConfirmState(s => ({ ...s, isOpen: false }));
                }
            }
        });
    }, [nodes, projectPath, handleRefresh]);

    const isMatch = useCallback((n: GraphNode): boolean => {
        const searchLower = searchText.trim().toLowerCase();
        if (filter === 'mine' && currentUser && !n.author.toLowerCase().includes(currentUser.toLowerCase())) return false;
        if (filter === 'merges' && !n.isMerge) return false;
        if (filter === 'tags' && !n.refs.includes('tag: ')) return false;
        if (!searchLower) return true;
        return n.message.toLowerCase().includes(searchLower) || n.author.toLowerCase().includes(searchLower) || n.shortHash.includes(searchLower);
    }, [filter, searchText, currentUser]);

    if (loading) return <div className="flex-1 flex items-center justify-center text-slate-500 gap-2"><RefreshCw size={16} className="animate-spin" /><span className="text-sm">Cargando...</span></div>;
    if (error) return <div className="flex-1 flex flex-col items-center justify-center text-microtermix-danger gap-3 p-8 text-sm text-center">{String(error)}<Button variant="outline" size="sm" onClick={handleRefresh}>Reintentar</Button></div>;

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-2 px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-900/50 shrink-0">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Buscar commit, autor, hash..." className="w-full bg-slate-950 border-slate-800 h-8 pl-7 pr-7 text-xs text-slate-200" />
                    {searchText && <Button variant="ghost" size="icon-xs" onClick={() => setSearchText('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 h-6 w-6"><X size={12} /></Button>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="outline" size="xs" onClick={() => setTimelineView('local')} className={cn("h-6 rounded-full text-[10px] px-2.5 transition-colors border", timelineView === 'local' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-transparent text-slate-400 border-slate-700')}>Locales ({localHashes.size})</Button>
                    <Button variant="outline" size="xs" onClick={() => setTimelineView('all')} className={cn("h-6 rounded-full text-[10px] px-2.5 transition-colors border", timelineView === 'all' ? 'bg-slate-600/40 text-slate-200 border-slate-500' : 'bg-transparent text-slate-400 border-slate-700')}>Todos</Button>
                    <div className="w-px h-3 bg-slate-700 mx-0.5" />
                    {(['all', 'mine', 'merges', 'tags'] as const).map(f => (
                        <Button variant="outline" size="xs" key={f} onClick={() => setFilter(f)} className={cn("h-6 flex items-center gap-1.5 rounded-full text-[10px] px-2.5 transition-colors border", filter === f ? 'bg-microtermix-neon text-microtermix-darker border-transparent' : 'bg-transparent text-slate-400 border-slate-700')}>{f}</Button>
                    ))}
                    <Button variant="ghost" size="icon-xs" onClick={handleRefresh} className="ml-auto h-6 w-6 text-slate-500 hover:text-slate-300 hover:bg-slate-800"><RefreshCw size={12} /></Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
                <div className="relative" style={{ height: nodes.length * ROW_H }}>
                    <svg width={svgW} height={nodes.length * ROW_H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1 }}>
                        {edges.map((e, i) => {
                            const x1 = e.fromCol * COL_W + COL_W / 2 + 4; const y1 = e.fromRow * ROW_H + ROW_H / 2;
                            const x2 = e.toCol * COL_W + COL_W / 2 + 4; const y2 = e.toRow * ROW_H + ROW_H / 2;
                            return <path key={i} d={`M${x1} ${y1} C${x1} ${(y1+y2)/2},${x2} ${(y1+y2)/2},${x2} ${y2}`} stroke={e.color} strokeWidth={1.5} fill="none" strokeOpacity={0.7} />;
                        })}
                        {nodes.map(n => {
                            const cx = n.col * COL_W + COL_W / 2 + 4; const cy = n.rowIndex * ROW_H + ROW_H / 2;
                            const c = laneColor(n.col); const sel = selectedHash === n.hash;
                            return <g key={n.hash}>{sel && <circle cx={cx} cy={cy} r={NODE_R + 3} fill={c} opacity={0.2} />}{n.isMerge ? <circle cx={cx} cy={cy} r={NODE_R} fill="none" stroke={c} strokeWidth={2} /> : <circle cx={cx} cy={cy} r={NODE_R} fill={c} />}</g>;
                        })}
                    </svg>

                    {nodes.map((n) => {
                        if (!isMatch(n)) return null;
                        const refs = parseRefs(n.refs);
                        const isSelected = selectedHash === n.hash;
                        const isLocal = localHashes.has(n.hash);
                        return (
                            <div key={n.hash} style={{ position: 'absolute', top: n.rowIndex * ROW_H, left: 0, right: 0, height: ROW_H, paddingLeft: svgW }} className={cn("flex items-center gap-2 pr-2 border-b border-slate-900/50 transition-colors group", isSelected ? 'bg-microtermix-neon/8 border-microtermix-neon/20' : 'hover:bg-slate-800/40')}>
                                <span className="font-mono text-[10px] text-slate-500 shrink-0 w-14 cursor-pointer" onClick={() => { setSelectedHash(n.hash); onCommitSelect?.(n.hash, n.message, n.author, n.date); }}>{n.shortHash}</span>
                                {refs.length > 0 && <div className="flex items-center gap-0.5 shrink-0 overflow-hidden" style={{ maxWidth: 140 }}>{refs.slice(0, 2).map((r, i) => <RefBadge key={i} ref={r} />)}</div>}
                                {commitStatuses[n.hash] && <div className="shrink-0 ml-1 flex items-center">{commitStatuses[n.hash] === 'success' ? <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_theme(colors.emerald.500)]" /> : commitStatuses[n.hash] === 'pending' ? <RefreshCw size={10} className="text-yellow-500 animate-spin" /> : <X size={10} strokeWidth={3} className="text-red-500" />}</div>}
                                <span className={cn("flex-1 text-xs truncate cursor-pointer", isSelected ? "text-white font-medium" : "text-slate-400 group-hover:text-slate-200")} onClick={() => { setSelectedHash(n.hash); onCommitSelect?.(n.hash, n.message, n.author, n.date); }}>{n.message}</span>
                                <span className="text-[10px] text-slate-600 shrink-0 truncate max-w-[80px] hidden lg:block">{n.author}</span>
                                <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap hidden xl:block">{n.date}</span>
                                {isLocal && (
                                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={e => { 
                                                e.stopPropagation(); 
                                                const msg = prompt('Nuevo mensaje de commit:', n.message);
                                                if (msg) handleEditSave(n, msg);
                                            }} 
                                            className="p-1 text-slate-500 hover:text-microtermix-neon"
                                        >
                                            <Pencil size={11} />
                                        </button>
                                        <button 
                                            onClick={e => { 
                                                e.stopPropagation(); 
                                                handleDelete(n);
                                            }} 
                                            className="p-1 text-slate-500 hover:text-microtermix-danger"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {nodes.length === 0 && (
                    <div className="text-center text-slate-600 py-12 text-sm">No hay commits en este repositorio.</div>
                )}
            </div>

            <AlertModal 
                isOpen={alertState.isOpen} 
                title={alertState.title} 
                message={alertState.message} 
                onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} 
            />
            <ConfirmationDialog
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                description={confirmState.description}
                confirmLabel={confirmState.confirmLabel}
                type={confirmState.type}
                onConfirm={confirmState.onConfirm}
                onCancel={() => setConfirmState(s => ({ ...s, isOpen: false }))}
                isLoading={deleteWorking}
            />
        </div>
    );
};
