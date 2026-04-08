import React, { useState, useRef, useEffect } from 'react';
import { ProjectRow } from '../project/ProjectRow';
import { Project } from '../../context/WorkspaceContext';
import { Button } from '../ui/button';
import { useProcessStore } from '../../stores/processStore';
import { 
    ContextMenu, 
    ContextMenuContent, 
    ContextMenuItem, 
    ContextMenuSeparator, 
    ContextMenuTrigger 
} from '../ui/context-menu';
import { Play, Square, Terminal, RotateCcw, Settings, Package, Zap, Wand2, Download } from 'lucide-react';

function getInstallCommand(projectType: string, buildSystem?: string): string {
    const type = String(projectType || '').toLowerCase();
    if (type.includes('gradle') || buildSystem === 'gradle') return './gradlew build';
    if (type.includes('maven') || buildSystem === 'maven') return 'mvn clean install -DskipTests';
    if (type.includes('java')) return 'mvn clean install -DskipTests';
    if (type.includes('bun')) return 'bun install';
    if (type.includes('python')) return 'pip install -r requirements.txt';
    if (type.includes('rust') || type.includes('cargo')) return 'cargo build';
    if (type.includes('go')) return 'go mod download';
    return 'npm install';
}

function getTypePresets(projectType: string, buildSystem?: string): string[] {
    const type = String(projectType || '').toLowerCase();

    if (type === 'java') {
        const isGradle = buildSystem === 'gradle';
        if (isGradle) return [
            './gradlew build',
            './gradlew bootRun',
            './gradlew clean',
            './gradlew test',
            './gradlew dependencies',
            'java -jar build/libs/*.jar',
        ];
        return [
            'mvn clean install -DskipTests',
            'mvn spring-boot:run',
            'mvn package',
            'mvn test',
            'mvn clean',
            'java -jar target/*.jar',
        ];
    }

    if (type === 'go') return [
        'go run .',
        'go build .',
        'go test ./...',
        'go mod tidy',
        'go vet ./...',
        'go mod download',
    ];

    if (type === 'rust') return [
        'cargo run',
        'cargo build',
        'cargo build --release',
        'cargo test',
        'cargo clean',
        'cargo check',
    ];

    if (type === 'python') return [
        'python main.py',
        'python app.py',
        'python -m pytest',
        'pip install -r requirements.txt',
        'uvicorn main:app --reload',
        'python -m venv venv',
    ];

    return [];
}

interface ProjectListPaneProps {
    projects: Project[];
    selectedProjects: string[];
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onToggleSelect: (path: string) => void;
    onPlayScript: (path: string, script: string) => void;
    onOpenSettings: (path: string, tab?: string) => void;
    onQuickAction: (path: string, action: 'start' | 'stop' | 'logs' | 'restart') => void;
}

export const ProjectListPane: React.FC<ProjectListPaneProps> = ({
    projects,
    selectedProjects,
    onSelectAll,
    onDeselectAll,
    onToggleSelect,
    onPlayScript,
    onOpenSettings,
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
        const entries = Object.entries(activeProcesses).filter(([id]) => id.startsWith(path + '::'));
        if (entries.some(([_, p]) => p.status === 'running')) return 'running';
        if (entries.some(([_, p]) => p.status === 'error')) return 'error';
        if (entries.some(([_, p]) => p.status === 'stopped')) return 'stopped';
        return 'idle';
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
            <div className="flex-1 overflow-y-auto">
                {projects.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">No projects found.</div>
                ) : (
                    projects.map(project => {
                        const path = (project.path as string) || '';
                        if (!path) return null;
                        const status = getProjectStatus(path);
                        
                        return (
                            <ContextMenu key={path}>
                                <ContextMenuTrigger>
                                    <ProjectRow
                                        project={project}
                                        status={status}
                                        isSelected={selectedProjects.includes(path)}
                                        onToggleSelect={() => onToggleSelect(path)}
                                        onOpenSettings={() => onOpenSettings(path)}
                                        onPlayScript={(script) => onPlayScript(path, script)}
                                        onQuickAction={(action) => onQuickAction(path, action)}
                                    />
                                </ContextMenuTrigger>
                                <ContextMenuContent className="w-64 bg-slate-900 border-slate-800 shadow-2xl">
                                    <div className="px-2 py-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800/50 mb-1">
                                        Acciones Rápidas
                                    </div>
                                    <ContextMenuItem onClick={() => onQuickAction(path, 'start')} className="gap-2 text-xs text-emerald-400 hover:bg-emerald-500/10">
                                        <Play size={14} /> Ejecutar Principal
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => onQuickAction(path, 'stop')} className="gap-2 text-xs text-rose-400 hover:bg-rose-500/10">
                                        <Square size={14} /> Detener Procesos
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => onQuickAction(path, 'restart')} className="gap-2 text-xs text-blue-400 hover:bg-blue-500/10">
                                        <RotateCcw size={14} /> Reiniciar
                                    </ContextMenuItem>
                                    <ContextMenuSeparator className="bg-slate-800" />
                                    <ContextMenuItem onClick={() => onQuickAction(path, 'logs')} className="gap-2 text-xs text-slate-300">
                                        <Terminal size={14} /> Ver Logs
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => onPlayScript(path, getInstallCommand(String(project.project_type || ''), project.build_system))}
                                        className="gap-2 text-xs text-amber-400 hover:bg-amber-500/10"
                                    >
                                        <Download size={14} /> Install
                                    </ContextMenuItem>
                                    {project.scripts && project.scripts.length > 0 && (
                                        <>
                                            <ContextMenuSeparator className="bg-slate-800" />
                                            <div className="px-2 py-1 text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                                Scripts
                                            </div>
                                            {project.scripts.slice(0, 8).map(script => (
                                                <ContextMenuItem
                                                    key={script}
                                                    onClick={() => onPlayScript(path, script)}
                                                    className="gap-2 text-xs text-slate-300 hover:bg-microtermix-neon/10 hover:text-microtermix-neon"
                                                >
                                                    <Play size={11} className="shrink-0 opacity-60" />
                                                    <span className="truncate font-mono">{script}</span>
                                                </ContextMenuItem>
                                            ))}
                                        </>
                                    )}
                                    {(() => {
                                        const presets = getTypePresets(String(project.project_type || ''), project.build_system);
                                        const existingScripts = project.scripts || [];
                                        const filteredPresets = presets.filter(p => !existingScripts.includes(p));
                                        return filteredPresets.length > 0 ? (
                                            <>
                                                <ContextMenuSeparator className="bg-slate-800" />
                                                <div className="px-2 py-1 text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                                    Presets
                                                </div>
                                                {filteredPresets.map(preset => (
                                                    <ContextMenuItem
                                                        key={preset}
                                                        onClick={() => onPlayScript(path, preset)}
                                                        className="gap-2 text-xs text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                                                    >
                                                        <Wand2 size={11} className="shrink-0 opacity-60" />
                                                        <span className="truncate font-mono">{preset}</span>
                                                    </ContextMenuItem>
                                                ))}
                                            </>
                                        ) : null;
                                    })()}
                                    <ContextMenuSeparator className="bg-slate-800" />
                                    <ContextMenuItem onClick={() => onOpenSettings(path, 'envs')} className="gap-2 text-xs text-slate-300">
                                        <Zap size={14} /> Environments
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => onOpenSettings(path, 'deps')} className="gap-2 text-xs text-slate-300">
                                        <Package size={14} /> Dependencies
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => onOpenSettings(path)} className="gap-2 text-xs text-slate-400">
                                        <Settings size={14} /> Configuración
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        );
                    })
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
