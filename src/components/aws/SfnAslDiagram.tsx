import { useState, useMemo, useRef } from 'react';
import { RotateCcw, Upload, GitBranch, X, Check, ChevronRight, ChevronLeft, ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCwStore } from '../../stores/cwStore';
import { extractLambdaName } from './cwUtils';

// ─── ASL types ────────────────────────────────────────────────────────────────

interface AslChoice { Variable?: string; StringEquals?: string; NumericEquals?: number; BooleanEquals?: boolean; IsNull?: boolean; Next: string; }
interface AslCatch { ErrorEquals: string[]; Next: string; }
interface AslState { Type: string; Next?: string; End?: boolean; Default?: string; Choices?: AslChoice[]; Catch?: AslCatch[]; Resource?: string; Comment?: string; Seconds?: number;[k: string]: any; }
interface AslDef { StartAt: string; States: Record<string, AslState>; Comment?: string; }
interface LNode { name: string; state: AslState; x: number; y: number; w: number; h: number; isStart: boolean; isEnd: boolean; }
interface LEdge { from: LNode; to: LNode; label?: string; isError: boolean; idx: number; }

// ─── Visual config ────────────────────────────────────────────────────────────

type SCfg = { bg: string; border: string; text: string; dim: string; badge: string };
const STYLES: Record<string, SCfg> = {
    Task: { bg: '#081f3f', border: '#2563eb', text: '#60a5fa', dim: '#1e3a5f', badge: 'Task' },
    Choice: { bg: '#1f1100', border: '#d97706', text: '#fbbf24', dim: '#3d2500', badge: 'Choice' },
    Pass: { bg: '#0d1117', border: '#475569', text: '#94a3b8', dim: '#1e2530', badge: 'Pass' },
    Wait: { bg: '#1e0d00', border: '#ea580c', text: '#fb923c', dim: '#3d1a00', badge: 'Wait' },
    Succeed: { bg: '#021510', border: '#059669', text: '#34d399', dim: '#04291e', badge: 'Succeed' },
    Fail: { bg: '#190404', border: '#dc2626', text: '#f87171', dim: '#330808', badge: 'Fail' },
    Parallel: { bg: '#110828', border: '#7c3aed', text: '#a78bfa', dim: '#200f48', badge: 'Parallel' },
    Map: { bg: '#0a0a28', border: '#4338ca', text: '#818cf8', dim: '#141438', badge: 'Map' },
};
const DFLT: SCfg = { bg: '#0d1117', border: '#475569', text: '#94a3b8', dim: '#1e2530', badge: '?' };

// Edge colours depending on direction relative to selection
const EDGE_NORMAL = '#2d4a6a';
const EDGE_OUTGOING = '#10b981';   // green  = edges going OUT of selected
const EDGE_INCOMING = '#38bdf8';   // cyan   = edges coming IN to selected
const EDGE_ERROR = '#991b1b';
const EDGE_ERR_HI = '#ef4444';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NW = 180; const NH = 52;   // node width / height
const DM = 68;                   // choice diamond size
const HG = 48; const VG = 100;  // horizontal / vertical gaps
const PAD = 56;                  // canvas padding

// ─── Layout ───────────────────────────────────────────────────────────────────

function buildLayout(raw: string): { nodes: LNode[]; edges: LEdge[]; W: number; H: number } | null {
    let def: AslDef;
    try { def = JSON.parse(raw); } catch { return null; }
    const states = def.States || {};
    const startAt = def.StartAt;
    if (!states[startAt]) return null;

    // BFS – longest-path depth so diamond graphs spread out correctly
    const depth = new Map<string, number>([[startAt, 0]]);
    const visited = new Set<string>();
    const q = [startAt];
    while (q.length) {
        const n = q.shift()!;
        if (visited.has(n)) continue;
        visited.add(n);
        const s = states[n]; const d = depth.get(n)!;
        const nexts: string[] = [];
        if (s?.Next) nexts.push(s.Next);
        if (s?.Default) nexts.push(s.Default);
        s?.Choices?.forEach(c => nexts.push(c.Next));
        s?.Catch?.forEach(c => nexts.push(c.Next));
        nexts.forEach(nx => {
            if ((depth.get(nx) ?? -1) < d + 1) depth.set(nx, d + 1);
            if (!visited.has(nx)) q.push(nx);
        });
    }
    Object.keys(states).forEach(n => { if (!depth.has(n)) depth.set(n, 99); });

    // Group by depth
    const byD = new Map<number, string[]>();
    depth.forEach((d, n) => { if (!byD.has(d)) byD.set(d, []); byD.get(d)!.push(n); });

    const levelW = (names: string[]) =>
        names.reduce((s, n) => s + (states[n]?.Type === 'Choice' ? DM : NW), 0) +
        Math.max(0, names.length - 1) * HG;

    const sortedD = [...byD.keys()].sort((a, b) => a - b);
    const maxLW = Math.max(...sortedD.map(d => levelW(byD.get(d)!)));
    const nodeMap = new Map<string, LNode>();

    sortedD.forEach(d => {
        const names = byD.get(d)!;
        const lw = levelW(names);
        // Center each row within the max level width
        let x = PAD + (maxLW - lw) / 2;
        const y = PAD + 36 + d * (NH + VG);
        names.forEach(n => {
            const isChoice = states[n]?.Type === 'Choice';
            const w = isChoice ? DM : NW;
            const h = isChoice ? DM : NH;
            nodeMap.set(n, {
                name: n, state: states[n] || { Type: 'Pass' },
                x, y, w, h,
                isStart: n === startAt,
                isEnd: !!(states[n]?.End || states[n]?.Type === 'Succeed' || states[n]?.Type === 'Fail'),
            });
            x += w + HG;
        });
    });

    const nodes = [...nodeMap.values()];

    // Edges
    const edges: LEdge[] = [];
    let idx = 0;
    nodes.forEach(node => {
        const s = node.state;
        const add = (to: string, label?: string, isError = false) => {
            const t = nodeMap.get(to);
            if (t) edges.push({ from: node, to: t, label, isError, idx: idx++ });
        };
        if (s.Next) add(s.Next);
        if (s.Default) add(s.Default, 'default');
        s.Choices?.forEach((c, i) => {
            const condKey = Object.keys(c).find(k => k !== 'Variable' && k !== 'Next') || '=';
            const condVal = (c as any)[condKey];
            const lbl = c.Variable
                ? `${c.Variable.split('.').pop()} ${condKey} ${String(condVal).slice(0, 12)}`
                : `choice ${i + 1}`;
            add(c.Next, lbl);
        });
        s.Catch?.forEach(c => add(c.Next, c.ErrorEquals?.join('|') || 'catch', true));
    });

    const maxDepth = Math.max(...sortedD);
    const W = maxLW + PAD * 2;
    const H = PAD + 36 + maxDepth * (NH + VG) + NH + PAD + 50;
    return { nodes, edges, W, H };
}

// ─── Edge path (cubic bezier, bottom→top) ─────────────────────────────────────

function edgePath(from: LNode, to: LNode): string {
    const fx = from.x + from.w / 2, fy = from.y + from.h;
    const tx = to.x + to.w / 2, ty = to.y;
    const cy = fy + (ty - fy) / 2;
    return `M ${fx} ${fy} C ${fx} ${cy} ${tx} ${cy} ${tx} ${ty}`;
}

// ─── SVG Node ─────────────────────────────────────────────────────────────────

function DiagramNode({
    n, isSelected, isHovered, isDimmed,
    onMouseEnter, onMouseLeave, onClick,
}: {
    n: LNode; isSelected: boolean; isHovered: boolean; isDimmed: boolean;
    onMouseEnter: () => void; onMouseLeave: () => void; onClick: () => void;
}) {
    const cfg = STYLES[n.state.Type] || DFLT;
    const { x, y, w, h, name, state, isStart, isEnd } = n;
    const isChoice = state.Type === 'Choice';
    const isPill = state.Type === 'Succeed' || state.Type === 'Fail';
    const isActive = isSelected || isHovered;
    const opacity = isDimmed ? 0.3 : 1;
    const sw = isActive ? 2.5 : 1.5;
    const fill = isDimmed ? cfg.dim : cfg.bg;

    return (
        <g onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
            style={{ cursor: 'pointer', opacity }}>

            {/* START bubble */}
            {isStart && <>
                <circle cx={x + w / 2} cy={y - 30} r={10} fill={cfg.border} />
                <line x1={x + w / 2} y1={y - 20} x2={x + w / 2} y2={y - 1}
                    stroke={cfg.border} strokeWidth={2} markerEnd="url(#arrowhead)" />
            </>}

            {/* Active glow ring */}
            {isActive && (isChoice
                ? <polygon points={`${x + w / 2},${y - 6} ${x + w + 6},${y + h / 2} ${x + w / 2},${y + h + 6} ${x - 6},${y + h / 2}`}
                    fill="none" stroke={cfg.border} strokeWidth={3} opacity={0.4} />
                : <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={isPill ? (h + 10) / 2 : 10}
                    fill="none" stroke={cfg.border} strokeWidth={3} opacity={0.4} />
            )}

            {/* Main shape */}
            {isChoice
                ? <polygon
                    points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
                    fill={fill} stroke={cfg.border} strokeWidth={sw} />
                : <rect x={x} y={y} width={w} height={h} rx={isPill ? h / 2 : 7}
                    fill={fill} stroke={cfg.border} strokeWidth={sw}
                    strokeDasharray={state.Type === 'Parallel' ? '6,3' : undefined} />
            }

            {/* Type badge (top-left corner) */}
            {!isChoice && <>
                <rect x={x + 7} y={y + 5} width={cfg.badge.length * 5.4 + 6} height={13} rx={3}
                    fill={cfg.border + '28'} />
                <text x={x + 10} y={y + 15} fontSize={8} fontFamily="ui-monospace,monospace"
                    fill={cfg.text} opacity={0.8}>{cfg.badge}</text>
            </>}

            {/* State name */}
            {isChoice
                ? <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle"
                    fontSize={10} fontWeight="700" fontFamily="ui-monospace,monospace"
                    fill={cfg.text} style={{ userSelect: 'none' }}>
                    {name.length > 11 ? name.slice(0, 10) + '…' : name}
                </text>
                : <text x={x + 10} y={y + h / 2 + 8}
                    fontSize={12} fontWeight="600" fontFamily="ui-monospace,monospace"
                    fill={cfg.text} style={{ userSelect: 'none' }}>
                    {name.length > 19 ? name.slice(0, 18) + '…' : name}
                </text>
            }

            {/* END terminal dot */}
            {isEnd && <>
                <line x1={x + w / 2} y1={y + h} x2={x + w / 2} y2={y + h + 22}
                    stroke={cfg.border} strokeWidth={2} />
                <circle cx={x + w / 2} cy={y + h + 32} r={11} fill="none" stroke={cfg.border} strokeWidth={2.5} />
                <circle cx={x + w / 2} cy={y + h + 32} r={7} fill={cfg.border} />
            </>}
        </g>
    );
}

// ─── SVG Edge ─────────────────────────────────────────────────────────────────

function DiagramEdge({ edge, highlight, dimmed }: { edge: LEdge; highlight: 'outgoing' | 'incoming' | null; dimmed: boolean }) {
    const isHighlighted = highlight !== null;
    const opacity = dimmed ? 0.12 : 1;
    const sw = isHighlighted ? 2.5 : 1.5;
    let stroke = edge.isError ? EDGE_ERROR : EDGE_NORMAL;
    let markerId = edge.isError ? 'url(#arr-err)' : 'url(#arr)';

    if (isHighlighted) {
        stroke = edge.isError ? EDGE_ERR_HI : (highlight === 'outgoing' ? EDGE_OUTGOING : EDGE_INCOMING);
        markerId = edge.isError ? 'url(#arr-err-hi)' : (highlight === 'outgoing' ? 'url(#arr-out)' : 'url(#arr-in)');
    }

    const d = edgePath(edge.from, edge.to);
    const midX = (edge.from.x + edge.from.w / 2 + edge.to.x + edge.to.w / 2) / 2;
    const midY = (edge.from.y + edge.from.h + edge.to.y) / 2;
    const lbl = edge.label;
    const lblW = lbl ? lbl.length * 5 + 12 : 0;

    return (
        <g style={{ opacity }}>
            <path d={d} fill="none" stroke={stroke} strokeWidth={sw}
                strokeDasharray={edge.isError ? '5,3' : undefined}
                markerEnd={markerId} />
            {lbl && (
                <>
                    <rect x={midX - lblW / 2} y={midY - 10} width={lblW} height={14} rx={3}
                        fill="#030c1a" stroke={stroke} strokeWidth={0.5} opacity={0.9} />
                    <text x={midX} y={midY} textAnchor="middle"
                        fontSize={8} fontFamily="ui-monospace,monospace"
                        fill={isHighlighted ? stroke : '#4a6a8a'}
                        style={{ userSelect: 'none' }}>
                        {lbl.length > 24 ? lbl.slice(0, 23) + '…' : lbl}
                    </text>
                </>
            )}
        </g>
    );
}

// ─── Marker defs ──────────────────────────────────────────────────────────────

function ArrowDefs() {
    const mk = (id: string, fill: string) => (
        <marker key={id} id={id} markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0,9 3.5,0 7" fill={fill} />
        </marker>
    );
    return (
        <defs>
            {mk('arr', EDGE_NORMAL)}
            {mk('arr-out', EDGE_OUTGOING)}
            {mk('arr-in', EDGE_INCOMING)}
            {mk('arr-err', EDGE_ERROR)}
            {mk('arr-err-hi', EDGE_ERR_HI)}
        </defs>
    );
}

// ─── States sidebar ────────────────────────────────────────────────────────────

function StatesSidebar({
    nodes, selectedName, onSelect,
}: { nodes: LNode[]; selectedName: string | null; onSelect: (name: string) => void }) {
    return (
        <div className="w-[200px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/30 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Estados ({nodes.length})
                </span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                {nodes.map(n => {
                    const cfg = STYLES[n.state.Type] || DFLT;
                    const isSelected = n.name === selectedName;
                    return (
                        <button
                            key={n.name}
                            onClick={() => onSelect(n.name)}
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all',
                                isSelected
                                    ? 'bg-slate-800/70'
                                    : 'hover:bg-slate-900/60',
                            )}
                        >
                            {/* indicator dot */}
                            <div className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                                style={{ background: isSelected ? cfg.border : cfg.border + '55' }} />

                            {/* name */}
                            <span className={cn(
                                'flex-1 text-[11px] font-medium truncate leading-tight',
                                isSelected ? 'text-white' : 'text-slate-400',
                            )}>
                                {n.name}
                            </span>

                            {/* type pill */}
                            <span className="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded"
                                style={{
                                    background: cfg.border + (isSelected ? '30' : '18'),
                                    color: cfg.text + (isSelected ? '' : 'aa'),
                                }}>
                                {cfg.badge}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface SfnAslDiagramProps {
    definition: string;
    localDef: string | null;
    onLocalDefChange: (def: string | null) => void;
    onPushLocal?: () => void;
    pushingLocal?: boolean;
}

export function SfnAslDiagram({
    definition, localDef, onLocalDefChange, onPushLocal, pushingLocal,
}: SfnAslDiagramProps) {
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [hoveredName, setHoveredName] = useState<string | null>(null);
    const [editBuf, setEditBuf] = useState('');
    const [editErr, setEditErr] = useState<string | null>(null);
    const svgWrapRef = useRef<HTMLDivElement>(null);

    const activeDef = localDef ?? definition;
    const layout = useMemo(() => buildLayout(activeDef), [activeDef]);
    const isModified = localDef !== null && localDef !== definition;

    if (!layout) {
        return (
            <div className="flex items-center justify-center h-32 text-slate-600 text-xs italic">
                No se pudo parsear la definición ASL
            </div>
        );
    }

    const { nodes, edges, W, H } = layout;

    // The "active" name for highlighting is hovered > selected
    const activeName = hoveredName ?? selectedName;

    // Compute edge highlight direction relative to activeName
    const edgeHighlight = useMemo(() => {
        if (!activeName) return new Map<number, 'outgoing' | 'incoming'>();
        const map = new Map<number, 'outgoing' | 'incoming'>();
        edges.forEach(e => {
            if (e.from.name === activeName) map.set(e.idx, 'outgoing');
            else if (e.to.name === activeName) map.set(e.idx, 'incoming');
        });
        return map;
    }, [activeName, edges]);

    const hasHighlight = edgeHighlight.size > 0;

    const selNode = nodes.find(n => n.name === selectedName) ?? null;

    const handleNodeClick = (name: string) => {
        if (selectedName === name) { setSelectedName(null); setEditBuf(''); return; }
        setSelectedName(name);
        const nd = nodes.find(n => n.name === name);
        setEditBuf(JSON.stringify(nd?.state, null, 2));
        setEditErr(null);
    };

    const handleSidebarSelect = (name: string) => {
        handleNodeClick(name);
        // Scroll SVG wrapper so the node is visible
        const nd = nodes.find(n => n.name === name);
        if (nd && svgWrapRef.current) {
            svgWrapRef.current.scrollTo({
                left: Math.max(0, nd.x - 60),
                top: Math.max(0, nd.y - 60),
                behavior: 'smooth',
            });
        }
    };

    const handleApply = () => {
        try {
            const parsed = JSON.parse(editBuf);
            const def = JSON.parse(activeDef) as AslDef;
            def.States[selectedName!] = parsed;
            onLocalDefChange(JSON.stringify(def, null, 2));
            setEditErr(null);
        } catch (e: any) { setEditErr(e.message); }
    };

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">

            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900/40 shrink-0">
                <GitBranch size={12} className="text-slate-600" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Diagrama ASL</span>
                <div className="ml-auto flex items-center gap-2">
                    {isModified && (
                        <>
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold tracking-wider animate-pulse">
                                ● Modificado localmente
                            </span>
                            <Button variant="ghost" size="xs"
                                onClick={() => { onLocalDefChange(null); setSelectedName(null); }}
                                className="h-5 text-[10px] text-slate-500 gap-1">
                                <RotateCcw size={9} /> Reset
                            </Button>
                        </>
                    )}
                    {onPushLocal && (
                        <Button size="xs" onClick={onPushLocal} disabled={pushingLocal}
                            className="h-6 text-[10px] font-bold gap-1 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100">
                            <Upload size={10} />
                            {pushingLocal ? 'Subiendo…' : 'Push a SFN Local'}
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Body: states sidebar + diagram + editor panel ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* States list (left – primary navigator) */}
                <StatesSidebar
                    nodes={nodes}
                    selectedName={selectedName}
                    onSelect={handleSidebarSelect}
                />

                {/* Diagram (center, shrinks when editor is open) */}
                <div ref={svgWrapRef}
                    className="flex-1 overflow-auto custom-scrollbar bg-[#020a18] transition-all duration-300"
                    style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #0d1f38 1px, transparent 0)', backgroundSize: '28px 28px' }}>
                    <div style={{ minWidth: W, minHeight: H, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
                            style={{ display: 'block', overflow: 'visible' }}>
                            <ArrowDefs />
                            <rect x={0} y={0} width={W} height={H} fill="none" />
                            {edges.map(e => (
                                <DiagramEdge key={e.idx} edge={e}
                                    highlight={edgeHighlight.get(e.idx) ?? null}
                                    dimmed={hasHighlight && !edgeHighlight.has(e.idx)} />
                            ))}
                            {nodes.map(n => (
                                <DiagramNode key={n.name} n={n}
                                    isSelected={selectedName === n.name}
                                    isHovered={hoveredName === n.name}
                                    isDimmed={activeName !== null && activeName !== n.name && !edgeHighlight.has(
                                        edges.find(e => (e.from.name === activeName && e.to.name === n.name) || (e.to.name === activeName && e.from.name === n.name))?.idx ?? -1
                                    ) && activeName !== n.name}
                                    onMouseEnter={() => setHoveredName(n.name)}
                                    onMouseLeave={() => setHoveredName(null)}
                                    onClick={() => handleNodeClick(n.name)} />
                            ))}
                        </svg>
                    </div>
                </div>

                {/* ── State editor — right side panel ── */}
                {selNode && (
                    <StateEditorPanel
                        node={selNode}
                        allNodes={nodes}
                        edges={edges}
                        editBuf={editBuf}
                        editErr={editErr}
                        onBufChange={(v) => { setEditBuf(v); setEditErr(null); }}
                        onApply={handleApply}
                        onClose={() => { setSelectedName(null); setEditBuf(''); }}
                    />
                )}
            </div>
        </div>
    );
}

// ─── State editor right panel ─────────────────────────────────────────────────

interface EditorPanelProps {
    node: LNode;
    allNodes: LNode[];
    edges: LEdge[];
    editBuf: string;
    editErr: string | null;
    onBufChange: (v: string) => void;
    onApply: () => void;
    onClose: () => void;
}

function StateEditorPanel({ node, allNodes, edges, editBuf, editErr, onBufChange, onApply, onClose }: EditorPanelProps) {
    const cfg = STYLES[node.state.Type] || DFLT;

    // Connections relative to this state
    const incoming = edges.filter(e => e.to.name === node.name);
    const outgoing = edges.filter(e => e.from.name === node.name);

    const { goToLogs } = useCwStore();

    // Quick-field helpers: parse buffer for specific fields
    const parsed = useMemo(() => { try { return JSON.parse(editBuf); } catch { return null; } }, [editBuf]);

    const setField = (key: string, value: any) => {
        try {
            const obj = JSON.parse(editBuf);
            if (value === '' || value === null || value === undefined) {
                delete obj[key];
            } else {
                obj[key] = value;
            }
            onBufChange(JSON.stringify(obj, null, 2));
        } catch { /* leave as-is */ }
    };

    const isJsonValid = editErr === null && (() => { try { JSON.parse(editBuf); return true; } catch { return false; } })();

    return (
        <div className="w-[300px] shrink-0 border-l-2 border-slate-700 bg-slate-900 flex flex-col overflow-hidden animate-in slide-in-from-right-3 duration-200">

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800 shrink-0"
                style={{ borderLeftColor: cfg.border, borderLeftWidth: 3 }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.border }} />
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold font-mono truncate" style={{ color: cfg.text }}>
                        {node.name}
                    </p>
                    <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                            background: cfg.border + '25',
                            color: cfg.text,
                            border: `1px solid ${cfg.border}50`,
                        }}>
                        {cfg.badge}
                    </span>
                    {node.isStart && (
                        <span className="ml-1 text-[8px] font-black text-microtermix-neon uppercase tracking-wider">
                            START
                        </span>
                    )}
                    {node.isEnd && (
                        <span className="ml-1 text-[8px] font-black text-slate-500 uppercase tracking-wider">
                            END
                        </span>
                    )}
                </div>
                <button onClick={onClose}
                    className="p-1 rounded hover:bg-slate-800 text-slate-600 hover:text-slate-300 transition-colors shrink-0">
                    <X size={13} />
                </button>
            </div>

            {/* Connections map */}
            {(incoming.length > 0 || outgoing.length > 0) && (
                <div className="px-3 py-2 border-b border-slate-800/60 shrink-0 flex flex-col gap-1.5">
                    {incoming.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1">
                                <ChevronRight size={8} className="text-sky-500" /> Desde ({incoming.length})
                            </span>
                            <div className="flex flex-wrap gap-1 ml-3">
                                {incoming.map((e, i) => (
                                    <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                        {e.from.name.length > 14 ? e.from.name.slice(0, 13) + '…' : e.from.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {outgoing.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1">
                                <ArrowRight size={8} className="text-emerald-500" /> Hacia ({outgoing.length})
                            </span>
                            <div className="flex flex-wrap gap-1 ml-3">
                                {outgoing.map((e, i) => (
                                    <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        {e.to.name.length > 14 ? e.to.name.slice(0, 13) + '…' : e.to.name}
                                        {e.label && <span className="text-[8px] text-emerald-600 ml-1">({e.label.slice(0, 10)})</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Quick fields (type-specific) */}
            {parsed && (
                <div className="px-3 py-2 border-b border-slate-800/60 shrink-0 flex flex-col gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">
                        Campos rápidos
                    </span>

                    {/* Comment — always shown */}
                    <QuickField label="Comment" value={parsed.Comment ?? ''}
                        onChange={v => setField('Comment', v || null)} />

                    {/* Task-specific */}
                    {node.state.Type === 'Task' && (() => {
                        const directLambda = parsed.Resource?.startsWith('arn:aws:lambda:') ? extractLambdaName(parsed.Resource, undefined) : null;
                        const isLambdaInvoke = parsed.Resource?.includes(':::lambda:invoke');
                        const paramLambda = isLambdaInvoke ? extractLambdaName(undefined, parsed.Parameters) : null;

                        return (
                            <>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">Resource (ARN)</span>
                                        {directLambda && (
                                            <button 
                                                title="Ir a logs de esta Lambda"
                                                onClick={() => goToLogs(`/aws/lambda/${directLambda}`)}
                                                className="text-[9px] text-microtermix-neon hover:text-white flex items-center gap-1 transition-colors"
                                            >
                                                <Terminal size={10} /> Ver Logs
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        value={parsed.Resource ?? ''}
                                        onChange={e => setField('Resource', e.target.value)}
                                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-microtermix-neon/40 w-full"
                                    />
                                </div>

                                {isLambdaInvoke && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">FunctionName (Parameters)</span>
                                            {paramLambda && (
                                                <button 
                                                    title="Ir a logs de esta Lambda"
                                                    onClick={() => goToLogs(`/aws/lambda/${paramLambda}`)}
                                                    className="text-[9px] text-microtermix-neon hover:text-white flex items-center gap-1 transition-colors"
                                                >
                                                    <Terminal size={10} /> Ver Logs
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            value={parsed.Parameters?.FunctionName ?? ''}
                                            onChange={e => {
                                                const obj = { ...parsed, Parameters: { ...parsed.Parameters, FunctionName: e.target.value } };
                                                onBufChange(JSON.stringify(obj, null, 2));
                                            }}
                                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-microtermix-neon/40 w-full"
                                        />
                                    </div>
                                )}

                                <QuickField label="TimeoutSeconds" value={parsed.TimeoutSeconds ?? ''}
                                    type="number" onChange={v => setField('TimeoutSeconds', v ? Number(v) : null)} />
                            </>
                        );
                    })()}

                    {/* Wait-specific */}
                    {node.state.Type === 'Wait' &&
                        <QuickField label="Seconds" value={parsed.Seconds ?? ''}
                            type="number" onChange={v => setField('Seconds', v ? Number(v) : null)} />
                    }

                    {/* Next state (for non-Choice/terminal) */}
                    {parsed.Next !== undefined && (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">Next</span>
                            <select
                                value={parsed.Next ?? ''}
                                onChange={e => setField('Next', e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-microtermix-neon/40 w-full">
                                <option value="">— sin Next —</option>
                                {allNodes.filter(n => n.name !== node.name).map(n => (
                                    <option key={n.name} value={n.name}>{n.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            )}

            {/* JSON editor (main area) */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">
                        JSON completo
                    </span>
                    <button
                        onClick={() => {
                            try { onBufChange(JSON.stringify(JSON.parse(editBuf), null, 2)); } catch { }
                        }}
                        className="text-[8px] text-slate-600 hover:text-slate-400 transition-colors uppercase tracking-wider font-bold">
                        Format
                    </button>
                </div>
                <textarea
                    value={editBuf}
                    onChange={e => onBufChange(e.target.value)}
                    spellCheck={false}
                    className={cn(
                        'flex-1 bg-slate-950 text-[11px] font-mono text-slate-200 px-3 py-2 resize-none focus:outline-none custom-scrollbar border-t',
                        editErr ? 'border-red-500/50' : 'border-slate-800/60',
                    )}
                />
                {editErr && (
                    <p className="px-3 py-1.5 text-[10px] text-red-400 font-mono bg-red-950/40 border-t border-red-500/30 shrink-0 truncate">
                        {editErr}
                    </p>
                )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-800 bg-slate-900/80 shrink-0">
                <Button variant="ghost" size="sm" onClick={onClose}
                    className="flex-1 h-8 text-xs text-slate-500 gap-1.5">
                    <ChevronLeft size={12} /> Cerrar
                </Button>
                <Button size="sm" onClick={onApply} disabled={!isJsonValid}
                    className="flex-1 h-8 text-xs font-bold gap-1.5 bg-microtermix-neon/80 hover:bg-microtermix-neon text-black">
                    <Check size={12} /> Aplicar
                </Button>
            </div>
        </div>
    );
}

// ─── Quick field input ─────────────────────────────────────────────────────────

function QuickField({ label, value, onChange, type = 'text', mono = false }: {
    label: string; value: string | number; onChange: (v: string) => void;
    type?: string; mono?: boolean;
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">{label}</span>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                className={cn(
                    'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-microtermix-neon/40 w-full',
                    mono && 'font-mono',
                )}
            />
        </div>
    );
}
