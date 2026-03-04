import React, { useState } from 'react';
import { Copy, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export type Scheme = 'aes' | 'rsa' | 'ecies';
export interface KeyPair { public_key: string; private_key: string; }

interface ServiceConfig {
    url: string;
    method: 'GET' | 'POST';
    /** Name of the header that carries the token, e.g. "x-user-token" */
    tokenHeader: string;
    /** Any extra fixed headers as JSON object, e.g. {"x-platform":"NEXUS_POS"} */
    extraHeaders: string;
    /** dot-notation path inside the response for the public key */
    publicKeyPath: string;
    /** dot-notation path inside the response for the private key */
    privateKeyPath: string;
}

const DEFAULT_SERVICE: ServiceConfig = {
    url: '',
    method: 'GET',
    tokenHeader: 'x-user-token',
    extraHeaders: '{"x-platform": "NEXUS_POS"}',
    publicKeyPath: 'publicKey',
    privateKeyPath: 'privateKey',
};

function storageKey(scheme: Scheme) { return `crypto-service-config-${scheme}`; }

function loadServiceConfig(scheme: Scheme): ServiceConfig {
    try {
        return { ...DEFAULT_SERVICE, ...JSON.parse(localStorage.getItem(storageKey(scheme)) || '{}') };
    } catch { return { ...DEFAULT_SERVICE }; }
}

function saveServiceConfig(scheme: Scheme, cfg: ServiceConfig) {
    localStorage.setItem(storageKey(scheme), JSON.stringify(cfg));
}

function getNestedValue(obj: any, path: string): string {
    if (!path) return '';
    return path.split('.').reduce((acc, k) => acc?.[k], obj) ?? '';
}

function copyText(text: string) { navigator.clipboard?.writeText(text).catch(() => {}); }

interface KeysPanelProps {
    scheme: Scheme;
    keys: KeyPair;
    onChange: (keys: KeyPair) => void;
}

export const KeysPanel: React.FC<KeysPanelProps> = ({ scheme, keys, onChange }) => {
    const [generating, setGenerating] = useState(false);
    const [serviceOpen, setServiceOpen] = useState(false);
    const [cfg, setCfg] = useState<ServiceConfig>(() => loadServiceConfig(scheme));
    const [token, setToken] = useState(() => localStorage.getItem(`crypto-token-${scheme}`) ?? '');
    const [fetching, setFetching] = useState(false);
    const [serviceError, setServiceError] = useState<string | null>(null);
    const [serviceSuccess, setServiceSuccess] = useState(false);

    const isSymmetric = scheme === 'aes';

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const pair = await invoke<KeyPair>('crypto_generate_keys', { scheme });
            onChange(pair);
        } catch (e: any) {
            console.error('keygen error', e);
        } finally {
            setGenerating(false);
        }
    };

    const patch = (update: Partial<ServiceConfig>) => {
        const updated = { ...cfg, ...update };
        setCfg(updated);
        saveServiceConfig(scheme, updated);
    };

    const handleFetchKeys = async () => {
        setFetching(true);
        setServiceError(null);
        setServiceSuccess(false);
        try {
            // Build headers: fixed + token header + extra
            let extraParsed: Record<string, string> = {};
            try { extraParsed = JSON.parse(cfg.extraHeaders || '{}'); } catch { /* ignore */ }

            const headers: Record<string, string> = {
                'Accept': 'application/json',
                [cfg.tokenHeader]: token,
                ...extraParsed,
            };

            const res = await tauriFetch(cfg.url, {
                method: cfg.method,
                headers,
            });

            const data = await res.json();
            const pubKey = getNestedValue(data, cfg.publicKeyPath);
            const privKey = getNestedValue(data, cfg.privateKeyPath);

            if (!pubKey && !privKey) {
                setServiceError(`No se encontraron llaves en la respuesta. Paths configurados: "${cfg.publicKeyPath}", "${cfg.privateKeyPath}". Respuesta: ${JSON.stringify(data).slice(0, 200)}`);
                return;
            }

            onChange({ public_key: pubKey, private_key: privKey });
            setServiceSuccess(true);
            setTimeout(() => setServiceSuccess(false), 3000);
        } catch (e: any) {
            setServiceError(e?.message ?? String(e));
        } finally {
            setFetching(false);
        }
    };

    const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-slate-500 placeholder-slate-600';

    return (
        <div className="flex flex-col gap-3 p-4 border-r border-slate-800 w-64 shrink-0 bg-slate-950 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Llaves</span>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={10} className={generating ? 'animate-spin' : ''} />
                    Generar
                </button>
            </div>

            {isSymmetric ? (
                <KeyField label="Llave AES (base64)" value={keys.private_key}
                    onChange={v => onChange({ ...keys, private_key: v })}
                    onCopy={() => copyText(keys.private_key)} />
            ) : (
                <>
                    <KeyField label="Llave pública" value={keys.public_key}
                        onChange={v => onChange({ ...keys, public_key: v })}
                        onCopy={() => copyText(keys.public_key)} />
                    <KeyField label="Llave privada" value={keys.private_key}
                        onChange={v => onChange({ ...keys, private_key: v })}
                        onCopy={() => copyText(keys.private_key)} />
                </>
            )}

            {/* Service config */}
            <div className="border-t border-slate-800 pt-3">
                <button
                    onClick={() => setServiceOpen(o => !o)}
                    className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 w-full transition-colors"
                >
                    {serviceOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    Del servicio
                </button>

                {serviceOpen && (
                    <div className="mt-3 flex flex-col gap-2">

                        <FieldLabel>URL</FieldLabel>
                        <input className={inputCls} value={cfg.url}
                            onChange={e => patch({ url: e.target.value })}
                            placeholder="https://api.example.com/keys" />

                        <FieldLabel>Método</FieldLabel>
                        <select className={inputCls} value={cfg.method}
                            onChange={e => patch({ method: e.target.value as 'GET' | 'POST' })}>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>

                        <FieldLabel>Header del token</FieldLabel>
                        <input className={inputCls} value={cfg.tokenHeader}
                            onChange={e => patch({ tokenHeader: e.target.value })}
                            placeholder="x-user-token" />

                        <FieldLabel>Headers adicionales (JSON)</FieldLabel>
                        <textarea className={`${inputCls} h-16 resize-none`} value={cfg.extraHeaders}
                            onChange={e => patch({ extraHeaders: e.target.value })}
                            placeholder='{"x-platform": "NEXUS_POS"}' />

                        <FieldLabel>Path llave pública en respuesta</FieldLabel>
                        <input className={inputCls} value={cfg.publicKeyPath}
                            onChange={e => patch({ publicKeyPath: e.target.value })}
                            placeholder="publicKey" />

                        <FieldLabel>Path llave privada en respuesta</FieldLabel>
                        <input className={inputCls} value={cfg.privateKeyPath}
                            onChange={e => patch({ privateKeyPath: e.target.value })}
                            placeholder="privateKey" />

                        <FieldLabel>Token</FieldLabel>
                        <textarea
                            className={`${inputCls} h-16 resize-none`}
                            value={token}
                            onChange={e => {
                                setToken(e.target.value);
                                localStorage.setItem(`crypto-token-${scheme}`, e.target.value);
                            }}
                            placeholder="Pega tu JWT u otro token aquí..."
                        />

                        {serviceError && (
                            <p className="text-[10px] text-red-400 break-all leading-relaxed">{serviceError}</p>
                        )}
                        {serviceSuccess && (
                            <p className="text-[10px] text-emerald-400 font-bold">✓ Llaves obtenidas correctamente</p>
                        )}

                        <button
                            onClick={handleFetchKeys}
                            disabled={fetching || !cfg.url || !token}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-xs text-white font-bold transition-colors"
                        >
                            {fetching && <RefreshCw size={10} className="animate-spin" />}
                            Obtener llaves
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const FieldLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
    <label className="text-[10px] text-slate-500">{children}</label>
);

const KeyField: React.FC<{
    label: string; value: string;
    onChange: (v: string) => void; onCopy: () => void;
}> = ({ label, value, onChange, onCopy }) => (
    <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-500">{label}</label>
            <button onClick={onCopy} title="Copiar" className="text-slate-600 hover:text-slate-400 transition-colors">
                <Copy size={10} />
            </button>
        </div>
        <textarea
            className="w-full h-20 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 resize-none focus:outline-none focus:border-slate-500 placeholder-slate-600"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Pega o genera una llave..."
        />
    </div>
);
