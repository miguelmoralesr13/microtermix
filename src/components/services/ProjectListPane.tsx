import React, { useState, useRef, useEffect } from 'react';
import { ProjectRow } from '../ProjectRow';
import { Project } from '../../context/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { useProcessStore } from '../../stores/processStore';

interface ProjectListPaneProps {
    projects: Project[];
    selectedProjects: string[];
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onToggleSelect: (path: string) => void;
    onPlayScript: (path: string, script: string) => void;
    onOpenLogs: (path: string) => void;
    onOpenEnvs: (path: string) => void;
    onOpenScripts: (path: string) => void;
    onQuickAction: (path: string, action: 'start' | 'stop') => void;
}

export const ProjectListPane: React.FC<ProjectListPaneProps> = ({
    projects,
    selectedProjects,
    onSelectAll,
    onDeselectAll,
    onToggleSelect,
    onPlayScript,
    onOpenLogs,
    onOpenEnvs,
    onOpenScripts,
    onQuickAction
}) => {
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem('microtermix-project-pane-width');
        return saved ? parseInt(saved, 10) : 352;
    });

    const isDragging = useRef(false);
    const widthRef = useRef(width);
    const activeProcesses = useProcessStore(s => s.activeProcesses);

    useEffect(() => {
        widthRef.current = width;
    }, [width]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            setWidth(prev => Math.max(200, Math.min(prev + e.movementX, 800)));
        };

        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                document.body.style.cursor = 'default';
                localStorage.setItem('microtermix-project-pane-width', widthRef.current.toString());
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const getProjectStatus = (path: string) => {
        // Logic to determine project status from activeProcesses
        const running = Object.entries(activeProcesses).some(([id, proc]) => 
            id.startsWith(path + '::') && proc.status === 'running'
        );
        return running ? 'running' : 'idle';
    };

    return (
        <div
            className="flex flex-col border-r border-slate-800 bg-slate-950/30 overflow-hidden shrink-0 relative"
            style={{ width: `${width}px` }}
        >
            <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center shrink-0 gap-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
                    Proyectos <span className="text-slate-600">({projects.length})</span>
                </h2>
                {selectedProjects.length > 0 ? (
                    <Button variant="ghost" size="xs" onClick={onDeselectAll}
                        className="text-slate-400 hover:text-slate-200 text-[10px] h-auto py-0.5">
                        Deseleccionar
                    </Button>
                ) : (
                    <Button variant="ghost" size="xs" onClick={onSelectAll}
                        className="text-microtermix-neon hover:text-microtermix-neon/80 hover:bg-microtermix-neon/10 text-[10px] h-auto py-0.5">
                        Seleccionar todos
                    </Button>
                )}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                {projects.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">No projects found.</div>
                ) : (
                    projects.map(project => (
                        <ProjectRow
                            key={project.path as string}
                            project={project}
                            status={getProjectStatus(project.path as string)}
                            isSelected={selectedProjects.includes(project.path as string)}
                            onToggleSelect={() => onToggleSelect(project.path as string)}
                            onOpenLogs={() => onOpenLogs(project.path as string)}
                            onOpenEnvs={() => onOpenEnvs(project.path as string)}
                            onOpenScripts={() => onOpenScripts(project.path as string)}
                            onPlayScript={(script: string) => onPlayScript(project.path as string, script)}
                            onQuickAction={(action) => onQuickAction(project.path as string, action)}
                        />
                    ))
                )}
            </div>

            {/* Draggable handle */}
            <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-microtermix-neon/50 transition-colors z-10"
                onMouseDown={(e) => {
                    e.preventDefault();
                    isDragging.current = true;
                    document.body.style.cursor = 'col-resize';
                }}
            />
        </div>
    );
};
