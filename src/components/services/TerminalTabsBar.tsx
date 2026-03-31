import { Square, RotateCcw, X } from 'lucide-react';
import { ProcessState } from '../../stores/processStore';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';

interface TerminalTabsBarProps {
    processIds: string[];
    activeProcesses: Record<string, ProcessState>;
    activeTerminalTab: string | null;
    onTabSelect: (id: string) => void;
    onTabStop: (e: React.MouseEvent, id: string) => void;
    onTabRestart: (e: React.MouseEvent, id: string) => void;
    onTabClose: (e: React.MouseEvent, id: string) => void;
    onTabCloseAll: () => void;
    onTabCloseFinished: () => void;
}

export const TerminalTabsBar: React.FC<TerminalTabsBarProps> = ({
    processIds,
    activeProcesses,
    activeTerminalTab,
    onTabSelect,
    onTabStop,
    onTabRestart,
    onTabClose,
    onTabCloseAll,
    onTabCloseFinished,
}) => {
    if (processIds.length === 0) return null;

    return (
        <div className="flex bg-slate-900/95 border-b border-slate-800 shrink-0 overflow-x-auto overflow-y-hidden">
            <div className="flex shrink-0 items-stretch gap-0 px-1">
                {processIds.map(serviceId => {
                    const procStatus = activeProcesses[serviceId]?.status;
                    const isRunning = procStatus === 'running';
                    const isError = procStatus === 'error';
                    const isStopped = procStatus === 'stopped';
                    const isActive = activeTerminalTab === serviceId;
                    const tabLabel = serviceId.split('::')[0].split(/[/\\]/).pop() ?? 'term';
                    const scriptLabel = serviceId.includes('::') ? serviceId.split('::')[1]?.trim() : '';

                    return (
                        <ContextMenu key={serviceId}>
                            <ContextMenuTrigger>
                                <TooltipProvider delay={400}>
                                    <div
                                        onClick={() => onTabSelect(serviceId)}
                                        onDoubleClick={onTabCloseFinished}
                                        onAuxClick={(e) => {
                                            if (e.button === 1) { // Middle button
                                                e.preventDefault();
                                                onTabClose(e as any, serviceId);
                                            }
                                        }}
                                        className={cn(
                                            'group flex shrink-0 items-center gap-2 px-3 py-2 min-w-[110px] max-w-[220px]',
                                            'cursor-pointer border-b-2 transition-all duration-150 select-none relative',
                                            isActive
                                                ? cn(
                                                    'border-microtermix-neon bg-slate-900',
                                                    isError && 'border-red-400',
                                                    isStopped && 'border-slate-600',
                                                )
                                                : 'border-transparent hover:bg-slate-800/40 hover:border-slate-700',
                                        )}
                                        title="Doble clic para limpiar terminales terminadas"
                                    >
                                        {/* Status dot */}
                                        <span className={cn(
                                            'w-1.5 h-1.5 shrink-0 rounded-full',
                                            isRunning && 'bg-emerald-400 animate-pulse',
                                            isError && 'bg-red-400',
                                            isStopped && 'bg-slate-500',
                                            !isRunning && !isError && !isStopped && 'bg-slate-600',
                                        )} />

                                        {/* Label */}
                                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                            <span className={cn(
                                                'truncate text-[11px] font-bold tracking-tight',
                                                isActive && !isError && !isStopped && 'text-slate-100',
                                                isActive && isError && 'text-red-400',
                                                isActive && isStopped && 'text-slate-400',
                                                !isActive && 'text-slate-500 group-hover:text-slate-300',
                                            )}>
                                                {tabLabel}
                                            </span>
                                            {scriptLabel && (
                                                <span className="truncate text-[9px] text-slate-600 group-hover:text-slate-500 leading-none mt-0.5">{scriptLabel}</span>
                                            )}
                                        </div>

                                        {/* Botón de cierre rápido — siempre discreto pero disponible */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onTabClose(e, serviceId); }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded-md transition-all text-slate-600 hover:text-red-400"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                </TooltipProvider>
                            </ContextMenuTrigger>

                            <ContextMenuContent className="w-52 bg-[#0a0c10] border-slate-800 shadow-2xl">
                                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">
                                    {tabLabel}
                                </div>
                                <ContextMenuItem 
                                    onClick={() => { const e = { stopPropagation: () => {}, preventDefault: () => {} } as any; onTabRestart(e, serviceId); }}
                                    className="gap-2 text-emerald-400 hover:bg-emerald-400/10"
                                >
                                    <RotateCcw size={14} />
                                    <span>Reiniciar Servicio</span>
                                </ContextMenuItem>
                                
                                {isRunning && (
                                    <ContextMenuItem 
                                        onClick={() => { const e = { stopPropagation: () => {}, preventDefault: () => {} } as any; onTabStop(e, serviceId); }}
                                        className="gap-2 text-amber-400 hover:bg-amber-400/10"
                                    >
                                        <Square size={14} />
                                        <span>Detener Proceso</span>
                                    </ContextMenuItem>
                                )}
                                
                                <ContextMenuSeparator />
                                
                                <ContextMenuItem 
                                    onClick={() => { const e = { stopPropagation: () => {}, preventDefault: () => {} } as any; onTabClose(e, serviceId); }}
                                    className="gap-2 text-red-500 hover:bg-red-500/10"
                                >
                                    <X size={14} />
                                    <span>Cerrar Terminal</span>
                                </ContextMenuItem>
                                
                                <ContextMenuSeparator />
                                
                                <ContextMenuItem 
                                    onClick={onTabCloseFinished}
                                    className="gap-2 text-slate-300"
                                >
                                    <Square size={14} className="opacity-50" />
                                    <span>Cerrar Terminadas</span>
                                </ContextMenuItem>
                                
                                <ContextMenuItem 
                                    onClick={onTabCloseAll}
                                    className="gap-2 text-red-400/80 hover:text-red-400"
                                >
                                    <X size={14} className="opacity-50" />
                                    <span>Cerrar Todas</span>
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    );
                })}
            </div>
        </div>
    );
};
