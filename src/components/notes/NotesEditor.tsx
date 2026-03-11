import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { marked } from 'marked';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

// marked: configuración básica segura
marked.setOptions({ breaks: true, gfm: true });

interface Props {
    filePath: string;
    fileName: string;
}

export const NotesEditor: React.FC<Props> = ({ filePath, fileName }) => {
    const monacoTheme = useMonacoTheme();
    const [content, setContent]     = useState('');
    const [preview, setPreview]     = useState(false);
    const [saving, setSaving]       = useState(false);
    const [saved, setSaved]         = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedRef = useRef('');

    // Cargar contenido al cambiar de archivo
    useEffect(() => {
        let cancelled = false;
        invoke<string>('read_file_at_path', { path: filePath })
            .then(text => { if (!cancelled) { setContent(text); lastSavedRef.current = text; setSaved(false); } })
            .catch(() => { if (!cancelled) setContent(''); });
        return () => { cancelled = true; };
    }, [filePath]);

    // Auto-save con debounce 600ms
    const autoSave = useCallback((value: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (value === lastSavedRef.current) return;
            setSaving(true);
            try {
                await invoke('notes_write_file', { path: filePath, content: value });
                lastSavedRef.current = value;
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } catch (e) {
                toast.error(`Error al guardar: ${e}`);
            } finally {
                setSaving(false);
            }
        }, 600);
    }, [filePath]);

    const handleChange = (val: string | undefined) => {
        const v = val ?? '';
        setContent(v);
        autoSave(v);
    };

    const previewHtml = preview ? marked(content) as string : '';

    return (
        <div className="flex flex-col h-full">
            {/* Barra del editor */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <span className="text-sm text-slate-300 font-medium flex-1 truncate">{fileName}</span>
                <span className="text-xs text-slate-600">
                    {saving ? 'Guardando…' : saved ? <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 size={11} /> Guardado</span> : null}
                </span>
                <Button size="sm" variant="ghost"
                    onClick={() => { navigator.clipboard.writeText(content); toast.success('Copiado'); }}
                    className="h-7 text-xs gap-1 text-slate-500 hover:text-slate-200">
                    <Copy size={13} />
                </Button>
                <Button size="sm" variant={preview ? 'outline' : 'ghost'}
                    onClick={() => setPreview(p => !p)}
                    className="h-7 text-xs gap-1">
                    {preview ? <><EyeOff size={13} /> Editor</> : <><Eye size={13} /> Preview</>}
                </Button>
            </div>

            {/* Contenido */}
            <div className="flex-1 min-h-0">
                {preview ? (
                    <div
                        className="h-full overflow-auto px-8 py-6 prose prose-invert prose-sm max-w-none
                            prose-headings:text-slate-100 prose-p:text-slate-300 prose-code:text-violet-300
                            prose-pre:bg-slate-800 prose-blockquote:border-violet-500 prose-blockquote:text-slate-400
                            prose-a:text-violet-400 prose-strong:text-slate-100 prose-li:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                ) : (
                    <Editor
                        height="100%"
                        defaultLanguage="markdown"
                        theme={monacoTheme}
                        value={content}
                        onChange={handleChange}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: 'on',
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            renderWhitespace: 'none',
                            padding: { top: 12, bottom: 12 },
                        }}
                    />
                )}
            </div>
        </div>
    );
};
