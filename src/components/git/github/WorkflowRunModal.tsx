import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Server } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WorkflowRun, WorkflowJob } from '../../../services/githubApi';
import { useWorkflowRunJobs } from '../../../hooks/queries/useGitQueries';

interface WorkflowRunModalProps {
    projectPath: string | null;
    run: WorkflowRun | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function formatDuration(start: string | null, end: string | null): string {
    if (!start) return '';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const secs = Math.round((e - s) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

interface WorkflowJobAccordionProps {
    job: WorkflowJob;
    defaultExpanded?: boolean;
}

const WorkflowJobAccordion: React.FC<WorkflowJobAccordionProps> = ({ job, defaultExpanded = false }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    useEffect(() => {
        setExpanded(defaultExpanded);
    }, [defaultExpanded]);

    const Icon = expanded ? ChevronDown : ChevronRight;

    return (
        <div className="border border-slate-700 rounded-md overflow-hidden">
            <Button
                variant="ghost"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 h-auto rounded-none bg-slate-800 hover:bg-slate-700 justify-start text-left"
            >
                <Icon size={13} className="text-slate-400 shrink-0" />
                <WorkflowStatusBadge status={job.status} conclusion={job.conclusion} />
                <span className="flex-1 text-sm text-slate-200 truncate font-medium">{job.name}</span>
                {job.runner_name && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0 mr-1">
                        <Server size={10} />
                        {job.runner_name}
                    </span>
                )}
                <span className="text-xs text-slate-500 shrink-0">
                    {formatDuration(job.started_at, job.completed_at)}
                </span>
            </Button>

            {expanded && job.steps.length > 0 && (
                <div className="divide-y divide-slate-700/50">
                    {job.steps.map(step => (
                        <div
                            key={step.number}
                            className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-xs"
                        >
                            <span className="text-slate-600 font-mono w-5 text-right shrink-0">
                                {step.number}
                            </span>
                            <WorkflowStatusBadge status={step.status} conclusion={step.conclusion} />
                            <span className="flex-1 text-slate-300 truncate">{step.name}</span>
                            <span className="text-slate-500 shrink-0">
                                {formatDuration(step.started_at, step.completed_at)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {expanded && job.steps.length === 0 && (
                <div className="px-4 py-2 bg-slate-900 text-xs text-slate-500">No steps recorded.</div>
            )}
        </div>
    );
};

export const WorkflowRunModal: React.FC<WorkflowRunModalProps> = ({
    projectPath,
    run,
    open: isOpen,
    onOpenChange,
}) => {
    const { data: jobs, isLoading, isError, error } = useWorkflowRunJobs(
        projectPath,
        isOpen && run ? run.id : null
    );

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-100 text-sm">
                        {run && (
                            <WorkflowStatusBadge status={run.status} conclusion={run.conclusion} />
                        )}
                        <span className="truncate">
                            {run?.name ?? 'Workflow'}{' '}
                            <span className="text-slate-400">#{run?.run_number}</span>
                        </span>
                    </DialogTitle>
                </DialogHeader>

                {run && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 px-1 -mt-1">
                        {run.head_branch && (
                            <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                                {run.head_branch}
                            </span>
                        )}
                        <span>·</span>
                        <span>
                            triggered by <span className="text-slate-300">{run.event}</span>
                        </span>
                        {run.actor && (
                            <>
                                <span>·</span>
                                <span>{run.actor.login}</span>
                            </>
                        )}
                        <span>·</span>
                        <span>{new Date(run.created_at).toLocaleString()}</span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={20} className="animate-spin text-slate-400" />
                        </div>
                    )}

                    {isError && !isLoading && (
                        <div className="p-4 bg-red-950/30 border border-red-800/50 rounded-lg text-xs text-red-400">
                            {(error as Error)?.message || 'Failed to load jobs.'}
                        </div>
                    )}

                    {!isLoading && !isError && jobs?.map((job, index) => (
                        <WorkflowJobAccordion
                            key={job.id}
                            job={job}
                            defaultExpanded={index === 0}
                        />
                    ))}

                    {!isLoading && !isError && jobs?.length === 0 && (
                        <p className="text-slate-500 text-sm text-center py-8">No jobs found for this run.</p>
                    )}
                </div>

                <DialogFooter className="pt-2 border-t border-slate-700 flex items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                        Close
                    </Button>
                    {run && (
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(run.html_url, '_blank')}
                                    className="gap-1.5 border-slate-700 text-slate-300 hover:bg-slate-800"
                                >
                                    <ExternalLink size={13} />
                                    Open in GitHub
                                </Button>
                            } />
                            <TooltipContent>Open this run on GitHub</TooltipContent>
                        </Tooltip>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WorkflowRunModal;
