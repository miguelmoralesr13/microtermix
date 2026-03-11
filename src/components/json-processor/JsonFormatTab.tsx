import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'json-yaml' | 'yaml-json' | 'json-csv' | 'json-xml';

const MODE_LABELS: Record<Mode, string> = {
    'json-yaml': 'JSON → YAML',
    'yaml-json': 'YAML → JSON',
    'json-csv':  'JSON → CSV (array)',
    'json-xml':  'JSON → XML',
};

const INPUT_LANG: Record<Mode, string> = {
    'json-yaml': 'json',
    'yaml-json': 'yaml',
    'json-csv':  'json',
    'json-xml':  'json',
};

const OUTPUT_LANG: Record<Mode, string> = {
    'json-yaml': 'yaml',
    'yaml-json': 'json',
    'json-csv':  'plaintext',
    'json-xml':  'xml',
};

export const JsonFormatTab: React.FC = () => {
    const [mode, setMode]     = useState<Mode>('json-yaml');
    const [input, setInput]   = useState('');
    const [output, setOutput] = useState('');
    const [error, setError]   = useState<string | null>(null);

    const handleConvert = async () => {
        try {
            let result: string;
            if (mode === 'yaml-json') {
                result = await invoke<string>('yaml_to_json_cmd', { input });
            } else {
                const target = mode.split('-')[1] as 'yaml' | 'csv' | 'xml';
                result = await invoke<string>('json_convert_format', { input, target });
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
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Select value={mode} onValueChange={(v) => { setMode(v as Mode); setOutput(''); setError(null); }}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {(Object.entries(MODE_LABELS) as [Mode, string][]).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={handleConvert} className="h-7 text-xs gap-1">
                    <ArrowLeftRight size={13} /> Convertir
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
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Entrada</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" language={INPUT_LANG[mode]} theme="vs-dark" value={input}
                            onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Resultado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" language={OUTPUT_LANG[mode]} theme="vs-dark" value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
