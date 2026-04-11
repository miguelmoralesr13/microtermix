import React, { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Loader2, AlertCircle, RefreshCw, List, CheckCircle2, Circle, XCircle, SkipForward } from 'lucide-react';
import { Button } from '../../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WorkflowJob, WorkflowStep } from '../../../services/githubApi';
import { useWorkflowJobLogs } from '../../../hooks/queries/useGitQueries';
import { cn } from '../../../lib/utils';

// ── Time helpers ──────────────────────────────────────────────────────────────

function formatDuration(start: string | null, end: string | null): string {
    if (!start || !end) return '';
    const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function useElapsed(startedAt: string | null, active: boolean): string {
    const [, tick] = useState(0);
    useEffect(() => {
        if (!active || !startedAt) return;
        const t = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(t);
    }, [active, startedAt]);
    if (!active || !startedAt) return '';
    const secs = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ── Live step progress (while job is in_progress) ─────────────────────────────

const LiveStepRow: React.FC<{ step: WorkflowStep }> = ({ step }) => {
    const isRunning = step.status === 'in_progress';
    const isDone    = step.status === 'completed';
    const isSkipped = step.conclusion === 'skipped';
    const isFailed  = step.conclusion === 'failure';
    const elapsed   = useElapsed(step.started_at, isRunning);
    const duration  = isDone ? formatDuration(step.started_at, step.completed_at) : elapsed;

    const Icon = isRunning
        ? () => <Loader2 size={13} className="animate-spin text-blue-400 shrink-0" />
        : isDone && isFailed
            ? () => <XCircle size={13} className="text-red-400 shrink-0" />
            : isDone && isSkipped
                ? () => <SkipForward size={13} className="text-slate-500 shrink-0" />
                : isDone
                    ? () => <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    : () => <Circle size={13} className="text-slate-600 shrink-0" />;

    return (
        <div className={cn(
            'flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 transition-colors',
            isRunning && 'bg-blue-500/5'
        )}>
            <Icon />
            <span className={cn(
                'flex-1 text-xs',
                isRunning  ? 'text-slate-100 font-medium' :
                isDone && isFailed ? 'text-red-300' :
                isSkipped  ? 'text-slate-600 line-through' :
                isDone     ? 'text-slate-300' : 'text-slate-500'
            )}>
                {step.name}
            </span>
            {duration && (
                <span className={cn(
                    'text-[10px] font-mono tabular-nums shrink-0',
                    isRunning ? 'text-blue-400' : 'text-slate-500'
                )}>
                    {duration}
                </span>
            )}
        </div>
    );
};

// ── Types ──────────────────────────────────────────────────────────────────────

type LogLine = { text: string; kind: 'normal' | 'error' | 'warning' | 'debug' };

type LogStep = {
    name: string;
    lines: LogLine[];
    hasError: boolean;
    hasWarning: boolean;
};

// ── Log parsing ────────────────────────────────────────────────────────────────

const TS_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/;
const ANSI_RE = /\u001b\[[0-9;]*[mGKHFABCDJsu]/g;

function parseLine(clean: string): LogLine {
    if (clean.startsWith('##[error]'))   return { text: clean.replace('##[error]', ''), kind: 'error' };
    if (clean.startsWith('##[warning]')) return { text: clean.replace('##[warning]', ''), kind: 'warning' };
    if (clean.startsWith('##[debug]'))   return { text: clean.replace('##[debug]', ''), kind: 'debug' };
    return { text: clean, kind: 'normal' };
}

function parseLogsByStep(raw: string): { steps: LogStep[]; all: LogLine[] } {
    const all: LogLine[] = [];
    const steps: LogStep[] = [];
    let current: LogStep | null = null;

    for (const line of raw.split('\n')) {
        const clean = line.replace(TS_RE, '').replace(ANSI_RE, '');

        if (clean.startsWith('##[endgroup]')) {
            if (current) { steps.push(current); current = null; }
            continue;
        }
        if (clean.startsWith('##[group]')) {
            current = { name: clean.replace('##[group]', '').trim(), lines: [], hasError: false, hasWarning: false };
            continue;
        }

        const l = parseLine(clean);
        all.push(l);
        if (current) {
            current.lines.push(l);
            if (l.kind === 'error')   current.hasError = true;
            if (l.kind === 'warning') current.hasWarning = true;
        }
    }

    if (current) steps.push(current); // unclosed group (job cut short)
    return { steps, all };
}

// ── Step sidebar ───────────────────────────────────────────────────────────────

const LINE_CLASS: Record<LogLine['kind'], string> = {
    normal:  'text-slate-300',
    error:   'text-red-400',
    warning: 'text-yellow-400',
    debug:   'text-slate-500',
};

// Find the matching API step by name (normalized) to get its conclusion
function findApiStep(apiSteps: WorkflowStep[], name: string): WorkflowStep | undefined {
    const norm = (s: string) => s.toLowerCase().trim();
    return apiSteps.find(s => norm(s.name) === norm(name));
}

interface StepItemProps {
    logStep: LogStep;
    apiStep?: WorkflowStep;
    selected: boolean;
    onClick: () => void;
}

const StepItem: React.FC<StepItemProps> = ({ logStep, apiStep, selected, onClick }) => (
    <button
        onClick={onClick}
        className={cn(
            'w-full text-left px-3 py-2 flex items-start gap-2 border-b border-slate-800/60 transition-colors',
            selected ? 'bg-slate-800' : 'hover:bg-slate-800/50'
        )}
    >
        {apiStep
            ? <WorkflowStatusBadge status={apiStep.status} conclusion={apiStep.conclusion} />
            : <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0', logStep.hasError ? 'bg-red-500' : logStep.hasWarning ? 'bg-yellow-500' : 'bg-slate-600')} />
        }
        <span className={cn('text-[11px] leading-tight', selected ? 'text-slate-100' : 'text-slate-400')}>
            {logStep.name}
        </span>
        {logStep.hasError && <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 mt-1" />}
        {!logStep.hasError && logStep.hasWarning && <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1" />}
    </button>
);

// ── Log content pane ───────────────────────────────────────────────────────────

interface LogPaneProps {
    lines: LogLine[];
    bottomRef: React.RefObject<HTMLDivElement | null>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
}

const LogPane: React.FC<LogPaneProps> = ({ lines, bottomRef, containerRef, onScroll }) => (
    <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed"
    >
        {lines.length === 0
            ? <p className="text-slate-500 text-xs text-center py-8">No log output for this step.</p>
            : (
                <div className="px-4 py-3 space-y-px">
                    {lines.map((line, i) => (
                        <div key={i} className={cn('whitespace-pre-wrap break-all', LINE_CLASS[line.kind])}>
                            {line.text || '\u00a0'}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            )
        }
    </div>
);

// ── Component ──────────────────────────────────────────────────────────────────

interface JobLogsDrawerProps {
    job: WorkflowJob;
    projectPath: string;
    onClose: () => void;
}

export const JobLogsDrawer: React.FC<JobLogsDrawerProps> = ({ job, projectPath, onClose }) => {
    const isActive    = job.status === 'in_progress';
    const isCompleted = job.status === 'completed';

    const { data: raw, isLoading, isError, error, isFetching, refetch } =
        useWorkflowJobLogs(projectPath, job.id, job.status);

    // null = All steps
    const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);

    const bottomRef   = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const userScrolledUp = useRef(false);

    // Reset state when job changes
    useEffect(() => {
        userScrolledUp.current = false;
        setSelectedStepIdx(null);
    }, [job.id]);

    // Auto-scroll when new data arrives
    useEffect(() => {
        if (!raw || userScrolledUp.current) return;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [raw]);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80;
    };

    const { steps, all } = raw ? parseLogsByStep(raw) : { steps: [], all: [] };
    const hasSteps = steps.length > 0;

    const visibleLines = selectedStepIdx === null
        ? all
        : (steps[selectedStepIdx]?.lines ?? []);

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 border-l border-slate-800 animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 shrink-0 bg-slate-900">
                <WorkflowStatusBadge status={job.status} conclusion={job.conclusion} />
                <span className="flex-1 text-sm font-bold text-slate-200 truncate">{job.name}</span>

                {isCompleted && (
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
                )}

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

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── Running: live step progress from jobs polling ── */}
                {isActive && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Step list — updates every 10s via useWorkflowRunJobs */}
                        <div className="flex-1 overflow-y-auto">
                            {job.steps.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                                    <Loader2 size={18} className="animate-spin text-blue-400" />
                                    <p className="text-xs">Waiting for steps...</p>
                                </div>
                            ) : (
                                job.steps.map(step => (
                                    <LiveStepRow key={step.number} step={step} />
                                ))
                            )}
                        </div>
                        {/* Footer hint */}
                        <div className="shrink-0 px-4 py-2 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                                Updating every 10s · Full logs after completion
                            </span>
                            <a
                                href={job.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                                <ExternalLink size={10} /> Live on GitHub
                            </a>
                        </div>
                    </div>
                )}

                {!isActive && !isCompleted && (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-500 text-xs text-center py-8">
                            Job is <span className="font-mono text-slate-400">{job.status}</span> — no logs yet.
                        </p>
                    </div>
                )}

                {/* ── Completed: loading ── */}
                {isCompleted && isLoading && (
                    <div className="flex-1 flex items-center justify-center gap-2 text-slate-400">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs">Loading logs...</span>
                    </div>
                )}

                {/* ── Completed: error ── */}
                {isCompleted && isError && !isLoading && (
                    <div className="flex-1 flex items-start p-4">
                        <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-red-400 text-xs w-full">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold mb-0.5">Failed to load logs</p>
                                <p className="text-red-300/70">{(error as Error)?.message}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Completed: logs ready ── */}
                {isCompleted && !isLoading && !isError && raw && (
                    <>
                        {/* Step sidebar — only when there are parsed steps */}
                        {hasSteps && (
                            <div className="w-[200px] shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950">
                                <div className="px-3 py-2 border-b border-slate-800 shrink-0 flex items-center gap-1.5">
                                    <List size={11} className="text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Steps</span>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {/* All steps */}
                                    <button
                                        onClick={() => setSelectedStepIdx(null)}
                                        className={cn(
                                            'w-full text-left px-3 py-2 flex items-center gap-2 border-b border-slate-800/60 transition-colors',
                                            selectedStepIdx === null ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                                        )}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                                        <span className={cn('text-[11px]', selectedStepIdx === null ? 'text-slate-100' : 'text-slate-400')}>
                                            All steps
                                        </span>
                                    </button>

                                    {steps.map((step, idx) => (
                                        <StepItem
                                            key={idx}
                                            logStep={step}
                                            apiStep={findApiStep(job.steps, step.name)}
                                            selected={selectedStepIdx === idx}
                                            onClick={() => {
                                                setSelectedStepIdx(idx);
                                                userScrolledUp.current = false;
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Log content */}
                        <LogPane
                            lines={visibleLines}
                            bottomRef={bottomRef}
                            containerRef={containerRef}
                            onScroll={handleScroll}
                        />
                    </>
                )}

                {/* No log output at all */}
                {isCompleted && !isLoading && !isError && !raw && (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-500 text-xs">No log output.</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            {isCompleted && !isLoading && !isError && all.length > 0 && (
                <div className="shrink-0 px-4 py-1.5 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
                    {hasSteps && (
                        <span className="text-[10px] text-slate-500">
                            {selectedStepIdx === null
                                ? `${steps.length} steps · ${all.length} lines`
                                : `${visibleLines.length} lines in "${steps[selectedStepIdx]?.name}"`
                            }
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                            userScrolledUp.current = false;
                            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-[10px] text-slate-400 hover:text-white h-5 px-2 ml-auto"
                    >
                        ↓ Jump to bottom
                    </Button>
                </div>
            )}
        </div>
    );
};
