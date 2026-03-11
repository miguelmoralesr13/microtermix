import { useState, useEffect } from 'react';
import { X, RefreshCw, UserCheck, ExternalLink } from 'lucide-react';
import { JiraIssue, loadConfig, JiraTransition, getTransitions, statusColor } from '../jiraApi';
import { useEscape } from '../../hooks/useEscape';

export function TaskDetailModal({ task, onClose, onTransition, onAssign }: {
    task: JiraIssue;
    onClose: () => void;
    onTransition: (tr: JiraTransition, onCompleteLocally: () => void) => void;
    onAssign: (() => void) | undefined;
}) {
    const cfg = loadConfig();
    const { fields } = task;
    useEscape(onClose);

    // Load transitions internally — works for any issue type
    const [transitions, setTransitions] = useState<JiraTransition[]>([]);
    const [loadingTr, setLoadingTr] = useState(true);
    const [transitioningTask, setTransitioningTask] = useState<string | null>(null);

    useEffect(() => {
        setLoadingTr(true);
        getTransitions(task.key)
            .then(setTransitions)
            .catch(() => setTransitions([]))
            .finally(() => setLoadingTr(false));
    }, [task.key]);

    const descText = !fields.description ? null
        : typeof fields.description === 'string' ? fields.description
            : fields.description?.content?.[0]?.content?.[0]?.text ?? null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[85vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-slate-800 shrink-0">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${task.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
                            {task.key} <ExternalLink size={10} />
                        </a>
                        <p className="text-sm font-semibold text-slate-100 mt-0.5 leading-snug">{fields.summary}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white shrink-0"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Status + type */}
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase"
                            style={{
                                background: statusColor(fields.status.statusCategory.colorName) + '22',
                                color: statusColor(fields.status.statusCategory.colorName),
                                border: `1px solid ${statusColor(fields.status.statusCategory.colorName)}44`,
                            }}>{fields.status.name}</span>
                        {fields.issuetype?.name && (
                            <span className="text-[10px] text-slate-500">{fields.issuetype.name}</span>
                        )}
                        {fields.priority?.name && (
                            <span className="text-[10px] text-slate-500">{fields.priority.name}</span>
                        )}
                    </div>

                    {/* Assignee */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {fields.assignee ? (
                                <>
                                    <img src={fields.assignee.avatarUrls['24x24']} alt="" className="w-5 h-5 rounded-full" />
                                    <span className="text-xs text-slate-300">{fields.assignee.displayName}</span>
                                </>
                            ) : (
                                <span className="text-xs text-slate-500 italic">Sin asignar</span>
                            )}
                        </div>
                        {onAssign && (
                            <button onClick={onAssign}
                                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold rounded-lg bg-nexus-neon/10 border border-nexus-neon/30 text-nexus-neon hover:bg-nexus-neon/20 transition-colors">
                                <UserCheck size={11} /> Asignarme
                            </button>
                        )}
                    </div>

                    {/* Description */}
                    {descText && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Descripción</p>
                            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{descText}</p>
                        </div>
                    )}

                    {/* Transitions */}
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
                            Transiciones
                            {loadingTr && <RefreshCw size={9} className="animate-spin text-slate-600" />}
                        </p>
                        {!loadingTr && transitions.length === 0 && (
                            <p className="text-[10px] text-slate-600 italic">Sin transiciones disponibles</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {transitions.map(tr => {
                                const isCurrent = fields.status.name.toLowerCase() === tr.toName.toLowerCase();
                                const color = /discard/i.test(tr.toName) ? '#ef4444' : statusColor(tr.toColor);
                                return (
                                    <button key={tr.id}
                                        onClick={() => {
                                            setTransitioningTask(task.key);
                                            onTransition(tr, () => setTransitioningTask(null));
                                        }}
                                        disabled={transitioningTask === task.key || isCurrent}
                                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 flex items-center gap-1"
                                        style={{ background: color + '18', borderColor: color + '44', color }}
                                        title={`${tr.name} → ${tr.toName}`}>
                                        {transitioningTask === task.key ? <RefreshCw size={10} className="animate-spin" /> : null}
                                        {tr.toName}
                                        {isCurrent && <span className="text-[9px] opacity-60">(actual)</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
