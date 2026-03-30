import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
    Dialog,
    DialogContent,
} from '@/components//ui/dialog';
import {
    FileCode,
    RefreshCw,
    Layers,
    ChevronRight,
    Search,
    AlertCircle,
    CheckCircle2,
    Layout
} from 'lucide-react';
import { GitlabFile, fetchGitlabFileContent } from '../../services/gitlabApi';
import { GitlabFileTree } from './GitlabFileTree';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface GitlabBranchViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectPath: string;
    token: string;
    branch: string;
    apiUrl?: string;
}

const TREE_MIN_WIDTH = 250;
const EDITOR_MIN_WIDTH = 400;

export function GitlabBranchViewerModal({
    isOpen,
    onClose,
    projectPath,
    token,
    branch,
    apiUrl
}: GitlabBranchViewerModalProps) {
    const monacoTheme = useMonacoTheme();
    const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
    const [fileData, setFileData] = useState<GitlabFile | null>(null);
    const [loading, setLoading] = useState(false);
    const [treeWidth, setTreeWidth] = useState(320);

    // Resize logic
    const bodyRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);

    const onResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (ev: MouseEvent) => {
            if (!draggingRef.current || !bodyRef.current) return;
            const rect = bodyRef.current.getBoundingClientRect();
            const newW = ev.clientX - rect.left;
            const clamped = Math.min(rect.width - EDITOR_MIN_WIDTH, Math.max(TREE_MIN_WIDTH, newW));
            setTreeWidth(clamped);
        };

        const onUp = () => {
            draggingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    useEffect(() => {
        if (!selectedFilePath || !isOpen) return;

        setLoading(true);
        fetchGitlabFileContent(projectPath, token, selectedFilePath, branch, apiUrl)
            .then(data => {
                if (data.encoding === 'base64') {
                    try {
                        data.content = atob(data.content);
                    } catch (e) {
                        data.content = "// Error decoding base64 content";
                    }
                }
                setFileData(data);
            })
            .catch(err => {
                toast.error(`Error al cargar archivo: ${err.message}`);
                setFileData(null);
            })
            .finally(() => setLoading(false));
    }, [selectedFilePath, projectPath, token, branch, apiUrl, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedFilePath(null);
            setFileData(null);
        }
    }, [isOpen]);

    const getLanguage = (path: string) => {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js':
            case 'jsx': return 'javascript';
            case 'ts':
            case 'tsx': return 'typescript';
            case 'py': return 'python';
            case 'md': return 'markdown';
            case 'json': return 'json';
            case 'css': return 'css';
            case 'html': return 'html';
            case 'yml':
            case 'yaml': return 'yaml';
            default: return 'plaintext';
        }
    };

    // Extract project name from path
    const projectName = projectPath.split('\\').pop() || projectPath.split('/').pop() || 'Proyecto';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[98vw] sm:max-w-[98vw] w-full h-[98vh] p-0 gap-0 border-slate-800 bg-slate-950 overflow-hidden flex flex-col shadow-2xl">
                {/* Modern Header (Swagger Style) */}
                <div className="shrink-0 flex items-center gap-3 px-6 py-3 bg-slate-900 border-b border-slate-800">
                    <Layout size={18} className="text-microtermix-neon shrink-0" />
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-widest shrink-0">
                        GitLab Explorer
                    </span>

                    {/* Hierarchy Badges */}
                    <div className="flex items-center gap-1.5 ml-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 capitalize">
                            {projectName}
                        </span>
                        <ChevronRight size={12} className="text-slate-600" />
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-microtermix-neon/10 border border-microtermix-neon/20 text-microtermix-neon font-bold">
                            {branch}
                        </span>
                    </div>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-4 ml-6">
                        {loading ? (
                            <span className="flex items-center gap-2 text-[10px] text-microtermix-neon/70 animate-pulse">
                                <RefreshCw size={11} className="animate-spin" /> Descargando...
                            </span>
                        ) : selectedFilePath ? (
                            <span className="flex items-center gap-2 text-[10px] text-emerald-400">
                                <CheckCircle2 size={11} /> Archivo cargado
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 text-[10px] text-slate-500">
                                <Search size={11} /> Esperando selección
                            </span>
                        )}
                    </div>

                    <div className="flex-1" />

                    {/* Tooltip/Info (Optional) */}
                    <div className="flex items-center gap-4 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1.5"><AlertCircle size={12} /> Solo lectura</span>
                    </div>
                </div>

                <div ref={bodyRef} className="flex-1 flex overflow-hidden">
                    {/* Sidebar: File Tree */}
                    <div
                        style={{ width: treeWidth }}
                        className="flex-shrink-0 border-r border-slate-800 bg-slate-900/40 overflow-y-auto overflow-x-hidden flex flex-col"
                    >
                        <div className="px-4 py-3 border-b border-white/5 bg-slate-900/50 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Explorador de Archivos</span>
                        </div>
                        <div className="flex-1 p-2">
                            <GitlabFileTree
                                projectPath={projectPath}
                                token={token}
                                branch={branch}
                                apiUrl={apiUrl}
                                onFileSelect={setSelectedFilePath}
                            />
                        </div>
                    </div>

                    {/* Resizer handle */}
                    <div
                        onMouseDown={onResizeStart}
                        className="w-1 shrink-0 cursor-col-resize bg-slate-800 hover:bg-microtermix-neon/50 transition-colors z-10"
                    />

                    {/* Main area: Editor */}
                    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
                        {selectedFilePath ? (
                            <>
                                <div className="h-10 border-b border-slate-800 bg-slate-900/30 flex items-center px-4 gap-3 shrink-0">
                                    <FileCode size={14} className="text-microtermix-neon" />
                                    <div className="flex items-center gap-1 overflow-hidden">
                                        {selectedFilePath.split('/').map((part, i, arr) => (
                                            <div key={i} className="flex items-center gap-1 shrink-0">
                                                <span className={cn(
                                                    "text-[11px] font-mono",
                                                    i === arr.length - 1 ? "text-slate-100 font-bold" : "text-slate-500"
                                                )}>
                                                    {part}
                                                </span>
                                                {i < arr.length - 1 && <ChevronRight size={10} className="text-slate-700" />}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex-1" />
                                    <span className="text-[10px] text-slate-500 font-mono uppercase bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700">
                                        {getLanguage(selectedFilePath)}
                                    </span>
                                </div>
                                <div className="flex-1 min-h-0 relative">
                                    {loading && (
                                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center text-slate-400 gap-4">
                                            <div className="w-12 h-12 relative">
                                                <RefreshCw size={48} className="animate-spin text-microtermix-neon/30" />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Layers size={16} className="text-microtermix-neon animate-pulse" />
                                                </div>
                                            </div>
                                            <p className="text-xs font-mono tracking-widest uppercase">Obteniendo contenido...</p>
                                        </div>
                                    )}
                                    <Editor
                                        height="100%"
                                        language={getLanguage(selectedFilePath)}
                                        theme={monacoTheme}
                                        value={fileData?.content || ''}
                                        loading={<div className="bg-slate-950 h-full" />}
                                        options={{
                                            readOnly: true,
                                            minimap: { enabled: true },
                                            fontSize: 13,
                                            wordWrap: 'on',
                                            lineNumbers: 'on',
                                            scrollBeyondLastLine: false,
                                            padding: { top: 16, bottom: 16 },
                                            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                                            renderWhitespace: 'none',
                                            folding: true,
                                            lineHeight: 20
                                        }}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center bg-slate-950/50 overflow-hidden relative">
                                {/* Grid background effect */}
                                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                                    style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                                <div className="z-10 flex flex-col items-center gap-6 p-12 bg-slate-900/50 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-sm max-w-md text-center">
                                    <div className="w-20 h-20 rounded-full bg-microtermix-neon/5 flex items-center justify-center border border-microtermix-neon/10 animate-pulse-slow">
                                        <FileCode size={40} className="text-microtermix-neon opacity-40" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-100 mb-2">Visor de Código Remoto</h3>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Selecciona un archivo del repositorio para visualizar su contenido directamente desde GitLab sin necesidad de clonar localmente.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-500 font-mono">Syntax Highlight</span>
                                        <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-500 font-mono">Live GitLab Sync</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
