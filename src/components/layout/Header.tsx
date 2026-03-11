import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { RotateCcw, FolderPlus, SquareStack, Save, Upload, FolderOpen, Palette } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useMonacoTheme, setMonacoTheme, MONACO_THEMES } from '@/hooks/useMonacoTheme';

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
    const { state, scanWorkspace, openFolderInThisWindow, openFolderInNewWindow } = useWorkspace();
    const monacoTheme = useMonacoTheme();

    const getTitleSuffix = () => {
        switch (state.activeView) {
            case 'services': return '- Services & Terminals';
            case 'processes': return '- Procesos en escucha';
            case 'proxy': return '- Proxy reverso';
            case 'fileServer': return '- Servidor de archivos';
            default: return `- ${state.activeView}`;
        }
    };

    return (
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 bg-slate-950/50 relative z-10 w-full gap-4">
            {/* Izquierda: Path del Workspace + Refresh */}
            <div className="flex-1 flex justify-start items-center min-w-0 gap-2">
                <span className="text-xs text-slate-500 font-mono truncate max-w-sm lg:max-w-md bg-slate-900/50 px-3 py-1.5 rounded-md border border-slate-800" title={state.currentPath}>
                    {state.currentPath || 'No Workspace Loaded'}
                </span>
                {state.currentPath && (
                    <button
                        type="button"
                        onClick={() => scanWorkspace(state.currentPath!)}
                        className="p-1.5 text-slate-500 hover:text-nexus-neon rounded border border-slate-700 hover:border-slate-600 transition-colors hover:rotate-[-90deg] active:rotate-[-180deg]"
                        title="Refrescar proyectos del workspace"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
            </div>

            {/* Centro: Título */}
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-nexus-neon to-nexus-accent capitalize shrink-0 text-center flex-none">
                Microtermix {getTitleSuffix()}
            </h1>

            {/* Derecha: Botones de Configuración */}
            <div className="flex-1 flex items-center justify-end gap-2">
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
                                title="Guardar config en carpeta del workspace (nexus-workspace.json)"
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
        </header>
    );
};
