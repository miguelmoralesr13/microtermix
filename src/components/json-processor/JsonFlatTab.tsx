import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components//ui/button';
import { Table2, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

export const JsonFlatTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [input, setInput]   = useState('');
    const [output, setOutput] = useState('');
    const [error, setError]   = useState<string | null>(null);

    const handleFlatten = async () => {
        try {
            const result = await invoke<string>('json_flatten', { input });
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
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Button size="sm" onClick={handleFlatten} className="h-7 text-xs gap-1">
                    <Table2 size={13} /> Aplanar
                </Button>
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
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON anidado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={input}
                            onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON plano (dot-notation)</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
