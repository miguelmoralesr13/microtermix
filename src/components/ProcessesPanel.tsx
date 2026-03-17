import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Trash2, Globe, Activity, Info, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { cn } from '../lib/utils';

export interface ListeningProcess {
    proto: string;
    localAddress: string;
    foreignAddress: string;
    state: string;
    pid: number;
    name: string;
    path: string;
    serviceId: string | null;
}

export const ProcessesPanel: React.FC = () => {
    const [killing, setKilling] = useState<number | null>(null);
    const [techFilter, setTechFilter] = useState<'all' | 'node' | 'java' | 'web'>('all');
    const [confirmKill, setConfirmConfirmKill] = useState<{ pid: number; name: string } | null>(null);

    const { data: allProcesses = [], isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['listening-processes'],
        queryFn: () => invoke<ListeningProcess[]>('get_listening_processes'),
        refetchInterval: 10000,
    });

    const processes = useMemo(() => {
        if (techFilter === 'all') return allProcesses;
        return allProcesses.filter(p => {
            const name = p.name.toLowerCase();
            const path = p.path.toLowerCase();
            const sid = (p.serviceId || '').toLowerCase();
            const port = p.localAddress.split(':').pop() || '';

            if (techFilter === 'node') {
                return name.includes('node') || path.includes('node') || sid.includes('node');
            }
            if (techFilter === 'java') {
                return name.includes('java') || path.includes('java') || sid.includes('java');
            }
            if (techFilter === 'web') {
                return ['80', '443', '3000', '8080', '5173', '4200', '3001'].includes(port);
            }
            return true;
        });
    }, [allProcesses, techFilter]);

    const handleKill = async (pid: number) => {
        setKilling(pid);
        try {
            await invoke('kill_process_by_pid', { pid });
            refetch();
        } catch (e) {
            console.error('Failed to kill process:', e);
        } finally {
            setKilling(null);
            setConfirmConfirmKill(null);
        }
    };

    const openInBrowser = (localAddress: string) => {
        // Extract port from address like "0.0.0.0:3000" or "[::]:3000"
        const port = localAddress.split(':').pop();
        if (port) {
            const url = `http://localhost:${port}`;
            invoke('open_in_editor', { path: url }).catch(() => {
                window.open(url, '_blank');
            });
        }
    };

    const isLocalhost = (addr: string) => {
        return addr.startsWith('0.0.0.0') || addr.startsWith('127.0.0.1') || addr.startsWith('[::]') || addr.startsWith('localhost');
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-950">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-microtermix-neon/10 rounded-lg">
                        <Activity size={18} className="text-microtermix-neon" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-100">Procesos en Escucha</h2>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Análisis de red en tiempo real</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 mr-2">
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setTechFilter('all')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight", techFilter === 'all' ? "bg-slate-800 text-white" : "text-slate-500")}
                        >
                            Todos
                        </Button>
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setTechFilter('node')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight", techFilter === 'node' ? "bg-slate-800 text-microtermix-neon" : "text-slate-500")}
                        >
                            Node.js
                        </Button>
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setTechFilter('java')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight", techFilter === 'java' ? "bg-slate-800 text-microtermix-neon" : "text-slate-500")}
                        >
                            Java
                        </Button>
                        <Button
                            variant="ghost" size="xs"
                            onClick={() => setTechFilter('web')}
                            className={cn("h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight", techFilter === 'web' ? "bg-slate-800 text-microtermix-neon" : "text-slate-500")}
                        >
                            Web
                        </Button>
                    </div>

                    {isFetching && !isLoading && (
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-500 animate-pulse">
                            <RefreshCw size={10} className="animate-spin" /> Actualizando...
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
                        Refrescar
                    </Button>
                </div>
            </div>

            {error && (
                <div className="m-4 p-3 rounded-lg bg-microtermix-danger/10 border border-microtermix-danger/20 text-microtermix-danger text-xs flex items-center gap-2">
                    <Activity size={14} />
                    <span>Error al obtener procesos: {(error as Error).message}</span>
                </div>
            )}

            <div className="flex-1 overflow-auto scrollbar-hide px-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
                        <Loader2 size={32} className="animate-spin text-microtermix-neon/40" />
                        <span className="text-sm font-medium animate-pulse">Analizando puertos del sistema...</span>
                    </div>
                ) : processes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-2 text-center">
                        <Info size={40} className="opacity-20 mb-2" />
                        <p className="text-sm font-medium text-slate-400">No se detectaron servicios en escucha.</p>
                        <p className="text-xs max-w-xs leading-relaxed opacity-60">
                            Esto puede deberse a falta de permisos o a que no hay servidores TCP activos actualmente.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-xs border-separate border-spacing-y-1.5 mt-2">
                        <thead>
                            <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                                <th className="text-left py-2 px-3">Aplicación / PID</th>
                                <th className="text-left py-2 px-3">Protocolo</th>
                                <th className="text-left py-2 px-3">Local (Puerto)</th>
                                <th className="text-left py-2 px-3">Estado</th>
                                <th className="w-24 px-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {processes.map((proc) => {
                                const localhost = isLocalhost(proc.localAddress);
                                return (
                                    <tr
                                        key={`${proc.pid}-${proc.localAddress}-${proc.proto}`}
                                        className="bg-slate-900/40 border border-slate-800 hover:bg-slate-800/60 transition-all group"
                                    >
                                        <td className="py-2.5 px-3 rounded-l-lg border-y border-l border-slate-800 group-hover:border-slate-700">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 shrink-0">
                                                    <span className="text-[10px] font-bold text-microtermix-neon/70">{proc.name[0]?.toUpperCase() || '?'}</span>
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-200 truncate max-w-[180px]" title={proc.path}>
                                                            {proc.name === 'unknown' ? 'Proceso desconocido' : proc.name}
                                                        </span>
                                                        {proc.serviceId && (
                                                            <Tooltip>
                                                                <TooltipTrigger render={
                                                                    <Badge className="bg-microtermix-neon text-microtermix-darker border-none text-[8px] h-4 px-1 font-black animate-pulse">
                                                                        Microtermix
                                                                    </Badge>
                                                                } />
                                                                <TooltipContent>Servicio gestionado por Microtermix: {proc.serviceId}</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-500">
                                                        <span className="text-microtermix-accent">PID: {proc.pid}</span>
                                                        {proc.pid > 0 && proc.path !== 'unknown' && (
                                                            <span className="truncate max-w-[120px] opacity-50 hidden md:block">· {proc.path}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700">
                                            <Badge variant="outline" className="bg-slate-950 border-slate-800 text-slate-400 font-mono text-[9px] h-5 px-1.5">
                                                {proc.proto.toUpperCase()}
                                            </Badge>
                                        </td>
                                        <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700">
                                            <div className="flex flex-col">
                                                <span className={cn("font-mono text-[11px]", localhost ? "text-microtermix-neon" : "text-slate-300")}>
                                                    {proc.localAddress}
                                                </span>
                                                {localhost && (
                                                    <span className="text-[9px] text-slate-500 font-sans tracking-tight">Local Loopback</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-tighter">LISTENING</span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 rounded-r-lg border-y border-r border-slate-800 group-hover:border-slate-700">
                                            <div className="flex items-center justify-end gap-1">
                                                {localhost && (
                                                    <Tooltip>
                                                        <TooltipTrigger render={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-xs"
                                                                onClick={() => openInBrowser(proc.localAddress)}
                                                                className="text-slate-500 hover:text-microtermix-neon hover:bg-microtermix-neon/10"
                                                            >
                                                                <Globe size={14} />
                                                            </Button>
                                                        } />
                                                        <TooltipContent>Abrir en navegador (localhost)</TooltipContent>
                                                    </Tooltip>
                                                )}

                                                <Tooltip>
                                                    <TooltipTrigger render={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            onClick={() => setConfirmConfirmKill({ pid: proc.pid, name: proc.name })}
                                                            disabled={killing === proc.pid || proc.pid === 0}
                                                            className="text-slate-500 hover:text-microtermix-danger hover:bg-microtermix-danger/10 transition-all"
                                                        >
                                                            {killing === proc.pid ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                        </Button>
                                                    } />
                                                    <TooltipContent>{proc.pid === 0 ? 'Sistema (protegido)' : 'Terminar proceso'}</TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Confirmation Modal */}
            <Dialog open={!!confirmKill} onOpenChange={(open) => !open && setConfirmConfirmKill(null)}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-microtermix-danger">
                            <Trash2 size={18} /> Confirmar terminación
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 pt-2">
                            ¿Estás seguro de que deseas terminar el proceso <strong className="text-white">{confirmKill?.name}</strong> con PID <strong className="text-microtermix-accent">{confirmKill?.pid}</strong>?
                            <br /><br />
                            Esta acción forzará el cierre de la aplicación y podría causar pérdida de datos no guardados.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 pt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmConfirmKill(null)}
                            className="text-slate-400 hover:text-white"
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => confirmKill && handleKill(confirmKill.pid)}
                            disabled={!!killing}
                            className="bg-red-600 hover:bg-red-700 font-bold"
                        >
                            {killing ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                            Terminar Proceso
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
