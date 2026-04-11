import React, { useEffect, useRef } from 'react';
import { X, ExternalLink, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WorkflowJob } from '../../../services/githubApi';
import { useWorkflowJobLogs } from '../../../hooks/queries/useGitQueries';
import { cn } from '../../../lib/utils';

// ── Log processing ─────────────────────────────────────────────────────────────

type LogLine = { text: string; kind: 'normal' | 'error' | 'warning' | 'group' | 'debug' };

const TS_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/;
const ANSI_RE = /\u001b\[[0-9;]*[mGKHFABCDJsu]/g;

function processLogs(raw: string): LogLine[] {
    return raw
        .split('\n')
        .map((line): LogLine | null => {
            const clean = line.replace(TS_RE, '').replace(ANSI_RE, '');
            if (clean.startsWith('##[endgroup]')) return null;
            if (clean.startsWith('##[group]'))
                return { text: clean.replace('##[group]', ''), kind: 'group' };
            if (clean.startsWith('##[error]'))
                return { text: clean.replace('##[error]', ''), kind: 'error' };
            if (clean.startsWith('##[warning]'))
                return { text: clean.replace('##[warning]', ''), kind: 'warning' };
            if (clean.startsWith('##[debug]'))
                return { text: clean.replace('##[debug]', ''), kind: 'debug' };
            return { text: clean, kind: 'normal' };
        })
        .filter((l): l is LogLine => l !== null);
}

const LINE_CLASS: Record<LogLine['kind'], string> = {
    normal:  'text-slate-300',
    error:   'text-red-400',
    warning: 'text-yellow-400',
    group:   'text-microtermix-accent font-semibold border-t border-slate-800 mt-1 pt-1',
    debug:   'text-slate-500',
};

// ── Component ──────────────────────────────────────────────────────────────────

interface JobLogsDrawerProps {
    job: WorkflowJob;
    projectPath: string;
    onClose: () => void;
}

export const JobLogsDrawer: React.FC<JobLogsDrawerProps> = ({ job, projectPath, onClose }) => {
    const isActive = job.status === 'in_progress';
    const hasLogs = job.status === 'in_progress' || job.status === 'completed';
    const { data: raw, isLoading, isError, error, isFetching, refetch } =
        useWorkflowJobLogs(projectPath, job.id, job.status);

    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const userScrolledUp = useRef(false);

    // Auto-scroll to bottom when new log data arrives, unless user scrolled up
    useEffect(() => {
        if (!raw || userScrolledUp.current) return;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [raw]);

    // Reset scroll-lock when job changes
    useEffect(() => {
        userScrolledUp.current = false;
    }, [job.id]);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80;
    };

    const lines = raw ? processLogs(raw) : [];

    return (
        /* Slide-in from right — absolute so it overlays the pipeline */
        <div className={cn(
            'absolute inset-y-0 right-0 z-10 flex flex-col',
            'bg-slate-950 border-l border-slate-700',
            'w-[65%] min-w-[420px]',
            'shadow-2xl shadow-black/60',
            'animate-in slide-in-from-right-8 duration-200'
        )}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 shrink-0 bg-slate-900">
                <WorkflowStatusBadge status={job.status} conclusion={job.conclusion} />
                <span className="flex-1 text-sm font-bold text-slate-200 truncate">{job.name}</span>

                {isActive && isFetching && (
                    <span className="text-[10px] text-blue-400 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                        live
                    </span>
                )}

                <Tooltip>
                    <TooltipTrigger render={
                        <Button variant="ghost" size="icon-sm"
                            onClick={() => refetch()}
                            className="text-slate-400 hover:text-white"
                        >
                            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                        </Button>
                    } />
                    <TooltipContent>Refresh logs</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger render={
                        <Button variant="ghost" size="icon-sm"
                            onClick={() => window.open(job.html_url, '_blank')}
                            className="text-slate-400 hover:text-white"
                        >
                            <ExternalLink size={13} />
                        </Button>
                    } />
                    <TooltipContent>Open in GitHub</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger render={
                        <Button variant="ghost" size="icon-sm"
                            onClick={onClose}
                            className="text-slate-400 hover:text-white"
                        >
                            <X size={14} />
                        </Button>
                    } />
                    <TooltipContent>Close</TooltipContent>
                </Tooltip>
            </div>

            {/* Log body */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed"
            >
                {isLoading && (
                    <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
                        <Loader2 size={16} className="animate-spin" />
                        <span>Loading logs...</span>
                    </div>
                )}

                {isError && !isLoading && (
                    <div className="flex items-start gap-2 m-4 p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-red-400 text-xs">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold mb-0.5">Failed to load logs</p>
                            <p className="text-red-300/70">{(error as Error)?.message}</p>
                        </div>
                    </div>
                )}

                {!hasLogs && (
                    <p className="text-slate-500 text-xs text-center py-8">
                        Logs not available — job is <span className="font-mono text-slate-400">{job.status}</span>.
                    </p>
                )}

                {hasLogs && !isLoading && !isError && lines.length === 0 && (
                    <p className="text-slate-500 text-xs text-center py-8">No log output yet.</p>
                )}

                {!isLoading && !isError && lines.length > 0 && (
                    <div className="px-4 py-3 space-y-px">
                        {lines.map((line, i) => (
                            <div key={i} className={cn('whitespace-pre-wrap break-all', LINE_CLASS[line.kind])}>
                                {line.text || '\u00a0'}
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* Footer — jump to bottom if user scrolled up */}
            {isActive && (
                <div className="shrink-0 px-4 py-1.5 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Refreshing every 5s</span>
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                            userScrolledUp.current = false;
                            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-[10px] text-slate-400 hover:text-white h-5 px-2"
                    >
                        ↓ Jump to bottom
                    </Button>
                </div>
            )}
        </div>
    );
};
