import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDockerStore } from '@/stores/dockerStore';
import { useDockerFiles } from '@/hooks/useDocker';
import { 
    Loader2, Folder, File, HardDrive, ChevronRight, 
    FileJson, FileCode, FileText, FileArchive, FileImage, FileAudio, FileVideo,
    Search, ArrowLeft, X, ExternalLink
} from 'lucide-react';
import { 
    SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiDocker, 
    SiMarkdown, SiHtml5, SiCss, SiPhp, SiRuby
} from 'react-icons/si';
import { 
    ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator 
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { invoke } from '@tauri-apps/api/core';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { cn } from '@/lib/utils';

interface EditorChoice {
    label: string;
    cmd: string;
}

const getFileIcon = (fileName: string, isDir: boolean) => {
    if (isDir) return <Folder size={16} className="text-blue-400 fill-blue-400/20" />;
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    switch (ext) {
        case 'js': case 'jsx': case 'mjs': return <SiJavascript size={14} className="text-yellow-400" />;
        case 'ts': case 'tsx': return <SiTypescript size={14} className="text-blue-500" />;
        case 'py': return <SiPython size={14} className="text-blue-400" />;
        case 'rs': return <SiRust size={14} className="text-orange-600" />;
        case 'go': return <SiGo size={14} className="text-cyan-500" />;
        case 'dockerfile': case 'dockerignore': return <SiDocker size={14} className="text-blue-400" />;
        case 'markdown': case 'md': return <SiMarkdown size={14} className="text-slate-400" />;
        case 'html': return <SiHtml5 size={14} className="text-orange-500" />;
        case 'css': case 'scss': case 'less': return <SiCss size={14} className="text-blue-400" />;
        case 'php': return <SiPhp size={14} className="text-indigo-400" />;
        case 'rb': return <SiRuby size={14} className="text-red-500" />;
        case 'java': case 'jar': return <FileCode size={14} className="text-red-400" />;
        case 'json': return <FileJson size={14} className="text-yellow-500" />;
        case 'sh': case 'bash': case 'zsh': return <FileCode size={14} className="text-emerald-400" />;
        case 'yaml': case 'yml': case 'toml': case 'conf': case 'ini': return <FileCode size={14} className="text-slate-300" />;
        case 'txt': case 'log': return <FileText size={14} className="text-slate-400" />;
        case 'zip': case 'gz': case 'tar': case '7z': case 'rar': return <FileArchive size={14} className="text-amber-500" />;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'ico': return <FileImage size={14} className="text-purple-400" />;
        case 'mp3': case 'wav': case 'flac': return <FileAudio size={14} className="text-rose-400" />;
        case 'mp4': case 'mov': case 'avi': return <FileVideo size={14} className="text-rose-500" />;
        default: return <File size={14} className="text-slate-500" />;
    }
};

const normalizePath = (path: string) => {
    return '/' + path.split('/').filter(p => p !== '').join('/');
};

export const ContainerFileExplorer: React.FC = () => {
    const { fileExplorerOpen, setFileExplorerOpen, selectedContainerId } = useDockerStore();
    const [currentPath, setCurrentPath] = useState('/');
    const [searchQuery, setSearchQuery] = useState('');
    const [availableEditors, setAvailableEditors] = useState<EditorChoice[]>([]);
    const sidebarWidth = 280;

    const { data: files = [], isLoading, error } = useDockerFiles(selectedContainerId || '', currentPath);

    useEffect(() => {
        if (fileExplorerOpen) {
            setCurrentPath('/');
        }
    }, [fileExplorerOpen, selectedContainerId]);

    useEffect(() => {
        const detectEditors = async () => {
            try {
                const eds = await invoke<EditorChoice[]>('get_available_editors');
                setAvailableEditors(eds);
            } catch (err) {
                console.error('Failed to detect editors', err);
            }
        };
        detectEditors();
    }, []);

    const handleNavigate = (folderName: string) => {
        const newPath = normalizePath(currentPath + '/' + folderName);
        setCurrentPath(newPath);
    };

    const { setOpenedFile } = useDockerStore();
    const [isReadingFile, setIsReadingFile] = useState<string | null>(null);

    const handleOpenFile = async (file: any) => {
        if (file.isDir) {
            handleNavigate(file.name);
            return;
        }

        setIsReadingFile(file.name);
        try {
            const filePath = normalizePath(currentPath + '/' + file.name);
            const content = await invoke<string>('docker_read_file', { 
                containerId: selectedContainerId, 
                path: filePath 
            });
            setOpenedFile({ name: file.name, path: filePath, content });
        } catch (err) {
            console.error('Failed to read file', err);
        } finally {
            setIsReadingFile(null);
        }
    };

    const handleOpenWithEditor = async (file: any, editorCmd?: string | null) => {
        if (file.isDir) return;
        
        setIsReadingFile(file.name);
        try {
            const filePath = normalizePath(currentPath + '/' + file.name);
            const content = await invoke<string>('docker_read_file', { 
                containerId: selectedContainerId, 
                path: filePath 
            });

            const dataDir = await appLocalDataDir();
            const tempDir = await join(dataDir, 'docker_files');
            const fileNameParsed = file.name.replace(/[^a-z0-9.]/gi, '_');
            const tempPath = await join(tempDir, fileNameParsed);
            
            await invoke('ensure_directory', { path: tempDir });
            await invoke('write_file', { path: tempPath, content });
            
            console.log('[FileExplorer] Invoking open_in_editor with:', { path: tempPath, editor_cmd: editorCmd });
            
            await invoke('open_in_editor', { 
                path: tempPath, 
                editorCmd: editorCmd || null,
                editor_cmd: editorCmd || null,
                line: null,
                column: null
            });
            console.log('[FileExplorer] Open in editor invoked successfully');
        } catch (err: any) {
            console.error('[FileExplorer] ERROR invoking editor:', err);
            alert(`Error fatal al abrir editor: ${err?.message || err}`);
        } finally {
            setIsReadingFile(null);
        }
    };

    const handleNavigateUp = () => {
        if (currentPath === '/') return;
        const parts = currentPath.split('/').filter(p => p !== '');
        parts.pop();
        setCurrentPath(normalizePath('/' + parts.join('/')));
    };

    const goToRelative = (index: number) => {
        const parts = currentPath.split('/').filter(p => p !== '');
        const newPath = normalizePath('/' + parts.slice(0, index + 1).join('/'));
        setCurrentPath(newPath);
    };

    const filteredFiles = files.filter(f => 
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pathParts = currentPath.split('/').filter(p => p !== '');

    if (!selectedContainerId) return null;

    return (
        <Dialog open={fileExplorerOpen} onOpenChange={setFileExplorerOpen}>
            <DialogContent className="bg-[#020617] border-slate-800 text-white max-w-[1600px] sm:max-w-none w-[98vw] h-[92vh] flex flex-col p-0 overflow-hidden shadow-2xl ring-1 ring-white/10 rounded-xl">
                <DialogHeader className="p-4 border-b border-slate-800 bg-[#0f172a]/50 shrink-0">
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <SiDocker size={20} className="text-blue-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-tight">Source Tree Explorer</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-slate-500 font-mono uppercase px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
                                        ID: {selectedContainerId.substring(0, 12)}
                                    </span>
                                    <ChevronRight size={10} className="text-slate-600" />
                                    <span className="text-[10px] text-microtermix-neon font-mono truncate max-w-[300px]">
                                        {currentPath}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="hidden md:flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 gap-2 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all">
                                <Search size={14} className="text-slate-500" />
                                <input 
                                    type="text" 
                                    placeholder="Search entries..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border-none outline-none text-xs w-48 font-mono"
                                />
                             </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex">
                    {/* Navigation Sidebar */}
                    <div 
                        style={{ width: sidebarWidth }}
                        className="shrink-0 bg-[#020617] border-r border-slate-800 flex flex-col overflow-hidden"
                    >
                        <div className="p-3 border-b border-slate-800 bg-[#0f172a]/20">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Navigation</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 scrollbar-hide space-y-0.5">
                            <button 
                                onClick={() => setCurrentPath('/')}
                                className={cn(
                                    "w-full flex items-center gap-2.5 p-2 rounded-lg text-xs transition-all",
                                    currentPath === '/' ? "bg-blue-500/10 text-blue-400 font-bold" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                                )}
                            >
                                <HardDrive size={14} className={currentPath === '/' ? "text-blue-400" : "text-slate-500"} />
                                <span>Root (/)</span>
                            </button>
                            
                            {pathParts.map((part, i) => (
                                <button 
                                    key={i}
                                    onClick={() => goToRelative(i)}
                                    style={{ marginLeft: (i + 1) * 12 }}
                                    className={cn(
                                        "flex items-center gap-2.5 p-1.5 rounded-lg text-xs transition-all border-l border-slate-800/50",
                                        i === pathParts.length - 1 ? "bg-blue-500/5 text-blue-400 font-bold border-blue-500/30" : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                                    )}
                                >
                                    <Folder size={12} className={i === pathParts.length - 1 ? "text-blue-400" : "text-slate-700"} />
                                    <span className="truncate">{part}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main File View (Grid/Flex instead of Table for ContextMenu stability) */}
                    <div className="flex-1 flex flex-col min-w-0 bg-[#020617]">
                        {/* Toolbar */}
                        <div className="flex items-center justify-between p-2.5 bg-[#0f172a]/20 border-b border-slate-800 backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="ghost" size="icon-xs" 
                                    onClick={handleNavigateUp} 
                                    disabled={currentPath === '/'}
                                    className="text-slate-400 hover:text-white disabled:opacity-30 h-7 w-7"
                                >
                                    <ArrowLeft size={16} />
                                </Button>
                                <div className="h-4 w-px bg-slate-800 mx-1" />
                                <div className="flex items-center gap-1 text-[10px] font-mono">
                                    <Button variant="ghost" size="xs" onClick={() => setCurrentPath('/')} className="h-7 text-slate-500 hover:text-white uppercase font-bold px-2">Root</Button>
                                    {pathParts.map((part, i) => (
                                        <React.Fragment key={i}>
                                            <ChevronRight size={10} className="text-slate-700" />
                                            <Button 
                                                variant="ghost" size="xs" 
                                                onClick={() => {
                                                    const newPath = '/' + pathParts.slice(0, i + 1).join('/');
                                                    setCurrentPath(newPath);
                                                }}
                                                className="h-7 text-microtermix-accent hover:text-white px-2"
                                            >
                                                {part}
                                            </Button>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-2">
                                <span className="text-[10px] text-slate-500 font-mono italic">{filteredFiles.length} item(s)</span>
                            </div>
                        </div>

                        {/* Flex-based File List */}
                        <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
                            {/* Table Header (Simulated) */}
                            <div className="flex items-center p-3 text-slate-500 uppercase text-[9px] font-bold tracking-widest border-b border-slate-800/50 sticky top-0 bg-[#020617] z-10">
                                <div className="flex-1 pl-8">Name</div>
                                <div className="w-24 px-4 hidden sm:block">Size</div>
                                <div className="w-48 px-4 hidden md:block">Modified</div>
                                <div className="w-24 px-4 hidden lg:block">Perms</div>
                            </div>

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-32 text-slate-500 animate-pulse">
                                    <div className="p-4 bg-slate-900 rounded-full mb-4">
                                        <Loader2 size={32} className="animate-spin text-blue-500" />
                                    </div>
                                    <span className="text-sm font-medium">Scanning container filesystem...</span>
                                    <span className="text-[10px] mt-1 text-slate-600 font-mono">{currentPath}</span>
                                </div>
                            ) : error ? (
                                <div className="p-8 flex flex-col items-center justify-center text-center">
                                    <div className="p-3 bg-red-500/10 rounded-full mb-3">
                                        <X size={24} className="text-red-500" />
                                    </div>
                                    <span className="text-sm text-red-400 font-bold">Process execution failed</span>
                                    <p className="text-xs text-slate-500 mt-2 max-w-md font-mono bg-slate-950 p-4 border border-red-500/20 rounded">
                                        {(error as Error).message}
                                    </p>
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPath('/')} className="mt-4 border-slate-800">Return to root</Button>
                                </div>
                                
                            ) : (
                                <div className="flex flex-col p-1">
                                    {filteredFiles.map((file, idx) => (
                                        <ContextMenu key={`${file.name}-${idx}`}>
                                            <ContextMenuTrigger render={
                                                <div 
                                                    onClick={() => handleOpenFile(file)}
                                                    className={cn(
                                                        "flex items-center p-2 rounded-lg transition-all cursor-pointer group hover:bg-[#0f172a] border border-transparent hover:border-blue-500/20",
                                                        file.isDir ? "text-blue-300 font-medium" : "text-slate-300"
                                                    )}
                                                >
                                                    <div className="flex-1 flex items-center min-w-0">
                                                        <div className="w-8 flex justify-center shrink-0">
                                                            {isReadingFile === file.name ? <Loader2 size={16} className="animate-spin text-blue-400" /> : getFileIcon(file.name, file.isDir)}
                                                        </div>
                                                        <span className="truncate font-mono text-xs">{file.name}</span>
                                                    </div>
                                                    <div className="w-24 px-4 hidden sm:block font-mono text-[10px] text-slate-500">
                                                        {file.isDir ? 'DIR' : file.size}
                                                    </div>
                                                    <div className="w-48 px-4 hidden md:block font-mono text-[10px] text-slate-500">
                                                        {file.date}
                                                    </div>
                                                    <div className="w-24 px-4 hidden lg:block font-mono text-[9px] text-slate-600 uppercase">
                                                        {file.permissions}
                                                    </div>
                                                </div>
                                            } />
                                            
                                            {!file.isDir && (
                                                <ContextMenuContent className="w-56 bg-slate-900 border-slate-800 text-slate-200 shadow-xl p-1">
                                                    <div className="px-2 py-1.5 text-[9px] font-bold text-slate-600 uppercase tracking-widest border-b border-slate-800/50 mb-1">
                                                        Opciones de Archivo
                                                    </div>
                                                    <ContextMenuItem onClick={() => handleOpenFile(file)} className="gap-2.5">
                                                        <FileCode size={14} className="text-blue-400" />
                                                        <span className="font-medium text-[11px]">Ver en Monaco (Microtermix)</span>
                                                    </ContextMenuItem>
                                                    
                                                    <ContextMenuSeparator className="bg-slate-800" />
                                                    
                                                    {availableEditors.length > 0 && (
                                                        <>
                                                            <div className="px-2 py-1.5 text-[9px] text-slate-600 font-bold uppercase tracking-tighter">Abrir con...</div>
                                                            {availableEditors.map(ed => (
                                                                <ContextMenuItem key={ed.cmd} onClick={() => handleOpenWithEditor(file, ed.cmd)} className="gap-2.5 hover:bg-slate-800 group">
                                                                    <ExternalLink size={14} className="text-emerald-500/60 group-hover:text-emerald-400" />
                                                                    <span className="text-[11px]">{ed.label}</span>
                                                                </ContextMenuItem>
                                                            ))}
                                                            <ContextMenuSeparator className="bg-slate-800" />
                                                        </>
                                                    )}
                                                    
                                                    <ContextMenuItem onClick={() => handleOpenWithEditor(file, null)} className="gap-2.5 hover:bg-slate-800 opacity-80">
                                                        <Search size={14} className="text-slate-400" />
                                                        <span className="text-[11px]">Editor del Sistema</span>
                                                    </ContextMenuItem>
                                                </ContextMenuContent>
                                            )}
                                        </ContextMenu>
                                    ))}
                                    {filteredFiles.length === 0 && (
                                        <div className="py-24 text-center text-slate-600 italic font-mono text-xs bg-slate-950/20 rounded-xl mt-4">
                                            <Folder className="mx-auto mb-2 opacity-20" size={32} />
                                            {searchQuery ? "No matching entries found." : "Directory is empty."}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
