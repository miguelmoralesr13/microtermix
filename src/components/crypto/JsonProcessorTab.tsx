import React, { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Lock, Unlock, Copy, ArrowLeftRight, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { KeysPanel, Scheme, KeyPair } from './KeysPanel';

const BASE64_RE = /^[A-Za-z0-9+/=\-_]+$/;

/** Finds the first string that looks like it could be encrypted (base64-ish, length > 20). */
function findFirstEncryptedString(obj: any): string | null {
    if (typeof obj === 'string') {
        if (obj.length > 20 && BASE64_RE.test(obj.replace(/\s/g, ''))) return obj;
        return null;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findFirstEncryptedString(item);
            if (found) return found;
        }
    }
    if (obj && typeof obj === 'object') {
        for (const val of Object.values(obj)) {
            const found = findFirstEncryptedString(val as any);
            if (found) return found;
        }
    }
    return null;
}

const MONACO_OPTS = {
    minimap: { enabled: false },
    fontSize: 12,
    fontFamily: 'Consolas, "Courier New", monospace',
    wordWrap: 'on' as const,
    scrollBeyondLastLine: false,
    lineNumbers: 'off' as const,
    folding: false,
};

const SCHEMES: { id: Scheme; label: string }[] = [
    { id: 'aes',   label: 'AES-CBC' },
    { id: 'rsa',   label: 'RSA-OAEP' },
    { id: 'ecies', label: 'ECIES' },
];

interface JsonProcessorTabProps {
    activeScheme: Scheme;
    onSchemeChange: (s: Scheme) => void;
    keysByScheme: Record<Scheme, KeyPair>;
    onKeysChange: (scheme: Scheme, keys: KeyPair) => void;
}

export const JsonProcessorTab: React.FC<JsonProcessorTabProps> = ({
    activeScheme, onSchemeChange, keysByScheme, onKeysChange,
}) => {
    const [jsonInput, setJsonInput] = useState(() => localStorage.getItem('crypto-json-input') ?? '{\n  \n}');
    const [jsonOutput, setJsonOutput] = useState('');
    const [fieldsToEncrypt, setFieldsToEncrypt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<{ time: string; level: 'info' | 'ok' | 'error'; msg: string }[]>([]);
    const [logsOpen, setLogsOpen] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const addLog = (level: 'info' | 'ok' | 'error', msg: string) => {
        const time = new Date().toLocaleTimeString('es-MX', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [...prev.slice(-199), { time, level, msg }]);
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const keys = keysByScheme[activeScheme];
    const isSymmetric = activeScheme === 'aes';

    const handleEncrypt = async () => {
        const fields = fieldsToEncrypt.split(',').map(f => f.trim()).filter(Boolean);
        if (!fields.length) return;
        setLoading(true);
        setError(null);
        const pubKey = isSymmetric ? keys.private_key : keys.public_key;
        addLog('info', `Cifrado [${activeScheme.toUpperCase()}] — campos: ${fields.join(', ')}`);
        addLog('info', `Llave pública/simétrica: ${pubKey ? pubKey.slice(0, 40) + '…' : '⚠ VACÍA'}`);
        addLog('info', `JSON entrada: ${jsonInput.length} chars`);
        try {
            const result = await invoke<string>('crypto_encrypt_json_fields', {
                scheme: activeScheme,
                publicKey: pubKey,
                json: jsonInput,
                fields,
            });
            setJsonOutput(result);
            addLog('ok', `Cifrado OK — resultado: ${result.length} chars`);
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            setError(msg);
            addLog('error', `Error al cifrar: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDecryptAll = async () => {
        if (!keys.private_key.trim()) {
            addLog('error', '⚠ Llave privada/simétrica vacía — genera o pega una llave primero');
            setLogsOpen(true);
            return;
        }
        setLoading(true);
        setError(null);
        addLog('info', `─── Descifrado [${activeScheme.toUpperCase()}] ───`);
        addLog('info', `Llave: ${keys.private_key.slice(0, 50)}…`);
        addLog('info', `JSON entrada: ${jsonInput.length} chars`);

        // Test con el primer valor string encontrado para obtener el error real
        try {
            const parsed = JSON.parse(jsonInput);
            const sample = findFirstEncryptedString(parsed);
            if (sample) {
                addLog('info', `Probando con valor de muestra: "${sample.slice(0, 60)}${sample.length > 60 ? '…' : ''}"`);
                try {
                    const testResult = await invoke<string>('crypto_decrypt', {
                        scheme: activeScheme,
                        privateKey: keys.private_key,
                        data: sample,
                    });
                    addLog('ok', `Prueba OK: "${testResult.slice(0, 80)}"`);
                } catch (testErr: any) {
                    const errMsg = testErr?.message ?? String(testErr);
                    addLog('error', `Prueba falló: ${errMsg}`);
                    if (errMsg.includes('decryption error') || errMsg.includes('decrypt')) {
                        addLog('error', `→ La llave privada NO corresponde a la llave pública usada para cifrar`);
                        addLog('error', `→ Verifica que uses la llave privada del par correcto`);
                    } else if (errMsg.includes('PEM') || errMsg.includes('PKCS') || errMsg.includes('ASN')) {
                        addLog('error', `→ Formato de llave inválido para el esquema ${activeScheme.toUpperCase()}`);
                    } else {
                        addLog('error', `→ Esto explica por qué no se descifra ningún valor`);
                    }
                }
            } else {
                addLog('info', 'No se encontraron valores cifrados (base64) en el JSON — ¿ya está cifrado el JSON?');
            }
        } catch (parseErr: any) {
            addLog('error', `JSON inválido: ${parseErr?.message ?? String(parseErr)}`);
            setLoading(false);
            return;
        }

        try {
            const result = await invoke<string>('crypto_decrypt_json_all', {
                scheme: activeScheme,
                privateKey: keys.private_key,
                json: jsonInput,
            });
            setJsonOutput(result);
            const sameContent = result.replace(/\s/g, '') === jsonInput.replace(/\s/g, '');
            if (sameContent) {
                addLog('error', `Resultado idéntico a la entrada — ningún valor fue descifrado`);
            } else {
                addLog('ok', `Descifrado OK — resultado: ${result.length} chars`);
            }
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            setError(msg);
            addLog('error', `Error al invocar comando: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const outputValue = error ? `// Error:\n// ${error}` : jsonOutput;

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <KeysPanel scheme={activeScheme} keys={keys} onChange={k => onKeysChange(activeScheme, k)} />

            <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-hidden">
                {/* Scheme selector */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">Esquema</span>
                    {SCHEMES.map(s => (
                        <button
                            key={s.id}
                            onClick={() => onSchemeChange(s.id)}
                            className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                                activeScheme === s.id
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Editors */}
                <div className="flex flex-1 min-h-0 gap-4">
                    {/* Input */}
                    <div className="flex-1 flex flex-col min-h-0 gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
                            JSON entrada
                        </label>
                        <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-700">
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={jsonInput}
                                onChange={v => { const s = v ?? ''; setJsonInput(s); localStorage.setItem('crypto-json-input', s); }}
                                options={MONACO_OPTS}
                            />
                        </div>
                    </div>

                    {/* Output */}
                    <div className="flex-1 flex flex-col min-h-0 gap-1">
                        <div className="flex items-center justify-between shrink-0">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                JSON resultado
                            </label>
                            {jsonOutput && !error && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setJsonInput(jsonOutput)}
                                        title="Usar resultado como entrada (para descifrar)"
                                        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-semibold"
                                    >
                                        <ArrowLeftRight size={10} /> Usar como entrada
                                    </button>
                                    <button
                                        onClick={() => navigator.clipboard?.writeText(jsonOutput)}
                                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        <Copy size={10} /> Copiar
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className={`flex-1 min-h-0 rounded-lg overflow-hidden border ${error ? 'border-red-500/40' : 'border-slate-700'}`}>
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={outputValue}
                                options={{ ...MONACO_OPTS, readOnly: true }}
                            />
                        </div>
                    </div>
                </div>

                {/* Fields + actions */}
                <div className="shrink-0 flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Campos a cifrar — dot-notation, separados por coma
                    </label>
                    <input
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-slate-500 placeholder-slate-600 transition-colors"
                        value={fieldsToEncrypt}
                        onChange={e => setFieldsToEncrypt(e.target.value)}
                        placeholder="nombre, usuario.tarjeta.numero, pagos[].cvv"
                    />
                    <div className="flex gap-3">
                        <button
                            onClick={handleEncrypt}
                            disabled={loading || !fieldsToEncrypt.trim()}
                            className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                        >
                            <Lock size={13} /> Cifrar campos
                        </button>
                        <button
                            onClick={handleDecryptAll}
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                        >
                            <Unlock size={13} /> Descifrar todo
                        </button>
                    </div>
                </div>

                {/* Debug log panel */}
                <div className="shrink-0 border-t border-slate-800">
                    <button
                        onClick={() => setLogsOpen(o => !o)}
                        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                    >
                        {logsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        <span className="uppercase tracking-widest font-bold">Consola</span>
                        {logs.length > 0 && (
                            <span className="ml-1 px-1.5 py-px bg-slate-800 rounded text-slate-500">
                                {logs.length}
                            </span>
                        )}
                        {logs.some(l => l.level === 'error') && (
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                        )}
                        <span className="ml-auto">
                            {logsOpen && (
                                <button
                                    onClick={e => { e.stopPropagation(); setLogs([]); }}
                                    className="flex items-center gap-1 text-slate-600 hover:text-slate-400"
                                >
                                    <Trash2 size={10} /> Limpiar
                                </button>
                            )}
                        </span>
                    </button>

                    {logsOpen && (
                        <div className="h-32 overflow-y-auto bg-slate-950 px-3 py-2 font-mono text-[10px] leading-relaxed">
                            {logs.length === 0 ? (
                                <span className="text-slate-600">Sin entradas. Ejecuta una operación para ver el log.</span>
                            ) : (
                                logs.map((l, i) => (
                                    <div key={i} className="flex gap-2">
                                        <span className="text-slate-600 shrink-0">{l.time}</span>
                                        <span className={
                                            l.level === 'ok' ? 'text-emerald-400' :
                                            l.level === 'error' ? 'text-red-400' :
                                            'text-slate-400'
                                        }>
                                            {l.level === 'ok' ? '✓' : l.level === 'error' ? '✗' : '›'} {l.msg}
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
