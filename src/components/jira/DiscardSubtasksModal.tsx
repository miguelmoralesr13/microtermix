import { useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Layers } from 'lucide-react';
import { JiraIssue, loadConfig, JiraTransition, assignIssue, getTransitions, transitionIssue } from '../jiraApi';

export interface DiscardSubtasksTarget {
    story: JiraIssue;
    transition: JiraTransition;
    openSubtasks: JiraIssue[];
    onCompleteLocally?: () => void;
}

export function DiscardSubtasksModal({ target, onConfirm, onClose }: {
    target: DiscardSubtasksTarget;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const { transition, openSubtasks } = target;
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState<{ completed: number, total: number, currentKey?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [remainingTasks, setRemainingTasks] = useState<JiraIssue[]>(openSubtasks);

    // Filter out already processed tasks
    const tasksToProcess = remainingTasks;

    const processTasks = async (tasks: JiraIssue[]) => {
        setProcessing(true);
        setError(null);
        setProgress({ completed: 0, total: tasks.length });

        try {
            const cfg = loadConfig();
            const accountId = cfg.defaultAssigneeId; // Current user

            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                setProgress({ completed: i, total: tasks.length, currentKey: task.key });

                // 1. Auto-assign to me if not already
                if (accountId && task.fields.assignee?.accountId !== accountId) {
                    try { await assignIssue(task.key, accountId); } catch (e) { console.warn("Failed to assign", task.key, e); }
                }

                // 2. Transition to Discarded
                const trs = await getTransitions(task.key);
                const discardTr = trs.find(t => /discard/i.test(t.toName) || /discard/i.test(t.name) || /rechazad/i.test(t.toName));

                try {
                    await transitionIssue(
                        task.key,
                        discardTr ? discardTr.toName : 'Discarded',
                        "Cerrada automáticamente al pasar historia a Developed"
                    );
                } catch (e) {
                    console.warn(`Failed to transition ${task.key} to Discarded`, e);
                    // Continue anyway, try the next
                }

                setRemainingTasks(prev => prev.filter(t => t.key !== task.key));
            }

            setProgress({ completed: tasks.length, total: tasks.length });

            // Wait a moment so user can see completion
            setTimeout(() => {
                onConfirm(); // This will trigger the original story transition
            }, 800);
        } catch (e: any) {
            setError(e?.message ?? 'Error descartando subtareas');
            setProcessing(false);
        }
    };

    const StatusBadge = ({ status }: { status: any }) => {
        let colorCls = 'bg-slate-800 text-slate-400';
        const cname = status.statusCategory.colorName;
        if (cname === 'blue-grey') colorCls = 'bg-slate-800 text-slate-400';
        if (cname === 'yellow') colorCls = 'bg-amber-500/10 text-amber-500';
        if (cname === 'green') colorCls = 'bg-emerald-500/10 text-emerald-500';
        if (cname === 'red') colorCls = 'bg-red-500/10 text-red-500';

        return <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${colorCls}`}>{status.name}</span>;
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={!processing ? onClose : undefined}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 p-4 border-b border-slate-800 bg-slate-900/50">
                    <AlertCircle size={18} className="text-yellow-400 shrink-0" />
                    <div>
                        <h3 className="text-sm font-bold text-slate-100 leading-snug">Subtareas Abiertas Detectadas</h3>
                        <p className="text-[10px] text-slate-400">La historia pasará a <span className="font-bold text-nexus-neon">{transition.toName}</span></p>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    <p className="text-xs text-slate-300">
                        Tienes <strong>{openSubtasks.length}</strong> tareas asociadas a esta historia que aún están en curso o pendientes.
                        ¿Deseas descartarlas automáticamente y asignártelas para poder avanzar la historia?
                    </p>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-800 rounded-lg p-2 bg-slate-950">
                        {openSubtasks.map(task => {
                            const isProcessed = !remainingTasks.find(t => t.key === task.key);
                            const isCurrent = progress?.currentKey === task.key;
                            return (
                                <div key={task.key} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {isProcessed ? <CheckCircle size={12} className="text-nexus-success shrink-0" /> :
                                            isCurrent ? <RefreshCw size={12} className="text-nexus-neon animate-spin shrink-0" /> :
                                                <Layers size={12} className="text-slate-500 shrink-0" />}
                                        <span className="text-[11px] font-mono text-slate-400 shrink-0 bg-slate-950 px-1 rounded">{task.key}</span>
                                        <span className="text-xs text-slate-300 truncate">{task.fields.summary}</span>
                                    </div>
                                    <StatusBadge status={task.fields.status} />
                                </div>
                            );
                        })}
                    </div>

                    {error && (
                        <div className="p-2 border border-red-500/30 bg-red-500/10 text-red-400 text-xs rounded">
                            {error}
                        </div>
                    )}

                    {processing && progress && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Procesando...</span>
                                <span>{progress.completed} / {progress.total}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-nexus-neon transition-all duration-300" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 p-4 pt-1">
                    <button type="button" onClick={onClose} disabled={processing}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50">
                        Cancelar
                    </button>
                    {!processing ? (
                        <button type="button" onClick={() => processTasks(tasksToProcess)} disabled={tasksToProcess.length === 0}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-bold border bg-nexus-accent/20 border-nexus-accent/30 text-nexus-accent hover:bg-nexus-accent/30 transition-colors disabled:opacity-50">
                            Cerrar Tasks y Continuar
                        </button>
                    ) : (
                        <button type="button" disabled
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-bold border bg-slate-800 border-slate-700 text-slate-400 disabled:opacity-50 flex items-center justify-center gap-2">
                            <RefreshCw size={12} className="animate-spin" /> Procesando...
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
