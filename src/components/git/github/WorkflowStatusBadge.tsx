import React from 'react';
import {
    Clock,
    Loader2,
    CheckCircle2,
    XCircle,
    Ban,
    SkipForward,
    AlertCircle,
    MinusCircle,
    HelpCircle,
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import { WorkflowRunStatus, WorkflowRunConclusion } from '../../../services/githubApi';

interface WorkflowStatusBadgeProps {
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion;
}

interface StatusConfig {
    label: string;
    className: string;
    Icon: React.ElementType;
    pulse?: boolean;
}

function resolveStatusConfig(status: WorkflowRunStatus, conclusion: WorkflowRunConclusion): StatusConfig {
    if (status === 'in_progress') {
        return {
            label: 'In progress',
            className: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
            Icon: Loader2,
            pulse: true,
        };
    }
    if (status !== 'completed') {
        return {
            label: status === 'queued' ? 'Queued'
                : status === 'waiting' ? 'Waiting'
                : status === 'pending' ? 'Pending'
                : 'Requested',
            className: 'bg-slate-700/40 text-slate-300 border-slate-600',
            Icon: Clock,
        };
    }
    // completed — resolve by conclusion
    switch (conclusion) {
        case 'success':
            return { label: 'Success', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', Icon: CheckCircle2 };
        case 'failure':
            return { label: 'Failure', className: 'bg-red-500/15 text-red-300 border-red-500/40', Icon: XCircle };
        case 'cancelled':
            return { label: 'Cancelled', className: 'bg-slate-500/15 text-slate-300 border-slate-500/40', Icon: Ban };
        case 'skipped':
            return { label: 'Skipped', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30', Icon: SkipForward };
        case 'timed_out':
            return { label: 'Timed out', className: 'bg-red-500/15 text-red-300 border-red-500/40', Icon: Clock };
        case 'action_required':
            return { label: 'Action required', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40', Icon: AlertCircle };
        case 'neutral':
            return { label: 'Neutral', className: 'bg-slate-500/15 text-slate-300 border-slate-500/40', Icon: MinusCircle };
        case 'stale':
            return { label: 'Stale', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30', Icon: Clock };
        default:
            return { label: 'Unknown', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30', Icon: HelpCircle };
    }
}

export const WorkflowStatusBadge: React.FC<WorkflowStatusBadgeProps> = ({ status, conclusion }) => {
    const config = resolveStatusConfig(status, conclusion);
    const { Icon } = config;

    return (
        <Badge className={cn('text-xs border font-medium gap-1 shrink-0', config.className)}>
            {config.pulse ? (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            ) : (
                <Icon size={11} className="shrink-0" />
            )}
            {config.label}
        </Badge>
    );
};

export default WorkflowStatusBadge;
