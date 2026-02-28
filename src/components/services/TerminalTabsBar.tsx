import React from 'react';
import { Square, RotateCcw, X } from 'lucide-react';
import { ProcessState } from '../../context/WorkspaceContext';

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
        <div className="flex bg-slate-900/95 border-b border-slate-800 shrink-0 min-h-[40px] overflow-x-auto overflow-y-hidden">
            <div className="flex shrink-0 items-center gap-0.5 py-1 px-1">
                {processIds.map(serviceId => {
                    const procStatus = activeProcesses[serviceId]?.status;
                    const isRunning = procStatus === 'running';
                    const isError = procStatus === 'error';
                    const isStopped = procStatus === 'stopped';
                    const isActive = activeTerminalTab === serviceId;
                    const tabLabel = serviceId.split('::')[0].split(/[/\\]/).pop() ?? 'term';
                    const scriptLabel = serviceId.includes('::') ? serviceId.split('::')[1]?.trim() : '';

                    const tabStyle = isActive
                        ? isError
                            ? 'border-nexus-danger/50 bg-nexus-danger/10 text-nexus-danger shadow-sm'
                            : isStopped
                                ? 'border-slate-600 bg-slate-800/80 text-slate-400 shadow-sm'
                                : 'border-nexus-neon/50 bg-nexus-darker text-slate-100 shadow-sm'
                        : isError
                            ? 'border-slate-700/80 text-slate-400 hover:bg-nexus-danger/10 hover:text-nexus-danger hover:border-nexus-danger/30'
                            : isStopped
                                ? 'border-slate-700/80 text-slate-500 hover:bg-slate-800 hover:text-slate-400 hover:border-slate-600'
                                : 'border-slate-700/80 text-slate-500 hover:bg-slate-800 hover:text-slate-300 hover:border-slate-600';

                    return (
                        <div
                            key={serviceId}
                            onClick={() => onTabSelect(serviceId)}
                            className={`group flex shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 min-w-[100px] max-w-[180px] cursor-pointer transition-all duration-150 ${tabStyle}`}
                        >
                            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                <span className="truncate text-xs font-semibold" title={tabLabel}>{tabLabel}</span>
                                {scriptLabel && (
                                    <span className="truncate text-[10px] opacity-80" title={scriptLabel}>{scriptLabel}</span>
                                )}
                                {isRunning && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-nexus-success animate-pulse" />}
                                {isError && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-nexus-danger" />}
                                {isStopped && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-slate-500" title="Parado" />}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-600/50 pl-2">
                                {isRunning && (
                                    <button
                                        onClick={(e) => onTabStop(e, serviceId)}
                                        className="rounded p-0.5 text-slate-500 hover:text-amber-400 hover:bg-slate-700 transition-colors"
                                        title="Parar proceso (mantener pestaña)"
                                    >
                                        <Square size={12} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => onTabRestart(e, serviceId)}
                                    className={`rounded p-0.5 transition-colors ${isError ? 'text-nexus-danger hover:bg-nexus-danger/20' : 'text-slate-500 hover:text-nexus-success hover:bg-slate-700'}`}
                                    title="Reiniciar"
                                >
                                    <RotateCcw size={12} />
                                </button>
                                <button
                                    onClick={(e) => onTabClose(e, serviceId)}
                                    className="rounded p-0.5 text-slate-500 hover:text-nexus-danger hover:bg-slate-700 transition-colors"
                                    title="Cerrar pestaña"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
