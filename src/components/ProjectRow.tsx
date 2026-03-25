import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspace, Project } from '../context/WorkspaceContext';
import { useProcessStore } from '../stores/processStore';
import { useProjectEnvs } from './useProjectEnvs';
import { EnvManager } from './EnvManager';
import { Package, Plus, Play, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSonarStore } from '../stores/sonarStore';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PackageExplorer } from './services/PackageExplorer';
import { toast } from 'sonner';

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
    const isNode = project.project_type === 'node' || project.project_type === 'bun';
    const isJava = project.project_type === 'java';
    const isPython = project.project_type === 'python';
    const isRust = project.project_type === 'rust';

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
        if (isNode) scripts = scripts.filter(s => !['mvn ', 'gradle', './gradlew', 'java -jar'].some(k => s.includes(k)));
        if (isJava) scripts = scripts.filter(s => !['npm ', 'yarn ', 'pnpm ', 'bun '].some(k => s.includes(k)));
        return scripts;
    }, [project.scripts, isNode, isJava]);

    const { activeVars } = useProjectEnvs(projectPath);
    const [envManagerOpen, setEnvManagerOpen] = useState(false);
    const [addDepsOpen, setAddDepsOpen] = useState(false);
    const [scriptMenuOpen, setScriptMenuOpen] = useState(false);

    const runNpmCommand = async (script: string) => {
        const serviceId = `${projectPath}::${script} `;
        try {
            setTargetTerminalTab(serviceId);
            await executeProjectScript(projectPath, script, { globalEnvName: 'none' });
        } catch (e) {
            console.error('Command failed', e);
            updateProcessStatus(serviceId, 'error');
        }
    };

    const isMaven = useMemo(() => {
        return isJava && ((project as any).package_manager === 'mvn' || (project as any).build_system === 'maven' || project.scripts?.some(s => s.includes('mvn ')));
    }, [isJava, project]);

    const javaFilteredPresets = useMemo(() => {
        if (!isJava) return [];
        if (isMaven) return JAVA_PRESETS.filter(p => p.name.startsWith('Mvn') || p.name.startsWith('Jar'));
        return JAVA_PRESETS.filter(p => p.name.startsWith('Gradle') || p.name.startsWith('Jar'));
    }, [isJava, isMaven]);

    const hasFile = async (path: string, filename: string) => {
        try {
            await invoke('read_file', { path: `${path}/${filename}` });
            return true;
        } catch (e) { return false; }
    };

    const handleNpmInstall = async () => {
        if (isPython) {
            const pipCmd = `if [ -d "venv" ]; then ./venv/bin/pip install -r requirements.txt; elif [ -d ".venv" ]; then ./.venv/bin/pip install -r requirements.txt; else pip install -r requirements.txt --break-system-packages; fi`;
            runNpmCommand(pipCmd);
        } else if (isJava) {
            const hasPom = await hasFile(projectPath, 'pom.xml');
            if (hasPom || isMaven) {
                runNpmCommand('mvn clean install -DskipTests');
            } else {
                const isGradleW = await hasFile(projectPath, 'gradlew') || await hasFile(projectPath, 'gradlew.bat');
                runNpmCommand(isGradleW ? './gradlew build' : 'gradle build');
            }
        } else if (isRust) {
            runNpmCommand('cargo build');
        } else {
            const manager = (project as any).package_manager || 'npm';
            runNpmCommand(`${manager} install`);
        }
    };

    const handleAddDepsInstall = async (packageName: string, isDev: boolean, version?: string) => {
        let manager = (project as any).package_manager || (project as any).build_system;
        if (!manager) {
            if (isPython) manager = 'pip';
            else if (isJava) manager = (await hasFile(projectPath, 'pom.xml')) ? 'mvn' : 'gradle';
            else if (project.project_type === 'go') manager = 'go';
            else if (project.project_type === 'rust') manager = 'cargo';
            else manager = isNode ? 'npm' : 'unknown';
        }

        if (isJava || manager === 'mvn' || manager === 'gradle') {
            try {
                const isM = manager === 'mvn' || await hasFile(projectPath, 'pom.xml');
                const filename = isM ? 'pom.xml' : (await hasFile(projectPath, 'build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle');
                const filePath = `${projectPath}/${filename}`;
                let content = await invoke<string>('read_file', { path: filePath });
                const v = version || 'latest';
                if (isM) {
                    const depXml = `\n        <dependency>\n            <groupId>${packageName.split(':')[0]}</groupId>\n            <artifactId>${packageName.split(':')[1]}</artifactId>\n            <version>${v}</version>\n        </dependency>`;
                    content = content.includes('<dependencies>') ? content.replace('<dependencies>', `<dependencies>${depXml}`) : content.replace('</project>', `    <dependencies>${depXml}\n    </dependencies>\n</project>`);
                } else {
                    const depLine = `\n    implementation("${packageName}:${v}")`;
                    content = content.match(/dependencies\s*\{/) ? content.replace(/dependencies\s*\{/, `dependencies {${depLine}`) : content + `\n\ndependencies {${depLine}\n}`;
                }
                await invoke('write_file', { path: filePath, content });
                toast.success(`Dependency added to ${filename}`);
                setAddDepsOpen(false); return;
            } catch (e) { console.error('Injection failed', e); }
        }

        let command = '';
        const pkgWithVersion = version ? `${packageName}==${version}` : packageName;
        switch (manager) {
            case 'go': command = `go get ${version ? `${packageName}@${version}` : packageName}`; break;
            case 'cargo': command = `cargo add ${packageName}${version ? ` --version ${version}` : ''}`; break;
            case 'pip': command = `if [ -d "venv" ]; then ./venv/bin/pip install ${pkgWithVersion}; elif [ -d ".venv" ]; then ./.venv/bin/pip install ${pkgWithVersion}; else pip install ${pkgWithVersion} --break-system-packages; fi`; break;
            case 'poetry': command = `poetry add ${packageName}${version ? `@${version}` : ''}`; break;
            case 'bun': command = `bun add ${version ? `${packageName}@${version}` : packageName}${isDev ? ' -d' : ''}`; break;
            case 'pnpm': command = `pnpm add ${version ? `${packageName}@${version}` : packageName}${isDev ? ' -D' : ''}`; break;
            case 'yarn': command = `yarn add ${version ? `${packageName}@${version}` : packageName}${isDev ? ' -D' : ''}`; break;
            default: if (isNode) command = `npm install ${version ? `${packageName}@${version}` : packageName}${isDev ? ' --save-dev' : ''}`;
        }
        if (command) {
            toast.info(`Executing: ${command}`);
            await executeProjectScript(projectPath, command, { globalEnvName: 'none' });
            setTargetTerminalTab(`${projectPath}::${command} `);
            setAddDepsOpen(false);
        }
    };

    const activeProcessIds = useMemo(() => Object.keys(activeProcesses).filter(id => id.startsWith(`${projectPath}::`)), [activeProcesses, projectPath]);
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

    const STATUS_BAR: Record<string, string> = {
        running: 'bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]',
        error: 'bg-red-500 shadow-[0_0_8px_theme(colors.red.500)]',
        stopped: 'bg-slate-600',
    };

    const sonarStore = useSonarStore();
    const sonarData = sonarStore.projects[projectPath];
    const qg = sonarData?.qualityGate || 'NONE';
    const sonarMetrics = sonarData?.metrics;

    return (
        <TooltipProvider delay={400}>
            <div className={cn("flex items-center px-4 py-2 hover:bg-slate-900/50 group transition-all border-b border-slate-800/30 relative", isSelected && "bg-blue-600/10 border-blue-500/30")}>
                <div className={cn('absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-colors', STATUS_BAR[status] ?? 'bg-transparent')} />
                <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="accent-microtermix-neon shrink-0 w-3.5 h-3.5 ml-2" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleSelect}>
                    <div className="flex items-center gap-1.5 min-w-0">
                        {qg !== 'NONE' && (
                            <Tooltip>
                                <TooltipTrigger render={<div className="shrink-0">{qg === 'OK' ? <ShieldCheck size={14} className="text-emerald-500" /> : <ShieldAlert size={14} className="text-red-500" />}</div>} />
                                <TooltipContent className="p-2 space-y-1 bg-slate-900 border-slate-700">
                                    <p className="font-bold text-[10px] text-slate-200">Sonar Quality Gate: {qg}</p>
                                    <div className="flex gap-3 text-[9px]"><span className="text-red-400">Bugs: {sonarMetrics?.bugs}</span><span className="text-blue-400">Coverage: {sonarMetrics?.coverage}%</span></div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <span className="text-xs font-semibold text-slate-200 truncate">{project.name}</span>
                        <div className="flex items-center gap-1 overflow-hidden">
                            {project.project_type && <Badge className={cn('text-[8px] px-1 py-0 border shrink-0 font-mono uppercase rounded leading-tight', TYPE_BADGE[project.project_type as string] ?? 'bg-slate-700 text-slate-400 border-slate-600')}>{project.project_type}</Badge>}
                        </div>
                    </div>
                    {status !== 'idle' && <p className={cn('text-[9px] mt-0.5', status === 'running' && 'text-emerald-400', status === 'error' && 'text-red-400', status === 'stopped' && 'text-slate-500')}>{status === 'stopped' ? 'parado' : status}</p>}
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    {project.scripts && project.scripts.length > 0 && (
                        <Popover open={scriptMenuOpen} onOpenChange={setScriptMenuOpen}>
                            <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="text-slate-500 hover:text-microtermix-neon"><Play size={13} className="fill-current" /></Button>} />
                            <PopoverContent side="bottom" align="start" className="w-56 p-1 bg-slate-900 border-slate-700 max-h-80 overflow-y-auto">
                                {isJava && (
                                    <>
                                        <p className="px-2 py-1 text-[9px] font-bold text-orange-500 uppercase tracking-wider border-b border-slate-800/60 mb-1 bg-orange-500/5">{isMaven ? 'Maven' : 'Gradle'} Presets</p>
                                        {javaFilteredPresets.map(preset => (
                                            <button key={preset.name} className="w-full text-left px-2 py-1 text-[11px] text-slate-300 hover:bg-orange-500/10 hover:text-orange-400 rounded transition-colors flex flex-col" onClick={() => { onPlayScript(preset.cmd); setScriptMenuOpen(false); }}>
                                                <span className="font-bold">{preset.name}</span><span className="text-[9px] opacity-40 truncate">{preset.cmd}</span>
                                            </button>
                                        ))}
                                        <div className="h-px bg-slate-800 my-1" />
                                    </>
                                )}
                                <p className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-1">Scripts</p>
                                {filteredScripts.length === 0 && <p className="px-2 py-2 text-[10px] text-slate-600 italic">No scripts found</p>}
                                {filteredScripts.map(s => (
                                    <button key={s} className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-microtermix-neon rounded transition-colors" onClick={() => { onPlayScript(s); setScriptMenuOpen(false); }}>{s}</button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    )}

                    {(isNode || isPython || isJava || isRust) && (
                        <>
                            <Tooltip>
                                <TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); handleNpmInstall(); }} className="text-slate-500 hover:text-microtermix-neon"><Package size={12} /></Button>} />
                                <TooltipContent>{isPython ? 'pip install' : isJava ? 'Sync (mvn/gradle)' : isRust ? 'cargo build' : 'Install (lockfile)'}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); setAddDepsOpen(true); }} className="text-slate-500 hover:text-microtermix-neon"><Plus size={12} /></Button>} />
                                <TooltipContent>Package Explorer</TooltipContent>
                            </Tooltip>
                        </>
                    )}

                    <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); setEnvManagerOpen(true); }} className="text-slate-500 hover:text-microtermix-neon font-mono text-[9px] w-auto px-1.5 h-6"><span>ENV{Object.keys(activeVars).length > 0 && ` (${Object.keys(activeVars).length})`}</span></Button>} />
                        <TooltipContent>Variables de entorno</TooltipContent>
                    </Tooltip>
                </div>

                <Dialog open={addDepsOpen} onOpenChange={setAddDepsOpen}>
                    <DialogContent showCloseButton={true} className="!max-w-[98vw] w-[98vw] h-[96vh] !p-0 bg-slate-950 border-slate-800 overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                        <DialogHeader className="px-6 py-4 border-b border-slate-800 shrink-0 bg-slate-900/80 backdrop-blur-xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <DialogTitle className="text-xl font-black text-slate-100 flex items-center gap-3 tracking-tight">
                                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20"><Package className="w-5 h-5 text-blue-400" /></div>
                                        Dependency Manager
                                    </DialogTitle>
                                    <p className="text-[10px] text-slate-500 font-mono mt-2 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                        Project: <span className="text-blue-400 font-bold">{project.name}</span> 
                                        <span className="mx-3 text-slate-800">|</span> 
                                        Engine: <span className="text-amber-500 font-bold">{isJava ? (isMaven ? 'Maven' : 'Gradle') : isRust ? 'Cargo' : (project as any).package_manager || (isPython ? 'pip' : 'npm')}</span>
                                    </p>
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="flex-1 min-h-0 bg-slate-950">
                            <PackageExplorer projectPath={projectPath} projectType={String(project.project_type || 'unknown')} packageManager={isJava ? (isMaven ? 'mvn' : 'gradle') : isRust ? 'cargo' : (project as any).package_manager || (isPython ? 'pip' : 'npm')} onInstall={handleAddDepsInstall} />
                        </div>
                    </DialogContent>
                </Dialog>

                {envManagerOpen && <EnvManager projectPath={projectPath} onClose={() => setEnvManagerOpen(false)} />}
            </div>
        </TooltipProvider>
    );
};
