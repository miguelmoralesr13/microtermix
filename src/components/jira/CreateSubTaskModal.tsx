import { useState, useRef, useEffect } from 'react';
import { Plus, X, RefreshCw } from 'lucide-react';
import { loadConfig, createSubTask, transitionIssue, assignIssue } from '../jiraApi';
import { useEscape } from '../../hooks/useEscape';

export function CreateSubTaskModal({ parentKey, onCreated, onClose }: {
    parentKey: string; onCreated: (key: string) => void; onClose: () => void;
}) {
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    useEscape(onClose);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const cfg = loadConfig();
            const res = await createSubTask(parentKey, summary.trim(), description);
            // Auto-transition to Working
            try { await transitionIssue(res.key, 'Working'); } catch { }
            // Auto-assign — propagate error so user can see if assignment fails
            if (cfg.defaultAssigneeId) {
                await assignIssue(res.key, cfg.defaultAssigneeId);
            }
            onCreated(res.key);
        } catch (err: any) {
            setError(err?.message ?? 'Error al crear la tarea');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Plus size={14} className="text-microtermix-neon" /> Nueva Sub-tarea en <span className="font-mono text-microtermix-neon text-xs">{parentKey}</span>
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</p>}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Resumen *</label>
                        <input
                            ref={inputRef}
                            value={summary}
                            onChange={e => setSummary(e.target.value)}
                            required
                            placeholder="¿Qué hay que hacer?"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Descripción (opcional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Detalles adicionales..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon resize-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !summary.trim()}
                            className="flex-1 py-2 text-xs rounded-lg bg-microtermix-accent hover:bg-opacity-80 text-white font-bold disabled:opacity-50"
                        >
                            {submitting ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}
                            {submitting ? 'Creando...' : 'Crear + Working'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
