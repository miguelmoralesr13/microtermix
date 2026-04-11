import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, GitBranch, Zap, ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronRight, ScrollText, RotateCcw, StopCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WorkflowRun, WorkflowJob, WorkflowStep, cancelWorkflowRun, rerunWorkflowRun, rerunFailedJobs } from '../../../services/githubApi';
import { useWorkflowRuns, useWorkflowRunJobs } from '../../../hooks/queries/useGitQueries';
import { useGitStore } from '../../../stores/gitStore';
import { useGithubActionsWatcher } from '../../../hooks/useGithubActionsWatcher';
import { useQueryClient } from '@tanstack/react-query';
import { gitKeys } from '../../../hooks/queries/useGitQueries';
import { JobLogsDrawer } from './JobLogsDrawer';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

// ── Utilities ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

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

// ── Step dot indicator ────────────────────────────────────────────────────────

function stepDotClass(status: WorkflowStep['status'], conclusion: WorkflowStep['conclusion']): string {
    if (status === 'in_progress') return 'bg-blue-400 animate-pulse';
    if (status !== 'completed') return 'bg-slate-600';
    if (conclusion === 'success') return 'bg-emerald-400';
    if (conclusion === 'failure') return 'bg-red-400';
    if (conclusion === 'skipped') return 'bg-slate-700';
    return 'bg-slate-500';
}

// ── Step row (inside job accordion) ───────────────────────────────────────────

const StepRow: React.FC<{ step: WorkflowStep }> = ({ step }) => {
    const isActive = step.status === 'in_progress';
    const isFailed = step.conclusion === 'failure';
    const isSkipped = step.conclusion === 'skipped';
    const elapsed = useElapsed(step.started_at, isActive);
    const duration = isActive ? elapsed : formatDuration(step.started_at, step.completed_at);

    return (
        <div className={cn(
            'flex items-center gap-2 pl-7 pr-3 py-[4px] text-[11px] border-b border-slate-800/30 last:border-b-0 transition-colors',
            isActive && 'bg-blue-500/[0.07]',
            isFailed && 'bg-red-500/[0.08]'
        )}>
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', stepDotClass(step.status, step.conclusion))} />
            <span className={cn(
                'flex-1 truncate',
                isActive ? 'text-blue-100 font-medium' :
                isFailed ? 'text-red-300' :
                isSkipped ? 'text-slate-600 line-through' :
                step.status === 'completed' ? 'text-slate-300' : 'text-slate-500'
            )}>
                {step.name}
            </span>
            {duration && (
                <span className={cn(
                    'font-mono tabular-nums text-[10px] shrink-0',
                    isActive ? 'text-blue-400' : isFailed ? 'text-red-500' : 'text-slate-600'
                )}>
                    {duration}
                </span>
            )}
        </div>
    );
};

// ── Job accordion ─────────────────────────────────────────────────────────────

const JobSection: React.FC<{
    job: WorkflowJob;
    selected: boolean;
    onSelect: () => void;
}> = ({ job, selected, onSelect }) => {
    const isActive = job.status === 'in_progress';
    const isFailed = job.conclusion === 'failure';
    const elapsed = useElapsed(job.started_at, isActive);
    const duration = isActive ? elapsed : formatDuration(job.started_at, job.completed_at);
    const [expanded, setExpanded] = useState(isActive || isFailed);

    // Auto-expand when job becomes active
    useEffect(() => {
        if (isActive) setExpanded(true);
    }, [isActive]);

    return (
        <div className={cn(
            'border-b border-slate-800/60 transition-colors',
            selected && 'border-l-2 border-l-blue-500 bg-blue-500/[0.04]'
        )}>
            {/* Job header row */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-2 px-3 py-2 flex-1 text-left hover:bg-slate-800/40 transition-colors min-w-0"
                >
                    {expanded
                        ? <ChevronDown size={10} className="text-slate-600 shrink-0" />
                        : <ChevronRight size={10} className="text-slate-600 shrink-0" />
                    }
                    <WorkflowStatusBadge status={job.status} conclusion={job.conclusion} />
                    <span className="flex-1 text-[11px] font-semibold text-slate-200 truncate min-w-0">{job.name}</span>
                    {duration && (
                        <span className="text-[10px] text-slate-500 font-mono tabular-nums shrink-0 mr-1">{duration}</span>
                    )}
                </button>

                {/* Logs toggle button */}
                <Tooltip>
                    <TooltipTrigger render={
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={onSelect}
                            className={cn(
                                'h-7 w-7 mr-1.5 shrink-0 transition-colors',
                                selected
                                    ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                                    : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'
                            )}
                        >
                            <ScrollText size={11} />
                        </Button>
                    } />
                    <TooltipContent>{selected ? 'Cerrar logs' : 'Ver logs'}</TooltipContent>
                </Tooltip>
            </div>

            {/* Steps (expanded) */}
            {expanded && (
                <div className="bg-slate-900/50 border-t border-slate-800/40">
                    {job.steps.length === 0 ? (
                        <div className="pl-7 pr-3 py-1.5 text-[11px] text-slate-600 italic">
                            {isActive ? 'Waiting for steps...' : 'No steps recorded'}
                        </div>
                    ) : (
                        job.steps.map(s => <StepRow key={s.number} step={s} />)
                    )}
                    {job.runner_name && (
                        <div className="pl-7 pr-3 py-1 text-[10px] text-slate-600 border-t border-slate-800/40 font-mono">
                            {job.runner_name}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Pipeline view ─────────────────────────────────────────────────────────────

const PipelineView: React.FC<{
    run: WorkflowRun;
    projectPath: string;
    token: string;
    apiUrl?: string;
    selectedJob: WorkflowJob | null;
    onSelectJob: (job: WorkflowJob | null) => void;
}> = ({ run, projectPath, token, apiUrl, selectedJob, onSelectJob }) => {
    const queryClient = useQueryClient();
    const isActive = run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting';
    const isFailed = run.status === 'completed' && run.conclusion === 'failure';
    const isCompleted = run.status === 'completed';
    const elapsed = useElapsed(run.run_started_at ?? run.created_at, isActive);
    const { data: jobs, isLoading, isError, error } = useWorkflowRunJobs(projectPath, run.id, run.status);
    const [actionLoading, setActionLoading] = useState<'cancel' | 'rerun' | 'rerun-failed' | null>(null);

    // GitHub only allows re-runs within 30 days of the original run
    const runAgeMs = Date.now() - new Date(run.created_at).getTime();
    const isRerunnable = runAgeMs < 30 * 24 * 60 * 60 * 1000;
    const notRerunnableReason = !isRerunnable ? 'El run tiene más de 30 días — GitHub no permite re-ejecutarlo' : undefined;

    // Always use fresh job data — selectedJob snapshot can go stale
    const liveSelectedJob = selectedJob
        ? (jobs?.find(j => j.id === selectedJob.id) ?? selectedJob)
        : null;

    const handleCancel = async () => {
        setActionLoading('cancel');
        try {
            await cancelWorkflowRun(projectPath, token, run.id, apiUrl);
            toast.success('Pipeline cancelado');
            queryClient.invalidateQueries({ queryKey: gitKeys.workflowRuns(projectPath) });
        } catch (e: any) {
            toast.error(e?.message || 'Error al cancelar el pipeline');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRerun = async () => {
        setActionLoading('rerun');
        try {
            await rerunWorkflowRun(projectPath, token, run.id, apiUrl);
            toast.success('Pipeline re-ejecutado');
            setTimeout(() => queryClient.invalidateQueries({ queryKey: gitKeys.workflowRuns(projectPath) }), 2000);
        } catch (e: any) {
            const msg: string = e?.message || '';
            if (msg.includes('cannot be retried') || msg.includes('cannot be rerun')) {
                toast.error('GitHub no permite reintentar este run. Puede que sea muy antiguo o el branch ya no existe.');
            } else {
                toast.error(msg || 'Error al re-ejecutar el pipeline');
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleRerunFailed = async () => {
        setActionLoading('rerun-failed');
        try {
            await rerunFailedJobs(projectPath, token, run.id, apiUrl);
            toast.success('Jobs fallidos re-ejecutados');
            setTimeout(() => queryClient.invalidateQueries({ queryKey: gitKeys.workflowRuns(projectPath) }), 2000);
        } catch (e: any) {
            const msg: string = e?.message || '';
            if (msg.includes('cannot be retried') || msg.includes('cannot be rerun')) {
                toast.error('GitHub no permite reintentar este run. Puede que sea muy antiguo o el branch ya no existe.');
            } else {
                toast.error(msg || 'Error al re-ejecutar jobs fallidos');
            }
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Run header */}
            <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-950 flex items-center gap-2.5">
                <WorkflowStatusBadge status={run.status} conclusion={run.conclusion} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-100 truncate">
                            {run.name ?? 'Workflow'}
                        </span>
                        <span className="text-slate-500 text-xs shrink-0">#{run.run_number}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        {run.head_branch && (
                            <span className="flex items-center gap-1 shrink-0">
                                <GitBranch size={9} />{run.head_branch}
                            </span>
                        )}
                        <span>·</span>
                        <span className="flex items-center gap-1 shrink-0">
                            <Zap size={9} />{run.event}
                        </span>
                        {run.actor && <><span>·</span><span className="shrink-0">{run.actor.login}</span></>}
                        <span>·</span>
                        <span className="shrink-0 tabular-nums font-mono">
                            {isActive ? `⏱ ${elapsed}` : relativeTime(run.updated_at)}
                        </span>
                        {run.head_commit && (
                            <><span>·</span>
                            <span className="font-mono shrink-0 text-slate-600 truncate max-w-[200px]">
                                {run.head_commit.message.split('\n')[0]}
                            </span></>
                        )}
                    </div>
                </div>

                {/* ── Action buttons ── */}
                <div className="flex items-center gap-1 shrink-0">
                    {/* Cancel — only for active runs */}
                    {isActive && (
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={handleCancel}
                                    disabled={actionLoading !== null}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                    {actionLoading === 'cancel'
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <StopCircle size={13} />
                                    }
                                </Button>
                            } />
                            <TooltipContent>Cancelar pipeline</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Re-run failed — only when run failed */}
                    {isFailed && (
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={handleRerunFailed}
                                    disabled={actionLoading !== null || !isRerunnable}
                                    className={cn(
                                        isRerunnable
                                            ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                            : 'text-slate-600 cursor-not-allowed'
                                    )}
                                >
                                    {actionLoading === 'rerun-failed'
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <RotateCcw size={13} />
                                    }
                                </Button>
                            } />
                            <TooltipContent>
                                {notRerunnableReason ?? 'Re-ejecutar jobs fallidos'}
                            </TooltipContent>
                        </Tooltip>
                    )}

                    {/* Re-run all — only for completed runs */}
                    {isCompleted && (
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={handleRerun}
                                    disabled={actionLoading !== null || !isRerunnable}
                                    className={cn(
                                        isRerunnable
                                            ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                                            : 'text-slate-600 cursor-not-allowed'
                                    )}
                                >
                                    {actionLoading === 'rerun'
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <RefreshCw size={13} />
                                    }
                                </Button>
                            } />
                            <TooltipContent>
                                {notRerunnableReason ?? 'Re-ejecutar pipeline completo'}
                            </TooltipContent>
                        </Tooltip>
                    )}

                    {/* Open in GitHub */}
                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => window.open(run.html_url, '_blank')}
                                className="text-slate-400 hover:text-white"
                            >
                                <ExternalLink size={13} />
                            </Button>
                        } />
                        <TooltipContent>Abrir en GitHub</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Body: jobs list + logs panel side by side */}
            <div className="flex-1 flex overflow-hidden">
                {/* Jobs accordion list */}
                <div className={cn(
                    'flex flex-col overflow-y-auto bg-slate-900 transition-all duration-200',
                    liveSelectedJob ? 'w-72 shrink-0 border-r border-slate-800' : 'flex-1'
                )}>
                    {isLoading && (
                        <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-xs">Loading jobs...</span>
                        </div>
                    )}
                    {isError && !isLoading && (
                        <div className="flex items-start gap-2 text-red-400 text-xs p-4 m-4 bg-red-950/20 border border-red-800/30 rounded-lg">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{(error as Error)?.message || 'Failed to load jobs'}</span>
                        </div>
                    )}
                    {!isLoading && !isError && jobs?.length === 0 && (
                        <p className="text-slate-500 text-xs text-center py-8">No jobs found for this run.</p>
                    )}
                    {!isLoading && !isError && jobs?.map(job => (
                        <JobSection
                            key={job.id}
                            job={job}
                            selected={liveSelectedJob?.id === job.id}
                            onSelect={() => onSelectJob(liveSelectedJob?.id === job.id ? null : job)}
                        />
                    ))}
                </div>

                {/* Logs panel — proper flex child, not overlay */}
                {liveSelectedJob && (
                    <JobLogsDrawer
                        job={liveSelectedJob}
                        projectPath={projectPath}
                        onClose={() => onSelectJob(null)}
                    />
                )}
            </div>
        </div>
    );
};

// ── Run status dot ────────────────────────────────────────────────────────────

function runDotClass(status: WorkflowRun['status'], conclusion: WorkflowRun['conclusion']): string {
    if (status === 'in_progress') return 'bg-amber-400 animate-pulse';
    if (status === 'queued' || status === 'waiting' || status === 'pending') return 'bg-slate-400';
    if (conclusion === 'success') return 'bg-emerald-400';
    if (conclusion === 'failure') return 'bg-red-400';
    if (conclusion === 'cancelled') return 'bg-slate-500';
    return 'bg-slate-600';
}

// ── Compact run row (left list) ────────────────────────────────────────────────

const RunRow: React.FC<{ run: WorkflowRun; selected: boolean; onClick: () => void }> = ({ run, selected, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-start gap-2 px-3 py-2 text-left border-b border-slate-800/60 transition-colors',
                selected ? 'bg-slate-800' : 'hover:bg-slate-800/40'
            )}
        >
            <span className={cn('w-2 h-2 rounded-full mt-[3px] shrink-0', runDotClass(run.status, run.conclusion))} />
            <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-slate-200 truncate">
                    {run.name ?? 'Workflow'}{' '}
                    <span className="text-slate-500 font-normal">#{run.run_number}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 truncate">
                    {run.head_branch && <span className="truncate">{run.head_branch}</span>}
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">{relativeTime(run.updated_at)}</span>
                </div>
            </div>
        </button>
    );
};

// ── Error helpers ──────────────────────────────────────────────────────────────

function errorMessage(msg: string): string {
    if (!msg) return 'Failed to load workflow runs';
    if (msg.includes('403')) return 'Token needs "workflow" scope — update your PAT in settings.';
    if (msg.includes('401')) return 'Token invalid or expired — update your PAT in settings.';
    return msg;
}

// ── Main component ─────────────────────────────────────────────────────────────

export const WorkflowRunList: React.FC<{ projectPath: string }> = ({ projectPath: rawPath }) => {
    // Normalize path to avoid trailing slash mismatches in query keys
    const projectPath = rawPath.replace(/\/+$/, '');
    
    const { data: runs, isLoading, isError, error, refetch, isFetching } = useWorkflowRuns(projectPath, true);
    const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
    const [selectedJob, setSelectedJob] = useState<WorkflowJob | null>(null);
    const queryClient = useQueryClient();

    // Resolve token + apiUrl for the active account
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = getActiveAccount(projectPath);
    const token = activeAccount?.token ?? '';
    const apiUrl = activeAccount?.url;

    // Reset selections when project changes
    useEffect(() => { setSelectedRunId(null); setSelectedJob(null); }, [projectPath]);

    // Backend watcher — pushes updates instead of frontend polling every 30s.
    const handleActionsUpdate = useCallback(() => {
        console.log(`[Watcher] Invalidating all git queries for ${projectPath}`);
        queryClient.invalidateQueries({ queryKey: gitKeys.repo(projectPath) });
    }, [queryClient, projectPath]);

    useGithubActionsWatcher({
        projectPath,
        token,
        apiUrl,
        accountId: activeAccount?.id,
        onUpdate: handleActionsUpdate,
    });

    // Close logs drawer when switching runs
    const handleSelectRun = (id: number) => { setSelectedRunId(id); setSelectedJob(null); };

    // Derive selected run from latest data — always fresh
    const selectedRun = runs?.find(r => r.id === selectedRunId) ?? runs?.[0] ?? null;

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Left: compact run list ── */}
            <div className="w-52 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 shrink-0">
                    <span className="text-xs font-bold text-slate-300">
                        Runs
                        {runs && runs.length > 0 && (
                            <span className="ml-1 text-slate-500 font-mono">({runs.length})</span>
                        )}
                    </span>
                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => refetch()}
                                className="text-slate-400 hover:text-white"
                            >
                                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                            </Button>
                        } />
                        <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoading && Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex gap-2 px-3 py-2.5 border-b border-slate-800 animate-pulse">
                            <div className="w-12 h-4 rounded bg-slate-700/60 shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 w-4/5 rounded bg-slate-700/60" />
                                <div className="h-2.5 w-3/5 rounded bg-slate-700/40" />
                            </div>
                        </div>
                    ))}

                    {isError && !isLoading && (
                        <div className="p-3 text-[11px] text-red-400 leading-relaxed">
                            <AlertCircle size={13} className="inline mr-1" />
                            {errorMessage((error as Error)?.message || '')}
                        </div>
                    )}

                    {!isLoading && !isError && runs?.length === 0 && (
                        <div className="p-4 text-xs text-slate-500 text-center">
                            No workflow runs found
                        </div>
                    )}

                    {!isLoading && !isError && runs?.map(run => (
                        <RunRow
                            key={run.id}
                            run={run}
                            selected={selectedRun?.id === run.id}
                            onClick={() => handleSelectRun(run.id)}
                        />
                    ))}
                </div>
            </div>

            {/* ── Right: pipeline view ── */}
            <div className="flex-1 min-w-0 overflow-hidden bg-slate-900">
                {selectedRun
                    ? <PipelineView
                        run={selectedRun}
                        projectPath={projectPath}
                        token={token}
                        apiUrl={apiUrl}
                        selectedJob={selectedJob}
                        onSelectJob={setSelectedJob}
                      />
                    : (
                        <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                            Select a run to view the pipeline
                        </div>
                    )
                }
            </div>
        </div>
    );
};

export default WorkflowRunList;
