import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Pencil, RefreshCw, AlertCircle } from 'lucide-react';
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

interface GitAmendModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    projectPath: string;
    onSuccess: () => void;
}

export function GitAmendModal({ isOpen, onOpenChange, projectPath, onSuccess }: GitAmendModalProps) {
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchLastCommitMessage();
        } else {
            setMessage('');
            setError(null);
        }
    }, [isOpen]);

    const fetchLastCommitMessage = async () => {
        setIsFetching(true);
        setError(null);
        try {
            const res: any = await invoke('git_execute', { 
                projectPath, 
                args: ['log', '--format=%B', '-n', '1', 'HEAD'] 
            });
            if (res?.stdout) {
                setMessage(res.stdout.trim());
            } else {
                setError('No se pudo obtener el mensaje del último commit.');
            }
        } catch (err: any) {
            setError(err?.toString() || 'Error al obtener el mensaje del commit.');
        } finally {
            setIsFetching(false);
        }
    };

    const handleAmend = async () => {
        if (!message.trim()) return;
        setIsLoading(true);
        setError(null);
        try {
            const hashRes: any = await invoke('git_execute', { projectPath, args: ['rev-parse', 'HEAD'] });
            const headHash = hashRes?.stdout?.trim();
            
            if (!headHash) {
                setError('No se pudo obtener el hash de HEAD');
                return;
            }

            const res: any = await invoke('git_reword_commit', { 
                projectPath, 
                commitHash: headHash, 
                newMessage: message.trim() 
            });

            if (!res?.success) {
                setError(res?.stderr || 'Error al realizar el amend.');
            } else {
                onSuccess();
                onOpenChange(false);
            }
        } catch (err: any) {
            setError(err?.toString() || 'Error inesperado durante el amend.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] border-slate-800 bg-slate-950 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-microtermix-neon">
                        <Pencil size={18} className="mr-2" />
                        Amend Last Commit
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <p className="text-xs text-slate-400">
                        Editando el mensaje del commit más reciente (HEAD). 
                        Esto sobreescribirá el mensaje anterior.
                    </p>

                    {error && (
                        <div className="flex items-start p-3 text-xs bg-red-500/10 border border-red-500/20 rounded text-red-400">
                            <AlertCircle size={14} className="mr-2 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="relative">
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={isFetching ? "Cargando mensaje..." : "Mensaje del commit..."}
                            className={cn(
                                "min-h-[120px] bg-slate-900 border-slate-800 text-slate-200 focus:ring-microtermix-neon/30 focus:border-microtermix-neon",
                                isFetching && "opacity-50 pointer-events-none"
                            )}
                            disabled={isLoading || isFetching}
                        />
                        {isFetching && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <RefreshCw size={20} className="animate-spin text-microtermix-neon" />
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="bg-slate-900/50 -mx-4 -mb-4 p-4 border-t border-slate-800">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                        className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleAmend}
                        disabled={isLoading || isFetching || !message.trim()}
                        className="bg-microtermix-neon text-black hover:bg-microtermix-neon/80 font-bold"
                    >
                        {isLoading ? (
                            <>
                                <RefreshCw size={14} className="animate-spin mr-2" />
                                Amendando...
                            </>
                        ) : (
                            <>
                                <Pencil size={14} className="mr-2" />
                                Amend HEAD
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
