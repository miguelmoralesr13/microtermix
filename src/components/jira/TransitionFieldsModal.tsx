import { useState, useRef, useEffect } from 'react';
import { X, RefreshCw, AlertCircle } from 'lucide-react';
import { JiraIssue, loadConfig, JiraTransition } from '../jiraApi';
import { useEscape } from '../../hooks/useEscape';

export interface TransitionTarget {
    task: JiraIssue;
    transition: JiraTransition;
    onCompleteLocally?: () => void;
}

export function TransitionFieldsModal({ target, onConfirm, onClose }: {
    target: TransitionTarget;
    onConfirm: (comment: string, fields: Record<string, any>) => void;
    onClose: () => void;
}) {
    loadConfig();
    const isDiscard = /discard/i.test(target.transition.toName) || /discard/i.test(target.transition.name);
    const reqFields = Object.entries(target.transition.fields ?? {}).filter(([, f]) => f.required);
    const hasCommentField = reqFields.some(([k]) => k === 'comment');
    const needsComment = isDiscard || hasCommentField;
    const otherFields = reqFields.filter(([k]) => k !== 'comment');

    const [comment, setComment] = useState('');
    const [values, setValues] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const firstRef = useRef<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement | null>(null);
    useEscape(onClose);
    useEffect(() => { (firstRef.current as HTMLElement | null)?.focus(); }, []);

    const allFilled =
        (!needsComment || comment.trim().length > 0) &&
        otherFields.every(([k]) => (values[k] ?? '').trim().length > 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!allFilled || submitting) return;
        setSubmitting(true);
        const fieldPayload: Record<string, any> = {};
        otherFields.forEach(([key, field]) => {
            const v = (values[key] ?? '').trim();
            if (!v) return;
            if (field.allowedValues?.length) {
                const av = field.allowedValues.find(a => a.name === v || a.id === v);
                fieldPayload[key] = av ? { id: av.id, name: av.name } : { name: v };
            } else {
                fieldPayload[key] = v;
            }
        });
        onConfirm(comment.trim(), fieldPayload);
    };

    const borderColor = isDiscard ? 'border-red-500/30' : 'border-slate-700';
    const accentColor = isDiscard ? 'text-red-400' : 'text-nexus-neon';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-slate-900 border ${borderColor} rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                    <h3 className={`text-sm font-bold ${accentColor} flex items-center gap-2`}>
                        <AlertCircle size={14} />
                        {target.transition.name}
                        <span className="text-[10px] font-normal text-slate-400">→ {target.transition.toName}</span>
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto">
                    <p className="text-xs text-slate-300 font-semibold">{target.task.key} · {target.task.fields.summary}</p>

                    {/* Comment / Motivo */}
                    {needsComment && (
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                                {isDiscard ? 'Motivo del descarte' : 'Comentario'} <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                ref={firstRef as React.RefObject<HTMLTextAreaElement>}
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder={isDiscard ? 'Explica por qué se descarta...' : 'Escribe un comentario...'}
                                rows={3}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 resize-none focus:border-slate-400 focus:outline-none"
                            />
                        </div>
                    )}

                    {/* Other required fields */}
                    {otherFields.map(([key, field], i) => (
                        <div key={key}>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                                {field.name} <span className="text-red-400">*</span>
                            </label>
                            {field.allowedValues?.length ? (
                                <select
                                    ref={i === 0 && !needsComment ? firstRef as React.RefObject<HTMLSelectElement> : undefined}
                                    value={values[key] ?? ''}
                                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-slate-400 focus:outline-none"
                                >
                                    <option value="">Seleccionar...</option>
                                    {field.allowedValues.map(av => (
                                        <option key={av.id} value={av.name}>{av.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    ref={i === 0 && !needsComment ? firstRef as React.RefObject<HTMLInputElement> : undefined}
                                    type="text"
                                    value={values[key] ?? ''}
                                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-slate-400 focus:outline-none"
                                />
                            )}
                        </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={!allFilled || submitting}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${isDiscard ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' : 'bg-nexus-neon/10 border-nexus-neon/30 text-nexus-neon hover:bg-nexus-neon/20'}`}>
                            {submitting ? <RefreshCw size={11} className="animate-spin mx-auto" /> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
