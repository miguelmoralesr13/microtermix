import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { GitBranch, ShieldCheck } from 'lucide-react';
import { JsonTreeNode } from './JsonTreeNode';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

export const JsonTreeViewTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [input, setInput]   = useState('');
    const [parsed, setParsed] = useState<unknown>(null);
    const [error, setError]   = useState<string | null>(null);
    const [key, setKey]       = useState(0);

    const handleVisualize = () => {
        try {
            setParsed(JSON.parse(input));
            setError(null);
            setKey(k => k + 1);
        } catch (e) {
            setError(String(e));
            setParsed(null);
        }
    };

    return (
        <div className="flex h-full">
            <div className="w-2/5 flex flex-col border-r border-slate-800">
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                    <span className="text-xs text-slate-400 flex-1 font-bold">JSON entrada</span>
                    <Button size="sm" onClick={handleVisualize} className="h-7 text-xs gap-1">
                        <GitBranch size={13} /> Visualizar
                    </Button>
                </div>
                <div className="flex-1 min-h-0">
                    <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={input}
                        onChange={(v) => setInput(v ?? '')}
                        options={{ minimap: { enabled: false }, fontSize: 13 }} />
                </div>
            </div>
            <div className="flex-1 flex flex-col min-w-0">
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                    <ShieldCheck size={13} /> Procesado localmente.
                </div>
                {error && (
                    <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">
                        ✖ {error}
                    </div>
                )}
                <div className="flex-1 overflow-auto p-2">
                    {parsed !== null
                        ? <JsonTreeNode key={key} nodeKey={null} value={parsed} />
                        : <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                            Pega tu JSON y presiona Visualizar
                          </div>
                    }
                </div>
            </div>
        </div>
    );
};
