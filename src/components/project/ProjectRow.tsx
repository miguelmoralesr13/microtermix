import React from 'react';
import { 
    Settings, MoreVertical
} from 'lucide-react';
import { useWorkspace, Project } from '../../context/WorkspaceContext';
import { cn } from '../../lib/utils';
import { 
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../ui/tooltip";
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useSonarStore } from '../../stores/sonarStore';
import { useSonarMetrics } from '../../hooks/queries/useSonarQueries';

interface ProjectRowProps {
    project: Project;
    status: 'running' | 'error' | 'stopped' | 'idle';
    isSelected: boolean;
    onToggleSelect: () => void;
    onOpenSettings: () => void;
    onPlayScript: (script: string) => void;
    onQuickAction: (action: 'start' | 'stop' | 'logs' | 'restart') => void;
}

const TYPE_BADGE: Record<string, string> = {
    node: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    go:   'bg-sky-500/15 text-sky-400 border-sky-500/30',
    rust: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    java: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    bun:  'bg-pink-500/15 text-pink-400 border-pink-500/30',
};

const STATUS_BAR: Record<string, string> = {
    running: 'bg-emerald-400 shadow-[0_0_8px_theme(colors.emerald.400)]',
    error:   'bg-red-400 shadow-[0_0_8px_theme(colors.red.400)]',
    stopped: 'bg-slate-500',
    idle:    'bg-transparent',
};

const ProjectRow = React.memo(({ 
    project, status, isSelected, onToggleSelect, 
    onOpenSettings 
}: ProjectRowProps) => {
    const { setActiveView } = useWorkspace();
    const projectPath = project.path as string;

    const { projectLinks } = useSonarStore();
    const link = projectLinks[projectPath] || {};
    const sonarKey = (link.projectKey as string) || (project.name as string);
    const { data: sonarMetrics } = useSonarMetrics(sonarKey);
    const qg = sonarMetrics?.qualityGate || 'NONE';

    // Badge de conteo de variables ENV
    const activeVarsCount = React.useMemo(() => {
        try {
            const rawStore = localStorage.getItem(`microtermix-envs-${projectPath.replace(/[/\\:]/g, '_')}`);
            if (rawStore) {
                const parsed = JSON.parse(rawStore);
                const activeEnv = parsed.activeEnv || 'dev';
                return Object.keys(parsed.envs?.[activeEnv] || {}).length;
            }
        } catch { }
        return 0;
    }, [projectPath]);

    const handleContextMenu = () => {
        // El menú contextual real se implementará en ProjectListPane o ServicesView 
        // para centralizar el DOM, pero aquí capturamos el evento si es necesario.
    };

    return (
        <TooltipProvider delay={400}>
            <div 
                className={cn(
                    "group flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 transition-all relative select-none",
                    isSelected ? "bg-blue-600/10 border-blue-500/30" : "hover:bg-slate-800/40"
                )}
                onContextMenu={handleContextMenu}
            >
                {/* Status bar lateral izquierda */}
                <div className={cn(
                    'absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-colors',
                    STATUS_BAR[status] ?? 'bg-transparent',
                )} />

                {/* Checkbox */}
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className="accent-microtermix-neon shrink-0 w-3.5 h-3.5 ml-2 cursor-pointer"
                />

                {/* Content Area */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleSelect}>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("text-xs font-bold truncate", isSelected ? "text-blue-400" : "text-slate-300")}>
                            {project.name}
                        </span>
                        {project.project_type && (
                            <Badge variant="outline" className={cn(
                                'text-[9px] px-1.5 py-0 border shrink-0 font-mono uppercase',
                                TYPE_BADGE[project.project_type as string] ?? 'bg-slate-700 text-slate-400',
                            )}>
                                {project.project_type}
                            </Badge>
                        )}
                        {sonarMetrics && (
                            <Tooltip>
                                <TooltipTrigger render={
                                    <div onClick={(e) => { e.stopPropagation(); setActiveView('sonar'); }} className={cn("flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors", qg === 'OK' ? "text-emerald-500" : qg === 'ERROR' ? "text-rose-500" : "text-slate-600")}>
                                        <div className={cn("w-1 h-1 rounded-full", qg === 'OK' ? "bg-emerald-500" : qg === 'ERROR' ? "bg-rose-500" : "bg-slate-700")} />
                                        <span className="text-[8px] font-black uppercase tracking-tighter">Sonar</span>
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
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-slate-500 font-mono truncate opacity-60 group-hover:opacity-100 transition-opacity">
                            {projectPath.split(/[/\\]/).pop()}
                        </span>
                        {status !== 'idle' && (
                            <span className={cn(
                                'text-[9px] font-bold uppercase tracking-tighter',
                                status === 'running' && 'text-emerald-400',
                                status === 'error'   && 'text-red-400',
                                status === 'stopped' && 'text-slate-500',
                            )}>
                                • {status === 'stopped' ? 'parado' : status}
                            </span>
                        )}
                    </div>
                </div>

                {/* Single Settings Button */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all ml-2">
                    <Tooltip>
                        <TooltipTrigger render={
                            <Button 
                                variant="ghost" 
                                size="icon-xs" 
                                onClick={(e) => { e.stopPropagation(); onOpenSettings(); }} 
                                className="text-slate-500 hover:text-microtermix-neon relative"
                            >
                                <Settings size={13} />
                                {activeVarsCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-microtermix-neon text-slate-950 text-[7px] font-black w-3 h-3 rounded-full flex items-center justify-center border border-slate-950">
                                        {activeVarsCount}
                                    </span>
                                )}
                            </Button>
                        } />
                        <TooltipContent>Configuración Completa</TooltipContent>
                    </Tooltip>

                    <Button 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-slate-600 hover:text-microtermix-neon hover:bg-microtermix-neon/10 transition-colors cursor-context-menu"
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            // Dispatch a contextmenu event to trigger the shadcn menu programmatically if needed,
                            // but usually being inside ContextMenuTrigger is enough.
                            const event = new MouseEvent('contextmenu', {
                                bubbles: true,
                                cancelable: true,
                                clientX: e.clientX,
                                clientY: e.clientY
                            });
                            e.currentTarget.dispatchEvent(event);
                        }}
                    >
                        <MoreVertical size={13} />
                    </Button>
                </div>
            </div>
        </TooltipProvider>
    );
});

export { ProjectRow };
export type { ProjectRowProps };
