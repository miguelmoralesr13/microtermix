import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { RotateCcw, FolderPlus, SquareStack, Save, Upload, FolderOpen, Palette, ExternalLink, Folder } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useMonacoTheme, setMonacoTheme, MONACO_THEMES } from '@/hooks/useMonacoTheme';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceFoldersModal } from './WorkspaceFoldersModal';
import { listen } from '@tauri-apps/api/event';
import { cn } from '../../lib/utils';

interface HeaderProps {
    onSaveConfig?: () => void;
    onLoadConfigApplyCurrent?: () => void;
    onLoadWorkspaceConfig?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    onSaveConfig,
    onLoadConfigApplyCurrent,
    onLoadWorkspaceConfig,
}) => {
    const { state, scanWorkspace, openFolderInThisWindow, openFolderInNewWindow, addProjectsFromPaths } = useWorkspace();
    const monacoTheme = useMonacoTheme();
    const [foldersModalOpen, setFoldersModalOpen] = React.useState(false);
    const [isDraggingOver, setIsDraggingOver] = React.useState(false);

    // Localized Drag and Drop Listener
    React.useEffect(() => {
        let unlistenDrop: (() => void) | undefined;
        let unlistenOver: (() => void) | undefined;
        let unlistenLeave: (() => void) | undefined;

        const setupListeners = async () => {
            unlistenOver = await listen('tauri://drag-over', () => {
                setIsDraggingOver(true);
            });

            unlistenLeave = await listen('tauri://drag-leave', () => {
                setIsDraggingOver(false);
            });

            unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
                setIsDraggingOver(false);
                if (event.payload.paths.length > 0) {
                    addProjectsFromPaths(event.payload.paths);
                }
            });
        };

        setupListeners();
        return () => {
            unlistenDrop?.();
            unlistenOver?.();
            unlistenLeave?.();
        };
    }, [addProjectsFromPaths]);

    const extraProjects = React.useMemo(() => {
        if (!state.currentPath) return [];
        return state.projects.filter(p => !(p.path as string).startsWith(state.currentPath));
    }, [state.projects, state.currentPath]);

    const getTitleSuffix = () => {
        switch (state.activeView) {
            case 'services': return '- Services & Terminals';
            case 'processes': return '- Procesos en escucha';
            case 'proxy': return '- Proxy reverso';
            case 'fileServer': return '- Servidor de archivos';
            default: return `- ${state.activeView}`;
        }
    };

    const handlePopOut = async () => {
        const utility = state.activeView;
        try {
            await invoke('open_standalone_window', {
                utility,
                workspacePath: state.currentPath || '',
            });
        } catch (e) {
            console.error('Failed to open standalone window via Rust', e);
        }
    };

    return (
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 bg-slate-950/50 relative z-10 w-full gap-4">
            {/* Izquierda: Path del Workspace + Refresh */}
            <div className="flex-1 flex justify-start items-center min-w-0 gap-2">
                <button
                    onClick={() => setFoldersModalOpen(true)}
                    className={cn(
                        "group flex items-center gap-2 max-w-sm lg:max-w-md px-3 py-1.5 rounded-md border transition-all cursor-pointer text-left overflow-hidden shrink-0",
                        isDraggingOver 
                            ? "bg-microtermix-neon/20 border-microtermix-neon shadow-[0_0_15px_rgba(56,189,248,0.3)] animate-pulse scale-105" 
                            : "bg-slate-900/50 hover:bg-slate-800 border-slate-800 hover:border-slate-700"
                    )}
                >
                    <Folder size={14} className={extraProjects.length > 0 || isDraggingOver ? 'text-microtermix-neon' : 'text-slate-500'} />
                    <span className={cn(
                        "text-xs font-mono truncate",
                        isDraggingOver ? "text-white font-bold" : "text-slate-400"
                    )} title={state.currentPath}>
                        {isDraggingOver ? "Suelta para añadir..." : (state.currentPath || 'No Workspace Loaded')}
                    </span>
                    {extraProjects.length > 0 && !isDraggingOver && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-microtermix-neon/20 text-microtermix-neon text-[10px] font-bold border border-microtermix-neon/30 shrink-0">
                            +{extraProjects.length}
                        </span>
                    )}
                </button>

                {state.currentPath && (
                    <button
                        type="button"
                        onClick={() => scanWorkspace(state.currentPath!)}
                        className="p-1.5 text-slate-500 hover:text-microtermix-neon rounded border border-slate-700 hover:border-slate-600 transition-colors hover:rotate-[-90deg] active:rotate-[-180deg]"
                        title="Refrescar proyectos del workspace"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
            </div>

            {/* Centro: Título */}
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-microtermix-neon to-microtermix-accent capitalize shrink-0 text-center flex-none">
                Microtermix {getTitleSuffix()}
            </h1>

            {/* Derecha: Botones de Configuración */}
            <div className="flex-1 flex items-center justify-end gap-2">
                {state.currentPath && (
                    <IconButton
                        icon={ExternalLink}
                        onClick={handlePopOut}
                        variant="outline"
                        title="Abrir utilidad en ventana independiente"
                        className="text-microtermix-neon border-microtermix-neon/30 hover:bg-microtermix-neon/10"
                    />
                )}
                {/* Selector de tema Monaco */}
                <div className="flex items-center gap-1.5">
                    <Palette size={13} className="text-slate-500 shrink-0" />
                    <Select value={monacoTheme} onValueChange={v => v && setMonacoTheme(v)}>
                        <SelectTrigger className="h-7 text-xs w-44 bg-slate-900 border-slate-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            <div className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Oscuros
                            </div>
                            {MONACO_THEMES.filter(t => t.dark).map(t => (
                                <SelectItem key={t.value} value={t.value} className="text-xs">
                                    {t.label}
                                </SelectItem>
                            ))}
                            <div className="px-2 py-1 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t border-slate-700">
                                Claros
                            </div>
                            {MONACO_THEMES.filter(t => !t.dark).map(t => (
                                <SelectItem key={t.value} value={t.value} className="text-xs">
                                    {t.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <IconButton
                    icon={FolderPlus}
                    onClick={openFolderInThisWindow}
                    variant="outline"
                    title="Abrir otra carpeta en esta ventana"
                />
                <IconButton
                    icon={SquareStack}
                    onClick={openFolderInNewWindow}
                    variant="outline"
                    title="Abrir carpeta en nueva ventana"
                />
                {state.currentPath && (
                    <>
                        {onSaveConfig && (
                            <IconButton
                                icon={Save}
                                onClick={onSaveConfig}
                                variant="outline"
                                title="Guardar config en carpeta del workspace (microtermix.json)"
                            />
                        )}
                        {onLoadConfigApplyCurrent && (
                            <IconButton
                                icon={Upload}
                                onClick={onLoadConfigApplyCurrent}
                                variant="outline"
                                title="Cargar config y aplicar al workspace actual"
                            />
                        )}
                        {onLoadWorkspaceConfig && (
                            <IconButton
                                icon={FolderOpen}
                                onClick={onLoadWorkspaceConfig}
                                variant="outline"
                                title="Cargar config y elegir carpeta (sobrescribe y abre ese workspace)"
                            />
                        )}
                    </>
                )}
            </div>

            <WorkspaceFoldersModal 
                open={foldersModalOpen} 
                onOpenChange={setFoldersModalOpen} 
            />
        </header>
    );
};
