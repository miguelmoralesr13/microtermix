import React from 'react';
import { TerminalSquare, ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Log {
    id: string;
    timestamp: string;
    type: string;
    message: string;
}

interface SonarActivityConsoleProps {
    isOpen: boolean;
    onToggle: () => void;
    logs: Log[];
}

export const SonarActivityConsole: React.FC<SonarActivityConsoleProps> = ({ 
    isOpen, 
    onToggle, 
    logs 
}) => {
    return (
        <div className={cn(
            "shrink-0 border-t border-border bg-card transition-all flex flex-col",
            isOpen ? "h-40" : "h-8"
        )}>
            <div
                onClick={onToggle}
                className="h-8 px-5 flex items-center justify-between cursor-pointer flex-shrink-0 bg-muted/20 hover:bg-muted/40 transition-colors border-b border-border"
            >
                <div className="flex items-center gap-2">
                    <TerminalSquare size={12} className={cn("transition-colors", isOpen ? 'text-blue-400' : 'text-muted-foreground')} />
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">Scanner Activity Monitor</span>
                </div>
                <ChevronDown size={14} className={cn("text-muted-foreground transition-transform duration-300", isOpen ? "" : "rotate-180")} />
            </div>
            {isOpen && (
                <div className="flex-1 overflow-y-auto p-4 font-mono text-[9px] bg-background space-y-1.5 scrollbar-hide shadow-inner">
                    {logs.length === 0 ? (
                        <div className="text-muted-foreground italic uppercase tracking-widest text-[8px] flex items-center justify-center h-full opacity-30">No activity logged</div>
                    ) : logs.map(l => (
                        <div key={l.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                            <span className="text-muted-foreground/50 shrink-0 select-none">[{l.timestamp}]</span>
                            <span className={cn("font-black uppercase w-12 text-center rounded px-1 py-0.5",
                                l.type === 'error' ? 'bg-red-500/10 text-red-500' :
                                l.type === 'cmd' ? 'bg-emerald-500/10 text-emerald-500' :
                                'bg-blue-500/10 text-blue-500'
                            )}>{l.type}</span>
                            <span className="text-muted-foreground flex-1 truncate text-left">{l.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
