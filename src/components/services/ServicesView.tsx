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
    setSelectedProjects: React.Dispatch<React.SetStateAction<string[]>>;
    multiScript: string;
    setMultiScript: React.Dispatch<React.SetStateAction<string>>;
    globalEnvName: string;
    setGlobalEnvName: React.Dispatch<React.SetStateAction<string>>;
    vitePreviewOpen: boolean;
    setVitePreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
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

    // ─── Local UI State ──────────────────────────────────────────────────
    const [viteWrapperModalOpen, setViteWrapperModalOpen] = useState(false);
    const [viteWrapperCandidates, setViteWrapperCandidates] = useState<ProxyCandidateItem[]>([]);

    // ─── Derived State / Memos ───────────────────────────────────────────
    const allScripts = useMemo(() => {
        const scripts = new Set<string>();
        state.projects.forEach(p => {
            if (p.scripts) p.scripts.forEach(s => scripts.add(s));
        });
        return Array.from(scripts);
    }, [state.projects]);

    const allEnvs = useMemo(() => {
        const envs = new Set<string>();
        state.projects.forEach(p => {
            try {
                const rawStore = localStorage.getItem(`nexus-envs-${(p.path as string).replace(/[/\\:]/g, '_')}`);
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
        setSelectedProjects(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
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

    return (
        <>
            <ProjectListPane
                projects={state.projects}
                selectedProjects={selectedProjects}
                onSelectAll={() => setSelectedProjects(state.projects.map(p => p.path as string))}
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
                    onOpenViteWrapper={async () => {
                        if (!state.currentPath) return;
                        try {
                            const list = await invoke<ProxyCandidateItem[]>('get_proxy_candidates', { workspacePath: state.currentPath });
                            setViteWrapperCandidates(list.map((p: ProxyCandidateItem) => ({ project_path: p.project_path, display_name: p.display_name })));
                            setViteWrapperModalOpen(true);
                        } catch (_) {
                            setViteWrapperCandidates([]);
                            setViteWrapperModalOpen(true);
                        }
                    }}
                    selectedCount={selectedProjects.length}
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
                        e.stopPropagation();
                        await invoke('kill_service', { serviceId });
                        updateProcessStatus(serviceId, 'stopped');
                    }}
                    onTabRestart={handleTabRestart}
                    onTabClose={async (e, serviceId) => {
                        e.stopPropagation();
                        await invoke('kill_service', { serviceId });
                        updateProcessStatus(serviceId, 'idle');
                        if (activeTerminalTab === serviceId) {
                            const remaining = processIds.filter(id => id !== serviceId);
                            setActiveTerminalTab(remaining.length > 0 ? remaining[0] : null);
                        }
                    }}
                />
            </div>
        </>
    );
};
