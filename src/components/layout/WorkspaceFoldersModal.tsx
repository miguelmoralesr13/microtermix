import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Folder, Trash2, Lock } from 'lucide-react';
import { Button } from '../ui/button';

interface WorkspaceFoldersModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const WorkspaceFoldersModal: React.FC<WorkspaceFoldersModalProps> = ({ open, onOpenChange }) => {
    const { state, removeProjectsByPath } = useWorkspace();

    const isMainProject = (path: string) => {
        // Un proyecto es "principal" si está dentro de la carpeta raíz del workspace
        return path.startsWith(state.currentPath);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Folder className="text-microtermix-neon" size={20} />
                        Gestión de Directorios
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Proyectos cargados actualmente en este workspace. Las carpetas dentro de la raíz están bloqueadas.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {state.projects.map((project) => {
                        const path = project.path as string;
                        const isMain = isMainProject(path);
                        
                        return (
                            <div 
                                key={path} 
                                className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors group"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-2 rounded bg-slate-900 border ${isMain ? 'border-microtermix-neon/30' : 'border-slate-700'}`}>
                                        <Folder size={16} className={isMain ? 'text-microtermix-neon' : 'text-slate-400'} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-semibold truncate flex items-center gap-2">
                                            {project.name}
                                            {isMain && (
                                                <span className="text-[10px] bg-microtermix-neon/10 text-microtermix-neon px-1.5 py-0.5 rounded border border-microtermix-neon/20 uppercase tracking-tighter font-bold">
                                                    Principal
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono truncate" title={path}>
                                            {path}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {isMain ? (
                                        <div className="p-2 text-slate-600" title="Directorio raíz protegido">
                                            <Lock size={14} />
                                        </div>
                                    ) : (
                                        <Button 
                                            variant="ghost" 
                                            size="icon-xs"
                                            className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                                            onClick={() => removeProjectsByPath([path])}
                                            title="Quitar proyecto del workspace"
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 flex justify-end">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 hover:bg-slate-800">
                        Cerrar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
