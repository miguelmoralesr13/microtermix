import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { NotebookPen, FolderOpen, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { NotesSidebar } from './NotesSidebar';
import { NotesEditor } from './NotesEditor';
import { type NoteEntry } from './NotesTreeNode';

const STORAGE_KEY = 'nexus-notes-base-path';
const DEFAULT_DIR = 'notes-md';


export const NotesPanel: React.FC = () => {
    const [basePath, setBasePath] = useState<string>(() => {
        try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
    });
    const [editingPath, setEditingPath]   = useState(false);
    const [pathInput, setPathInput]       = useState('');
    const [entries, setEntries]           = useState<NoteEntry[]>([]);
    const [activeFile, setActiveFile]     = useState<string | null>(null);

    // Cargar directorio
    const refresh = useCallback(async (bp?: string) => {
        const target = bp ?? basePath;
        if (!target) return;
        try {
            const result = await invoke<NoteEntry[]>('notes_scan_dir', { basePath: target });
            setEntries(result);
        } catch (e) {
            toast.error(`Error leyendo directorio: ${e}`);
        }
    }, [basePath]);

    // Al montar, si no hay basePath intentar usar el home + notes-md
    useEffect(() => {
        if (!basePath) {
            // Obtener home vía Tauri (fallback a /tmp/notes-md)
            const fallback = `${DEFAULT_DIR}`;
            setBasePath(fallback);
            localStorage.setItem(STORAGE_KEY, fallback);
            refresh(fallback);
        } else {
            refresh(basePath);
        }
    }, []);

    const applyBasePath = (newPath: string) => {
        const trimmed = newPath.trim();
        if (!trimmed) return;
        setBasePath(trimmed);
        localStorage.setItem(STORAGE_KEY, trimmed);
        setEditingPath(false);
        setActiveFile(null);
        refresh(trimmed);
    };

    const handleBrowse = async () => {
        try {
            const dir = await openDialog({ directory: true, multiple: false, title: 'Seleccionar carpeta de notas' });
            if (dir && !Array.isArray(dir)) applyBasePath(dir);
        } catch { /* cancelado */ }
    };

    // ─── CRUD ───────────────────────────────────────────────────────────────

    const handleCreateFile = useCallback(async (parentPath: string, name: string) => {
        const fullPath = `${parentPath}/${name}`.replace(/\/+/g, '/');
        try {
            await invoke('notes_create_file', { path: fullPath });
            await refresh();
            setActiveFile(fullPath);
        } catch (e) { toast.error(String(e)); }
    }, [refresh]);

    const handleCreateFolder = useCallback(async (parentPath: string, name: string) => {
        const fullPath = `${parentPath}/${name}`.replace(/\/+/g, '/');
        try {
            await invoke('notes_create_folder', { path: fullPath });
            await refresh();
        } catch (e) { toast.error(String(e)); }
    }, [refresh]);

    const handleDelete = useCallback(async (entry: NoteEntry) => {
        const label = entry.is_dir ? `carpeta "${entry.name}" y todo su contenido` : `"${entry.name}"`;
        if (!confirm(`¿Eliminar ${label}?`)) return;
        try {
            await invoke('notes_delete_entry', { path: entry.path });
            if (activeFile?.startsWith(entry.path)) setActiveFile(null);
            await refresh();
        } catch (e) { toast.error(String(e)); }
    }, [refresh, activeFile]);

    const handleRename = useCallback(async (entry: NoteEntry, newName: string) => {
        const parent   = entry.path.substring(0, entry.path.lastIndexOf('/'));
        const newPath  = `${parent}/${newName}`;
        try {
            await invoke('notes_rename_entry', { oldPath: entry.path, newPath });
            if (activeFile === entry.path) setActiveFile(newPath);
            await refresh();
        } catch (e) { toast.error(String(e)); }
    }, [refresh, activeFile]);

    const activeFileName = activeFile ? activeFile.split('/').pop() ?? activeFile : null;

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2 shrink-0">
                    <NotebookPen size={15} className="text-violet-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Notas Markdown</span>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {editingPath ? (
                        <>
                            <Input
                                autoFocus
                                value={pathInput}
                                onChange={e => setPathInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter')  applyBasePath(pathInput);
                                    if (e.key === 'Escape') setEditingPath(false);
                                }}
                                placeholder="/ruta/a/tu/carpeta"
                                className="h-7 text-xs flex-1 font-mono"
                            />
                            <Button size="icon-xs" variant="ghost" onClick={() => applyBasePath(pathInput)} className="h-7 w-7 text-emerald-400">
                                <Check size={13} />
                            </Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => setEditingPath(false)} className="h-7 w-7 text-slate-500">
                                <X size={13} />
                            </Button>
                        </>
                    ) : (
                        <>
                            <span className="text-xs text-slate-500 font-mono truncate max-w-xs">{basePath || DEFAULT_DIR}</span>
                            <Button size="icon-xs" variant="ghost" title="Editar ruta"
                                onClick={() => { setPathInput(basePath); setEditingPath(true); }}
                                className="h-6 w-6 text-slate-500 hover:text-slate-200 shrink-0">
                                <Pencil size={11} />
                            </Button>
                            <Button size="icon-xs" variant="ghost" title="Seleccionar carpeta"
                                onClick={handleBrowse}
                                className="h-6 w-6 text-slate-500 hover:text-slate-200 shrink-0">
                                <FolderOpen size={12} />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Layout: sidebar + editor */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-56 shrink-0 border-r border-slate-800 overflow-hidden flex flex-col">
                    <NotesSidebar
                        entries={entries}
                        activeFile={activeFile}
                        basePath={basePath}
                        onSelectFile={setActiveFile}
                        onCreateFile={handleCreateFile}
                        onCreateFolder={handleCreateFolder}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        onRefresh={refresh}
                    />
                </div>

                {/* Editor */}
                <div className="flex-1 min-w-0 overflow-hidden">
                    {activeFile && activeFileName ? (
                        <NotesEditor key={activeFile} filePath={activeFile} fileName={activeFileName} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                            <NotebookPen size={32} className="opacity-20" />
                            <span className="text-sm">Selecciona o crea un archivo .md</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
