import React from 'react';
import { Play, Square, RotateCw, Trash2, Terminal, FolderOpen, ScrollText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DockerContainer, useDockerAction } from '@/hooks/useDocker';
import { useDockerStore } from '@/stores/dockerStore';
import { useProcessStore } from '@/stores/processStore';
import { invoke } from '@tauri-apps/api/core';

interface ContainerActionsProps {
    container: DockerContainer;
}

export const ContainerActions: React.FC<ContainerActionsProps> = ({ container }) => {
    const { mutate: performAction, isPending } = useDockerAction();
    const setFileExplorerOpen = useDockerStore(s => s.setFileExplorerOpen);
    const setSelectedContainerId = useDockerStore(s => s.setSelectedContainerId);
    const setViewMode = useDockerStore(s => s.setViewMode);
    const setActiveServiceId = useDockerStore(s => s.setActiveServiceId);

    const updateProcessStatus = useProcessStore(s => s.updateProcessStatus);

    const isRunning = container.state === 'running';

    const handleAction = (action: 'start' | 'stop' | 'restart' | 'rm') => {
        performAction({ action, containerId: container.id });
    };

    const handleOpenFiles = () => {
        setSelectedContainerId(container.id);
        setFileExplorerOpen(true);
    };

    const handleOpenTerminal = async () => {
        try {
            const serviceId = `docker-pty::${container.id} `;
            updateProcessStatus(serviceId, 'running', `docker exec -it ${container.id} sh`);
            setActiveServiceId(serviceId);
            setViewMode('terminal');

            await invoke('spawn_pty_shell', {
                serviceId,
                command: `docker exec -it ${container.id} sh`,
                envs: null
            });
        } catch (e) {
            console.error('Failed to open terminal', e);
        }
    };

    const handleOpenLogs = async () => {
        try {
            const serviceId = `docker-logs::${container.id} `;
            updateProcessStatus(serviceId, 'running', `docker logs -f ${container.id}`);
            setActiveServiceId(serviceId);
            setViewMode('logs');

            await invoke('spawn_interactive', {
                serviceId,
                command: `docker logs -f ${container.id}`,
                envs: null
            });
        } catch (e) {
            console.error('Failed to open logs', e);
        }
    };

    return (
        <div className="flex items-center justify-end gap-1">
            {!isRunning ? (
                <Tooltip>
                    <TooltipTrigger render={
                        <Button
                            variant="ghost" size="icon-xs" disabled={isPending}
                            onClick={() => handleAction('start')}
                            className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        >
                            <Play size={14} />
                        </Button>
                    } />
                    <TooltipContent>Start container</TooltipContent>
                </Tooltip>
            ) : (
                <Tooltip>
                    <TooltipTrigger render={
                        <Button
                            variant="ghost" size="icon-xs" disabled={isPending}
                            onClick={() => handleAction('stop')}
                            className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                        >
                            <Square size={14} className="fill-current" />
                        </Button>
                    } />
                    <TooltipContent>Stop container</TooltipContent>
                </Tooltip>
            )}

            <Tooltip>
                <TooltipTrigger render={
                    <Button
                        variant="ghost" size="icon-xs" disabled={isPending}
                        onClick={() => handleAction('restart')}
                        className="text-slate-400 hover:text-microtermix-neon hover:bg-microtermix-neon/10"
                    >
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                    </Button>
                } />
                <TooltipContent>Restart</TooltipContent>
            </Tooltip>

            {isRunning && (
                <>
                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost" size="icon-xs"
                                onClick={handleOpenLogs}
                                className="text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                <ScrollText size={14} />
                            </Button>
                        } />
                        <TooltipContent>Stream logs</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost" size="icon-xs"
                                onClick={handleOpenTerminal}
                                className="text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                <Terminal size={14} />
                            </Button>
                        } />
                        <TooltipContent>Open Terminal inside container (sh)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button
                                variant="ghost" size="icon-xs"
                                onClick={handleOpenFiles}
                                className="text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                <FolderOpen size={14} />
                            </Button>
                        } />
                        <TooltipContent>Browse Files</TooltipContent>
                    </Tooltip>
                </>
            )}

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <Tooltip>
                <TooltipTrigger render={
                    <Button
                        variant="ghost" size="icon-xs" disabled={isPending}
                        onClick={() => {
                            if (confirm('Are you sure you want to completely remove this container?')) {
                                handleAction('rm');
                            }
                        }}
                        className="text-slate-500 hover:text-red-500 hover:bg-red-500/10"
                    >
                        <Trash2 size={14} />
                    </Button>
                } />
                <TooltipContent>Remove container</TooltipContent>
            </Tooltip>
        </div>
    );
};
