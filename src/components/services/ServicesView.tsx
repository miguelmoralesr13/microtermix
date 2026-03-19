import React, { useState, useMemo } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { ProjectListPane } from './ProjectListPane';
import { MultiExecutionBar } from './MultiExecutionBar';
import { ServiceTerminals } from './ServiceTerminals';
import { ViteWrapperModal, type ProxyCandidateItem } from '../ViteWrapperModal';
import { invoke } from '@tauri-apps/api/core';

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

    const JAVA_PRESETS = useMemo(() => [
        { name: 'Mvn: Clean & Install', cmd: 'mvn clean install -DskipTests' },
        { name: 'Mvn: Spring Boot Run', cmd: 'mvn spring-boot:run' },
        { name: 'Mvn: Package', cmd: 'mvn package' },
        { name: 'Mvn: Test', cmd: 'mvn test' },
        { name: 'Gradle: Build', cmd: './gradlew build' },
        { name: 'Gradle: BootRun', cmd: './gradlew bootRun' },
        { name: 'Gradle: Clean', cmd: './gradlew clean' },
        { name: 'Jar: Run (target)', cmd: 'java -jar target/*.jar' },
        { name: 'Jar: Run (build/libs)', cmd: 'java -jar build/libs/*.jar' },
        { name: 'Java: Compile & Run', cmd: 'javac Main.java && java Main' },
    ], []);

    // ─── Derived State / Memos ───────────────────────────────────────────
    const selectedProjectTypes = useMemo(() => {
        const types = new Set<string>();
        selectedProjects.forEach(path => {
            const p = state.projects.find(proj => proj.path === path);
            if (p?.project_type) types.add(String(p.project_type));
        });
        return Array.from(types);
    }, [selectedProjects, state.projects]);

    const activeSelectionType = selectedProjectTypes.length > 0 ? selectedProjectTypes[0] : null;

    const allScripts = useMemo(() => {
        const scripts = new Set<string>();

        // Add Java presets if we are working with Java
        if (activeSelectionType === 'java') {
            JAVA_PRESETS.forEach(p => scripts.add(p.cmd));
        }

        state.projects.forEach(p => {
            // If we have an active type, only collect scripts from projects of that type
            if (activeSelectionType && String(p.project_type) !== activeSelectionType) return;

            if (p.scripts) p.scripts.forEach(s => scripts.add(s));
        });
        return Array.from(scripts);
    }, [state.projects, activeSelectionType, JAVA_PRESETS]);

    const allEnvs = useMemo(() => {
        const envs = new Set<string>();
        state.projects.forEach(p => {
            try {
                const rawStore = localStorage.getItem(`microtermix-envs-${(p.path as string).replace(/[/\\:]/g, '_')}`);
                if (rawStore) {
                    const parsed = JSON.parse(rawStore);
                    if (parsed.envs) {
                        Object.keys(parsed.envs).forEach(e => envs.add(e));
                    }
                }
            } catch (err) { }
        });
        const arr = Array.from(envs);
        const list = arr.length > 0 ? arr : ['dev'];
        if (!list.includes('none')) list.unshift('none');
        return list;
    }, [state.projects]);

    const processIds = useMemo(() => Object.keys(activeProcesses), [activeProcesses]);

    // ─── Handlers ────────────────────────────────────────────────────────
    const toggleProjectSelect = (path: string) => {
        const project = state.projects.find(p => p.path === path);
        if (!project) return;

        let next: string[];
        if (selectedProjects.includes(path)) {
            next = selectedProjects.filter(p => p !== path);
        } else {
            // Smart Filter: If we have an active type, only allow same type
            if (activeSelectionType && String(project.project_type) !== activeSelectionType) {
                return;
            }
            next = [...selectedProjects, path];
        }
        setSelectedProjects(next);
    };

    const handleSelectAll = () => {
        // If there's an active type, select all of that type. Otherwise select all.
        if (activeSelectionType) {
            setSelectedProjects(state.projects.filter(p => String(p.project_type) === activeSelectionType).map(p => p.path as string));
        } else {
            setSelectedProjects(state.projects.map(p => p.path as string));
        }
    };

    const handlePlayScript = async (projectPath: string, script: string) => {
        if (!script) return;
        const compositeServiceId = `${projectPath}::${script} `;
        const existing = activeProcesses[compositeServiceId];
        if (existing?.status === 'running') return;

        await executeProjectScript(projectPath, script, {
            globalEnvName
        });
    };

    const handleBatchPlay = async () => {
        if (selectedProjects.length === 0 || !multiScript) return;
        for (const projectPath of selectedProjects) {
            await handlePlayScript(projectPath, multiScript);
            await new Promise(r => setTimeout(r, 150));
        }
    };

    const handleBatchStop = async () => {
        if (selectedProjects.length === 0 || !multiScript) return;
        for (const projectPath of selectedProjects) {
            const compositeServiceId = `${projectPath}::${multiScript} `;
            await invoke('kill_service', { serviceId: compositeServiceId });
            updateProcessStatus(compositeServiceId, 'stopped');
            await new Promise(r => setTimeout(r, 50));
        }
    };

    const handleBatchRestart = async () => {
        if (selectedProjects.length === 0 || !multiScript) return;
        const projectsToRestart = [...selectedProjects];
        const scriptToRestart = multiScript;

        await handleBatchStop();
        await new Promise(r => setTimeout(r, 700));

        for (const projectPath of projectsToRestart) {
            await executeProjectScript(projectPath, scriptToRestart, {
                globalEnvName
            });
            await new Promise(r => setTimeout(r, 200));
        }
    };

    const handleTabRestart = async (e: React.MouseEvent, serviceId: string) => {
        e.preventDefault(); e.stopPropagation();
        const pState = activeProcesses[serviceId];
        if (!pState?.script) return;
        const projectPath = serviceId.split('::')[0];

        await invoke('kill_service', { serviceId });
        updateProcessStatus(serviceId, 'stopped');
        await new Promise(r => setTimeout(r, 700));
        await executeProjectScript(projectPath, pState.script as string, {
            globalEnvName,
            incrementRestart: true
        });
    };

    const handleOpenViteWrapper = async () => {
        try {
            const list = await invoke<ProxyCandidateItem[]>('get_proxy_candidates', { workspacePath: state.currentPath });
            setViteWrapperCandidates(list.map((p: ProxyCandidateItem) => ({
                project_path: p.project_path,
                display_name: p.display_name
            })));
            setViteWrapperModalOpen(true);
        } catch (_) {
            setViteWrapperCandidates([]);
            setViteWrapperModalOpen(true);
        }
    };

    return (
        <div className="flex-1 w-full h-full flex overflow-hidden">
            <ProjectListPane
                projects={state.projects}
                selectedProjects={selectedProjects}
                onSelectAll={handleSelectAll}
                onDeselectAll={() => setSelectedProjects([])}
                onToggleSelect={toggleProjectSelect}
                onPlayScript={handlePlayScript}
            />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <MultiExecutionBar
                    allScripts={allScripts}
                    multiScript={multiScript}
                    onScriptChange={setMultiScript}
                    allEnvs={allEnvs}
                    globalEnvName={globalEnvName}
                    onEnvChange={setGlobalEnvName}
                    onPlay={handleBatchPlay}
                    onStop={handleBatchStop}
                    onRestart={handleBatchRestart}
                    onOpenViteWrapper={handleOpenViteWrapper}
                    selectedCount={selectedProjects.length}
                    activeSelectionType={activeSelectionType}
                />

                <ViteWrapperModal
                    open={viteWrapperModalOpen}
                    onOpenChange={setViteWrapperModalOpen}
                    workspacePath={state.currentPath || ''}
                    candidates={viteWrapperCandidates}
                />

                <ServiceTerminals
                    processIds={processIds}
                    activeProcesses={activeProcesses}
                    activeTerminalTab={activeTerminalTab}
                    vitePreviewOpen={vitePreviewOpen}
                    onVitePreviewToggle={setVitePreviewOpen}
                    onTabSelect={setActiveTerminalTab}
                    onTabStop={async (e, serviceId) => {
                        e.preventDefault(); e.stopPropagation();
                        await invoke('kill_service', { serviceId });
                        updateProcessStatus(serviceId, 'stopped');
                    }}
                    onTabRestart={handleTabRestart}
                    onTabClose={async (e, serviceId) => {
                        e.preventDefault(); e.stopPropagation();
                        
                        // 1. Detener el proceso
                        try {
                            await invoke('kill_service', { serviceId });
                        } catch (_) {}
                        
                        // 2. Si es la activa, seleccionar otra antes de borrar
                        if (activeTerminalTab === serviceId) {
                            const remaining = Object.keys(activeProcesses).filter(id => id !== serviceId);
                            setActiveTerminalTab(remaining.length > 0 ? remaining[0] : null);
                        }
                        
                        // 3. Eliminar del store (quitar pestaña)
                        removeProcess(serviceId);
                    }}
                />
            </div>
        </div>
    );
};
