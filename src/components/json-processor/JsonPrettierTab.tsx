import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlignLeft, Minimize2, Copy, ShieldCheck, RotateCcw, Quote, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

type Indent = 'two' | 'four' | 'tab';

export const JsonPrettierTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [input, setInput]   = useState('');
    const [output, setOutput] = useState('');
    const [indent, setIndent] = useState<Indent>('two');
    const [error, setError]   = useState<string | null>(null);

    const run = async (cmd: 'format' | 'minify' | 'escape' | 'unescape') => {
        try {
            let result = '';
            if (cmd === 'format') {
                result = await invoke<string>('json_format', { input, indent });
            } else if (cmd === 'minify') {
                result = await invoke<string>('json_minify', { input });
            } else if (cmd === 'escape') {
                result = await invoke<string>('json_escape', { input });
            } else if (cmd === 'unescape') {
                result = await invoke<string>('json_unescape', { input });
            }
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
                <ShieldCheck size={13} /> Procesado localmente — tus datos no salen de tu equipo.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950 overflow-x-auto scrollbar-hide">
                <span className="text-xs text-slate-500 whitespace-nowrap">Indentación:</span>
                <Select value={indent} onValueChange={(v) => setIndent(v as Indent)}>
                    <SelectTrigger className="h-7 w-28 text-xs shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="two">2 espacios</SelectItem>
                        <SelectItem value="four">4 espacios</SelectItem>
                        <SelectItem value="tab">Tab</SelectItem>
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={() => run('format')} className="h-7 text-xs gap-1 shrink-0">
                    <AlignLeft size={13} /> Formatear
                </Button>
                <Button size="sm" variant="outline" onClick={() => run('minify')} className="h-7 text-xs gap-1 shrink-0">
                    <Minimize2 size={13} /> Minificar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => run('escape')} className="h-7 text-xs gap-1 shrink-0">
                    <Quote size={13} /> Escapar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => run('unescape')} className="h-7 text-xs gap-1 shrink-0">
                    <Unlock size={13} /> Unescapar (AWS)
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setInput(''); setOutput(''); setError(null); }} className="h-7 text-xs gap-1 shrink-0">
                    <RotateCcw size={13} /> Limpiar
                </Button>
                {output && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
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
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Entrada</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={input}
                            onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Resultado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
