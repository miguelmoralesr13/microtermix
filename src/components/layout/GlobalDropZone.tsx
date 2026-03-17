import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useWorkspace } from '../../context/WorkspaceContext';
import { FolderPlus, PlusCircle } from 'lucide-react';

export const GlobalDropZone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { addProjectsFromPaths } = useWorkspace();
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        let unlistenDrop: (() => void) | undefined;
        let unlistenOver: (() => void) | undefined;
        let unlistenLeave: (() => void) | undefined;

        const setupListeners = async () => {
            unlistenOver = await listen('tauri://drag-over', () => {
                setIsDragging(true);
            });

            unlistenLeave = await listen('tauri://drag-leave', () => {
                setIsDragging(false);
            });

            unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
                setIsDragging(false);
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

    return (
        <div className="relative w-full h-full overflow-hidden">
            {children}
            
            {isDragging && (
                <div className="absolute inset-0 z-[9999] bg-microtermix-dark/80 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-microtermix-neon m-4 rounded-3xl animate-in fade-in zoom-in duration-300">
                    <div className="p-8 rounded-full bg-microtermix-neon/20 mb-6 animate-bounce">
                        <FolderPlus size={64} className="text-microtermix-neon" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Soltar para añadir</h2>
                    <p className="text-slate-400 text-lg">Suelta carpetas o proyectos para incorporarlos al Workspace</p>
                    
                    <div className="mt-12 flex gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-full border border-slate-700 text-slate-300 text-sm">
                            <PlusCircle size={16} className="text-microtermix-neon" />
                            Detecta Node, Rust, Go, Java, Python
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
