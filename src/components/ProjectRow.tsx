import React from 'react';
import { 
    Terminal, Play, Square, Settings, Zap
} from 'lucide-react';
import { useWorkspace, Project } from '../context/WorkspaceContext';
import { cn } from '../lib/utils';
import { 
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";
import { Button } from './ui/button';
import { useSonarStore } from '../stores/sonarStore';
import { useSonarMetrics } from '../hooks/queries/useSonarQueries';

interface ProjectRowProps {
    project: Project;
    status: 'running' | 'error' | 'stopped' | 'idle';
    isSelected: boolean;
    onToggleSelect: () => void;
    onOpenLogs: () => void;
    onOpenEnvs: () => void;
    onOpenScripts: () => void;
    onPlayScript: (script: string) => void;
    onQuickAction: (action: 'start' | 'stop') => void;
}

const ProjectRow = React.memo(({ 
    project, status, isSelected, onToggleSelect, 
    onOpenLogs, onOpenEnvs, onOpenScripts, onQuickAction 
}: ProjectRowProps) => {
    const { setActiveView } = useWorkspace();

    const STATUS_BAR: Record<string, string> = {
        running: 'bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]',
        error: 'bg-red-500 shadow-[0_0_8px_theme(colors.red.500)]',
        stopped: 'bg-slate-600',
    };

    const projectPath = project.path as string;
    const { projectLinks } = useSonarStore();
    const link = projectLinks[projectPath] || {};
    const sonarKey = (link.projectKey as string) || (project.name as string);
    const { data: sonarMetrics } = useSonarMetrics(sonarKey);
    const qg = sonarMetrics?.qualityGate || 'NONE';

    return (
        <TooltipProvider delay={400}>
            <div className={cn("flex items-center px-4 py-2 hover:bg-slate-900/50 group transition-all border-b border-slate-800/30 relative", isSelected && "bg-blue-600/10 border-blue-500/30")}>
                <div className={cn('absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-colors', STATUS_BAR[status] ?? 'bg-transparent')} />
                <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="accent-microtermix-neon shrink-0 w-3.5 h-3.5 ml-2" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleSelect}>
                    <div className="px-3 flex items-center justify-between min-w-0">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className={cn("text-xs font-bold truncate", isSelected ? "text-blue-400" : "text-slate-300")}>{project.name}</span>
                                {project.project_type && (
                                    <span className="text-[9px] uppercase font-black text-slate-600 border border-slate-800 px-1 rounded bg-slate-900/50">
                                        {project.project_type}
                                    </span>
                                )}
                                {sonarMetrics && (
                                    <Tooltip>
                                        <TooltipTrigger render={
                                            <div onClick={(e) => { e.stopPropagation(); setActiveView('sonar'); }} className={cn("flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors", qg === 'OK' ? "text-emerald-500" : qg === 'ERROR' ? "text-rose-500" : "text-slate-600")}>
                                                <div className={cn("w-1.5 h-1.5 rounded-full", qg === 'OK' ? "bg-emerald-500" : qg === 'ERROR' ? "bg-rose-500" : "bg-slate-700")} />
                                                <span className="text-[9px] font-black uppercase tracking-tighter">Sonar</span>
                                            </div>
                                        } />
                                        <TooltipContent side="bottom" className="bg-slate-900 border-slate-800 p-3 shadow-2xl">
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">Quality Gate: {qg}</p>
                                                <div className="flex gap-3 text-[9px]"><span className="text-red-400">Bugs: {sonarMetrics?.bugs}</span><span className="text-blue-400">Coverage: {sonarMetrics?.coverage}%</span></div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[10px] text-slate-500 font-mono truncate opacity-60 group-hover:opacity-100 transition-opacity">
                                    {projectPath.split(/[/\\]/).pop()}
                                </span>
                            </div>
                        </div>

                        {/* Quick Action Icons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all ml-4">
                            <Tooltip>
                                <TooltipTrigger render={
                                    <Button variant="ghost" size="icon-xs" onClick={(e: any) => { e.stopPropagation(); onOpenEnvs(); }} className="text-slate-500 hover:text-microtermix-neon">
                                        <Settings size={13} />
                                    </Button>
                                } />
                                <TooltipContent>Environments</TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                                <TooltipTrigger render={
                                    <Button variant="ghost" size="icon-xs" onClick={(e: any) => { e.stopPropagation(); onOpenScripts(); }} className="text-slate-500 hover:text-microtermix-accent">
                                        <Zap size={13} />
                                    </Button>
                                } />
                                <TooltipContent>Scripts</TooltipContent>
                            </Tooltip>

                            <div className="w-px h-3 bg-slate-800 mx-1" />

                            {status === 'running' ? (
                                <Tooltip>
                                    <TooltipTrigger render={
                                        <Button variant="ghost" size="icon-xs" onClick={(e: any) => { e.stopPropagation(); onQuickAction('stop'); }} className="text-rose-500 hover:bg-rose-500/10">
                                            <Square size={13} fill="currentColor" />
                                        </Button>
                                    } />
                                    <TooltipContent>Stop Service</TooltipContent>
                                </Tooltip>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger render={
                                        <Button variant="ghost" size="icon-xs" onClick={(e: any) => { e.stopPropagation(); onQuickAction('start'); }} className="text-emerald-500 hover:bg-emerald-500/10">
                                            <Play size={13} fill="currentColor" />
                                        </Button>
                                    } />
                                    <TooltipContent>Start Default</TooltipContent>
                                </Tooltip>
                            )}

                            <Tooltip>
                                <TooltipTrigger render={
                                    <Button variant="ghost" size="icon-xs" onClick={(e: any) => { e.stopPropagation(); onOpenLogs(); }} className={cn("transition-colors", status === 'running' ? "text-emerald-400" : "text-slate-500")}>
                                        <Terminal size={13} />
                                    </Button>
                                } />
                                <TooltipContent>View Logs</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
});

export { ProjectRow };
export type { ProjectRowProps };
