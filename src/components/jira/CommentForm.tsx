import React, { useState, useRef } from 'react';
import { Paperclip, X, RefreshCw, Send } from 'lucide-react';
import { addComment, uploadAttachment } from './jiraApi';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

export function CommentForm({ issueKey, onSuccess }: { issueKey: string; onSuccess: () => void }) {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async () => {
        if (!text.trim() && files.length === 0) return;
        setSubmitting(true);
        setError(null);
        try {
            if (text.trim()) await addComment(issueKey, text.trim());
            if (files.length > 0) await uploadAttachment(issueKey, files);
            setText('');
            setFiles([]);
            onSuccess();
        } catch (e: any) {
            setError(e?.message ?? 'Error al enviar');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        e.target.value = '';
    };

    const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

    return (
        <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Agregar Comentario</h3>
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-ring/50 transition-shadow">
                <Textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Escribe un comentario…"
                    rows={3}
                    className="w-full bg-transparent px-4 py-3 text-sm text-slate-200 placeholder-slate-600 resize-none border-none focus-visible:ring-0 shadow-none rounded-none"
                />
                {files.length > 0 && (
                    <div className="px-4 pb-2 flex flex-wrap gap-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 bg-slate-700 rounded-full px-2.5 py-1 text-[11px] text-slate-300 max-w-[180px]">
                                <Paperclip size={10} className="shrink-0 text-slate-400" />
                                <span className="truncate">{f.name}</span>
                                <button onClick={() => removeFile(i)} className="text-slate-500 hover:text-red-400 shrink-0 ml-0.5"><X size={10} /></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/60">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        title="Adjuntar archivo"
                        className="text-slate-500 hover:text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-700"
                    >
                        <Paperclip size={15} />
                    </Button>
                    <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || (!text.trim() && files.length === 0)}
                        className="gap-1.5 bg-microtermix-accent/20 hover:bg-microtermix-accent/30 text-microtermix-accent border border-microtermix-accent/30 text-xs font-bold rounded-lg"
                        size="sm"
                    >
                        {submitting ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        {submitting ? 'Enviando…' : 'Comentar'}
                    </Button>
                </div>
            </div>
            {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
        </section>
    );
}
