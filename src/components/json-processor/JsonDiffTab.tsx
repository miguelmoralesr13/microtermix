import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { GitCompareArrows, ShieldCheck } from 'lucide-react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

interface DiffResult { left: string; right: string }

export const JsonDiffTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [left, setLeft]   = useState('');
    const [right, setRight] = useState('');
    const [diff, setDiff]   = useState<DiffResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCompare = async () => {
        try {
            const result = await invoke<DiffResult>('json_diff', { left, right });
            setDiff(result);
            setError(null);
        } catch (e) {
            setError(String(e));
            setDiff(null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Button size="sm" onClick={handleCompare} className="h-7 text-xs gap-1">
                    <GitCompareArrows size={13} /> Comparar
                </Button>
                {diff && (
                    <Button size="sm" variant="ghost" onClick={() => setDiff(null)} className="h-7 text-xs">
                        Ver editores
                    </Button>
                )}
            </div>
            {error && (
                <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">
                    ✖ {error}
                </div>
            )}
            {!diff ? (
                <div className="flex-1 min-h-0 flex">
                    {([
                        ['Izquierdo (original)',  left,  setLeft],
                        ['Derecho (modificado)', right, setRight],
                    ] as [string, string, React.Dispatch<React.SetStateAction<string>>][]).map(([label, value, setter], i) => (
                        <div key={i} className={`flex-1 min-w-0 flex flex-col ${i === 0 ? 'border-r border-slate-800' : ''}`}>
                            <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">{label}</div>
                            <div className="flex-1 min-h-0">
                                <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={value}
                                    onChange={(v) => setter(v ?? '')}
                                    options={{ minimap: { enabled: false }, fontSize: 13 }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                    <ReactDiffViewer
                        oldValue={diff.left}
                        newValue={diff.right}
                        splitView
                        useDarkTheme
                        compareMethod={DiffMethod.LINES}
                        leftTitle="Original"
                        rightTitle="Modificado"
                        styles={{
                            variables: {
                                dark: {
                                    diffViewerBackground: '#0f172a',
                                    gutterBackground:     '#0f172a',
                                    addedBackground:      '#14532d55',
                                    removedBackground:    '#7f1d1d55',
                                },
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
};
