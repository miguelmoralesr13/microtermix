import React, { useState, useRef } from 'react';
import { Lock, Unlock, Copy, ArrowLeftRight, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cipherUtils, CipherProperties } from 'lib-cipher';
import { LibCipherKeysPanel, LCAlgorithm, LCKeyPair } from './LibCipherKeysPanel';

const ALGORITHMS: { id: LCAlgorithm; label: string }[] = [
    { id: 'ECIES',      label: 'ECIES' },
    { id: 'AES',        label: 'AES-GCM' },
    { id: 'AES-LEGACY', label: 'AES-CBC' },
    { id: 'RSA',        label: 'RSA-OAEP' },
    { id: 'RSA-LEGACY', label: 'RSA-Legacy' },
];

const MONACO_OPTS = {
    minimap: { enabled: false },
    fontSize: 12,
    fontFamily: 'Consolas, "Courier New", monospace',
    wordWrap: 'on' as const,
    scrollBeyondLastLine: false,
    lineNumbers: 'off' as const,
    folding: true,
};

const DEFAULT_DATA_ENCRYPT = JSON.stringify({ sensitive: 'This is a secret', public: 'This is public' }, null, 2);
const DEFAULT_PROPS_ENCRYPT = JSON.stringify({ sensitive: true }, null, 2);
const DEFAULT_DATA_DECRYPT  = JSON.stringify({ sensitive: 'PASTE_ENCRYPTED_VALUE_HERE' }, null, 2);

// ---------------------------------------------------------------------------
// Mirrors the library's isEncryptedValue (src/utils/validation.ts) exactly.
// Values that fail this check are silently returned unchanged by the library.
// ---------------------------------------------------------------------------
function isEncryptedValue(value: unknown): boolean {
    try {
        if (typeof value !== 'string' || value.length < 20) return false;
        const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
        if (!base64Regex.test(value)) return false;
        atob(value);
        return true;
    } catch { return false; }
}

/** Intercepts console.error while fn() runs, returns collected error messages. */
async function captureConsoleErrors<T>(fn: () => Promise<T>): Promise<{ result: T; errors: string[] }> {
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...args: any[]) => {
        errors.push(args.map((a: any) => (typeof a === 'object' ? String(a) : String(a))).join(' '));
        orig.apply(console, args);
    };
    try {
        const result = await fn();
        return { result, errors };
    } finally {
        console.error = orig;
    }
}

// ---------------------------------------------------------------------------
// Collect all string leaves from a data structure for diagnostics
// ---------------------------------------------------------------------------
function collectStringLeaves(data: unknown, prefix = ''): { path: string; value: string; passesValidation: boolean }[] {
    const results: { path: string; value: string; passesValidation: boolean }[] = [];
    if (typeof data === 'string') {
        results.push({ path: prefix || '(root)', value: data, passesValidation: isEncryptedValue(data) });
    } else if (Array.isArray(data)) {
        data.slice(0, 1).forEach((item, i) => results.push(...collectStringLeaves(item, `${prefix}[${i}]`)));
    } else if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
            results.push(...collectStringLeaves(v, prefix ? `${prefix}.${k}` : k));
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Builds CipherProperties marking every string leaf as true, recursively
// ---------------------------------------------------------------------------
function buildDecryptAllProps(data: unknown): CipherProperties {
    if (Array.isArray(data)) {
        if (data.length > 0) return buildDecryptAllProps(data[0]);
        return {};
    }
    if (data && typeof data === 'object') {
        const props: CipherProperties = {};
        for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
            if (typeof val === 'string' && val.length > 0) {
                props[key] = true;
            } else if (val && typeof val === 'object') {
                const nested = buildDecryptAllProps(val);
                if (Object.keys(nested).length > 0) props[key] = nested;
            }
        }
        return props;
    }
    return {};
}

// ---------------------------------------------------------------------------
// Parse raw input: JSON or plain string
// ---------------------------------------------------------------------------
function parseInput(raw: string): { isPlainString: boolean; data: unknown } {
    const trimmed = raw.trim();
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string') return { isPlainString: true, data: parsed };
        return { isPlainString: false, data: parsed };
    } catch {
        return { isPlainString: true, data: trimmed };
    }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LibCipherJsonTabProps {
    activeAlgorithm: LCAlgorithm;
    onAlgorithmChange: (a: LCAlgorithm) => void;
    keysByAlgorithm: Record<LCAlgorithm, LCKeyPair>;
    onKeysChange: (algo: LCAlgorithm, keys: LCKeyPair) => void;
}

export const LibCipherJsonTab: React.FC<LibCipherJsonTabProps> = ({
    activeAlgorithm, onAlgorithmChange, keysByAlgorithm, onKeysChange,
}) => {
    const [mode, setMode] = useState<'encrypt' | 'decrypt'>('decrypt');

    const [encData,  setEncData]  = useState(() => localStorage.getItem('lc-enc-data')  ?? DEFAULT_DATA_ENCRYPT);
    const [encProps, setEncProps] = useState(() => localStorage.getItem('lc-enc-props') ?? DEFAULT_PROPS_ENCRYPT);
    const [decData,  setDecData]  = useState(() => localStorage.getItem('lc-dec-data')  ?? DEFAULT_DATA_DECRYPT);

    const [result,  setResult]  = useState('');
    const [error,   setError]   = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [logs, setLogs]         = useState<{ time: string; level: 'info' | 'ok' | 'error' | 'warn'; msg: string }[]>([]);
    const [logsOpen, setLogsOpen] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const keys = keysByAlgorithm[activeAlgorithm];

    const addLog = (level: 'info' | 'ok' | 'error' | 'warn', msg: string) => {
        const time = new Date().toLocaleTimeString('es-MX', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [...prev.slice(-299), { time, level, msg }]);
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const cipherKeys = () => ({
        accessId: null,
        publicAccess: keys.publicAccess,
        privateAccess: keys.privateAccess,
        time: new Date().toISOString(),
    });

    // ------------------------------------------------------------------
    // ENCRYPT
    // ------------------------------------------------------------------
    const runEncrypt = async () => {
        setError(null); setResult('');

        let parsedData: unknown;
        try { parsedData = JSON.parse(encData); }
        catch (e: any) {
            const msg = `Data JSON inválido: ${e?.message ?? String(e)}`;
            setError(msg); addLog('error', msg); setLogsOpen(true); return;
        }

        let parsedProps: CipherProperties;
        try { parsedProps = JSON.parse(encProps) as CipherProperties; }
        catch (e: any) {
            const msg = `Properties JSON inválido: ${e?.message ?? String(e)}`;
            setError(msg); addLog('error', msg); setLogsOpen(true); return;
        }

        setLoading(true);
        addLog('info', `─── Encrypt [${activeAlgorithm}] ───`);

        try {
            const { result: out, errors } = await captureConsoleErrors(() =>
                cipherUtils(parsedData, cipherKeys(), { algorithm: activeAlgorithm, properties: parsedProps }, 'encrypt')
            );
            errors.forEach(e => addLog('warn', `lib: ${e}`));
            const str = JSON.stringify(out, null, 2);
            setResult(str);
            addLog('ok', `Encrypt OK — ${str.length} chars`);
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            setError(msg); addLog('error', msg); setLogsOpen(true);
        } finally { setLoading(false); }
    };

    // ------------------------------------------------------------------
    // DECRYPT
    // ------------------------------------------------------------------
    const runDecrypt = async () => {
        setError(null); setResult('');
        const { isPlainString, data } = parseInput(decData);

        setLoading(true);
        addLog('info', `─── Decrypt [${activeAlgorithm}] ───`);
        setLogsOpen(true);

        try {
            if (isPlainString) {
                // Single string value
                const strVal = data as string;
                addLog('info', `Modo: valor único`);

                if (!isEncryptedValue(strVal)) {
                    addLog('warn', `⚠ El valor NO pasa la validación base64 de la librería — será devuelto sin cambios`);
                    addLog('warn', `  Regex esperada: /^[A-Za-z0-9+/]+=\\{0,2\\}$/ (base64 estándar, sin - ni _)`);
                    addLog('warn', `  Si tu valor usa base64 URL-safe (-_), la librería no lo descifra`);
                }

                const { result: wrapped, errors } = await captureConsoleErrors(() =>
                    cipherUtils({ _: strVal }, cipherKeys(), { algorithm: activeAlgorithm, properties: { _: true } }, 'decrypt')
                );
                errors.forEach(e => addLog('warn', `lib: ${e}`));

                const out = (wrapped as any)._;
                setResult(typeof out === 'string' ? out : JSON.stringify(out, null, 2));

                if (out === strVal) {
                    addLog('error', 'Resultado idéntico al input. Causas probables:');
                    addLog('error', '  1. Llave privada incorrecta o mal formateada');
                    addLog('error', '  2. El valor usa base64 URL-safe (con - o _) — no soportado por la lib');
                    addLog('error', '  3. El algoritmo seleccionado no coincide con el que se usó para cifrar');
                } else {
                    addLog('ok', 'Descifrado OK');
                }

            } else {
                // JSON — audit string leaves first
                const leaves = collectStringLeaves(data);
                const failing = leaves.filter(l => !l.passesValidation);

                if (failing.length > 0) {
                    addLog('warn', `⚠ ${failing.length} campo(s) NO pasan la validación base64 de la lib y serán ignorados:`);
                    failing.slice(0, 5).forEach(l =>
                        addLog('warn', `  ${l.path}: "${l.value.slice(0, 50)}${l.value.length > 50 ? '…' : ''}"`)
                    );
                    if (failing.length > 5) addLog('warn', `  ... y ${failing.length - 5} más`);
                    addLog('warn', `  Posible causa: base64 URL-safe (- _) en lugar de estándar (+ /)`);
                }

                const passing = leaves.filter(l => l.passesValidation);
                addLog('info', `Campos válidos para descifrar: ${passing.length}/${leaves.length}`);
                passing.slice(0, 5).forEach(l => addLog('info', `  ${l.path}`));

                const props = buildDecryptAllProps(data);
                if (Object.keys(props).length === 0) {
                    addLog('error', 'No se encontraron campos string para descifrar');
                    setLoading(false);
                    return;
                }

                const { result: out, errors } = await captureConsoleErrors(() =>
                    cipherUtils(data, cipherKeys(), { algorithm: activeAlgorithm, properties: props }, 'decrypt')
                );
                errors.forEach(e => addLog('warn', `lib: ${e}`));

                const str = JSON.stringify(out, null, 2);
                setResult(str);

                const unchanged = str.replace(/\s/g, '') === JSON.stringify(data).replace(/\s/g, '');
                if (unchanged) {
                    addLog('error', 'Resultado idéntico. Verifica:');
                    addLog('error', '  1. Que la llave privada sea la correcta');
                    addLog('error', '  2. Que el algoritmo coincida con el del cifrado');
                    addLog('error', '  3. Que los valores cifrados usen base64 ESTÁNDAR (+ /) no URL-safe (- _)');
                } else {
                    addLog('ok', `Descifrado OK — ${str.length} chars`);
                }
            }
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            setError(msg); addLog('error', `Error: ${msg}`);
        } finally { setLoading(false); }
    };

    const outputValue = error
        ? `// Error:\n// ${error}`
        : (result || '// El resultado aparecerá aquí...');

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <LibCipherKeysPanel
                algorithm={activeAlgorithm}
                keys={keys}
                onChange={k => onKeysChange(activeAlgorithm, k)}
            />

            <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">

                {/* Top bar */}
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        {ALGORITHMS.map(a => (
                            <button
                                key={a.id}
                                onClick={() => onAlgorithmChange(a.id)}
                                className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                                    activeAlgorithm === a.id
                                        ? 'bg-violet-600 border-violet-500 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {a.label}
                            </button>
                        ))}
                    </div>

                    <div className="h-4 border-l border-slate-700" />

                    <div className="flex rounded-lg overflow-hidden border border-slate-700">
                        <button
                            onClick={() => setMode('encrypt')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold transition-colors ${
                                mode === 'encrypt' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Lock size={11} /> Encrypt
                        </button>
                        <button
                            onClick={() => setMode('decrypt')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold transition-colors ${
                                mode === 'decrypt' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Unlock size={11} /> Decrypt
                        </button>
                    </div>
                </div>

                {/* Editors */}
                <div className="flex flex-1 min-h-0 gap-3">

                    {/* ENCRYPT: Data + Properties */}
                    {mode === 'encrypt' && (
                        <div className="flex flex-col flex-1 min-h-0 gap-3">
                            <div className="flex flex-col flex-[3] min-h-0 gap-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Data Payload (JSON)</label>
                                <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-700">
                                    <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={encData}
                                        onChange={v => { const s = v ?? ''; setEncData(s); localStorage.setItem('lc-enc-data', s); }}
                                        options={MONACO_OPTS} />
                                </div>
                            </div>
                            <div className="flex flex-col flex-[2] min-h-0 gap-1">
                                <div className="flex items-center gap-2 shrink-0">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Properties Config</label>
                                    <span className="text-[10px] text-slate-600 font-mono">— JSON espejo con <code className="text-violet-400">true</code> en campos a cifrar</span>
                                </div>
                                <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-violet-800/40">
                                    <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={encProps}
                                        onChange={v => { const s = v ?? ''; setEncProps(s); localStorage.setItem('lc-enc-props', s); }}
                                        options={MONACO_OPTS} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DECRYPT: single editor — JSON or plain string */}
                    {mode === 'decrypt' && (
                        <div className="flex flex-col flex-1 min-h-0 gap-1">
                            <div className="flex items-center gap-2 shrink-0">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data cifrada</label>
                                <span className="text-[10px] text-slate-600">— JSON o valor suelto, descifra todos los strings</span>
                            </div>
                            <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-700">
                                <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={decData}
                                    onChange={v => { const s = v ?? ''; setDecData(s); localStorage.setItem('lc-dec-data', s); }}
                                    options={MONACO_OPTS} />
                            </div>
                        </div>
                    )}

                    {/* RESULT — always right */}
                    <div className="flex flex-col flex-1 min-h-0 gap-1">
                        <div className="flex items-center justify-between shrink-0">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Result</label>
                            {result && !error && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => mode === 'encrypt' ? setDecData(result) : setEncData(result)}
                                        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-semibold"
                                    >
                                        <ArrowLeftRight size={10} /> Usar como Data
                                    </button>
                                    <button
                                        onClick={() => navigator.clipboard?.writeText(result)}
                                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        <Copy size={10} /> Copiar
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className={`flex-1 min-h-0 rounded-lg overflow-hidden border ${error ? 'border-red-500/40' : 'border-slate-700'}`}>
                            <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={outputValue}
                                options={{ ...MONACO_OPTS, readOnly: true }} />
                        </div>

                        <div className="flex gap-3 shrink-0 pt-1">
                            {mode === 'encrypt' ? (
                                <button onClick={runEncrypt} disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors">
                                    <Lock size={13} /> Encrypt
                                </button>
                            ) : (
                                <button onClick={runDecrypt} disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors">
                                    <Unlock size={13} /> Decrypt
                                </button>
                            )}
                            {loading && <span className="text-xs text-slate-500 self-center">Procesando…</span>}
                        </div>
                    </div>
                </div>

                {/* Console */}
                <div className="shrink-0 border-t border-slate-800">
                    <button onClick={() => setLogsOpen(o => !o)}
                        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                        {logsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        <span className="uppercase tracking-widest font-bold">Consola</span>
                        {logs.length > 0 && <span className="ml-1 px-1.5 py-px bg-slate-800 rounded text-slate-500">{logs.length}</span>}
                        {logs.some(l => l.level === 'error') && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-500" />}
                        {logs.some(l => l.level === 'warn') && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                        <span className="ml-auto">
                            {logsOpen && (
                                <button onClick={e => { e.stopPropagation(); setLogs([]); }}
                                    className="flex items-center gap-1 text-slate-600 hover:text-slate-400">
                                    <Trash2 size={10} /> Limpiar
                                </button>
                            )}
                        </span>
                    </button>

                    {logsOpen && (
                        <div className="h-36 overflow-y-auto bg-slate-950 px-3 py-2 font-mono text-[10px] leading-relaxed">
                            {logs.length === 0 ? (
                                <span className="text-slate-600">Sin entradas.</span>
                            ) : (
                                logs.map((l, i) => (
                                    <div key={i} className="flex gap-2">
                                        <span className="text-slate-600 shrink-0">{l.time}</span>
                                        <span className={
                                            l.level === 'ok'   ? 'text-emerald-400' :
                                            l.level === 'error'? 'text-red-400'     :
                                            l.level === 'warn' ? 'text-yellow-400'  : 'text-slate-400'
                                        }>
                                            {l.level === 'ok' ? '✓' : l.level === 'error' ? '✗' : l.level === 'warn' ? '⚠' : '›'} {l.msg}
                                        </span>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
