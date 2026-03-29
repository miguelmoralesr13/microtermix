import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useZeplinStore } from '../stores/zeplinStore';
import { 
    Settings, Layout, GitMerge, Loader2, X, ZoomIn, ZoomOut, 
    Maximize2, ChevronLeft, ChevronRight, Folder, Eye, Layers, Terminal, Trash2, Copy as CopyIcon, ChevronDown
} from 'lucide-react';
import { 
    verifyZeplinToken 
} from '../services/zeplinApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useEscape } from '../hooks/useEscape';
import { cn } from '@/lib/utils';
import { useZeplinProjects, useZeplinProjectData, useZeplinScreenDetails, useZeplinFlowDetails } from '../hooks/queries/useZeplinQueries';

type Tab = 'screens' | 'flows' | 'settings';

export const ZeplinPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>('flows');
    const [showLogs, setShowLogs] = useState(false);
    const { 
        currentProjectId, selectedScreenId, selectedFlowId,
        setCurrentProjectId, setSelectedScreenId, setSelectedFlowId
    } = useZeplinStore();

    const { data: projects = [], isLoading: loadingProjects } = useZeplinProjects();
    const { screens, flows, sections, isLoading: loadingData } = useZeplinProjectData(currentProjectId || undefined);

    if (selectedScreenId) return <ZeplinCanvas />;
    if (selectedFlowId) return <ZeplinFlowDiagram />;

    const isLoading = loadingProjects || loadingData;

    return (
        <div className="flex-1 flex flex-col h-full w-full min-h-0 bg-slate-950 text-slate-200 font-sans font-medium">
            <div className="flex items-center gap-1 px-6 pt-4 border-b border-slate-900 shrink-0 bg-slate-950">
                <button onClick={() => setTab('flows')}
                    className={cn("flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all", tab === 'flows' ? 'border-microtermix-neon text-white' : 'border-transparent text-slate-600 hover:text-slate-400')}>
                    <GitMerge size={14} /> Explorador
                </button>
                <button onClick={() => setTab('screens')}
                    className={cn("flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all", tab === 'screens' ? 'border-microtermix-neon text-white' : 'border-transparent text-slate-600 hover:text-slate-400')}>
                    <Layout size={14} /> Todo
                </button>
                <button onClick={() => setTab('settings')}
                    className={cn("flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all", tab === 'settings' ? 'border-microtermix-neon text-white' : 'border-transparent text-slate-600 hover:text-slate-400')}>
                    <Settings size={14} />
                </button>

                <div className="ml-auto flex items-center gap-4 pb-2">
                    {isLoading && <Loader2 size={14} className="animate-spin text-microtermix-neon" />}
                    {projects.length > 0 && (
                        <select value={currentProjectId || ''} onChange={(e) => {
                            setCurrentProjectId(e.target.value);
                            setSelectedScreenId(null);
                            setSelectedFlowId(null);
                        }}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-300 focus:outline-none focus:border-microtermix-neon transition-colors">
                            <option value="" disabled>Seleccionar Proyecto</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}
                    <button onClick={() => setShowLogs(!showLogs)}
                        className={cn("p-2 rounded-lg border transition-all", showLogs ? "bg-microtermix-neon/10 border-microtermix-neon text-microtermix-neon" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white")}>
                        <Terminal size={16} />
                    </button>
                </div>
            </div>
            
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                    {tab === 'settings' && <div className="p-6"><ZeplinSettings /></div>}
                    {tab === 'screens' && <div className="p-6 h-full"><ZeplinScreensView screens={screens} /></div>}
                    {tab === 'flows' && <ZeplinFlowsView screens={screens} flows={flows} sections={sections} />}
                </div>
                {showLogs && <div className="h-64 border-t border-slate-900 shrink-0 bg-slate-950 flex flex-col shadow-2xl"><ZeplinLogsView /></div>}
            </div>
        </div>
    );
};

const useOrganizedItems = (screens: any[], sections: any[], flows: any[]) => {
    return useMemo(() => {
        const boards: any[] = [];
        const orphanSections: any[] = [];
        const folderMap: Record<string, any> = {};
        const nameMap = new Map<string, string>();
        sections.forEach(s => nameMap.set(s.id, s.name));
        flows.forEach(f => nameMap.set(f.id, f.name));

        screens.forEach(s => {
            const raw = s as any;
            const container = raw.section || raw.latest_version?.section || raw.flow || raw.latest_version?.flow || raw.flow_board;
            const id = container?.id || s.section_id || 'root';
            if (!folderMap[id]) {
                const name = nameMap.get(id) || container?.name || (id === 'root' ? 'Pantallas Generales' : id);
                folderMap[id] = { id, name, screens: [], type: flows.some(f => f.id === id) ? 'board' : 'section' };
            }
            folderMap[id].screens.push(s);
        });

        Object.values(folderMap).forEach((f: any) => {
            if (/^[0-9a-f]{10,}$/i.test(f.name) && f.id !== 'root') {
                const labeledScreen = f.screens.find((sc: any) => (sc as any).section?.name || (sc as any).latest_version?.section?.name);
                f.name = labeledScreen?.section?.name || labeledScreen?.latest_version?.section?.name || 'Grupo de Diseño';
            }
            if (f.type === 'board') boards.push(f); else orphanSections.push(f);
        });

        return { boards, orphanSections };
    }, [screens, sections, flows]);
};

const ZeplinFlowsView: React.FC<{ screens: any[], flows: any[], sections: any[] }> = ({ screens, flows, sections }) => {
    const { boards, orphanSections } = useOrganizedItems(screens, sections, flows);
    const { setSelectedFlowId, setSelectedScreenId } = useZeplinStore();

    if (boards.length === 0 && orphanSections.length === 0) {
        return <div className="h-full flex flex-col items-center justify-center text-slate-600 animate-pulse"><Loader2 className="mb-4 animate-spin" /> Escaneando estructura...</div>;
    }

    return (
        <div className="p-8 space-y-16 pb-32">
            {boards.length > 0 && (
                <div className="space-y-8">
                    <h3 className="text-[10px] font-black text-microtermix-neon uppercase tracking-[0.3em] px-2">Tableros de Flujo</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                        {boards.map(board => (
                            <div key={board.id} className="group flex flex-col bg-slate-900/40 border border-slate-800 rounded-[2rem] overflow-hidden hover:border-microtermix-neon/50 transition-all duration-500 shadow-2xl">
                                <div className="p-6 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/20">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-microtermix-neon/10 flex items-center justify-center text-microtermix-neon shrink-0"><GitMerge size={20} /></div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-black text-white truncate uppercase tracking-tight">{board.name}</h4>
                                            <p className="text-[9px] text-slate-500 font-bold">{board.screens.length} PANTALLAS</p>
                                        </div>
                                    </div>
                                    <Button onClick={() => setSelectedFlowId(board.id)} variant="outline" size="sm" className="h-8 text-[9px] font-black px-3 rounded-full border-slate-700 bg-slate-950 hover:bg-microtermix-neon hover:text-slate-950 transition-all">DIAGRAMA</Button>
                                </div>
                                <div className="p-4 grid grid-cols-4 sm:grid-cols-5 gap-3 bg-slate-950/20">
                                    {board.screens.slice(0, 10).map((s: any) => (
                                        <div key={s.id} onClick={() => setSelectedScreenId(s.id)} className="group/s cursor-pointer">
                                            <div className="rounded-lg border border-slate-800 overflow-hidden hover:border-microtermix-neon transition-all hover:scale-105 active:scale-95 shadow-lg bg-slate-900">
                                                <img src={s.image.thumbnails.small} className="w-full h-auto block" alt={s.name} loading="lazy" />
                                            </div>
                                        </div>
                                    ))}
                                    {board.screens.length > 10 && <div className="aspect-[3/4] rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-center text-[10px] font-black text-slate-500">+{board.screens.length - 10}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {orphanSections.length > 0 && (
                <div className="space-y-8">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] px-2">Carpetas de Organización</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {orphanSections.map(sec => (
                            <div key={sec.id} className="bg-slate-900/20 border border-slate-800/50 rounded-3xl overflow-hidden hover:border-slate-700 transition-all">
                                <div className="p-4 flex items-center justify-between border-b border-slate-800/30">
                                    <div className="flex items-center gap-4 min-w-0"><Folder size={18} className="text-slate-500 shrink-0" /><div className="min-w-0"><h4 className="text-xs font-black text-slate-300 uppercase tracking-tight truncate">{sec.name}</h4><p className="text-[9px] text-slate-600 font-bold">{sec.screens.length} ITEMS</p></div></div>
                                    <Button onClick={() => setSelectedFlowId(`section-${sec.id}`)} variant="ghost" size="sm" className="h-8 text-[9px] font-black px-3 rounded-full text-microtermix-neon hover:bg-microtermix-neon/10">VER MAPA</Button>
                                </div>
                                <div className="p-4 flex gap-3 overflow-x-auto scrollbar-hide bg-slate-950/10">
                                    {sec.screens.map((s: any) => (
                                        <div key={s.id} onClick={() => setSelectedScreenId(s.id)} className="w-20 shrink-0 space-y-2 cursor-pointer group/s">
                                            <div className="aspect-[3/4] rounded-xl border border-slate-800 overflow-hidden group-hover/s:border-microtermix-neon shadow-lg transition-all"><img src={s.image.thumbnails.small} className="w-full h-full object-cover" loading="lazy" /></div>
                                            <p className="text-[8px] font-bold text-slate-600 group-hover/s:text-slate-300 truncate text-center uppercase tracking-tighter">{s.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const ZeplinFlowDiagram: React.FC = () => {
    const { currentProjectId, selectedFlowId, setSelectedFlowId, setSelectedScreenId } = useZeplinStore();
    const { screens } = useZeplinProjectData(currentProjectId || undefined);
    const { data: remoteFlowData, isLoading: loading } = useZeplinFlowDetails(currentProjectId || undefined, selectedFlowId);
    
    const flowData = useMemo(() => {
        if (selectedFlowId?.startsWith('section-')) {
            const sectionId = selectedFlowId.replace('section-', '');
            const sectionScreens = screens.filter(s => (s.section_id || (s as any).section?.id || (s as any).latest_version?.section?.id || 'root') === sectionId);
            const nodes = sectionScreens.map((s, i) => ({ id: `node-${s.id}`, screen_id: s.id, width: 375, position: { x: (i % 4) * 500, y: Math.floor(i / 4) * 850 } }));
            return { name: "Mapa Dinámico", nodes, connectors: [] };
        }
        return remoteFlowData;
    }, [selectedFlowId, remoteFlowData, screens]);

    const panRef = useRef({ x: 100, y: 100 });
    const [zoom, setZoom] = useState(0.4);
    const isDraggingRef = useRef(false);
    const lastPosRef = useRef({ x: 0, y: 0 });
    
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    useEscape(() => setSelectedFlowId(null));

    const updateDOM = useCallback(() => {
        if (!canvasContainerRef.current) return;
        const { x, y } = panRef.current;
        const z = zoom;
        canvasContainerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
        
        if (gridRef.current) {
            gridRef.current.style.backgroundPosition = `${x}px ${y}px`;
            gridRef.current.style.backgroundSize = `${40 * z}px ${40 * z}px`;
        }
    }, [zoom]);

    useEffect(() => { if (!loading && flowData) updateDOM(); }, [loading, flowData, updateDOM]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.node-item')) return;
        isDraggingRef.current = true;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        panRef.current.x += dx;
        panRef.current.y += dy;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        requestAnimationFrame(updateDOM);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        isDraggingRef.current = false;
        (e.currentTarget as HTMLElement).style.cursor = 'grab';
    };

    const changeZoom = (delta: number) => {
        setZoom(prev => Math.max(0.05, Math.min(3, prev + delta)));
    };

    if (loading) return <div className="flex-1 flex items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-microtermix-neon w-12 h-12" /></div>;
    if (!flowData) return null;

    return (
        <div className="flex-1 flex flex-col h-full w-full bg-[#020617] relative overflow-hidden select-none" 
            onMouseDown={handleMouseDown} 
            onMouseMove={handleMouseMove} 
            onMouseUp={handleMouseUp} 
            onMouseLeave={handleMouseUp} 
            style={{ cursor: 'grab' }}
        >
            <div ref={gridRef} className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)' }} />
            
            <div className="absolute top-6 left-6 z-20 flex items-center gap-3 pointer-events-none">
                <Button variant="outline" size="icon" onClick={() => setSelectedFlowId(null)} className="bg-slate-900/90 border-slate-700 text-white shadow-2xl backdrop-blur-md hover:bg-slate-800 pointer-events-auto"><X size={18} /></Button>
                <div className="px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-2xl">
                    <p className="text-[10px] font-black text-microtermix-neon uppercase tracking-widest leading-none mb-1">Canvas</p>
                    <p className="text-sm font-bold text-white leading-tight">{flowData.name}</p>
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
                <div ref={canvasContainerRef} style={{ transformOrigin: '0 0' }} className="absolute inset-0">
                    <svg className="absolute inset-0 pointer-events-none" style={{ width: '10000px', height: '10000px' }}>
                        <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" /></marker></defs>
                        {flowData.connectors?.map((conn: any) => {
                            const s = flowData.nodes?.find((n: any) => n.id === (conn.source.id || conn.source));
                            const t = flowData.nodes?.find((n: any) => n.id === (conn.target.id || conn.target));
                            if (!s || !t) return null;
                            const x1 = s.position.x + 187; const y1 = s.position.y + 400; const x2 = t.position.x + 187; const y2 = t.position.y + 400;
                            return <path key={conn.id} d={`M ${x1} ${y1} C ${x1 + (x2-x1)/2} ${y1}, ${x1 + (x2-x1)/2} ${y2}, ${x2} ${y2}`} stroke="#38bdf8" strokeWidth="4" strokeOpacity="0.3" fill="none" markerEnd="url(#arrowhead)" />;
                        })}
                    </svg>
                    {flowData.nodes?.map((node: any) => {
                        const screen = screens.find(s => s.id === node.screen_id);
                        if (!screen) return null;
                        return (
                            <div key={node.id} onClick={() => setSelectedScreenId(screen.id)} style={{ left: node.position.x, top: node.position.y, width: '375px' }} className="absolute group cursor-pointer node-item">
                                <div className="absolute -top-12 left-0 right-0 px-4 py-2.5 rounded-2xl bg-slate-900 border-2 border-slate-800 shadow-2xl z-10 group-hover:border-microtermix-neon transition-all">
                                    <p className="text-[11px] font-black text-white truncate uppercase tracking-widest text-center">{screen.name}</p>
                                </div>
                                <div className="bg-slate-900 rounded-[2rem] border-4 border-slate-800 group-hover:border-microtermix-neon transition-all duration-300 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] group-hover:-translate-y-2">
                                    <div className="overflow-hidden bg-slate-950 h-auto"><img src={screen.image.thumbnails.medium} className="w-full h-auto block opacity-90 group-hover:opacity-100" loading="lazy" /></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 p-3 rounded-[2rem] bg-slate-900/90 border border-slate-800 backdrop-blur-2xl shadow-2xl z-20">
                <Button variant="ghost" size="icon" onClick={() => changeZoom(-0.1)} className="text-white hover:bg-slate-800 h-12 w-12 rounded-2xl"><ZoomOut size={20} /></Button>
                <div className="px-4 text-xs font-black font-mono text-slate-400 border-x border-slate-800 min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
                <Button variant="ghost" size="icon" onClick={() => changeZoom(0.1)} className="text-white hover:bg-slate-800 h-12 w-12 rounded-2xl"><ZoomIn size={20} /></Button>
                <Button variant="ghost" size="icon" onClick={() => { setZoom(0.4); panRef.current = { x: 100, y: 100 }; }} className="bg-microtermix-neon/10 text-microtermix-neon hover:bg-microtermix-neon hover:text-slate-950 h-12 w-12 rounded-2xl ml-2"><Maximize2 size={20} /></Button>
            </div>
        </div>
    );
};

const ZeplinScreensView: React.FC<{ screens: any[] }> = ({ screens }) => {
    const { setSelectedScreenId } = useZeplinStore();
    return (
        <div className="h-full overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-10 pb-32 scrollbar-hide">
            {screens.map(s => (
                <div key={s.id} onClick={() => setSelectedScreenId(s.id)} className="group cursor-pointer space-y-4">
                    <div className="rounded-[2rem] border-2 border-slate-800 overflow-hidden shadow-2xl group-hover:border-microtermix-neon/50 transition-all duration-500 bg-slate-900">
                        <img src={s.image.thumbnails.medium} className="w-full h-auto block opacity-90 group-hover:scale-110 transition-transform duration-1000" loading="lazy" />
                    </div>
                    <p className="text-[11px] font-black text-slate-500 group-hover:text-white truncate uppercase px-2 tracking-tighter leading-none">{s.name}</p>
                </div>
            ))}
        </div>
    );
};

const ZeplinCanvas: React.FC = () => {
    const { currentProjectId, selectedScreenId, setSelectedScreenId } = useZeplinStore();
    const { screens } = useZeplinProjectData(currentProjectId || undefined);
    const { data: screenDetails, isLoading: loading } = useZeplinScreenDetails(currentProjectId || undefined, selectedScreenId);
    
    const [zoom, setZoom] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const currentIndex = screens.findIndex(s => s.id === selectedScreenId);
    const screen = screens[currentIndex];

    useEffect(() => { if (imgRef.current && containerRef.current) { const sX = (containerRef.current.clientWidth - 100) / imgRef.current.naturalWidth; const sY = (containerRef.current.clientHeight - 100) / imgRef.current.naturalHeight; setZoom(Math.min(sX, sY, 1)); } }, [screenDetails]);
    
    useEscape(() => setSelectedScreenId(null));
    const handleWheel = (e: React.WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(z => Math.max(0.05, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1)))); } };
    if (!screen) return null;
    return (
        <div className="flex-1 flex h-full w-full bg-[#020617] overflow-hidden">
            <div className="flex-1 flex flex-col relative group/canvas overflow-hidden" ref={containerRef} onWheel={handleWheel}>
                <div className="absolute top-8 left-8 z-30 flex items-center gap-4 pointer-events-none">
                    <Button variant="outline" size="icon" onClick={() => setSelectedScreenId(null)} className="bg-slate-900/80 border-slate-700 text-white shadow-2xl backdrop-blur-md pointer-events-auto h-12 w-12 rounded-2xl hover:bg-slate-800"><X size={20} /></Button>
                    <div className="px-5 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-2xl"><p className="text-sm font-black text-white uppercase tracking-tight">{screen.name}</p></div>
                </div>
                <div className="absolute top-8 right-8 z-30 flex items-center gap-3">
                    <div className="flex items-center bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
                        <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="text-white h-12 w-12"><ZoomOut size={18} /></Button>
                        <div className="px-4 text-[11px] font-black font-mono text-slate-400 min-w-[65px] text-center">{Math.round(zoom * 100)}%</div>
                        <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="text-white h-12 w-12"><ZoomIn size={18} /></Button>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => { if (imgRef.current && containerRef.current) { const sX = (containerRef.current.clientWidth - 100) / imgRef.current.naturalWidth; const sY = (containerRef.current.clientHeight - 100) / imgRef.current.naturalHeight; setZoom(Math.min(sX, sY, 1)); } }} className="bg-slate-900/80 border-slate-700 text-white shadow-2xl backdrop-blur-md h-12 w-12 rounded-2xl"><Maximize2 size={18} /></Button>
                </div>
                <div className="absolute inset-y-0 left-8 z-20 flex items-center pointer-events-none"><Button variant="outline" size="icon" onClick={() => setSelectedScreenId(screens[currentIndex-1].id)} disabled={currentIndex === 0} className="w-16 h-16 rounded-full bg-slate-900/50 border-slate-700 text-white hover:bg-microtermix-neon hover:text-slate-950 pointer-events-auto opacity-0 group-hover/canvas:opacity-100 transition-all shadow-2xl"><ChevronLeft size={32} /></Button></div>
                <div className="absolute inset-y-0 right-8 z-20 flex items-center pointer-events-none"><Button variant="outline" size="icon" onClick={() => setSelectedScreenId(screens[currentIndex+1].id)} disabled={currentIndex === screens.length - 1} className="w-16 h-16 rounded-full bg-slate-900/50 border-slate-700 text-white hover:bg-microtermix-neon hover:text-slate-950 pointer-events-auto opacity-0 group-hover/canvas:opacity-100 transition-all shadow-2xl"><ChevronRight size={32} /></Button></div>
                <div className="flex-1 h-full w-full overflow-auto flex items-center justify-center p-20 scrollbar-hide bg-[#0a0f1e]">
                    <div style={{ transform: `scale(${zoom})`, transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)' }} className="relative shadow-[0_50px_150px_rgba(0,0,0,0.9)] bg-white origin-center rounded-sm">
                        <img ref={imgRef} src={screen.image.original_url} alt={screen.name} className="max-w-none block" onLoad={(e) => { const img = e.currentTarget; if (containerRef.current) { const sX = (containerRef.current.clientWidth - 100) / img.naturalWidth; const sY = (containerRef.current.clientHeight - 100) / img.naturalHeight; setZoom(Math.min(sX, sY, 1)); } }} />
                    </div>
                </div>
            </div>
            <div className="w-96 border-l border-slate-900 bg-slate-950 flex flex-col shrink-0 shadow-2xl">
                <div className="p-8 border-b border-slate-900 bg-slate-900/20 flex items-center justify-between"><h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2"><Eye size={14} className="text-microtermix-neon" /> Capas de Diseño</h3>{loading && <Loader2 size={14} className="animate-spin text-microtermix-neon" />}</div>
                <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide">
                    {screenDetails?.latest_version?.layers?.length > 0 ? (
                        screenDetails.latest_version.layers.slice(0, 40).map((layer: any) => (
                            <div key={layer.id} className="p-5 rounded-3xl bg-slate-900/40 border border-slate-800/50 hover:border-microtermix-neon/30 transition-all group flex items-center justify-between shadow-lg">
                                <div className="min-w-0 flex-1 pr-3"><p className="text-xs font-black text-slate-200 truncate group-hover:text-white transition-colors">{layer.name}</p><p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter mt-1">{layer.type}</p></div>
                                <button className="text-slate-700 hover:text-microtermix-neon transition-all"><CopyIcon size={14} /></button>
                            </div>
                        ))
                    ) : (<div className="h-80 flex flex-col items-center justify-center text-slate-800 space-y-6 text-center px-10"><Layers size={64} strokeWidth={1} /><p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Selecciona un elemento para inspeccionar sus tokens</p></div>)}
                </div>
            </div>
        </div>
    );
};

const ZeplinLogsView: React.FC = () => {
    const { logs, clearLogs } = useZeplinStore();
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("cURL Copiado"); };
    if (logs.length === 0) return <div className="h-full flex flex-col items-center justify-center text-slate-800 font-black tracking-widest text-[10px]">NO ACTIVITY DETECTED</div>;
    return (
        <div className="h-full flex flex-col bg-[#020617] font-mono">
            <div className="p-4 border-b border-slate-900 bg-slate-900/40 flex items-center justify-between"><span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Debugger: Network Activity</span><Button variant="ghost" size="sm" onClick={clearLogs} className="text-red-500 hover:bg-red-500/10 h-7 text-[10px] font-black px-4">PURGE</Button></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {logs.map(log => (
                    <div key={log.id} className={cn("border rounded-xl overflow-hidden transition-all", (log.responseStatus || 0) >= 400 ? "border-red-900/30 bg-red-950/5" : "border-slate-800/50 bg-slate-900/10")}>
                        <div onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)} className="p-3 flex items-center gap-5 cursor-pointer hover:bg-white/5">
                            <span className={cn("text-[10px] font-black w-12 text-center py-1 rounded-lg", log.method === 'GET' ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400")}>{log.method}</span>
                            <span className={cn("text-[10px] font-black", log.responseStatus === 200 ? "text-green-500" : "text-red-500")}>{log.responseStatus}</span>
                            <p className="text-[11px] text-slate-400 truncate flex-1 font-mono tracking-tight">{log.url.split('/v1')[1]}</p>
                            <ChevronDown size={14} className={cn("text-slate-600 transition-transform", expandedLogId === log.id && "rotate-180")} />
                        </div>
                        {expandedLogId === log.id && (
                            <div className="p-6 bg-black/40 border-t border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center justify-between"><span className="text-[10px] font-black text-slate-500 uppercase">Generated Command</span><Button size="sm" variant="secondary" className="h-8 text-[10px] font-black bg-slate-800 hover:bg-microtermix-neon hover:text-slate-950" onClick={() => copy(log.curl)}>COPY CURL</Button></div>
                                <pre className="text-[10px] text-slate-500 bg-black/50 p-4 rounded-2xl overflow-x-auto whitespace-pre-wrap break-all leading-relaxed border border-slate-800">{log.curl}</pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const ZeplinSettings: React.FC = () => {
    const { accounts, addAccount, removeAccount, setActiveAccount, activeAccountId } = useZeplinStore();
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const [verifying, setVerifying] = useState(false);
    const handleAdd = () => { if (!name || !token) return; addAccount(name, token); setName(''); setToken(''); };
    const handleVerify = async () => { if (!token) return; setVerifying(true); try { await verifyZeplinToken(token); toast.success("Access verified."); } catch (e: any) { toast.error(`Auth Error: ${e.message}`); } finally { setVerifying(false); } };
    return (
        <div className="max-w-2xl space-y-12 py-6">
            <section className="space-y-8">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] px-2">Access Credentials</h3>
                <div className="grid gap-5">
                    {accounts.map(acc => (
                        <div key={acc.id} className="flex items-center justify-between p-6 rounded-[2rem] bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all shadow-2xl">
                            <div className="space-y-1"><p className="text-sm font-black text-white leading-none">{acc.name}</p><p className="text-[10px] text-slate-500 font-mono tracking-tighter">API KEY: ****{acc.token.slice(-4)}</p></div>
                            <div className="flex items-center gap-4">
                                <Button variant={activeAccountId === acc.id ? "default" : "outline"} size="sm" onClick={() => setActiveAccount(acc.id)} className={cn("h-10 rounded-2xl font-black text-[10px] px-6", activeAccountId === acc.id ? "bg-microtermix-neon text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.2)]" : "")}>{activeAccountId === acc.id ? 'ACTIVE' : 'SELECT'}</Button>
                                <Button variant="ghost" size="sm" onClick={() => removeAccount(acc.id)} className="h-10 w-10 rounded-2xl text-red-500 hover:bg-red-500/10 flex items-center justify-center"><Trash2 size={18} /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            <section className="p-10 rounded-[3rem] border-2 border-slate-800 border-dashed bg-slate-900/10 space-y-8 shadow-inner">
                <div className="space-y-2 text-center"><h4 className="text-xl font-black text-white tracking-tighter uppercase">Connect Zeplin</h4><p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Enter your personal access token to sync design flows.</p></div>
                <div className="space-y-5">
                    <Input placeholder="Account Tag (e.g. Work)" value={name} onChange={e => setName(e.target.value)} className="bg-slate-950 border-slate-800 h-14 rounded-3xl px-6 font-black text-xs uppercase tracking-widest" />
                    <div className="flex gap-4">
                        <Input placeholder="Paste PAT Token here..." type="password" value={token} onChange={e => setToken(e.target.value)} className="bg-slate-950 border-slate-800 h-14 rounded-3xl px-6 flex-1 font-mono text-xs" />
                        <Button variant="secondary" onClick={handleVerify} disabled={!token || verifying} className="h-14 rounded-3xl px-8 bg-slate-800 hover:bg-slate-700 text-white font-black text-[10px] tracking-widest">{verifying ? <Loader2 size={20} className="animate-spin" /> : "TEST"}</Button>
                    </div>
                    <Button onClick={handleAdd} className="w-full h-16 bg-microtermix-neon text-slate-950 font-black text-xs uppercase tracking-[0.2em] rounded-3xl shadow-[0_20px_50px_rgba(56,189,248,0.3)] hover:scale-[1.03] active:scale-[0.97] transition-all">ESTABLISH CONNECTION</Button>
                </div>
            </section>
        </div>
    );
};
