import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Trash2, FilePlus, FolderPlus, Pencil } from 'lucide-react';
import { Button } from '@/components//ui/button';
import { Input } from '@/components//ui/input';
import { cn } from '@/lib/utils';

export interface NoteEntry {
    name:     string;
    path:     string;
    is_dir:   boolean;
    children: NoteEntry[];
}

interface Props {
    entry:          NoteEntry;
    activeFile:     string | null;
    basePath:       string;
    depth?:         number;
    onSelectFile:   (path: string) => void;
    onCreateFile:   (parentPath: string, name: string) => void;
    onCreateFolder: (parentPath: string, name: string) => void;
    onDelete:       (entry: NoteEntry) => void;
    onRename:       (entry: NoteEntry, newName: string) => void;
}

export const NotesTreeNode: React.FC<Props> = ({
    entry, activeFile, basePath, depth = 0,
    onSelectFile, onCreateFile, onCreateFolder, onDelete, onRename,
}) => {
    const [open, setOpen]           = useState(depth === 0);
    const [hovering, setHovering]   = useState(false);
    const [addingFile, setAddingFile]     = useState(false);
    const [addingFolder, setAddingFolder] = useState(false);
    const [renaming, setRenaming]         = useState(false);
    const [inputVal, setInputVal]         = useState('');

    const isActive = !entry.is_dir && activeFile === entry.path;

    const commitInput = (mode: 'file' | 'folder' | 'rename') => {
        const val = inputVal.trim();
        if (!val) { cancel(); return; }
        if (mode === 'file') {
            const name = val.endsWith('.md') ? val : `${val}.md`;
            onCreateFile(entry.path, name);
        } else if (mode === 'folder') {
            onCreateFolder(entry.path, val);
        } else if (mode === 'rename') {
            onRename(entry, val.endsWith('.md') || entry.is_dir ? val : `${val}.md`);
        }
        cancel();
    };

    const cancel = () => {
        setAddingFile(false);
        setAddingFolder(false);
        setRenaming(false);
        setInputVal('');
    };

    const handleKey = (e: React.KeyboardEvent, mode: 'file' | 'folder' | 'rename') => {
        if (e.key === 'Enter')  commitInput(mode);
        if (e.key === 'Escape') cancel();
    };

    return (
        <div>
            {/* Fila de la entrada */}
            {renaming ? (
                <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
                    <Input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => handleKey(e, 'rename')} onBlur={cancel}
                        placeholder={entry.name} className="h-6 text-xs flex-1" />
                </div>
            ) : (
                <div
                    className={cn(
                        'flex items-center gap-1 py-[3px] pr-1 cursor-pointer select-none group rounded-sm',
                        isActive ? 'bg-violet-600/20 text-violet-300' : 'hover:bg-slate-800/60 text-slate-300',
                    )}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onClick={() => entry.is_dir ? setOpen(o => !o) : onSelectFile(entry.path)}
                    onMouseEnter={() => setHovering(true)}
                    onMouseLeave={() => setHovering(false)}
                >
                    {/* Ícono */}
                    <span className="shrink-0 text-slate-500 w-4">
                        {entry.is_dir
                            ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                            : null}
                    </span>
                    <span className="shrink-0 text-slate-400">
                        {entry.is_dir
                            ? (open ? <FolderOpen size={13} className="text-amber-400" /> : <Folder size={13} className="text-amber-400" />)
                            : <FileText size={13} className={isActive ? 'text-violet-400' : 'text-slate-400'} />
                        }
                    </span>
                    <span className={cn('text-xs flex-1 truncate', isActive && 'font-medium')}>
                        {entry.name}
                    </span>

                    {/* Acciones al hover */}
                    {hovering && (
                        <div className="flex items-center gap-0.5 shrink-0">
                            {entry.is_dir && (
                                <>
                                    <Button size="icon-xs" variant="ghost" title="Nuevo archivo"
                                        onClick={e => { e.stopPropagation(); setInputVal(''); setAddingFile(true); setOpen(true); }}
                                        className="h-5 w-5 text-slate-500 hover:text-slate-200">
                                        <FilePlus size={11} />
                                    </Button>
                                    <Button size="icon-xs" variant="ghost" title="Nueva carpeta"
                                        onClick={e => { e.stopPropagation(); setInputVal(''); setAddingFolder(true); setOpen(true); }}
                                        className="h-5 w-5 text-slate-500 hover:text-slate-200">
                                        <FolderPlus size={11} />
                                    </Button>
                                </>
                            )}
                            <Button size="icon-xs" variant="ghost" title="Renombrar"
                                onClick={e => { e.stopPropagation(); setInputVal(entry.name); setRenaming(true); }}
                                className="h-5 w-5 text-slate-500 hover:text-slate-200">
                                <Pencil size={11} />
                            </Button>
                            <Button size="icon-xs" variant="ghost" title="Eliminar"
                                onClick={e => { e.stopPropagation(); onDelete(entry); }}
                                className="h-5 w-5 text-slate-500 hover:text-red-400">
                                <Trash2 size={11} />
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Input para nuevo archivo dentro de esta carpeta */}
            {entry.is_dir && addingFile && (
                <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                    <FileText size={12} className="text-slate-400 shrink-0" />
                    <Input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => handleKey(e, 'file')} onBlur={() => commitInput('file')}
                        placeholder="nombre.md" className="h-6 text-xs flex-1" />
                </div>
            )}

            {/* Input para nueva carpeta */}
            {entry.is_dir && addingFolder && (
                <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                    <Folder size={12} className="text-amber-400 shrink-0" />
                    <Input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => handleKey(e, 'folder')} onBlur={() => commitInput('folder')}
                        placeholder="nombre-carpeta" className="h-6 text-xs flex-1" />
                </div>
            )}

            {/* Hijos recursivos */}
            {entry.is_dir && open && entry.children.map(child => (
                <NotesTreeNode
                    key={child.path}
                    entry={child}
                    activeFile={activeFile}
                    basePath={basePath}
                    depth={depth + 1}
                    onSelectFile={onSelectFile}
                    onCreateFile={onCreateFile}
                    onCreateFolder={onCreateFolder}
                    onDelete={onDelete}
                    onRename={onRename}
                />
            ))}
        </div>
    );
};
