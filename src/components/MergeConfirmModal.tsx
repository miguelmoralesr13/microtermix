import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, GitMerge, Loader2, GitCommit, AlertCircle, Info } from 'lucide-react';
import { RawCommit } from '../stores/gitStore';

interface MergeConfirmModalProps {
    projectPath: string;
    sourceBranch: string;
    currentBranch: string;
    onClose: () => void;
    onMergeComplete: () => void;
}

type MergeStrategy = '--ff-only' | '--no-ff' | '--squash';

export const MergeConfirmModal: React.FC<MergeConfirmModalProps> = ({
    projectPath,
    sourceBranch,
    currentBranch,
    onClose,
    onMergeComplete
}) => {
    const [commits, setCommits] = useState<RawCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mergeError, setMergeError] = useState<string | null>(null);
    const [strategy, setStrategy] = useState<MergeStrategy>('--no-ff');
    const [isMerging, setIsMerging] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        // Fetch commits that are in sourceBranch but NOT in currentBranch
        invoke<{ success: boolean; stdout: string; stderr: string }>('git_execute', {
            projectPath,
            args: ['log', `${currentBranch}..${sourceBranch}`, '--format=%H|%P|%an|%cI|%s|%D']
        })
            .then(res => {
                if (!isMounted) return;
                if (!res.success) {
                    setError('No se pudo cargar el preview de commits.');
                } else {
                    const parsed = res.stdout.split('\n').filter(l => l.trim()).map(line => {
                        const parts = line.split('|');
                        const hash = parts[0] ?? '';
                        const parentsRaw = parts[1] ?? '';
                        const author = parts[2] ?? '';
                        const date = parts[3] ?? '';
                        const message = parts[4] ?? '';
                        const refs = parts.slice(5).join('|');
                        const parents = parentsRaw.trim().split(' ').filter(Boolean).map(p => p.slice(0, 7));
                        return { hash, shortHash: hash.slice(0, 7), parents, author, date, message, refs };
                    });
                    setCommits(parsed);
                }
            })
            .catch(() => {
                if (isMounted) setError('Error al comunicarse con git.');
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, [projectPath, sourceBranch, currentBranch]);

    const handleMerge = async () => {
        setIsMerging(true);
        setMergeError(null);
        try {
            const res = await invoke<{ success: boolean; stdout: string; stderr: string }>('git_execute', {
                projectPath,
                args: ['merge', strategy, sourceBranch]
            });

            if (res.success) {
                if (strategy === '--squash') {
                    // El squash NO commitea automáticamente, muestra aviso y refresca
                    alert('Squash aplicado — haz commit en el panel de staging preparatorios.');
                }
                onMergeComplete();
                onClose();
            } else {
                const out = (res.stderr || res.stdout).toLowerCase();
                if (out.includes('conflict')) {
                    // Conflicto: el backend devuelve error en el status, pero el repositorio ENTRA en modo conflict
                    // Refrescamos y dejamos que el GitPanel abra el GitConflictModal
                    onMergeComplete();
                    onClose();
                } else if (out.includes('fatal: not possible to fast-forward')) {
                    setMergeError('Esta rama no puede aplicarse en fast-forward. Prueba con Merge commit (--no-ff).');
                } else {
                    setMergeError(res.stderr || res.stdout || 'Error desconocido durante el merge.');
                }
            }
        } catch (e: any) {
            setMergeError(String(e));
        } finally {
            setIsMerging(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] select-none">
            <div className="bg-slate-900 border border-slate-700 w-[550px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900 shrink-0">
                    <div className="flex items-center gap-2">
                        <GitMerge className="text-nexus-accent" size={18} />
                        <h2 className="text-base font-bold text-white">Merge Branch</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 rounded-full p-1" disabled={isMerging}>
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                    {/* Resumen */}
                    <div className="flex items-center justify-center gap-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                        <div className="text-center min-w-0 flex-1">
                            <span className="text-xs text-slate-500 block mb-1 uppercase tracking-wider font-semibold">Rama origen</span>
                            <span className="text-sm font-mono text-nexus-neon truncate block bg-slate-950 px-2 py-1 rounded inline-block max-w-full">{sourceBranch}</span>
                        </div>
                        <div className="text-slate-500 flex flex-col items-center shrink-0">
                            <GitMerge size={20} className="text-slate-600 mb-1" />
                            <span className="text-[10px] font-bold uppercase">hacia</span>
                        </div>
                        <div className="text-center min-w-0 flex-1">
                            <span className="text-xs text-slate-500 block mb-1 uppercase tracking-wider font-semibold">Rama actual</span>
                            <span className="text-sm font-mono text-white truncate block bg-slate-950 px-2 py-1 rounded inline-block max-w-full">{currentBranch}</span>
                        </div>
                    </div>

                    {/* Selector de Estrategia */}
                    <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block tracking-wider">
                            Estrategia de Merge
                        </label>
                        <select
                            value={strategy}
                            onChange={e => setStrategy(e.target.value as MergeStrategy)}
                            disabled={isMerging}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-nexus-neon focus:ring-1 focus:ring-nexus-neon transition-colors"
                        >
                            <option value="--no-ff">Merge commit (--no-ff) - Conserva la rama entera y crea commit</option>
                            <option value="--ff-only">Fast-forward (--ff-only) - Mueve la rama (falla si hay desvíos)</option>
                            <option value="--squash">Squash (--squash) - Junta todo en tus cambios listos para commit</option>
                        </select>
                    </div>

                    {/* Preview de Commits */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Commits entrantes {commits.length > 0 && `(${commits.length})`}
                            </span>
                        </div>

                        <div className="bg-slate-950 rounded-lg border border-slate-800 min-h-[150px] max-h-[250px] overflow-y-auto w-full flex flex-col">
                            {loading ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-500">
                                    <Loader2 size={24} className="animate-spin mb-3 text-slate-600" />
                                    <span className="text-sm">Cargando commits...</span>
                                </div>
                            ) : error ? (
                                <div className="flex-1 flex items-center justify-center text-sm text-red-400 p-6 text-center">
                                    {error}
                                </div>
                            ) : commits.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-amber-500/80 p-6 text-center">
                                    <Info size={28} className="mb-2 opacity-80" />
                                    <p className="text-sm font-medium">No hay commits nuevos.</p>
                                    <p className="text-xs opacity-70 mt-1">{currentBranch} ya tiene todos los cambios de {sourceBranch}.</p>
                                </div>
                            ) : (
                                <div className="flex-1 py-1 w-full">
                                    {commits.map(c => (
                                        <div key={c.hash} className="px-3 py-2 flex items-start gap-3 hover:bg-slate-800/50 transition-colors border-b border-transparent hover:border-slate-800 group">
                                            <GitCommit size={14} className="text-slate-600 mt-1 shrink-0 group-hover:text-nexus-neon" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-slate-200 truncate font-medium">{c.message}</p>
                                                <div className="flex items-center gap-2 mt-1 opacity-70">
                                                    <span className="text-xs font-mono text-slate-500 bg-slate-900 px-1 rounded">{c.shortHash}</span>
                                                    <span className="text-xs text-slate-400 truncate">{c.author}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Merge Error Box */}
                    {mergeError && (
                        <div className="p-3 bg-red-900/30 border border-red-900/50 rounded-lg flex items-start gap-3 text-red-200 text-sm">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0 break-words whitespace-pre-wrap font-mono text-xs">
                                {mergeError}
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isMerging}
                        className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleMerge}
                        disabled={isMerging || (commits.length === 0 && !loading)}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-nexus-neon text-nexus-darker hover:bg-nexus-neon/90 focus:ring-2 focus:ring-nexus-neon focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isMerging ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Merging...
                            </>
                        ) : (
                            <>
                                <GitMerge size={16} />
                                Mergear a {currentBranch}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
