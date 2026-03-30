import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Sidebar } from '../layout/Sidebar';
import { Header } from '../layout/Header';
import { UtilityRenderer } from '../layout/UtilityRenderer';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useServiceManagerState } from '../../hooks/useServiceManagerState';

export const ServiceManager: React.FC = () => {
    const { state, applyWorkspaceConfig, setWorkspacePath, scanWorkspace, saveWorkspaceConfig } = useWorkspace();

    // Call state sync hook
    useServiceManagerState();

    const handleSaveWorkspaceConfig = async () => {
        await saveWorkspaceConfig();
    };

    const handleLoadWorkspaceConfig = async () => {
        try {
            const filePath = await open({
                directory: false,
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
                title: 'Seleccionar archivo de configuración (microtermix.json)',
            });
            if (filePath === null || Array.isArray(filePath)) return;
            const content = await invoke<string>('read_file_at_path', { path: filePath });
            const config = JSON.parse(content || '{}');
            if (!config || typeof config !== 'object') return;

            const folder = await open({
                directory: true,
                multiple: false,
                title: 'Seleccionar carpeta del workspace donde aplicar la config',
            });
            if (folder === null || Array.isArray(folder)) return;

            await invoke('write_workspace_config_in_folder', { workspacePath: folder, content });
            setWorkspacePath(folder);
            const projects = await scanWorkspace(folder);
            const projectPaths = projects.map((p) => p.path as string);
            applyWorkspaceConfig(config, folder, projectPaths);
        } catch (e) {
            console.error('Load workspace config failed', e);
        }
    };

    const handleLoadConfigApplyCurrent = async () => {
        if (!state.currentPath) return;
        try {
            const filePath = await open({
                directory: false,
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
                title: 'Seleccionar archivo de configuración',
            });
            if (filePath === null || Array.isArray(filePath)) return;
            const content = await invoke<string>('read_file_at_path', { path: filePath });
            const config = JSON.parse(content || '{}');
            if (!config || typeof config !== 'object') return;
            const projectPaths = state.projects.map((p) => p.path as string);
            applyWorkspaceConfig(config, state.currentPath, projectPaths);
            await saveWorkspaceConfig();
        } catch (e) {
            console.error('Load and apply config failed', e);
        }
    };

    // ─── Layout ─────────────────────────────────────────────────────────────
    return (
        <div className="flex w-full h-full bg-microtermix-dark text-slate-200 overflow-hidden">
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col  h-full overflow-hidden">
                <Header
                    onSaveConfig={handleSaveWorkspaceConfig}
                    onLoadConfigApplyCurrent={handleLoadConfigApplyCurrent}
                    onLoadWorkspaceConfig={handleLoadWorkspaceConfig}
                />

                <div className="flex-1 min-h-0 flex bg-slate-900 overflow-hidden w-full relative">
                    <UtilityRenderer />
                </div>
            </div>
        </div>
    );
};
