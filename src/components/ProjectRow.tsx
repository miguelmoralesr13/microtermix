import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspace, Project } from '../context/WorkspaceContext';
import { useProjectEnvs } from './useProjectEnvs';
import { EnvManager } from './EnvManager';
import { getViteWrapperConfig } from './ViteWrapperModal';
import { Package, Plus } from 'lucide-react';

interface ProjectRowProps {
    project: Project;
    isSelected: boolean;
    onToggleSelect: () => void;
}

export const ProjectRow: React.FC<ProjectRowProps> = ({ project, isSelected, onToggleSelect }) => {
    const { state, updateProcessStatus, setTargetTerminalTab } = useWorkspace();
    const projectPath = project.path as string;
    const isNode = project.project_type === 'node';

    const { activeVars } = useProjectEnvs(projectPath);
    const [envManagerOpen, setEnvManagerOpen] = useState(false);
    const [addDepsOpen, setAddDepsOpen] = useState(false);
    const [addDepsPackages, setAddDepsPackages] = useState('');
    const [addDepsDev, setAddDepsDev] = useState(false);

    const runNpmCommand = async (script: string) => {
        const serviceId = `${projectPath}::${script} `;
        const envVarsJson = '{}'; // npm install commands should not use project envs
        try {
            updateProcessStatus(serviceId, 'running', script, envVarsJson);
            setTargetTerminalTab(serviceId);
            const viteConfig = getViteWrapperConfig(projectPath);
            const useViteWrapper = !!viteConfig?.enabled && Object.keys(viteConfig?.remotes ?? {}).length > 0;
            const viteWrapperRemotes = useViteWrapper ? viteConfig!.remotes : undefined;
            await invoke('execute_service_script', {
                serviceId,
                projectPath,
                script,
                envVarsJson,
                useViteWrapper: useViteWrapper || undefined,
                viteWrapperRemotes,
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

    // Default to the first script (or empty) to find the status from multi-execution if running
    // Note: Multiple executions might have started with a specific script, we'll try to find any active process for this path
    const activeProcessIds = Object.keys(state.activeProcesses).filter(id => id.startsWith(`${projectPath}::`));
    const processState = activeProcessIds.length > 0 ? state.activeProcesses[activeProcessIds[0]] : null;
    const status = processState?.status || 'idle';

    return (
        <>
            <div className={`group flex flex-col p-2 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-slate-800/30' : ''}`}>
                <div className="flex items-center gap-2 w-full min-w-0">
                    {/* Checkbox */}
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggleSelect}
                        className="accent-nexus-neon shrink-0 w-3.5 h-3.5"
                    />

                    {/* Nombre: prioridad de espacio para ver completo */}
                    <div
                        className="flex-1 min-w-0 flex flex-col cursor-pointer py-0.5 -my-0.5 rounded pr-1 hover:bg-slate-800/50 transition-colors"
                        onClick={onToggleSelect}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelect(); } }}
                        title={project.name as string}
                    >
                        <span className="text-xs font-semibold text-slate-200 truncate block">
                            {project.name}
                        </span>
                        {status !== 'idle' && (
                            <div className="flex items-center text-[9px] mt-0.5">
                                <span className={`w-1 h-1 rounded-full mr-1 ${status === 'running' ? 'bg-nexus-success animate-pulse' :
                                        status === 'stopped' ? 'bg-slate-500' : 'bg-nexus-danger'
                                    }`} />
                                <span className="text-slate-400 capitalize">{status === 'stopped' ? 'parado' : status}</span>
                            </div>
                        )}
                    </div>

                    {/* Botones compactos */}
                    <div className="flex items-center gap-0.5 shrink-0">
                        {isNode && (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleNpmInstall(); }}
                                    className="p-1 text-slate-500 hover:text-nexus-neon hover:bg-slate-800 rounded border border-slate-700/80 transition-colors"
                                    title="npm install"
                                >
                                    <Package size={12} />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setAddDepsOpen(true); }}
                                    className="p-1 text-slate-500 hover:text-nexus-neon hover:bg-slate-800 rounded border border-slate-700/80 transition-colors"
                                    title="Agregar deps"
                                >
                                    <Plus size={12} />
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEnvManagerOpen(true); }}
                            className="px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 hover:text-nexus-neon bg-slate-900 rounded border border-slate-700 hover:border-nexus-neon transition-colors"
                            title={`ENV (${Object.keys(activeVars).length})`}
                        >
                            ENV ({Object.keys(activeVars).length})
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal: Agregar dependencias */}
            {addDepsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setAddDepsOpen(false)}>
                    <div
                        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-sm font-bold text-slate-200 mb-3">Agregar dependencias</h3>
                        <p className="text-[10px] text-slate-500 mb-2 font-mono truncate">{projectPath}</p>
                        <input
                            type="text"
                            value={addDepsPackages}
                            onChange={e => setAddDepsPackages(e.target.value)}
                            placeholder="lodash axios react"
                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-nexus-neon focus:outline-none mb-3"
                            onKeyDown={e => e.key === 'Enter' && handleAddDepsInstall()}
                        />
                        <div className="flex items-center gap-4 mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="depsType"
                                    checked={!addDepsDev}
                                    onChange={() => setAddDepsDev(false)}
                                    className="accent-nexus-neon"
                                />
                                <span className="text-xs text-slate-300">Dependencies</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="depsType"
                                    checked={addDepsDev}
                                    onChange={() => setAddDepsDev(true)}
                                    className="accent-nexus-neon"
                                />
                                <span className="text-xs text-slate-300">Dev Dependencies</span>
                            </label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setAddDepsOpen(false)}
                                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddDepsInstall}
                                disabled={!addDepsPackages.trim()}
                                className="px-3 py-1.5 text-xs font-bold bg-nexus-neon text-nexus-darker rounded-lg hover:bg-opacity-80 disabled:opacity-50"
                            >
                                Instalar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {envManagerOpen && (
                <EnvManager
                    projectPath={projectPath}
                    onClose={() => setEnvManagerOpen(false)}
                />
            )}
        </>
    );
};
