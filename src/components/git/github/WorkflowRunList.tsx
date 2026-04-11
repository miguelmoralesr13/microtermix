import React, { useState, useEffect } from 'react';
import { RefreshCw, GitBranch, Zap, ExternalLink, Loader2, AlertCircle, ScrollText } from 'lucide-react';
import { Button } from '../../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WorkflowRun, WorkflowJob, WorkflowStep } from '../../../services/githubApi';
import { useWorkflowRuns, useWorkflowRunJobs } from '../../../hooks/queries/useGitQueries';
import { JobLogsDrawer } from './JobLogsDrawer';
import { cn } from '../../../lib/utils';

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

// Local timer — re-renders every second while active. Zero API calls.
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

// ── Step row ───────────────────────────────────────────────────────────────────

const StepRow: React.FC<{ step: WorkflowStep }> = ({ step }) => {
    const isActive = step.status === 'in_progress';
    const elapsed = useElapsed(step.started_at, isActive);
    const duration = isActive ? elapsed : formatDuration(step.started_at, step.completed_at);

    return (
        <div className={cn(
            'flex items-center gap-1.5 px-3 py-[3px] text-[11px] transition-colors',
            isActive && 'bg-blue-500/5'
        )}>
            <WorkflowStatusBadge status={step.status} conclusion={step.conclusion} />
            <span className={cn('flex-1 truncate', isActive ? 'text-slate-200' : 'text-slate-400')}>
                {step.name}
            </span>
            {duration && (
                <span className="text-slate-500 shrink-0 font-mono tabular-nums text-[10px]">{duration}</span>
            )}
        </div>
    );
};

// ── Job card ───────────────────────────────────────────────────────────────────

const JobCard: React.FC<{ job: WorkflowJob; onViewLogs: () => void }> = ({ job, onViewLogs }) => {
    const isActive = job.status === 'in_progress';
    const elapsed = useElapsed(job.started_at, isActive);
    const duration = isActive ? elapsed : formatDuration(job.started_at, job.completed_at);

    return (
        <div className={cn(
            'flex flex-col border rounded-lg overflow-hidden flex-1 min-w-[170px] max-w-[260px]',
            isActive
                ? 'border-blue-500/50 shadow-sm shadow-blue-500/10'
                : job.conclusion === 'failure'
                    ? 'border-red-800/40'
                    : 'border-slate-700/70'
        )}>
            {/* Job header — click to open logs */}
            <button
                onClick={onViewLogs}
                className={cn(
                    'flex items-center gap-2 px-3 py-2 shrink-0 text-left w-full group transition-colors',
                    isActive
                        ? 'bg-blue-900/20 hover:bg-blue-900/30'
                        : 'bg-slate-800 hover:bg-slate-750'
                )}
            >
                <WorkflowStatusBadge status={job.status} conclusion={job.conclusion} />
                <span className="flex-1 text-xs font-semibold text-slate-200 truncate">{job.name}</span>
                {duration && (
                    <span className="text-[10px] text-slate-500 font-mono tabular-nums shrink-0">{duration}</span>
                )}
                <ScrollText size={11} className="text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
            </button>
            {/* Steps */}
            <div className="bg-slate-900 divide-y divide-slate-800/50">
                {job.steps.length > 0
                    ? job.steps.map(s => <StepRow key={s.number} step={s} />)
                    : <div className="px-3 py-1.5 text-[11px] text-slate-500 italic">No steps recorded</div>
                }
            </div>
            {/* Runner label */}
            {job.runner_name && (
                <div className="px-3 py-1 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-600 truncate">
                    {job.runner_name}
                </div>
            )}
        </div>
    );
};

// ── Pipeline view (right pane) ─────────────────────────────────────────────────

const PipelineView: React.FC<{
    run: WorkflowRun;
    projectPath: string;
    selectedJob: WorkflowJob | null;
    onSelectJob: (job: WorkflowJob | null) => void;
}> = ({ run, projectPath, selectedJob, onSelectJob }) => {
    const isActive = run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting';
    const elapsed = useElapsed(run.run_started_at ?? run.created_at, isActive);
    const { data: jobs, isLoading, isError, error } = useWorkflowRunJobs(projectPath, run.id, run.status);

    // Always derive from fresh jobs data — selectedJob is a snapshot that goes stale
    // when a job transitions from in_progress → completed while the drawer is open.
    const liveSelectedJob = selectedJob
        ? (jobs?.find(j => j.id === selectedJob.id) ?? selectedJob)
        : null;

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            {/* Run header */}
            <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
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
                        <span className="shrink-0 tabular-nums">
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
                <Tooltip>
                    <TooltipTrigger render={
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => window.open(run.html_url, '_blank')}
                            className="text-slate-400 hover:text-white shrink-0"
                        >
                            <ExternalLink size={13} />
                        </Button>
                    } />
                    <TooltipContent>Open in GitHub</TooltipContent>
                </Tooltip>
            </div>

            {/* Jobs grid */}
            <div className="flex-1 overflow-auto p-4">
                {isLoading && (
                    <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs">Loading jobs...</span>
                    </div>
                )}
                {isError && !isLoading && (
                    <div className="flex items-center gap-2 text-red-400 text-xs p-3 bg-red-950/20 border border-red-800/30 rounded-lg">
                        <AlertCircle size={14} />
                        {(error as Error)?.message || 'Failed to load jobs'}
                    </div>
                )}
                {!isLoading && !isError && jobs && jobs.length === 0 && (
                    <p className="text-slate-500 text-xs text-center py-8">No jobs found for this run.</p>
                )}
                {!isLoading && !isError && jobs && jobs.length > 0 && (
                    <div className="flex flex-wrap gap-3 items-start content-start">
                        {jobs.map(job => (
                            <JobCard
                                key={job.id}
                                job={job}
                                onViewLogs={() => onSelectJob(liveSelectedJob?.id === job.id ? null : job)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Logs drawer — overlays the pipeline */}
            {liveSelectedJob && (
                <JobLogsDrawer
                    job={liveSelectedJob}
                    projectPath={projectPath}
                    onClose={() => onSelectJob(null)}
                />
            )}
        </div>
    );
};

// ── Compact run row (left list) ────────────────────────────────────────────────

const RunRow: React.FC<{ run: WorkflowRun; selected: boolean; onClick: () => void }> = ({ run, selected, onClick }) => {
    const isActive = run.status === 'in_progress' || run.status === 'queued';
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-slate-800/70 transition-colors',
                selected ? 'bg-slate-800' : 'hover:bg-slate-800/50'
            )}
        >
            <div className="mt-0.5 shrink-0">
                <WorkflowStatusBadge status={run.status} conclusion={run.conclusion} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-200 truncate">
                    {run.name ?? 'Workflow'} <span className="text-slate-500 font-normal">#{run.run_number}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 truncate">
                    {run.head_branch && <span className="truncate">{run.head_branch}</span>}
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">{relativeTime(run.updated_at)}</span>
                    {isActive && <span className="shrink-0 text-blue-400 animate-pulse ml-0.5">●</span>}
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

export const WorkflowRunList: React.FC<{ projectPath: string }> = ({ projectPath }) => {
    const { data: runs, isLoading, isError, error, refetch, isFetching } = useWorkflowRuns(projectPath, true);
    const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
    const [selectedJob, setSelectedJob] = useState<WorkflowJob | null>(null);

    // Reset selections when project changes
    useEffect(() => { setSelectedRunId(null); setSelectedJob(null); }, [projectPath]);

    // Close logs drawer when switching runs
    const handleSelectRun = (id: number) => { setSelectedRunId(id); setSelectedJob(null); };

    // Derive selected run from latest data — always fresh, no extra state sync
    const selectedRun = runs?.find(r => r.id === selectedRunId) ?? runs?.[0] ?? null;

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Left: compact run list ── */}
            <div className="w-52 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 shrink-0">
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
