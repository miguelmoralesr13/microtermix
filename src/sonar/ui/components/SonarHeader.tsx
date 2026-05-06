import React from 'react';
import { BarChart3, Play, Square, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SonarHeaderProps {
    isRunning: boolean;
    onRun: () => void;
    onStop: () => void;
    canRun: boolean;
    onRefresh?: () => void;
}

export const SonarHeader: React.FC<SonarHeaderProps> = ({ isRunning, onRun, onStop, canRun, onRefresh }) => {
    return (
        <div className="shrink-0 px-6 py-3 border-b border-border flex items-center justify-between bg-card/80 backdrop-blur-md">
            <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                    <BarChart3 size={18} />
                </div>
                <div className="text-left">
                    <h2 className="text-sm font-black text-foreground uppercase tracking-widest leading-none">Sonar Manager</h2>
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Scanner Engine</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {onRefresh && (
                    <Button
                        onClick={onRefresh}
                        variant="outline"
                        size="sm"
                        className="font-black px-4 h-9 rounded-xl text-[10px] tracking-widest"
                    >
                        <RefreshCw size={12} className="mr-2" />
                        REFRESH
                    </Button>
                )}
                <Button
                    onClick={isRunning ? onStop : onRun}
                    disabled={!canRun}
                    variant={isRunning ? "destructive" : "default"}
                    size="sm"
                    className="font-black px-6 h-9 rounded-xl ring-1 ring-white/10 active:scale-95 transition-all text-[10px] tracking-widest"
                >
                    {isRunning ? <Square size={12} className="mr-2 fill-current" /> : <Play size={12} className="mr-2 fill-current" />}
                    {isRunning ? 'STOP' : 'RUN'}
                </Button>
            </div>
        </div>
    );
};
