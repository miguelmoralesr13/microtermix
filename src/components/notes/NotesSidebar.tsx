import React, { useState } from 'react';
import { FilePlus, FolderPlus, RefreshCw, HelpCircle } from 'lucide-react';
import { Button } from '@/components//ui/button';
import { Input } from '@/components//ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components//ui/dialog';
import { marked } from 'marked';
import { NotesTreeNode, type NoteEntry } from './NotesTreeNode';

// ── Cheatsheet data ───────────────────────────────────────────────────────────

const CHEATSHEET: { label: string; raw: string }[] = [
    { label: 'Encabezado 1',    raw: '# Título principal' },
    { label: 'Encabezado 2',    raw: '## Sección' },
    { label: 'Encabezado 3',    raw: '### Sub-sección' },
    { label: 'Encabezado 4–6',  raw: '#### H4  ##### H5  ###### H6' },
    { label: 'Negrita',         raw: '**texto en negrita**' },
    { label: 'Cursiva',         raw: '*texto en cursiva*' },
    { label: 'Negrita+cursiva', raw: '***negrita y cursiva***' },
    { label: 'Tachado',         raw: '~~texto tachado~~' },
    { label: 'Código inline',   raw: '`console.log("hola")`' },
    { label: 'Bloque de código',raw: '```js\nconst x = 42;\n```' },
    { label: 'Cita',            raw: '> Esto es una cita' },
    { label: 'Lista sin orden', raw: '- Elemento A\n- Elemento B\n- Elemento C' },
    { label: 'Lista ordenada',  raw: '1. Primero\n2. Segundo\n3. Tercero' },
    { label: 'Lista de tareas', raw: '- [x] Tarea hecha\n- [ ] Pendiente' },
    { label: 'Enlace',          raw: '[Texto del enlace](https://ejemplo.com)' },
    { label: 'Imagen',          raw: '![Alt de imagen](https://via.placeholder.com/80x30)' },
    { label: 'Línea horizontal',raw: '---' },
    { label: 'Tabla',           raw: '| Col A | Col B |\n|-------|-------|\n| Celda | Celda |' },
    { label: 'Escape de símbolo', raw: '\\# \\* \\_ \\`' },
];

marked.setOptions({ breaks: true, gfm: true });

// ── Cheatsheet dialog ─────────────────────────────────────────────────────────

const MdCheatsheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 p-0">
            <DialogHeader className="flex flex-row items-center gap-2 px-5 py-3 border-b border-slate-800">
                <HelpCircle size={16} className="text-violet-400" />
                <DialogTitle className="text-slate-200 text-sm">Referencia rápida de Markdown</DialogTitle>
            </DialogHeader>

            <div className="overflow-auto flex-1 p-4">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-800">
                            <th className="pb-2 pr-4 font-semibold w-36">Elemento</th>
                            <th className="pb-2 pr-6 font-semibold">Sintaxis</th>
                            <th className="pb-2 font-semibold">Resultado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {CHEATSHEET.map(({ label, raw }) => (
                            <tr key={label} className="border-b border-slate-800/50 align-top">
                                <td className="py-2 pr-4 text-slate-400 font-medium whitespace-nowrap">{label}</td>
                                <td className="py-2 pr-6">
                                    <pre className="font-mono text-violet-300 bg-slate-800 rounded px-2 py-1 whitespace-pre-wrap break-all leading-relaxed">
                                        {raw}
                                    </pre>
                                </td>
                                <td className="py-2">
                                    <div
                                        className="prose prose-invert prose-sm max-w-none
                                            prose-headings:my-0 prose-headings:text-slate-100
                                            prose-p:my-0 prose-p:text-slate-300
                                            prose-code:text-violet-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded
                                            prose-pre:my-0 prose-pre:bg-slate-800
                                            prose-blockquote:my-0 prose-blockquote:border-violet-500 prose-blockquote:text-slate-400
                                            prose-a:text-violet-400 prose-strong:text-slate-100
                                            prose-li:my-0 prose-li:text-slate-300
                                            prose-table:my-0 prose-th:text-slate-300 prose-td:text-slate-400
                                            prose-hr:my-1 prose-hr:border-slate-600"
                                        dangerouslySetInnerHTML={{ __html: marked(raw) as string }}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </DialogContent>
    </Dialog>
);

// ── Sidebar ───────────────────────────────────────────────────────────────────

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
    const [inputVal,  setInputVal]  = useState('');
    const [showHelp,  setShowHelp]  = useState(false);

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
                <Button size="icon-xs" variant="ghost" title="Referencia Markdown"
                    onClick={() => setShowHelp(true)}
                    className="h-6 w-6 text-slate-500 hover:text-violet-400">
                    <HelpCircle size={12} />
                </Button>
            </div>

            {/* Árbol */}
            <div className="flex-1 overflow-auto py-1">
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

            <MdCheatsheet open={showHelp} onClose={() => setShowHelp(false)} />
        </div>
    );
};
