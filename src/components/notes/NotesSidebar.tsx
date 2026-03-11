import React, { useState } from 'react';
import { FilePlus, FolderPlus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotesTreeNode, type NoteEntry } from './NotesTreeNode';

interface Props {
    entries:        NoteEntry[];
    activeFile:     string | null;
    basePath:       string;
    onSelectFile:   (path: string) => void;
    onCreateFile:   (parentPath: string, name: string) => void;
    onCreateFolder: (parentPath: string, name: string) => void;
    onDelete:       (entry: NoteEntry) => void;
    onRename:       (entry: NoteEntry, newName: string) => void;
    onRefresh:      () => void;
}

export const NotesSidebar: React.FC<Props> = ({
    entries, activeFile, basePath,
    onSelectFile, onCreateFile, onCreateFolder, onDelete, onRename, onRefresh,
}) => {
    const [addingRootFile,   setAddingRootFile]   = useState(false);
    const [addingRootFolder, setAddingRootFolder] = useState(false);
    const [inputVal, setInputVal] = useState('');

    const commitRoot = (mode: 'file' | 'folder') => {
        const val = inputVal.trim();
        if (!val) { cancel(); return; }
        if (mode === 'file') {
            onCreateFile(basePath, val.endsWith('.md') ? val : `${val}.md`);
        } else {
            onCreateFolder(basePath, val);
        }
        cancel();
    };

    const cancel = () => { setAddingRootFile(false); setAddingRootFolder(false); setInputVal(''); };

    const handleKey = (e: React.KeyboardEvent, mode: 'file' | 'folder') => {
        if (e.key === 'Enter')  commitRoot(mode);
        if (e.key === 'Escape') cancel();
    };

    return (
        <div className="flex flex-col h-full min-w-0">
            {/* Header */}
            <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-slate-800 bg-slate-950">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex-1 truncate">
                    Notas
                </span>
                <Button size="icon-xs" variant="ghost" title="Nuevo archivo en raíz"
                    onClick={() => { setInputVal(''); setAddingRootFile(true); setAddingRootFolder(false); }}
                    className="h-6 w-6 text-slate-500 hover:text-slate-200">
                    <FilePlus size={13} />
                </Button>
                <Button size="icon-xs" variant="ghost" title="Nueva carpeta en raíz"
                    onClick={() => { setInputVal(''); setAddingRootFolder(true); setAddingRootFile(false); }}
                    className="h-6 w-6 text-slate-500 hover:text-slate-200">
                    <FolderPlus size={13} />
                </Button>
                <Button size="icon-xs" variant="ghost" title="Refrescar" onClick={onRefresh}
                    className="h-6 w-6 text-slate-500 hover:text-slate-200">
                    <RefreshCw size={12} />
                </Button>
            </div>

            {/* Árbol */}
            <div className="flex-1 overflow-auto py-1">
                {/* Inputs en raíz */}
                {addingRootFile && (
                    <div className="flex items-center gap-1 px-3 py-1">
                        <Input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)}
                            onKeyDown={e => handleKey(e, 'file')} onBlur={() => commitRoot('file')}
                            placeholder="nombre.md" className="h-6 text-xs" />
                    </div>
                )}
                {addingRootFolder && (
                    <div className="flex items-center gap-1 px-3 py-1">
                        <Input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)}
                            onKeyDown={e => handleKey(e, 'folder')} onBlur={() => commitRoot('folder')}
                            placeholder="nombre-carpeta" className="h-6 text-xs" />
                    </div>
                )}

                {entries.length === 0 && !addingRootFile && !addingRootFolder && (
                    <div className="px-4 py-6 text-xs text-slate-600 text-center">
                        Carpeta vacía.<br />Crea un archivo o carpeta.
                    </div>
                )}

                {entries.map(entry => (
                    <NotesTreeNode
                        key={entry.path}
                        entry={entry}
                        activeFile={activeFile}
                        basePath={basePath}
                        depth={0}
                        onSelectFile={onSelectFile}
                        onCreateFile={onCreateFile}
                        onCreateFolder={onCreateFolder}
                        onDelete={onDelete}
                        onRename={onRename}
                    />
                ))}
            </div>
        </div>
    );
};
