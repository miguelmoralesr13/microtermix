import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitMerge, RefreshCw, AlertCircle, GitCommit } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface CommitInfo {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
}

interface GitSquashModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    projectPath: string;
    maxCommits: number;
    onSuccess: () => void;
}

export function GitSquashModal({ isOpen, onOpenChange, projectPath, maxCommits, onSuccess }: GitSquashModalProps) {
    const [numCommits, setNumCommits] = useState(2);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [commits, setCommits] = useState<CommitInfo[]>([]);
    const [targetParent, setTargetParent] = useState('');

    useEffect(() => {
        if (isOpen) {
            setNumCommits(Math.min(2, maxCommits));
            fetchCommitData(Math.min(2, maxCommits));
        } else {
            setMessage('');
            setError(null);
            setCommits([]);
        }
    }, [isOpen, maxCommits]);

    const fetchCommitData = async (count: number) => {
        setIsFetching(true);
        setError(null);
        try {
            // Get messages and info for all commits in the range
            const logRes: any = await invoke('git_execute', { 
                projectPath, 
                args: ['log', '--format=%H|%h|%s|%an|%ar', '-n', count.toString()] 
            });

            if (logRes?.stdout) {
                const lines = logRes.stdout.trim().split('\n');
                const fetchedCommits: CommitInfo[] = lines.map((line: string) => {
                    const [hash, shortHash, message, author, date] = line.split('|');
                    return { hash, shortHash, message, author, date };
                });
                
                // CRITICAL: Update the commits list to reflect the new count
                setCommits(fetchedCommits);

                // Set combined message (parent to child order)
                const combinedMsg = fetchedCommits.map(c => c.message).reverse().join('\n\n');
                setMessage(combinedMsg);

                // Get the parent commit hash (HEAD~count)
                // This is the commit we are squashing ONTO
                const parentRes: any = await invoke('git_execute', { projectPath, args: ['rev-parse', `HEAD~${count}`] });
                setTargetParent(parentRes?.stdout?.trim() || '');
            }
        } catch (err: any) {
            setError(err?.toString() || 'Error al obtener datos de los commits.');
        } finally {
            setIsFetching(false);
        }
    };

    const handleCountChange = (newCount: number) => {
        const clamped = Math.min(Math.max(2, newCount), maxCommits);
        setNumCommits(clamped);
        fetchCommitData(clamped);
    };

    const handleSquash = async () => {
        if (!message.trim() || !commits.length || !targetParent) return;
        setIsLoading(true);
        setError(null);
        try {
            const res: any = await invoke('git_squash_into_parent', { 
                projectPath, 
                commitHash: commits[0].hash, // Current HEAD
                parentShortHash: targetParent.substring(0, 7),
                newMessage: message.trim() 
            });

            if (!res?.success) {
                setError(res?.stderr || 'Error al realizar el squash.');
            } else {
                onSuccess();
                onOpenChange(false);
            }
        } catch (err: any) {
            setError(err?.toString() || 'Error inesperado durante el squash.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] border-slate-800 bg-slate-950 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-purple-400 font-sans tracking-tight">
                        <GitMerge size={18} className="mr-2" />
                        Interactive Squash
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2 space-y-4">
                    <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-300">Cantidad de commits a agrupar</p>
                            <p className="text-[10px] text-slate-500">Seleccionando los últimos {numCommits} commits de la historia local.</p>
                        </div>
                        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-1 gap-3">
                            <button
                                onClick={() => handleCountChange(numCommits - 1)}
                                disabled={numCommits <= 2 || isFetching}
                                className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-20"
                            >
                                -
                            </button>
                            <span className="text-sm font-bold text-microtermix-accent min-w-[20px] text-center">
                                {numCommits}
                            </span>
                            <button
                                onClick={() => handleCountChange(numCommits + 1)}
                                disabled={numCommits >= maxCommits || isFetching}
                                className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-20"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Commits seleccionados</p>
                        <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1 scrollbar-hide">
                            {isFetching ? (
                                <div className="py-4 flex justify-center"><RefreshCw size={20} className="animate-spin text-slate-700" /></div>
                            ) : (
                                commits.map((c, i) => (
                                    <div key={c.hash} className="flex items-center gap-2 p-2 bg-slate-900/30 rounded border border-slate-800/30 text-[11px]">
                                        <GitCommit size={12} className={cn(i === 0 ? "text-microtermix-neon" : "text-slate-600")} />
                                        <span className="font-mono text-slate-500 shrink-0">{c.shortHash}</span>
                                        <span className="truncate flex-1 text-slate-300">{c.message}</span>
                                        <span className="text-[9px] text-slate-600 shrink-0">{c.date}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start p-3 text-xs bg-red-500/10 border border-red-500/20 rounded text-red-400">
                            <AlertCircle size={14} className="mr-2 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nuevo mensaje de commit</p>
                        <div className="relative">
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Mensaje combinado..."
                                className={cn(
                                    "min-h-[140px] bg-slate-900 border-slate-800 text-slate-200 focus:ring-purple-500/30 focus:border-purple-500 text-xs font-mono leading-relaxed",
                                    isFetching && "opacity-50 pointer-events-none"
                                )}
                                disabled={isLoading || isFetching}
                            />
                            {isFetching && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20">
                                    <RefreshCw size={24} className="animate-spin text-purple-400" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="bg-slate-900/50 -mx-4 -mb-4 p-4 border-t border-slate-800">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                        className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 h-9 text-xs"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSquash}
                        disabled={isLoading || isFetching || !message.trim()}
                        className="bg-purple-600 text-white hover:bg-purple-500 font-bold h-9 text-xs px-6"
                    >
                        {isLoading ? (
                            <>
                                <RefreshCw size={14} className="animate-spin mr-2" />
                                Agrupando...
                            </>
                        ) : (
                            <>
                                <GitMerge size={14} className="mr-2" />
                                Confirm Squash
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
