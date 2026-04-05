import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDockerStore } from '@/stores/dockerStore';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { FileCode } from 'lucide-react';
import { SiDocker as DockerIcon } from 'react-icons/si';

export const DockerFileViewer: React.FC = () => {
    const { openedFile, setOpenedFile } = useDockerStore();
    const monacoTheme = useMonacoTheme();

    if (!openedFile) return null;

    const getLanguage = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const map: Record<string, string> = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'py': 'python', 'rs': 'rust', 'go': 'go', 'html': 'html', 'css': 'css',
            'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'md': 'markdown',
            'sh': 'shell', 'bash': 'shell', 'dockerfile': 'dockerfile'
        };
        return map[ext || ''] || 'plaintext';
    };

    return (
        <Dialog open={!!openedFile} onOpenChange={(open) => !open && setOpenedFile(null)}>
            <DialogContent className="bg-[#020617] border-slate-800 text-white max-w-[1400px] w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl ring-1 ring-white/10 z-[200] sm:max-w-none">
                <DialogHeader className="p-3 border-b border-slate-800 bg-[#0f172a]/50 shrink-0">
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                <FileCode size={16} className="text-blue-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold tracking-tight">{openedFile.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[500px]">
                                    {openedFile.path}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mr-8">
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20">
                                <DockerIcon size={10} className="text-blue-500" />
                                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">Docker Source</span>
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0">
                    <Editor
                        height="100%"
                        language={getLanguage(openedFile.name)}
                        value={openedFile.content}
                        theme={monacoTheme}
                        options={{
                            readOnly: true,
                            minimap: { enabled: true },
                            fontSize: 13,
                            fontFamily: 'Consolas, "Courier New", monospace',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            padding: { top: 10, bottom: 10 },
                            domReadOnly: true
                        }}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};
