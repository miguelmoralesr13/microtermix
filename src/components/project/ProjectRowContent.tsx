import React from 'react';
import { cn } from '../../lib/utils';
import { Project, useWorkspace } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { useSonarStore } from '../../stores/sonarStore';
import { useSonarMetrics } from '../../hooks/queries/useSonarQueries';
import { Badge } from '../ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip';

const TYPE_BADGE: Record<string, string> = {
    node:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    go:         'bg-sky-500/15 text-sky-400 border-sky-500/30',
    rust:       'bg-orange-500/15 text-orange-400 border-orange-500/30',
    java:       'bg-purple-500/15 text-purple-400 border-purple-500/30',
    bun:        'bg-pink-500/15 text-pink-400 border-pink-500/30',
    'git-repo': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

interface ProjectRowContentProps {
    project: Project;
}

/**
 * Renders the main content of a project row — name, type badge, sonar indicator,
 * path and running status text. Self-contained: computes its own process status
 * and sonar metrics via hooks.
 *
 * Designed to be used as the `getText` slot of ConfigurableSidebarList.
 * Does NOT render: outer wrapper, checkbox, context menu, settings button.
 */
export const ProjectRowContent = React.memo(({ project }: ProjectRowContentProps) => {
    const { setActiveView } = useWorkspace();
    const projectPath = project.path as string;

    // ── Process status ────────────────────────────────────────────────────
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const status = React.useMemo(() => {
        const entries = Object.entries(activeProcesses).filter(
            ([id, p]) => id.startsWith(projectPath + '::') && p.source === 'services'
        );
        if (entries.some(([, p]) => p.status === 'running')) return 'running';
        if (entries.some(([, p]) => p.status === 'error'))   return 'error';
        if (entries.some(([, p]) => p.status === 'stopped')) return 'stopped';
        return 'idle';
    }, [activeProcesses, projectPath]);

    // ── Sonar ─────────────────────────────────────────────────────────────
    const { projectLinks } = useSonarStore();
    const link    = projectLinks[projectPath] || {};
    const sonarKey = (link.projectKey as string) || (project.name as string);
    const { data: sonarMetrics } = useSonarMetrics(projectPath, sonarKey);
    const qg = sonarMetrics?.qualityGate || 'NONE';

    return (
        <div className="flex-1 min-w-0">
            {/* Row 1: name + badges */}
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold truncate text-slate-300">
                    {project.name}
                </span>

                {project.project_type && (
                    <Badge
                        variant="outline"
                        className={cn(
                            'text-[9px] px-1.5 py-0 border shrink-0 font-mono uppercase',
                            TYPE_BADGE[project.project_type as string] ?? 'bg-slate-700 text-slate-400'
                        )}
                    >
                        {project.project_type}
                    </Badge>
                )}

                {sonarMetrics && (
                    <TooltipProvider delay={400}>
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <div
                                        onClick={e => { e.stopPropagation(); setActiveView('sonar'); }}
                                        className={cn(
                                            'flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors',
                                            qg === 'OK'    ? 'text-emerald-500' :
                                            qg === 'ERROR' ? 'text-rose-500'    : 'text-slate-600'
                                        )}
                                    >
                                        <div className={cn(
                                            'w-1.5 h-1.5 rounded-full',
                                            qg === 'OK'    ? 'bg-emerald-500' :
                                            qg === 'ERROR' ? 'bg-rose-500'    : 'bg-slate-700'
                                        )} />
                                        <span className="text-[8px] font-black uppercase tracking-tighter">
                                            Sonar
                                        </span>
                                    </div>
                                }
                            />
                            <TooltipContent side="bottom" className="bg-slate-900 border-slate-800 p-3 shadow-2xl">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                                        Quality Gate: {qg}
                                    </p>
                                    <div className="flex gap-3 text-[9px]">
                                        <span className="text-red-400">Bugs: {sonarMetrics.bugs}</span>
                                        <span className="text-blue-400">Coverage: {sonarMetrics.coverage}%</span>
                                    </div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {/* Row 2: path + status text */}
            <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-slate-500 font-mono truncate opacity-60 group-hover:opacity-100 transition-opacity">
                    {projectPath.split(/[/\\]/).pop()}
                </span>
                {status !== 'idle' && (
                    <span className={cn(
                        'text-[9px] font-bold uppercase tracking-tighter shrink-0',
                        status === 'running' && 'text-emerald-400',
                        status === 'error'   && 'text-red-400',
                        status === 'stopped' && 'text-slate-500',
                    )}>
                        • {status === 'stopped' ? 'parado' : status}
                    </span>
                )}
            </div>
        </div>
    );
});
