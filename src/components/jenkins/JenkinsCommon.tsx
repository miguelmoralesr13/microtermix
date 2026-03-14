import {  colorFromJobColor, BuildResult, StageStatus } from '../../services/jenkinsApi';
import { CheckCircle2, AlertCircle, Loader2, AlertTriangle, Square, XCircle, MinusCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ResultBadge({ result, building }: { result: BuildResult; building: boolean }) {
    
    // Mapeo de estilos tipo shadcn
    const variants: Record<string, string> = {
        'SUCCESS': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        'FAILURE': 'bg-red-500/10 text-red-500 border-red-500/20',
        'UNSTABLE': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        'ABORTED': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
        'RUNNING': 'bg-sky-500/10 text-sky-400 border-sky-500/20 animate-pulse-slow',
    };

    const variant = building ? 'RUNNING' : (result ?? 'UNKNOWN');
    const styleClass = variants[variant] || 'bg-slate-800 text-slate-400 border-slate-700';

    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap",
            styleClass
        )}>
            {building && <Loader2 size={10} className="animate-spin" />}
            {!building && result === 'SUCCESS' && <CheckCircle2 size={10} />}
            {!building && result === 'FAILURE' && <XCircle size={10} />}
            {!building && result === 'ABORTED' && <MinusCircle size={10} />}
            {variant}
        </span>
    );
}

export function JobColorDot({ color }: { color: string }) {
    const c = colorFromJobColor(color);
    const animate = color?.endsWith('_anime');
    return (
        <div className="relative flex items-center justify-center">
            {animate && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
            )}
            <span
                className={cn(
                    "relative inline-block w-2.5 h-2.5 rounded-full shrink-0 shadow-sm",
                    animate ? "bg-sky-400" : ""
                )}
                style={!animate ? { backgroundColor: c } : {}}
            />
        </div>
    );
}

export const STAGE_COLORS: Record<StageStatus, string> = {
    SUCCESS:      '#22c55e',
    FAILED:       '#ef4444',
    IN_PROGRESS:  '#38bdf8',
    PAUSED:       '#f59e0b',
    NOT_EXECUTED: '#475569',
    UNSTABLE:     '#f59e0b',
    ABORTED:      '#6b7280',
};

export function JenkinsStageIcon({ status, size = 12 }: { status: StageStatus, size?: number }) {
    const color = STAGE_COLORS[status] ?? '#475569';
    switch (status) {
        case 'SUCCESS':
            return <CheckCircle2 size={size} style={{ color }} />;
        case 'FAILED':
            return <AlertCircle size={size} style={{ color }} />;
        case 'IN_PROGRESS':
            return <Loader2 size={size} style={{ color }} className="animate-spin" />;
        case 'PAUSED':
            return <AlertTriangle size={size} style={{ color }} />;
        case 'ABORTED':
            return <Square size={size} style={{ color }} />;
        default:
            return <div style={{ width: size, height: size, borderRadius: '50%', border: `1.5px solid ${color}`, flexShrink: 0 }} />;
    }
}
