import React, { useState, useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

function suggestFix(msg: string): string {
    if (msg.includes('Unexpected token'))  return 'Puede faltar una coma, comilla, o haya un carácter inválido.';
    if (msg.includes('Unexpected end'))    return 'El JSON está incompleto — revisa que { } y [ ] estén cerrados.';
    return 'Verifica la sintaxis cerca de la línea indicada.';
}

function errorLine(msg: string, input: string): number {
    const pos = msg.match(/position (\d+)/i);
    if (pos) return input.slice(0, parseInt(pos[1])).split('\n').length;
    const ln  = msg.match(/line (\d+)/i);
    return ln ? parseInt(ln[1]) : 1;
}

export const JsonValidatorTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [status, setStatus]       = useState<'idle' | 'valid' | 'invalid'>('idle');
    const [errorInfo, setErrorInfo] = useState<{ msg: string; line: number } | null>(null);
    const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const decoRef   = useRef<string[]>([]);
    const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

    const validate = useCallback((value: string) => {
        if (!value.trim()) { setStatus('idle'); setErrorInfo(null); return; }
        try {
            JSON.parse(value);
            setStatus('valid');
            setErrorInfo(null);
            if (editorRef.current) {
                decoRef.current = editorRef.current.deltaDecorations(decoRef.current, []);
            }
        } catch (e) {
            const msg  = (e as SyntaxError).message;
            const line = errorLine(msg, value);
            setStatus('invalid');
            setErrorInfo({ msg, line });
            if (editorRef.current && monacoRef.current) {
                decoRef.current = editorRef.current.deltaDecorations(decoRef.current, [{
                    range: new monacoRef.current.Range(line, 1, line, 9999),
                    options: { isWholeLine: true, className: 'json-err-line', glyphMarginClassName: 'json-err-glyph' },
                }]);
            }
        }
    }, []);

    const handleChange = useCallback((v: string | undefined) => {
        const val = v ?? '';
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => validate(val), 250);
    }, [validate]);

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className={`shrink-0 flex items-center gap-2 px-4 py-2 border-b text-sm transition-colors ${
                status === 'valid'   ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' :
                status === 'invalid' ? 'bg-red-950/30 border-red-800/40 text-red-400' :
                                       'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
                {status === 'valid' && <><CheckCircle2 size={15} /> JSON válido</>}
                {status === 'invalid' && errorInfo && <>
                    <XCircle size={15} />
                    <span className="font-medium">Línea {errorInfo.line}:</span>
                    <span className="truncate">{errorInfo.msg}</span>
                    <span className="ml-2 opacity-60 shrink-0">→ {suggestFix(errorInfo.msg)}</span>
                </>}
                {status === 'idle' && 'Escribe o pega tu JSON para validar en tiempo real…'}
            </div>
            <div className="flex-1 min-h-0">
                <Editor
                    height="100%"
                    defaultLanguage="json"
                    theme={monacoTheme}
                    onChange={handleChange}
                    onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
                    options={{ minimap: { enabled: false }, fontSize: 13, glyphMargin: true, scrollBeyondLastLine: false }}
                />
            </div>
            <style>{`.json-err-line{background:rgba(239,68,68,.12)!important}.json-err-glyph::before{content:'✖';color:#ef4444;font-size:11px}`}</style>
        </div>
    );
};
