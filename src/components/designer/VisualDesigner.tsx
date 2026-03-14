import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
    ReactFlow, 
    addEdge, 
    Background, 
    Controls, 
    Connection, 
    Edge, 
    applyNodeChanges, 
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    Node,
    Panel,
    Handle,
    Position,
    ReactFlowInstance,
    NodeResizer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MermaidConverter, DiagramMode } from './utils/mermaid-converter';
import { MermaidRenderer } from './utils/MermaidRenderer';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { 
    Download, 
    Trash2, 
    LayoutGrid, 
    Type, 
    Database, 
    Diamond,
    Code,
    Users,
    ArrowRightLeft,
    GitGraph,
    MessageSquare,
    StickyNote,
    Zap,
    Circle,
    PlayCircle,
    Settings2,
    HardDrive,
    Terminal,
    Eye,
    EyeOff,
    Copy,
    Share,
    Box,
    X as XIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

// ── ID Generator ─────────────────────────────────────────────────────────────
const generateId = () => `id_${Math.random().toString(36).substr(2, 9)}`;

// ── Custom Node Components ───────────────────────────────────────────────────

const BaseNode = ({ data, selected, Icon, color = "#38bdf8", shape = "rounded-lg" }: any) => (
    <div className={cn(
        "flex items-center gap-2.5 px-3.5 py-2 border bg-slate-900 shadow-2xl group/node relative",
        shape,
        selected ? "border-blue-400 ring-2 ring-blue-400/20" : "border-slate-700"
    )}>
        <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-blue-500 border-2 border-slate-900 !z-50 opacity-0 group-hover/node:opacity-100 transition-opacity" />
        <Icon size={14} style={{ color }} className="shrink-0" />
        <span className="flex-1 text-[11px] font-black text-slate-100 tracking-tight whitespace-nowrap">{data.label}</span>
        <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-blue-500 border-2 border-slate-900 !z-50 opacity-0 group-hover/node:opacity-100 transition-opacity" />
    </div>
);

const ActorNode = ({ data, selected }: any) => (
    <div className={cn("flex flex-col items-center group relative px-4", selected ? "scale-110 drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]" : "")}>
        <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-blue-500 border-2 border-slate-900 z-50 opacity-0 group-hover:opacity-100 transition-opacity" />
        <svg width="40" height="60" viewBox="0 0 40 60" className="pointer-events-none">
            <circle cx="20" cy="12" r="8" fill="none" stroke={selected ? "#fff" : "#38bdf8"} strokeWidth="2.5" />
            <path d="M20 20 L20 40 M10 28 L30 28 M20 40 L10 55 M20 40 L30 55" stroke={selected ? "#fff" : "#38bdf8"} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
        <span className={cn("mt-1 text-[10px] font-black uppercase px-2 py-0.5 rounded border transition-colors whitespace-nowrap", selected ? "bg-white text-slate-900 border-white" : "bg-slate-900/80 text-slate-200 border-slate-800")}>{data.label}</span>
        <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-blue-500 border-2 border-slate-900 z-50 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
);

const DecisionNode = ({ data, selected }: any) => (
    <div className={cn("w-20 h-20 bg-slate-900 border flex items-center justify-center shadow-2xl relative group/node", selected ? "border-blue-400 ring-2 ring-blue-400/20" : "border-slate-700")} style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}>
        <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-blue-500 border-2 border-slate-900 !z-50 opacity-0 group-hover/node:opacity-100 transition-opacity" />
        <div className="flex flex-col items-center gap-1 p-2">
            <Diamond size={12} className="text-amber-400" />
            <span className="text-[10px] font-black text-slate-100 text-center leading-tight line-clamp-2 px-2">{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-blue-500 border-2 border-slate-900 !z-50 opacity-0 group-hover/node:opacity-100 transition-opacity" />
    </div>
);

const GroupNode = ({ data, selected }: any) => (
    <>
        <NodeResizer minWidth={100} minHeight={100} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-2 w-2 bg-blue-500 border-slate-900 rounded" />
        <div className={cn("w-full h-full border-2 border-dashed bg-slate-900/10 rounded-2xl pointer-events-none relative", selected ? "border-blue-400 bg-slate-900/30" : "border-slate-800")}>
            <div className="absolute top-2 left-4 flex items-center gap-2 pointer-events-auto">
                <Box size={12} className="text-slate-500" />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{data.label}</span>
            </div>
        </div>
    </>
);

const nodeTypes = {
    actor: ActorNode,
    decision: DecisionNode,
    group: GroupNode,
    default: (props: any) => <BaseNode {...props} Icon={LayoutGrid} />,
    database: (props: any) => <BaseNode {...props} Icon={HardDrive} color="#fbbf24" />,
    terminal: (props: any) => <BaseNode {...props} Icon={Terminal} color="#10b981" shape="rounded-full" />,
    subroutine: (props: any) => <BaseNode {...props} Icon={StickyNote} color="#a855f7" />,
    input: (props: any) => <BaseNode {...props} Icon={Type} color="#ec4899" />,
};

// ── Main Component ───────────────────────────────────────────────────────────

export const VisualDesigner: React.FC = () => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [mode, setMode] = useState<DiagramMode>('flowchart');
    const [showCode, setShowCode] = useState(false);
    const [showPreview, setShowPreview] = useState(true);
    
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [debouncedMermaidCode, setDebouncedMermaidCode] = useState('');

    const onNodesChange = useCallback((c: NodeChange[]) => setNodes((nds) => applyNodeChanges(c, nds)), []);
    const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(c, eds)), []);
    const onConnect = useCallback((p: Connection) => setEdges((eds) => addEdge({ 
        ...p, animated: mode === 'flowchart', label: mode === 'sequence' ? 'Mensaje' : ''
    }, eds)), [mode]);

    const mermaidCode = useMemo(() => MermaidConverter.convert({ nodes, edges, mode }), [nodes, edges, mode]);

    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedMermaidCode(mermaidCode); }, 250);
        return () => clearTimeout(handler);
    }, [mermaidCode]);

    const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: any) => {
        setSelectedNodeId(selNodes[0]?.id || null);
        setSelectedEdgeId(selEdges[selEdges.length - 1]?.id || null);
    }, []);

    const onNodeDragStop = useCallback((_: any, draggedNode: Node) => {
        if (draggedNode.type === 'group') return;
        const targetGroup = nodes.find(n => 
            n.type === 'group' && n.id !== draggedNode.id &&
            draggedNode.position.x >= n.position.x &&
            draggedNode.position.x <= n.position.x + (n.measured?.width || 300) &&
            draggedNode.position.y >= n.position.y &&
            draggedNode.position.y <= n.position.y + (n.measured?.height || 200)
        );
        if (targetGroup && draggedNode.parentId !== targetGroup.id) {
            setNodes(nds => nds.map(n => n.id === draggedNode.id ? {
                ...n, parentId: targetGroup.id, extent: 'parent' as const,
                position: { x: n.position.x - targetGroup.position.x, y: n.position.y - targetGroup.position.y }
            } : n));
        }
    }, [nodes]);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        if (!reactFlowInstance) return;
        const type = event.dataTransfer.getData('application/reactflow');
        const label = event.dataTransfer.getData('application/reactflow-label');
        if (!type) return;
        const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const newNode: Node = {
            id: generateId(), type, position, data: { label: label || 'Nuevo' },
            ...(type === 'group' ? { zIndex: -1, style: { width: 300, height: 200 } } : {})
        };
        setNodes((nds) => nds.concat(newNode));
    }, [reactFlowInstance]);

    const addNodeViaClick = (type: string, label: string) => {
        const newNode: Node = {
            id: generateId(), type, position: { x: 250, y: 250 }, data: { label },
            ...(type === 'group' ? { zIndex: -1, style: { width: 300, height: 200 } } : {})
        };
        setNodes((nds) => nds.concat(newNode));
    };

    return (
        <div className="flex h-full w-full bg-slate-950 overflow-hidden relative">
            <div className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col p-4 gap-6 shrink-0 overflow-y-auto scrollbar-hide">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Modo</h3>
                        {nodes.length > 0 && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <Badge variant="outline" className="text-[8px] h-4 border-amber-500/30 text-amber-500 bg-amber-500/5 cursor-help">Bloqueado</Badge>
                                </TooltipTrigger>
                                <TooltipContent side="right">Limpia el canvas para cambiar de modo</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                    <div className={cn(
                        "flex bg-slate-950 p-1 rounded-lg border border-slate-800 transition-opacity",
                        nodes.length > 0 && "opacity-60"
                    )}>
                        <Button variant="ghost" size="xs" onClick={() => setMode('flowchart')}
                            disabled={nodes.length > 0 && mode !== 'flowchart'}
                            className={cn("flex-1 text-[10px] font-bold uppercase", mode === 'flowchart' ? "bg-blue-500/20 text-blue-400" : "text-slate-600")}>Flujo</Button>
                        <Button variant="ghost" size="xs" onClick={() => setMode('sequence')}
                            disabled={nodes.length > 0 && mode !== 'sequence'}
                            className={cn("flex-1 text-[10px] font-bold uppercase", mode === 'sequence' ? "bg-amber-500/20 text-amber-400" : "text-slate-600")}>Secuencia</Button>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                        <span>Librería</span>
                        <Badge variant="outline" className="text-[8px] font-mono h-4 px-1 opacity-50 border-slate-700">Drag & Drop</Badge>
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {mode === 'flowchart' ? (
                            <>
                                <DraggableTool icon={<Box size={14}/>} label="Contenedor" type="group" onClick={() => addNodeViaClick('group', 'Grupo')} />
                                <DraggableTool icon={<PlayCircle size={14}/>} label="Terminal" type="terminal" onClick={() => addNodeViaClick('terminal', 'Inicio/Fin')} />
                                <DraggableTool icon={<LayoutGrid size={14}/>} label="Tarea" type="default" onClick={() => addNodeViaClick('default', 'Proceso')} />
                                <DraggableTool icon={<Diamond size={14}/>} label="Decisión" type="decision" onClick={() => addNodeViaClick('decision', '¿Condición?')} />
                                <ToolButton icon={<HardDrive size={14}/>} label="DB" onClick={() => addNodeViaClick('database', 'Base Datos')} />
                                <ToolButton icon={<StickyNote size={14}/>} label="Sub-proceso" onClick={() => addNodeViaClick('subroutine', 'Subrutina')} />
                            </>
                        ) : (
                            <>
                                <DraggableTool icon={<Users size={16}/>} label="Actor" type="actor" onClick={() => addNodeViaClick('actor', 'Usuario')} />
                                <DraggableTool icon={<LayoutGrid size={16}/>} label="Componente" type="default" onClick={() => addNodeViaClick('default', 'Servicio')} />
                            </>
                        )}
                    </div>
                </div>

                {(selectedNodeId || selectedEdgeId) && (
                    <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
                        <div className="flex items-center gap-2 mb-4"><Settings2 size={14} className="text-blue-400" /><h3 className="text-xs font-bold text-slate-200">Propiedades</h3></div>
                        <div className="space-y-4">
                            <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Texto</label>
                                <Input autoFocus key={selectedNodeId || selectedEdgeId} value={(selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.data?.label : edges.find(e => e.id === selectedEdgeId)?.label) as string || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (selectedNodeId) setNodes(nds => nds.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, label: val } } : n));
                                        else if (selectedEdgeId) setEdges(eds => eds.map(e => e.id === selectedEdgeId ? { ...e, label: val } : e));
                                    }} className="bg-slate-950 border-slate-800 h-8 text-xs focus-visible:ring-blue-500" />
                            </div>
                            <Button variant="destructive" size="sm" onClick={() => {
                                if (selectedNodeId) { setNodes(nds => nds.filter(n => n.id !== selectedNodeId && n.parentId !== selectedNodeId)); setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId)); setSelectedNodeId(null); }
                                else if (selectedEdgeId) { setEdges(eds => eds.filter(e => e.id !== selectedEdgeId)); setSelectedEdgeId(null); }
                            }} className="w-full h-8 text-xs font-bold gap-2"><Trash2 size={14} /> Eliminar</Button>
                        </div>
                    </div>
                )}

                <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-slate-800">
                    <Button variant="secondary" className="w-full gap-2 text-xs font-bold h-9" onClick={() => setShowPreview(!showPreview)}>
                        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} {showPreview ? 'Ocultar Preview' : 'Mostrar Preview'}</Button>
                    <Button variant="outline" className="w-full gap-2 text-xs font-bold h-9 border-slate-800" onClick={() => setShowCode(!showCode)}><Code size={14} /> {showCode ? 'Ocultar Código' : 'Ver Mermaid'}</Button>
                    <Button variant="ghost" className="w-full gap-2 text-xs text-slate-500 hover:text-red-400" onClick={() => { setNodes([]); setEdges([]); setSelectedNodeId(null); setSelectedEdgeId(null); }}><Trash2 size={14} /> Limpiar Todo</Button>
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper}>
                <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={onSelectionChange}
                    onNodeDragStop={onNodeDragStop} onInit={setReactFlowInstance} onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    nodeTypes={nodeTypes} colorMode="dark" fitView elevateNodesOnSelect selectNodesOnDrag={false}
                >
                    <Background color="#1e293b" gap={20} />
                    <Controls />
                    <Panel position="top-right"><Badge variant="outline" className={cn("bg-slate-900/80 backdrop-blur-md px-3 py-1 font-mono text-[10px]", mode === 'flowchart' ? "text-blue-400 border-blue-900/50" : "text-amber-400 border-amber-900/50")}>DESIGNER — {mode.toUpperCase()} MODE</Badge></Panel>
                </ReactFlow>

                {showPreview && (
                    <div className="absolute left-4 bottom-24 top-4 w-[400px] pointer-events-none z-40 animate-in slide-in-from-left-4">
                        <div className="w-full h-full bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto border-l-4 border-l-blue-500">
                            <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between bg-slate-950/50 shrink-0">
                                <div className="flex items-center gap-2"><Share size={14} className="text-blue-400" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Preview</span></div>
                                <Button variant="ghost" size="icon-xs" onClick={() => setShowPreview(false)} className="text-slate-500"><XIcon size={14}/></Button>
                            </div>
                            <div className="flex-1 min-h-0 bg-slate-950/20 overflow-hidden"><MermaidRenderer chart={debouncedMermaidCode} /></div>
                        </div>
                    </div>
                )}

                {showCode && (
                    <div className="absolute right-4 top-16 bottom-4 w-[450px] bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in slide-in-from-right-4">
                        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-950/50">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Mermaid Definition</span>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon-xs" onClick={() => { navigator.clipboard.writeText(debouncedMermaidCode); toast.success("Copiado"); }} className="text-blue-400"><Copy size={16} /></Button>
                                <Button variant="ghost" size="icon-xs" className="text-blue-400"><Download size={16} /></Button>
                            </div>
                        </div>
                        <pre className="flex-1 p-6 font-mono text-[12px] text-emerald-400 overflow-auto scrollbar-hide select-all leading-relaxed">{debouncedMermaidCode}</pre>
                    </div>
                )}
            </div>
        </div>
    );
};

function DraggableTool({ icon, label, type, onClick }: any) {
    return (
        <div draggable onDragStart={(e) => {
            e.dataTransfer.setData('application/reactflow', type);
            e.dataTransfer.setData('application/reactflow-label', label);
            e.dataTransfer.effectAllowed = 'move';
        }} className="cursor-grab active:cursor-grabbing">
            <Button variant="outline" size="sm" onClick={onClick} className="flex flex-col h-16 w-full gap-1 bg-slate-900 border-slate-800 hover:border-blue-500 transition-all pointer-events-none text-[9px] uppercase font-bold">
                <div className="text-slate-400">{icon}</div> {label}
            </Button>
        </div>
    );
}

function ToolButton({ icon, label, onClick }: any) {
    return (
        <Button variant="outline" size="sm" onClick={onClick} className="flex flex-col h-16 w-full gap-1 bg-slate-900 border-slate-800 hover:border-blue-500 transition-all text-[9px] uppercase font-bold">
            <div className="text-slate-400">{icon}</div> {label}
        </Button>
    );
}
