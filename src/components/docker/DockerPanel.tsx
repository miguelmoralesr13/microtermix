import React, { useRef } from 'react';
import { useDockerStore } from '@/stores/dockerStore';
import { useDockerContainers, useDockerImages, useDockerVolumes } from '@/hooks/useDocker';
import { ContainerList } from './ContainerList';
import { NetworkList } from './NetworkList';
import { ContainerFileExplorer } from './ContainerFileExplorer';
import { Box, Layers, HardDrive, RefreshCw, Globe, X, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SiDocker } from 'react-icons/si';
import { TerminalView } from '@/components/services/TerminalView';
import { DockerFileViewer } from './DockerFileViewer';

import { DockerInspectModal } from './DockerInspectModal';

const ImageList: React.FC = () => {
    const { data: images = [], isLoading } = useDockerImages();
    const { setInspectResourceId } = useDockerStore();

    if (isLoading) return <div className="flex justify-center p-12 text-slate-500 animate-pulse text-xs"><RefreshCw className="animate-spin mr-2" size={14}/>Cargando imágenes...</div>;
    if (images.length === 0) return <div className="p-8 text-center text-slate-500 italic text-xs">No hay imágenes.</div>;
    return (
        <div className="flex-1 overflow-auto scrollbar-hide px-4 pt-2 pb-6">
            <table className="w-full text-xs border-separate border-spacing-y-1.5">
                <thead>
                    <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest bg-slate-900/50">
                        <th className="text-left py-2 px-3 rounded-l-lg">Repositorio</th>
                        <th className="text-left py-2 px-3">Tag</th>
                        <th className="text-left py-2 px-3">Size</th>
                        <th className="text-left py-2 px-3">Creado</th>
                        <th className="text-left py-2 px-3 rounded-r-lg">ID</th>
                    </tr>
                </thead>
                <tbody>
                    {images.map(img => (
                        <tr 
                            key={img.id} 
                            onClick={() => setInspectResourceId(img.id)}
                            className="bg-slate-900/40 border border-slate-800 hover:bg-[#0f172a] hover:border-blue-500/20 transition-all cursor-pointer group"
                        >
                            <td className="py-2.5 px-3 rounded-l-lg font-bold text-slate-300 group-hover:text-white transition-colors">{img.repository}</td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-microtermix-neon">{img.tag}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">{img.size}</td>
                            <td className="py-2.5 px-3 text-slate-500 text-[10px]">{img.createdSince}</td>
                            <td className="py-2.5 px-3 rounded-r-lg font-mono text-[10px] text-slate-600 group-hover:text-slate-400">{img.id.substring(0, 12)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const VolumeList: React.FC = () => {
    const { data: volumes = [], isLoading } = useDockerVolumes();
    if (isLoading) return <div className="flex justify-center p-12 text-slate-500 animate-pulse text-xs"><RefreshCw className="animate-spin mr-2" size={14}/>Cargando volúmenes...</div>;
    if (volumes.length === 0) return <div className="p-8 text-center text-slate-500 italic text-xs">No hay volúmenes.</div>;
    return (
        <div className="flex-1 overflow-auto scrollbar-hide px-4 pt-2 pb-6">
            <table className="w-full text-xs border-separate border-spacing-y-1.5">
                <thead>
                    <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest bg-slate-900/50">
                        <th className="text-left py-2 px-3 rounded-l-lg">Nombre</th>
                        <th className="text-left py-2 px-3 rounded-r-lg">Driver</th>
                    </tr>
                </thead>
                <tbody>
                    {volumes.map(vol => (
                        <tr key={vol.name} className="bg-slate-900/40 border border-slate-800 hover:bg-slate-800/60 transition-all">
                            <td className="py-2.5 px-3 rounded-l-lg font-bold text-slate-300 font-mono text-[10px]">{vol.name}</td>
                            <td className="py-2.5 px-3 rounded-r-lg text-microtermix-accent text-[10px]">{vol.driver}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const DockerPanel: React.FC = () => {
    const { 
        activeTab, setActiveTab, 
        viewMode, setViewMode,
        activeServiceId, setActiveServiceId,
        bottomPanelHeight, setBottomPanelHeight
    } = useDockerStore();
    const { isFetching, isLoading, refetch } = useDockerContainers();

    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);

    const onResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const onMove = (ev: MouseEvent) => {
            if (!draggingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const newH = Math.min(600, Math.max(150, rect.bottom - ev.clientY));
            setBottomPanelHeight(newH);
        };
        const onUp = () => {
            draggingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const closeBottomPanel = () => {
        setViewMode('list');
        setActiveServiceId(null);
    };

    return (
        <div ref={containerRef} className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-950 relative">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                        <SiDocker size={18} className="text-blue-500" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-100">Docker Manager</h2>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Local Resources (Orbstack / Docker Desktop)</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Tabs nav */}
                    <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 mr-2">
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setActiveTab('containers')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold tracking-tight gap-2", activeTab === 'containers' ? "bg-slate-800 text-white" : "text-slate-500")}
                        >
                            <Box size={12} /> Contenedores
                        </Button>
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setActiveTab('images')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold tracking-tight gap-2", activeTab === 'images' ? "bg-slate-800 text-white" : "text-slate-500")}
                        >
                            <Layers size={12} /> Imágenes
                        </Button>
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setActiveTab('volumes')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold tracking-tight gap-2", activeTab === 'volumes' ? "bg-slate-800 text-white" : "text-slate-500")}
                        >
                            <HardDrive size={12} /> Volúmenes
                        </Button>
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setActiveTab('networks')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold tracking-tight gap-2", activeTab === 'networks' ? "bg-slate-800 text-white" : "text-slate-500")}
                        >
                            <Globe size={12} /> Redes
                        </Button>
                    </div>

                    {isFetching && !isLoading && (
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-500 animate-pulse">
                            <RefreshCw size={10} className="animate-spin" />
                        </span>
                    )}
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={() => refetch()}
                        disabled={isLoading}
                        className="h-8 gap-2 bg-slate-900 border-slate-800 hover:bg-slate-800"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            {/* Main Area (Top Panel) */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'containers' && <ContainerList />}
                {activeTab === 'images' && <ImageList />}
                {activeTab === 'volumes' && <VolumeList />}
                {activeTab === 'networks' && <NetworkList />}
            </div>

            {/* Bottom Panel (Integrated Terminal/Logs) */}
            {activeServiceId && (viewMode === 'terminal' || viewMode === 'logs') && (
                <div 
                    className="flex flex-col border-t border-slate-800 bg-slate-950 shrink-0"
                    style={{ height: bottomPanelHeight }}
                >
                    {/* Resize Handle */}
                    <div 
                        onMouseDown={onResizeStart}
                        className="h-1 w-full cursor-row-resize bg-slate-800 hover:bg-blue-500/50 transition-colors flex items-center justify-center group"
                    >
                        <GripHorizontal size={12} className="text-slate-700 group-hover:text-blue-500/50 opacity-0 group-hover:opacity-100" />
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/80 border-b border-slate-800 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <SiDocker size={12} className="text-blue-500" />
                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                    {viewMode === 'terminal' ? 'Terminal Interactiva' : 'Streaming de Logs'}
                                </span>
                            </div>
                            <div className="h-3 w-px bg-slate-800" />
                            <span className="text-[10px] font-mono text-slate-500">
                                {activeServiceId}
                            </span>
                        </div>
                        <Button 
                            variant="ghost" size="icon-xs" 
                            onClick={closeBottomPanel}
                            className="h-6 w-6 text-slate-500 hover:text-white"
                        >
                            <X size={14} />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-h-0 p-2">
                        <TerminalView key={activeServiceId} serviceId={activeServiceId} />
                    </div>
                </div>
            )}

            <ContainerFileExplorer />
            <DockerFileViewer />
            <DockerInspectModal />
        </div>
    );
};
