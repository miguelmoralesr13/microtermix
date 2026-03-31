import React, { useState, useMemo, useCallback } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { ProjectListPane } from './ProjectListPane';
import { MultiExecutionBar } from './MultiExecutionBar';
import { ServiceTerminals } from './ServiceTerminals';
import { ViteWrapperModal, type ProxyCandidateItem } from '../project/ViteWrapperModal';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface ServicesViewProps {
    selectedProjects: string[];
    setSelectedProjects: (val: string[]) => void;
    multiScript: string;
    setMultiScript: (val: string) => void;
    globalEnvName: string;
    setGlobalEnvName: (val: string) => void;
    vitePreviewOpen: boolean;
    setVitePreviewOpen: (val: boolean) => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
    selectedProjects,
    setSelectedProjects,
    multiScript,
    setMultiScript,
    globalEnvName,
    setGlobalEnvName,
    vitePreviewOpen,
    setVitePreviewOpen
}) => {
    const { state, executeProjectScript } = useWorkspace();

    // Zustand Store
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const activeTerminalTab = useProcessStore(s => s.activeTerminalTab);
    const setActiveTerminalTab = useProcessStore(s => s.setActiveTerminalTab);
    const updateProcessStatus = useProcessStore(s => s.updateProcessStatus);
    const removeProcess = useProcessStore(s => s.removeProcess);

    // ─── Local UI State ──────────────────────────────────────────────────
    const [viteWrapperModalOpen, setViteWrapperModalOpen] = useState(false);
    const [viteWrapperCandidates, setViteWrapperCandidates] = useState<ProxyCandidateItem[]>([]);
    const [settingsProject, setSettingsProject] = useState<string | null>(null);
    const [settingsTab, setSettingsTab] = useState<string>('envs');

    const JAVA_PRESETS = useMemo(() => [
        { name: 'Mvn: Clean & Install', cmd: 'mvn clean install -DskipTests' },
        { name: 'Mvn: Spring Boot Run', cmd: 'mvn spring-boot:run' },
        { name: 'Mvn: Package', cmd: 'mvn package' },
        { name: 'Mvn: Test', cmd: 'mvn test' },
        { name: 'Gradle: Build', cmd: './gradlew build' },
        { name: 'Gradle: BootRun', cmd: './gradlew bootRun' },
        { name: 'Gradle: Clean', cmd: './gradlew clean' },
        { name: 'Jar: Run (target)', cmd: 'java -jar target/*.jar' },
        { name: 'Java: Compile & Run', cmd: 'javac Main.java && java Main' },
    ], []);

    // ─── Handlers ────────────────────────────────────────────────────────
    const handlePlayScript = useCallback(async (projectPath: string, script: string) => {
        if (!script) return;
        const normalizedScript = script.trim();
        const compositeServiceId = `${projectPath}::${normalizedScript} `;

        // Consultar el estado REAL y actual de Zustand, no la 'foto' del closure de React
        const currentProcesses = useProcessStore.getState().activeProcesses;
        const existing = currentProcesses[compositeServiceId];

        if (existing?.status === 'running') {
            console.warn(`[Services] Skipping execution: ${compositeServiceId} is already running.`);
            return;
        }

        await executeProjectScript(projectPath, normalizedScript, {
            globalEnvName
        });
    }, [executeProjectScript, globalEnvName]);

    const handleQuickAction = useCallback(async (path: string, action: 'start' | 'stop' | 'logs' | 'restart') => {
        const project = state.projects.find(p => p.path === path);
        if (!project) return;

        // Determinar el script principal (por defecto o específico de lenguaje)
        let mainScript = project.scripts?.[0] || '';
        if (project.project_type === 'java') {
            const isGradle = project.build_system === 'gradle';
            mainScript = isGradle ? './gradlew bootRun' : 'mvn spring-boot:run';
        }

        if (action === 'restart') {
            // Buscamos si hay algún proceso ACTIVO para este proyecto
            const current = useProcessStore.getState().activeProcesses;
            const runningId = Object.keys(current).find(id => id.startsWith(path + '::'));
            const scriptToRestart = runningId ? current[runningId].script : mainScript;

            if (runningId) {
                // Notificamos e intentamos matar
                toast.info(`Reiniciando ${path.split(/[/\\]/).pop()}...`);
                await invoke('kill_service', { serviceId: runningId });
                updateProcessStatus(runningId, 'stopped');
                await new Promise(r => setTimeout(r, 1000));
            }

            if (scriptToRestart) {
                await handlePlayScript(path, scriptToRestart);
            } else {
                toast.error("No hay script para reiniciar");
            }
            return;
        }

        if (action === 'start') {
            if (mainScript) await handlePlayScript(path, mainScript);
            else toast.error("No se encontró un script principal");
        } else if (action === 'stop') {
            const current = useProcessStore.getState().activeProcesses;
            const serviceIds = Object.keys(current).filter(id => id.startsWith(path + '::'));
            for (const id of serviceIds) {
                await invoke('kill_service', { serviceId: id });
                updateProcessStatus(id, 'stopped');
            }
        } else if (action === 'logs') {
            const serviceId = Object.keys(activeProcesses).find(id => id.startsWith(path + '::'));
            if (serviceId) setActiveTerminalTab(serviceId);
            else toast.info("No hay procesos activos");
        }
    }, [state.projects, activeProcesses, handlePlayScript, updateProcessStatus, setActiveTerminalTab]);

    const handleCloseAllTabs = useCallback(async () => {
        const ids = Object.keys(activeProcesses);
        if (ids.length === 0) return;
        
        for (const id of ids) {
            await invoke('kill_service', { serviceId: id }).catch(() => {});
        }
        useProcessStore.getState().clearAllProcesses();
        setActiveTerminalTab(null);
        toast.success("Todas las terminales cerradas");
    }, [activeProcesses, setActiveTerminalTab]);

    const handleCloseFinishedTabs = useCallback(() => {
        const ids = Object.keys(activeProcesses);
        let closedCount = 0;
        for (const id of ids) {
            const status = activeProcesses[id].status;
            if (status === 'stopped' || status === 'error' || status === 'idle') {
                removeProcess(id);
                closedCount++;
            }
        }
        
        if (closedCount > 0) {
            toast.success(`${closedCount} terminales terminadas cerradas`);
            // Si la tab activa se cerró, seleccionar la primera disponible o null
            const remaining = Object.keys(useProcessStore.getState().activeProcesses);
            if (remaining.length > 0) {
                if (!remaining.includes(activeTerminalTab || '')) {
                    setActiveTerminalTab(remaining[0]);
                }
            } else {
                setActiveTerminalTab(null);
            }
        } else {
            toast.info("No hay terminales terminadas para cerrar");
        }
    }, [activeProcesses, removeProcess, activeTerminalTab, setActiveTerminalTab]);

    const projectWithPresets = useMemo(() => {
        if (!settingsProject) return null;
        const p = state.projects.find(proj => proj.path === settingsProject);
        if (!p) return null;

        const scripts = [...(p.scripts || [])];
        if (p.project_type === 'java') {
            JAVA_PRESETS.forEach(preset => {
                if (!scripts.includes(preset.cmd)) scripts.push(preset.cmd);
            });
        }
        return { ...p, scripts };
    }, [settingsProject, state.projects, JAVA_PRESETS]);

    return (
        <div className="flex-1 w-full h-full flex overflow-hidden">
            <ProjectListPane
                projects={state.projects}
                selectedProjects={selectedProjects}
                onSelectAll={() => setSelectedProjects(state.projects.map(p => p.path as string))}
                onDeselectAll={() => setSelectedProjects([])}
                onToggleSelect={(path) => {
                    if (selectedProjects.includes(path)) setSelectedProjects(selectedProjects.filter(p => p !== path));
                    else setSelectedProjects([...selectedProjects, path]);
                }}
                onPlayScript={handlePlayScript}
                onOpenSettings={(path, tab) => { setSettingsProject(path); setSettingsTab(tab ?? 'envs'); }}
                onQuickAction={handleQuickAction}
            />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <MultiExecutionBar
                    allScripts={useMemo(() => Array.from(new Set([...state.projects.flatMap(p => p.scripts || []), ...JAVA_PRESETS.map(pr => pr.cmd)])), [state.projects, JAVA_PRESETS])}
                    multiScript={multiScript}
                    onScriptChange={setMultiScript}
                    allEnvs={useMemo(() => {
                        const envs = new Set<string>(['none', 'dev']);
                        state.projects.forEach(p => {
                            try {
                                const raw = localStorage.getItem(`microtermix-envs-${(p.path as string).replace(/[/\\:]/g, '_')}`);
                                if (raw) {
                                    const parsed = JSON.parse(raw);
                                    Object.keys(parsed.envs || {}).forEach(e => envs.add(e));
                                }
                            } catch { }
                        });
                        return Array.from(envs);
                    }, [state.projects])}
                    globalEnvName={globalEnvName}
                    onEnvChange={setGlobalEnvName}
                    onPlay={async () => {
                        for (const p of selectedProjects) {
                            if (multiScript) {
                                await handlePlayScript(p, multiScript);
                            } else {
                                await handleQuickAction(p, 'start');
                            }
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }}
                    onStop={async () => {
                        for (const p of selectedProjects) await handleQuickAction(p, 'stop');
                    }}
                    onRestart={async () => {
                        for (const p of selectedProjects) await handleQuickAction(p, 'restart');
                    }}
                    onOpenViteWrapper={async () => {
                        const list = await invoke<ProxyCandidateItem[]>('get_proxy_candidates', { workspacePath: state.currentPath });
                        setViteWrapperCandidates(list);
                        setViteWrapperModalOpen(true);
                    }}
                    selectedCount={selectedProjects.length}
                    activeSelectionType={null}
                />

                <ProjectSettingsModal
                    project={projectWithPresets}
                    open={!!settingsProject}
                    defaultTab={settingsTab}
                    onOpenChange={(open) => !open && setSettingsProject(null)}
                    onPlayScript={(s) => handlePlayScript(settingsProject!, s)}
                />

                <ViteWrapperModal
                    open={viteWrapperModalOpen}
                    onOpenChange={setViteWrapperModalOpen}
                    workspacePath={state.currentPath || ''}
                    candidates={viteWrapperCandidates}
                />

                <ServiceTerminals
                    processIds={useMemo(() => Object.keys(activeProcesses), [activeProcesses])}
                    activeProcesses={activeProcesses}
                    activeTerminalTab={activeTerminalTab}
                    vitePreviewOpen={vitePreviewOpen}
                    onVitePreviewToggle={setVitePreviewOpen}
                    onTabSelect={setActiveTerminalTab}
                    onTabStop={async (e, id) => { e.preventDefault(); await invoke('kill_service', { serviceId: id }); updateProcessStatus(id, 'stopped'); }}
                    onTabRestart={async (e, id) => {
                        e.preventDefault();
                        const p = activeProcesses[id];
                        // Cambiar a stopped en lugar de removeProcess para no cerrar la terminal
                        updateProcessStatus(id, 'stopped');
                        await invoke('kill_service', { serviceId: id });
                        await new Promise(r => setTimeout(r, 800));
                        if (p.script) {
                            toast.info(`Reiniciando ${id.split('::')[1]}...`);
                            await handlePlayScript(id.split('::')[0], p.script as string);
                        }
                    }}
                    onTabClose={async (e, id) => { 
                        e.preventDefault(); 
                        await invoke('kill_service', { serviceId: id }).catch(() => {});
                        removeProcess(id); 
                    }}
                    onTabCloseAll={handleCloseAllTabs}
                    onTabCloseFinished={handleCloseFinishedTabs}
                />
            </div>
        </div>
    );
};
