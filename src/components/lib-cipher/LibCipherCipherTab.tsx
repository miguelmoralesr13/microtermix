import React, { useState } from 'react';
import { Play, Copy, ArrowLeftRight } from 'lucide-react';
import { cipherUtils } from 'lib-cipher';
import { LibCipherKeysPanel, LCAlgorithm, LCKeyPair } from './LibCipherKeysPanel';

const ALGORITHMS: { id: LCAlgorithm; label: string; hint: string }[] = [
    { id: 'ECIES',      label: 'ECIES',      hint: 'Curva elíptica secp256k1' },
    { id: 'AES',        label: 'AES-GCM',    hint: 'Simétrico AES-256 GCM' },
    { id: 'AES-LEGACY', label: 'AES-CBC',    hint: 'Simétrico AES-256 CBC (legacy)' },
    { id: 'RSA',        label: 'RSA-OAEP',   hint: 'Asimétrico RSA con SHA-256 + MGF1-SHA1' },
    { id: 'RSA-LEGACY', label: 'RSA-Legacy', hint: 'RSA con MGF1-SHA256, llaves sin cabecera PEM' },
];

interface LibCipherCipherTabProps {
    activeAlgorithm: LCAlgorithm;
    onAlgorithmChange: (a: LCAlgorithm) => void;
    keysByAlgorithm: Record<LCAlgorithm, LCKeyPair>;
    onKeysChange: (algo: LCAlgorithm, keys: LCKeyPair) => void;
}

export const LibCipherCipherTab: React.FC<LibCipherCipherTabProps> = ({
    activeAlgorithm, onAlgorithmChange, keysByAlgorithm, onKeysChange,
}) => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const keys = keysByAlgorithm[activeAlgorithm];

    const run = async (action: 'encrypt' | 'decrypt') => {
        if (!input.trim()) return;
        setLoading(true);
        setError(null);
        setOutput('');
        try {
            const cipherKeys = {
                accessId: null,
                publicAccess: keys.publicAccess,
                privateAccess: keys.privateAccess,
                time: new Date().toISOString(),
            };
            const options = {
                algorithm: activeAlgorithm,
                properties: { _v: true as const },
            };
            const data = { _v: input };
            const result = await cipherUtils(data, cipherKeys, options, action);
            setOutput((result as any)._v ?? '');
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const areaCls = 'w-full flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-600 placeholder-slate-600';

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <LibCipherKeysPanel
                algorithm={activeAlgorithm}
                keys={keys}
                onChange={k => onKeysChange(activeAlgorithm, k)}
            />

            <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-hidden">
                {/* Algorithm selector */}
                <div className="flex flex-wrap gap-2 shrink-0">
                    {ALGORITHMS.map(a => (
                        <button
                            key={a.id}
                            onClick={() => onAlgorithmChange(a.id)}
                            title={a.hint}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                activeAlgorithm === a.id
                                    ? 'bg-violet-600 border-violet-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>

                {/* Input */}
                <div className="flex flex-col flex-1 min-h-0 gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
                        Texto de entrada
                    </label>
                    <textarea
                        className={areaCls}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Escribe o pega el texto a procesar..."
                    />
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 shrink-0">
                    <button
                        onClick={() => run('encrypt')}
                        disabled={loading || !input.trim()}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                        <Play size={13} /> Cifrar
                    </button>
                    <button
                        onClick={() => run('decrypt')}
                        disabled={loading || !input.trim()}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                        <Play size={13} /> Descifrar
                    </button>
                    {loading && (
                        <span className="text-xs text-slate-500 self-center">Procesando…</span>
                    )}
                </div>

                {/* Output */}
                <div className="flex flex-col flex-1 min-h-0 gap-1">
                    <div className="flex items-center justify-between shrink-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Resultado
                        </label>
                        {output && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setInput(output)}
                                    title="Mover resultado a la entrada"
                                    className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-semibold"
                                >
                                    <ArrowLeftRight size={10} /> Usar como entrada
                                </button>
                                <button
                                    onClick={() => navigator.clipboard?.writeText(output)}
                                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    <Copy size={10} /> Copiar
                                </button>
                            </div>
                        )}
                    </div>
                    {error ? (
                        <div className="flex-1 rounded-lg border border-red-500/30 bg-red-900/10 px-4 py-3 text-sm font-mono text-red-400 overflow-auto whitespace-pre-wrap">
                            {error}
                        </div>
                    ) : (
                        <textarea
                            className={`${areaCls} opacity-80`}
                            value={output}
                            readOnly
                            placeholder="El resultado aparecerá aquí..."
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
