import React, { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, RefreshCw, Archive, FileCode, Search, Maximize2, Minimize2, Loader2, ChevronRight, FilePlus, FileX, FileText, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { DiffEditor } from '@monaco-editor/react';
import { useMonacoTheme } from '../hooks/useMonacoTheme';

interface StashDiffModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectPath: string;
    stashRef: string; // e.g. "stash@{0}"
}

interface StashFile {
    path: string;
    status: 'M' | 'A' | 'D' | 'R' | string;
    original: string;
    modified: string;
}

export const StashDiffModal: React.FC<StashDiffModalProps> = ({ isOpen, onClose, projectPath, stashRef }) => {
    const [files, setFiles] = useState<StashFile[]>([]);
    const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const monacoTheme = useMonacoTheme();
    const editorRef = useRef<any>(null);

    const index = parseInt(stashRef.match(/\d+/)?.at(0) ?? '0', 10);

    const getLanguage = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (!ext) return 'plaintext';
        const map: Record<string, string> = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'rs': 'rust', 'py': 'python', 'json': 'json', 'html': 'html', 'css': 'css',
            'md': 'markdown', 'yml': 'yaml', 'yaml': 'yaml', 'toml': 'toml', 'go': 'go'
        };
        return map[ext] || 'plaintext';
    };

    const loadStashContent = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Obtener el diff completo
            const res: any = await invoke('git_get_stash_diff', { projectPath, index });
            if (!res.success) throw new Error(res.stderr || 'Error al obtener el diff');

            const fullDiff = res.stdout;
            
            // 2. Parsear el diff para separar por archivos
            // Git unified diff separa archivos con "diff --git"
            const fileDiffs = fullDiff.split(/^diff --git/m).filter(Boolean);
            
            const parsedFiles: StashFile[] = await Promise.all(fileDiffs.map(async (diffSegment: string) => {
                const lines = diffSegment.split('\n');
                let path = '';
                // Intentar capturar el path de b/ (modificado) que suele ser el más fiable
                const pathMatch = lines[0].match(/b\/(.*?)$/) || lines[0].match(/a\/(.*?) b\//);
                if (pathMatch) path = pathMatch[1].trim();

                let status = 'M';
                if (diffSegment.includes('new file mode')) status = 'A';
                else if (diffSegment.includes('deleted file mode')) status = 'D';

                try {
                    let original = '';
                    let modified = '';

                    // Si NO es un archivo nuevo, buscamos el original en el padre del stash
                    if (status !== 'A') {
                        const res: any = await invoke('git_execute', { projectPath, args: ['show', `${stashRef}^:${path}`] });
                        if (res.success) original = res.stdout;
                    }

                    // Si NO es un archivo eliminado, buscamos el contenido en el stash
                    if (status !== 'D') {
                        const res: any = await invoke('git_execute', { projectPath, args: ['show', `${stashRef}:${path}`] });
                        if (res.success) modified = res.stdout;
                    }

                    return { path, status, original, modified };
                } catch (e) {
                    console.error(`Error loading content for ${path}:`, e);
                    return { path, status, original: '', modified: '' };
                }
            }));

            setFiles(parsedFiles.filter(f => f.path));
            setSelectedFileIndex(0);
        } catch (e: any) {
            setError(e?.toString() || 'Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadStashContent();
        } else {
            setFiles([]);
            setSelectedFileIndex(0);
        }
    }, [isOpen, stashRef]);

    const handleEditorDidMount = (editor: any) => {
        editorRef.current = editor;
        editor.updateOptions({
            renderSideBySide: true,
            readOnly: true,
            fontSize: 12,
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
        });
    };

    const filteredFiles = useMemo(() => {
        return files.filter(f => f.path.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [files, searchTerm]);

    const selectedFile = filteredFiles[selectedFileIndex] || files[selectedFileIndex];

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'A': return <FilePlus size={14} className="text-emerald-400" />;
            case 'D': return <FileX size={14} className="text-rose-400" />;
            default: return <FileText size={14} className="text-microtermix-accent" />;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent 
                showCloseButton={false}
                className={cn(
                    "bg-slate-950 border-slate-800 shadow-2xl flex flex-col p-0 overflow-hidden transition-all duration-300",
                    isFullScreen ? "!max-w-none w-screen h-screen rounded-none border-none" : "!max-w-[98vw] w-[98vw] h-[92vh] rounded-2xl border"
                )}
            >
                {/* Header */}
                <DialogHeader className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-row items-center justify-between space-y-0 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-microtermix-accent/10 rounded-xl">
                            <Archive size={20} className="text-microtermix-accent" />
                        </div>
                        <div>
                            <DialogTitle className="text-slate-100 text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                Stash Inspector
                                <Badge variant="outline" className="ml-2 font-mono text-[10px] border-slate-700 text-slate-500">{stashRef}</Badge>
                            </DialogTitle>
                            {selectedFile && (
                                <p className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                    <span className="text-microtermix-neon">/</span> {selectedFile.path}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon-sm" onClick={loadStashContent} disabled={loading} className="text-slate-500 hover:text-white h-8 w-8">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setIsFullScreen(!isFullScreen)} className="text-slate-500 hover:text-white">
                            {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </Button>
                        <div className="w-px h-4 bg-slate-800 mx-1" />
                        <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-slate-500 hover:text-rose-400 h-9 w-9">
                            <X size={22} />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Sidebar Archivos */}
                    <div className="w-72 border-r border-slate-800 bg-slate-900/30 flex flex-col shrink-0">
                        <div className="p-3 border-b border-slate-800 bg-slate-900/50">
                            <div className="relative">
                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Filtrar archivos..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-microtermix-accent transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-600">
                                    <Loader2 size={24} className="animate-spin" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Analizando...</span>
                                </div>
                            ) : error ? (
                                <div className="p-4 text-center space-y-2">
                                    <AlertCircle size={20} className="mx-auto text-rose-500 opacity-50" />
                                    <p className="text-[10px] text-rose-400 font-bold uppercase">Error</p>
                                    <p className="text-[9px] text-slate-500 leading-tight">{error}</p>
                                </div>
                            ) : filteredFiles.length === 0 ? (
                                <div className="p-8 text-center text-slate-600 italic text-[11px]">
                                    No se encontraron archivos.
                                </div>
                            ) : (
                                filteredFiles.map((f, i) => (
                                    <button
                                        key={f.path}
                                        onClick={() => setSelectedFileIndex(i)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all border-l-2 group",
                                            selectedFileIndex === i
                                                ? "bg-microtermix-accent/10 border-microtermix-accent text-slate-100"
                                                : "border-transparent text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
                                        )}
                                    >
                                        {getStatusIcon(f.status)}
                                        <span className="flex-1 text-xs font-mono truncate">{f.path.split('/').pop()}</span>
                                        <ChevronRight size={12} className={cn(
                                            "transition-transform",
                                            selectedFileIndex === i ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"
                                        )} />
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <span>Total Cambios</span>
                                <Badge variant="secondary" className="bg-slate-800 text-slate-400 h-4">{files.length}</Badge>
                            </div>
                        </div>
                    </div>

                    {/* Right: Monaco Diff Editor */}
                    <div className="flex-1 flex flex-col bg-[#020617] relative overflow-hidden">
                        {loading ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-700">
                                <RefreshCw size={48} className="animate-spin opacity-10" />
                            </div>
                        ) : selectedFile ? (
                            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-500">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/20 border-b border-slate-800 shrink-0">
                                    <FileCode size={14} className="text-slate-500" />
                                    <span className="text-xs font-mono text-slate-400 truncate">{selectedFile.path}</span>
                                    <Badge variant="outline" className="ml-auto text-[9px] uppercase border-slate-800 text-slate-600">{getLanguage(selectedFile.path)}</Badge>
                                </div>
                                <div className="flex-1 relative">
                                    <DiffEditor
                                        original={selectedFile.original}
                                        modified={selectedFile.modified}
                                        language={getLanguage(selectedFile.path)}
                                        theme={monacoTheme}
                                        onMount={handleEditorDidMount}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-700 gap-4 opacity-30">
                                <Archive size={64} strokeWidth={1} />
                                <p className="text-sm font-black uppercase tracking-widest">Selecciona un archivo</p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
