import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Copy, ArrowLeftRight } from 'lucide-react';
import { KeysPanel, Scheme, KeyPair } from './KeysPanel';

const SCHEMES: { id: Scheme; label: string; hint: string }[] = [
    { id: 'aes',   label: 'AES-CBC',   hint: 'Simétrico — una sola llave' },
    { id: 'rsa',   label: 'RSA-OAEP',  hint: 'Asimétrico — pub cifra, priv descifra' },
    { id: 'ecies', label: 'ECIES',      hint: 'Curva elíptica secp256k1' },
];

interface CipherTabProps {
    activeScheme: Scheme;
    onSchemeChange: (s: Scheme) => void;
    keysByScheme: Record<Scheme, KeyPair>;
    onKeysChange: (scheme: Scheme, keys: KeyPair) => void;
}

export const CipherTab: React.FC<CipherTabProps> = ({
    activeScheme, onSchemeChange, keysByScheme, onKeysChange,
}) => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const keys = keysByScheme[activeScheme];
    const isSymmetric = activeScheme === 'aes';

    const encryptKey = isSymmetric ? keys.private_key : keys.public_key;
    const decryptKey = keys.private_key;

    const run = async (op: 'encrypt' | 'decrypt') => {
        if (!input.trim()) return;
        const activeKey = op === 'encrypt' ? encryptKey : decryptKey;
        if (!activeKey.trim()) {
            const label = op === 'encrypt'
                ? (isSymmetric ? 'llave AES' : 'llave pública')
                : 'llave privada';
            setError(`⚠ ${label} vacía — genera o pega una llave en el panel izquierdo`);
            return;
        }
        setLoading(true);
        setError(null);
        setOutput('');
        try {
            if (op === 'encrypt') {
                const result = await invoke<string>('crypto_encrypt', {
                    scheme: activeScheme,
                    publicKey: encryptKey,
                    data: input,
                });
                setOutput(result);
            } else {
                const result = await invoke<string>('crypto_decrypt', {
                    scheme: activeScheme,
                    privateKey: decryptKey,
                    data: input,
                });
                setOutput(result);
            }
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            if (msg.includes('decryption error') || msg.includes('decrypt')) {
                setError(`Descifrado falló — la llave privada no corresponde a la llave pública usada para cifrar.\n\nLlave usada: ${decryptKey.slice(0, 60)}…`);
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const areaCls = 'w-full flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-600 placeholder-slate-600';

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <KeysPanel scheme={activeScheme} keys={keys} onChange={k => onKeysChange(activeScheme, k)} />

            <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-hidden">
                {/* Scheme tabs */}
                <div className="flex gap-2 shrink-0">
                    {SCHEMES.map(s => (
                        <button
                            key={s.id}
                            onClick={() => onSchemeChange(s.id)}
                            title={s.hint}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                activeScheme === s.id
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            {s.label}
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
                <div className="flex flex-col gap-1.5 shrink-0">
                    <div className="flex gap-3">
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
                    </div>
                    <div className="flex gap-4 text-[10px] text-slate-600 font-mono">
                        <span>
                            Cifrar usa:{' '}
                            <span className={encryptKey ? 'text-emerald-500' : 'text-red-500'}>
                                {encryptKey ? `${encryptKey.slice(0, 32).replace(/\n/g, '')}…` : '⚠ vacía'}
                            </span>
                        </span>
                        {!isSymmetric && (
                            <span>
                                Descifrar usa:{' '}
                                <span className={decryptKey ? 'text-amber-500' : 'text-red-500'}>
                                    {decryptKey ? `${decryptKey.slice(0, 32).replace(/\n/g, '')}…` : '⚠ vacía'}
                                </span>
                            </span>
                        )}
                    </div>
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
                        <div className="flex-1 rounded-lg border border-red-500/30 bg-red-900/10 px-4 py-3 text-sm font-mono text-red-400 overflow-auto">
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
