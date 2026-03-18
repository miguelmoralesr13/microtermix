import React, { useState, useMemo } from 'react';
import { useWorkspace, Project } from '../context/WorkspaceContext';
import { useProcessStore } from '../stores/processStore';
import { useProjectEnvs } from './useProjectEnvs';
import { EnvManager } from './EnvManager';
import { Package, Plus, Play, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSonarStore } from '../stores/sonarStore';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ProjectRowProps {
    project: Project;
    isSelected: boolean;
    onToggleSelect: () => void;
    onPlayScript: (script: string) => void;
}

export const ProjectRow: React.FC<ProjectRowProps> = ({ project, isSelected, onToggleSelect, onPlayScript }) => {
    const { setTargetTerminalTab, executeProjectScript } = useWorkspace();
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const updateProcessStatus = useProcessStore(s => s.updateProcessStatus);

    const projectPath = project.path as string;
    const isNode = project.project_type === 'node';
    const isJava = project.project_type === 'java';

    const JAVA_PRESETS = [
        { name: 'Mvn: Clean & Install', cmd: 'mvn clean install -DskipTests' },
        { name: 'Mvn: Spring Boot Run', cmd: 'mvn spring-boot:run' },
        { name: 'Mvn: Package', cmd: 'mvn package' },
        { name: 'Mvn: Test', cmd: 'mvn test' },
        { name: 'Gradle: Build', cmd: './gradlew build' },
        { name: 'Gradle: BootRun', cmd: './gradlew bootRun' },
        { name: 'Gradle: Clean', cmd: './gradlew clean' },
        { name: 'Jar: Run (target)', cmd: 'java -jar target/*.jar' },
        { name: 'Jar: Run (build/libs)', cmd: 'java -jar build/libs/*.jar' },
    ];

    const filteredScripts = useMemo(() => {
        let scripts = project.scripts || [];

        // Smart Filter: If Node, hide obvious Java commands that might be in global saved commands
        if (isNode) {
            scripts = scripts.filter(s => !['mvn ', 'gradle', './gradlew', 'java -jar'].some(k => s.includes(k)));
        }

        // If Java, hide Node commands
        if (isJava) {
            scripts = scripts.filter(s => !['npm ', 'yarn ', 'pnpm ', 'bun '].some(k => s.includes(k)));
        }

        return scripts;
    }, [project.scripts, isNode, isJava]);

    const { activeVars } = useProjectEnvs(projectPath);
    const [envManagerOpen, setEnvManagerOpen] = useState(false);
    const [addDepsOpen, setAddDepsOpen] = useState(false);
    const [addDepsPackages, setAddDepsPackages] = useState('');
    const [addDepsDev, setAddDepsDev] = useState(false);
    const [scriptMenuOpen, setScriptMenuOpen] = useState(false);

    const runNpmCommand = async (script: string) => {
        const serviceId = `${projectPath}::${script} `;
        try {
            setTargetTerminalTab(serviceId);
            await executeProjectScript(projectPath, script, {
                globalEnvName: 'none'
            });
        } catch (e) {
            console.error('npm command failed', e);
            updateProcessStatus(serviceId, 'error');
        }
    };

    const handleNpmInstall = () => {
        runNpmCommand('npm install');
    };

    const handleAddDepsInstall = () => {
        const packages = addDepsPackages.trim().split(/\s+/).filter(Boolean).join(' ');
        if (!packages) return;
        const script = addDepsDev ? `npm install ${packages} --save-dev` : `npm install ${packages}`;
        runNpmCommand(script);
        setAddDepsPackages('');
        setAddDepsOpen(false);
    };

    const activeProcessIds = useMemo(() =>
        Object.keys(activeProcesses).filter(id => id.startsWith(`${projectPath}::`)),
        [activeProcesses, projectPath]);

    const processState = activeProcessIds.length > 0 ? activeProcesses[activeProcessIds[0]] : null;
    const status = processState?.status || 'idle';

    const TYPE_BADGE: Record<string, string> = {
        node: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        bun: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        go: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        rust: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        python: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        java: 'bg-red-500/15 text-red-400 border-red-500/30',
    };

    const FRAMEWORK_BADGE: Record<string, string> = {
        django: 'bg-emerald-700/20 text-emerald-300 border-emerald-700/40',
        fastapi: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
        flask: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
        'spring-boot': 'bg-green-600/20 text-green-300 border-green-600/40',
    };

    const STATUS_BAR: Record<string, string> = {
        running: 'bg-emerald-400',
        error: 'bg-red-400',
        stopped: 'bg-slate-500',
        idle: 'bg-transparent',
    };

    const sonarMetrics = useSonarStore(s => s.metricsCache[projectPath]);
    const qg = sonarMetrics?.qualityGate || 'NONE';

    return (
        <>
            <div className={cn(
                'group flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60',
                'hover:bg-slate-800/40 transition-colors relative',
                isSelected && 'bg-slate-800/30',
            )}>
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
                    className="accent-microtermix-neon shrink-0 w-3.5 h-3.5 ml-2"
                />

                {/* Nombre + Badge tipo */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleSelect}>
                    <div className="flex items-center gap-1.5 min-w-0">
                        {qg !== 'NONE' && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger render={
                                        <div className="shrink-0">
                                            {qg === 'OK' ? (
                                                <ShieldCheck size={14} className="text-emerald-500" />
                                            ) : (
                                                <ShieldAlert size={14} className="text-red-500" />
                                            )}
                                        </div>
                                    } />
                                    <TooltipContent className="p-2 space-y-1 bg-slate-900 border-slate-700">
                                        <p className="font-bold text-[10px] text-slate-200">Sonar Quality Gate: {qg}</p>
                                        <div className="flex gap-3 text-[9px]">
                                            <span className="text-red-400">Bugs: {sonarMetrics?.bugs}</span>
                                            <span className="text-blue-400">Coverage: {sonarMetrics?.coverage}%</span>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        <span className="text-xs font-semibold text-slate-200 truncate">{project.name}</span>
                        <div className="flex items-center gap-1 overflow-hidden">
                            {project.project_type && (
                                <Badge className={cn(
                                    'text-[8px] px-1 py-0 border shrink-0 font-mono uppercase rounded leading-tight',
                                    TYPE_BADGE[project.project_type as string] ?? 'bg-slate-700 text-slate-400 border-slate-600',
                                )}>
                                    {project.project_type}
                                </Badge>
                            )}
                            {project.framework && (
                                <Badge className={cn(
                                    'text-[8px] px-1 py-0 border shrink-0 font-mono uppercase rounded leading-tight',
                                    FRAMEWORK_BADGE[project.framework] ?? 'bg-slate-800 text-slate-500 border-slate-700',
                                )}>
                                    {project.framework}
                                </Badge>
                            )}
                        </div>
                    </div>
                    {status !== 'idle' && (
                        <p className={cn(
                            'text-[9px] mt-0.5',
                            status === 'running' && 'text-emerald-400',
                            status === 'error' && 'text-red-400',
                            status === 'stopped' && 'text-slate-500',
                        )}>
                            {status === 'stopped' ? 'parado' : status}
                        </p>
                    )}
                </div>

                {/* Action buttons */}
                <TooltipProvider delay={400}>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {/* Scripts popover */}
                        {project.scripts && project.scripts.length > 0 && (
                            <Popover open={scriptMenuOpen} onOpenChange={setScriptMenuOpen}>
                                <PopoverTrigger render={
                                    <Button variant="ghost" size="icon-xs" className="text-slate-500 hover:text-microtermix-neon">
                                        <Play size={13} className="fill-current" />
                                    </Button>
                                } />
                                <PopoverContent
                                    side="bottom"
                                    align="start"
                                    className="w-56 p-1 bg-slate-900 border-slate-700 max-h-80 overflow-y-auto"
                                >
                                    {isJava && (
                                        <>
                                            <p className="px-2 py-1 text-[9px] font-bold text-orange-500 uppercase tracking-wider border-b border-slate-800/60 mb-1 bg-orange-500/5">
                                                Java Presets
                                            </p>
                                            {JAVA_PRESETS.map(preset => (
                                                <button
                                                    key={preset.name}
                                                    className="w-full text-left px-2 py-1 text-[11px] text-slate-300 hover:bg-orange-500/10 hover:text-orange-400 rounded transition-colors flex flex-col"
                                                    onClick={() => { onPlayScript(preset.cmd); setScriptMenuOpen(false); }}
                                                >
                                                    <span className="font-bold">{preset.name}</span>
                                                    <span className="text-[9px] opacity-40 truncate">{preset.cmd}</span>
                                                </button>
                                            ))}
                                            <div className="h-px bg-slate-800 my-1" />
                                        </>
                                    )}

                                    <p className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-1">
                                        Scripts
                                    </p>
                                    {filteredScripts.length === 0 && (
                                        <p className="px-2 py-2 text-[10px] text-slate-600 italic">No scripts found</p>
                                    )}
                                    {filteredScripts.map(s => (
                                        <button
                                            key={s}
                                            className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-microtermix-neon rounded transition-colors"
                                            onClick={() => { onPlayScript(s); setScriptMenuOpen(false); }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </PopoverContent>
                            </Popover>
                        )}

                        {/* npm install + add deps (solo node) */}
                        {isNode && (
                            <>
                                <Tooltip>
                                    <TooltipTrigger render={
                                        <Button variant="ghost" size="icon-xs"
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleNpmInstall(); }}
                                            className="text-slate-500 hover:text-microtermix-neon" />
                                    }>
                                        <Package size={12} />
                                    </TooltipTrigger>
                                    <TooltipContent>npm install</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger render={
                                        <Button variant="ghost" size="icon-xs"
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setAddDepsOpen(true); }}
                                            className="text-slate-500 hover:text-microtermix-neon" />
                                    }>
                                        <Plus size={12} />
                                    </TooltipTrigger>
                                    <TooltipContent>Agregar dependencias</TooltipContent>
                                </Tooltip>
                            </>
                        )}

                        {/* ENV button */}
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="ghost" size="icon-xs"
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEnvManagerOpen(true); }}
                                    className="text-slate-500 hover:text-microtermix-neon font-mono text-[9px] w-auto px-1.5 h-6" />
                            }>
                                <span>ENV{Object.keys(activeVars).length > 0 && ` (${Object.keys(activeVars).length})`}</span>
                            </TooltipTrigger>
                            <TooltipContent>Variables de entorno</TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
            </div>

            {/* Modal: Agregar dependencias */}
            <Dialog open={addDepsOpen} onOpenChange={setAddDepsOpen}>
                <DialogContent className="max-w-md bg-slate-900 border-slate-700">
                    <DialogHeader>
                        <DialogTitle className="text-slate-200">Agregar dependencias</DialogTitle>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{projectPath}</p>
                    </DialogHeader>

                    <Input
                        value={addDepsPackages}
                        onChange={e => setAddDepsPackages(e.target.value)}
                        placeholder="lodash axios react"
                        className="bg-slate-950 border-slate-700 focus:border-microtermix-neon"
                        onKeyDown={e => e.key === 'Enter' && handleAddDepsInstall()}
                        autoFocus
                    />

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name={`depsType-${projectPath}`} checked={!addDepsDev}
                                onChange={() => setAddDepsDev(false)} className="accent-microtermix-neon" />
                            <span className="text-xs text-slate-300">Dependencies</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name={`depsType-${projectPath}`} checked={addDepsDev}
                                onChange={() => setAddDepsDev(true)} className="accent-microtermix-neon" />
                            <span className="text-xs text-slate-300">Dev Dependencies</span>
                        </label>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddDepsOpen(false)}
                            className="text-slate-400">Cancelar</Button>
                        <Button
                            onClick={handleAddDepsInstall}
                            disabled={!addDepsPackages.trim()}
                            className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold">
                            Instalar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {envManagerOpen && (
                <EnvManager
                    projectPath={projectPath}
                    onClose={() => setEnvManagerOpen(false)}
                />
            )}
        </>
    );
};
