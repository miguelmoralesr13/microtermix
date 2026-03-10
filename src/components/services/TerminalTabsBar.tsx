import React from 'react';
import { Square, RotateCcw, X } from 'lucide-react';
import { ProcessState } from '../../context/WorkspaceContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TerminalTabsBarProps {
    processIds: string[];
    activeProcesses: Record<string, ProcessState>;
    activeTerminalTab: string | null;
    onTabSelect: (id: string) => void;
    onTabStop: (e: React.MouseEvent, id: string) => void;
    onTabRestart: (e: React.MouseEvent, id: string) => void;
    onTabClose: (e: React.MouseEvent, id: string) => void;
}

export const TerminalTabsBar: React.FC<TerminalTabsBarProps> = ({
    processIds,
    activeProcesses,
    activeTerminalTab,
    onTabSelect,
    onTabStop,
    onTabRestart,
    onTabClose,
}) => {
    if (processIds.length === 0) return null;

    return (
        <div className="flex bg-slate-900/95 border-b border-slate-800 shrink-0 overflow-x-auto overflow-y-hidden">
            <div className="flex shrink-0 items-stretch gap-0 px-1">
                {processIds.map(serviceId => {
                    const procStatus = activeProcesses[serviceId]?.status;
                    const isRunning = procStatus === 'running';
                    const isError   = procStatus === 'error';
                    const isStopped = procStatus === 'stopped';
                    const isActive  = activeTerminalTab === serviceId;
                    const tabLabel  = serviceId.split('::')[0].split(/[/\\]/).pop() ?? 'term';
                    const scriptLabel = serviceId.includes('::') ? serviceId.split('::')[1]?.trim() : '';

                    return (
                        <TooltipProvider delay={400} key={serviceId}>
                            <div
                                onClick={() => onTabSelect(serviceId)}
                                className={cn(
                                    'group flex shrink-0 items-center gap-2 px-3 py-2 min-w-[110px] max-w-[200px]',
                                    'cursor-pointer border-b-2 transition-all duration-150 select-none',
                                    isActive
                                        ? cn(
                                            'border-nexus-neon bg-slate-900',
                                            isError   && 'border-red-400',
                                            isStopped && 'border-slate-600',
                                        )
                                        : 'border-transparent hover:bg-slate-800/60 hover:border-slate-600',
                                )}
                            >
                                {/* Status dot */}
                                <span className={cn(
                                    'w-1.5 h-1.5 shrink-0 rounded-full',
                                    isRunning && 'bg-emerald-400 animate-pulse',
                                    isError   && 'bg-red-400',
                                    isStopped && 'bg-slate-500',
                                    !isRunning && !isError && !isStopped && 'bg-slate-600',
                                )} />

                                {/* Label */}
                                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                    <span className={cn(
                                        'truncate text-xs font-semibold',
                                        isActive && !isError && !isStopped && 'text-slate-100',
                                        isActive && isError   && 'text-red-400',
                                        isActive && isStopped && 'text-slate-400',
                                        !isActive && 'text-slate-500 group-hover:text-slate-300',
                                    )}>
                                        {tabLabel}
                                    </span>
                                    {scriptLabel && (
                                        <span className="truncate text-[10px] text-slate-500">{scriptLabel}</span>
                                    )}
                                </div>

                                {/* Actions — visibles solo en hover */}
                                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isRunning && (
                                        <Tooltip>
                                            <TooltipTrigger render={
                                                <Button
                                                    variant="ghost" size="icon-xs"
                                                    onClick={(e) => { e.stopPropagation(); onTabStop(e, serviceId); }}
                                                    className="text-slate-500 hover:text-amber-400"
                                                />
                                            }>
                                                <Square size={11} />
                                            </TooltipTrigger>
                                            <TooltipContent>Parar proceso</TooltipContent>
                                        </Tooltip>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger render={
                                            <Button
                                                variant="ghost" size="icon-xs"
                                                onClick={(e) => { e.stopPropagation(); onTabRestart(e, serviceId); }}
                                                className={cn(
                                                    isError ? 'text-red-400 hover:bg-red-900/30' : 'text-slate-500 hover:text-emerald-400',
                                                )}
                                            />
                                        }>
                                            <RotateCcw size={11} />
                                        </TooltipTrigger>
                                        <TooltipContent>Reiniciar</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger render={
                                            <Button
                                                variant="ghost" size="icon-xs"
                                                onClick={(e) => { e.stopPropagation(); onTabClose(e, serviceId); }}
                                                className="text-slate-500 hover:text-red-400"
                                            />
                                        }>
                                            <X size={11} />
                                        </TooltipTrigger>
                                        <TooltipContent>Cerrar</TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        </TooltipProvider>
                    );
                })}
            </div>
        </div>
    );
};
