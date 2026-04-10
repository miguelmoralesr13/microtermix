import React from 'react';
import { DockerContainer } from '@/hooks/useDocker';
import { ContainerActions } from './ContainerActions';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Box } from 'lucide-react';

interface ContainerRowProps {
    container: DockerContainer;
}

export const ContainerRow: React.FC<ContainerRowProps> = ({ container }) => {
    const isRunning = container.state === 'running';

    return (
        <tr className="bg-slate-900/40 border border-slate-800 hover:bg-slate-800/60 transition-all group">
            <td className="py-2.5 px-3 rounded-l-lg border-y border-l border-slate-800 group-hover:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 shrink-0">
                        <Box size={14} className={isRunning ? 'text-microtermix-neon' : 'text-slate-500'} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-200 truncate" title={container.name}>
                            {container.name}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-500">
                            <span className="text-microtermix-accent">{container.id.substring(0, 12)}</span>
                        </div>
                    </div>
                </div>
            </td>
            <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700">
                <Badge variant="outline" className="bg-slate-950 border-slate-800 text-slate-400 font-mono text-[9px] h-5 px-1.5 truncate">
                    {container.image}
                </Badge>
            </td>
            <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700">
                <span className="font-mono text-[10px] text-slate-400 truncate block font-medium" title={container.ports || 'Ninguno'}>
                    {container.ports || '---'}
                </span>
            </td>
            <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700 w-32">
                <span className="text-[10px] text-slate-500 tracking-tight truncate block">
                    {container.status}
                </span>
            </td>
            <td className="py-2.5 px-3 border-y border-slate-800 group-hover:border-slate-700">
                <div className="flex items-center gap-1.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full", isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-500")} />
                    <span className={cn("text-[10px] font-bold uppercase tracking-tighter", isRunning ? "text-emerald-500/80" : "text-slate-500")}>
                        {container.state}
                    </span>
                </div>
            </td>
            <td className="py-2.5 px-3 rounded-r-lg border-y border-r border-slate-800 group-hover:border-slate-700">
                <ContainerActions container={container} />
            </td>
        </tr>
    );
};
