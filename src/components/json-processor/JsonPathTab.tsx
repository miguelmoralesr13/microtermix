import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

const EXAMPLES = [
    { label: 'Todos', expr: '$.*' },
    { label: 'Recursivo', expr: '$..name' },
    { label: 'Filtro', expr: '$..[?(@.price < 10)]' },
    { label: 'Array', expr: '$.store.book[*].author' },
];

export const JsonPathTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [input, setInput]   = useState('');
    const [expr, setExpr]     = useState('$.*');
    const [output, setOutput] = useState('');
    const [error, setError]   = useState<string | null>(null);

    const handleQuery = async () => {
        try {
            const result = await invoke<string>('json_query_path', { input, expression: expr });
            setOutput(result);
            setError(null);
        } catch (e) {
            setError(String(e));
            setOutput('');
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Input value={expr} onChange={e => setExpr(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuery()}
                    className="h-7 w-64 text-xs font-mono" placeholder="$.*" />
                <Button size="sm" onClick={handleQuery} className="h-7 text-xs gap-1">
                    <Search size={13} /> Consultar
                </Button>
                <span className="text-xs text-slate-600">Ejemplos:</span>
                {EXAMPLES.map(ex => (
                    <button key={ex.expr} onClick={() => setExpr(ex.expr)}
                        className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors">
                        {ex.label}
                    </button>
                ))}
                {output && (
                    <Button size="sm" variant="outline"
                        onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
                        className="h-7 text-xs gap-1 ml-auto">
                        <Copy size={13} /> Copiar
                    </Button>
                )}
            </div>
            {error && (
                <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">
                    ✖ {error}
                </div>
            )}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON fuente</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={input}
                            onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Resultado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
