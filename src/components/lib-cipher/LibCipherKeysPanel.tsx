import React, { useState } from 'react';
import { Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export type LCAlgorithm = 'ECIES' | 'AES' | 'AES-LEGACY' | 'RSA' | 'RSA-LEGACY';

export interface LCKeyPair {
    publicAccess: string;
    privateAccess: string;
}

export const ALGO_IS_SYMMETRIC: Record<LCAlgorithm, boolean> = {
    AES: true,
    'AES-LEGACY': true,
    ECIES: false,
    RSA: false,
    'RSA-LEGACY': false,
};

function storageKey(algo: LCAlgorithm) {
    return `lc-service-config-${algo}`;
}

interface ServiceConfig {
    url: string;
    method: 'GET' | 'POST';
    tokenHeader: string;
    extraHeaders: string;
    publicKeyPath: string;
    privateKeyPath: string;
    accessIdPath: string;   // dot-notation path to extract x-access-id from response
    accessId: string;       // value to append to URL when fetching decrypt keys
}

const DEFAULT_SERVICE: ServiceConfig = {
    url: '',
    method: 'GET',
    tokenHeader: 'x-user-token',
    extraHeaders: '{"x-platform": "Microtermix_POS"}',
    publicKeyPath: 'publicKey',
    privateKeyPath: 'privateKey',
    accessIdPath: 'accessId',
    accessId: '',
};

function loadServiceConfig(algo: LCAlgorithm): ServiceConfig {
    try {
        return { ...DEFAULT_SERVICE, ...JSON.parse(localStorage.getItem(storageKey(algo)) || '{}') };
    } catch { return { ...DEFAULT_SERVICE }; }
}

function saveServiceConfig(algo: LCAlgorithm, cfg: ServiceConfig) {
    localStorage.setItem(storageKey(algo), JSON.stringify(cfg));
}

function getNestedValue(obj: any, path: string): string {
    if (!path) return '';
    return path.split('.').reduce((acc: any, k) => acc?.[k], obj) ?? '';
}

interface LibCipherKeysPanelProps {
    algorithm: LCAlgorithm;
    keys: LCKeyPair;
    onChange: (keys: LCKeyPair) => void;
}

export const LibCipherKeysPanel: React.FC<LibCipherKeysPanelProps> = ({ algorithm, keys, onChange }) => {
    const [serviceOpen, setServiceOpen] = useState(false);
    const [cfg, setCfg] = useState<ServiceConfig>(() => loadServiceConfig(algorithm));
    const [token, setToken] = useState(() => localStorage.getItem(`lc-token-${algorithm}`) ?? '');
    const [fetching, setFetching] = useState(false);
    const [serviceError, setServiceError] = useState<string | null>(null);
    const [serviceSuccess, setServiceSuccess] = useState(false);
    // The accessId obtained from the last key fetch (shown so user can copy it)
    const [lastFetchedAccessId, setLastFetchedAccessId] = useState<string>('');

    const isSymmetric = ALGO_IS_SYMMETRIC[algorithm];

    const patch = (update: Partial<ServiceConfig>) => {
        const updated = { ...cfg, ...update };
        setCfg(updated);
        saveServiceConfig(algorithm, updated);
    };

    const handleFetchKeys = async () => {
        setFetching(true);
        setServiceError(null);
        setServiceSuccess(false);
        setLastFetchedAccessId('');
        try {
            let extraParsed: Record<string, string> = {};
            try { extraParsed = JSON.parse(cfg.extraHeaders || '{}'); } catch { /* ignore */ }

            const headers: Record<string, string> = {
                Accept: 'application/json',
                [cfg.tokenHeader]: token,
                ...extraParsed,
            };

            // Append /{accessId} to URL if provided (for fetching decrypt keys)
            const url = cfg.accessId.trim()
                ? `${cfg.url.replace(/\/$/, '')}/${cfg.accessId.trim()}`
                : cfg.url;

            const res = await tauriFetch(url, { method: cfg.method, headers });
            const data = await res.json();

            const pubKey = getNestedValue(data, cfg.publicKeyPath);
            const privKey = getNestedValue(data, cfg.privateKeyPath);
            const accessId = cfg.accessIdPath ? getNestedValue(data, cfg.accessIdPath) : '';

            if (!pubKey && !privKey) {
                setServiceError(
                    `No se encontraron llaves. Paths: "${cfg.publicKeyPath}", "${cfg.privateKeyPath}". Respuesta: ${JSON.stringify(data).slice(0, 300)}`
                );
                return;
            }

            onChange({ publicAccess: pubKey, privateAccess: privKey });

            if (accessId) {
                setLastFetchedAccessId(String(accessId));
            }

            setServiceSuccess(true);
        } catch (e: any) {
            setServiceError(e?.message ?? String(e));
        } finally {
            setFetching(false);
        }
    };

    const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-slate-500 placeholder-slate-600';

    return (
        <div className="flex flex-col gap-3 p-4 border-r border-slate-800 w-64 shrink-0 bg-slate-950 overflow-y-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Llaves</span>

            {isSymmetric ? (
                <KeyField
                    label={`Llave ${algorithm} (base64, simétrica)`}
                    value={keys.privateAccess}
                    onChange={v => onChange({ publicAccess: v, privateAccess: v })}
                    onCopy={() => navigator.clipboard?.writeText(keys.privateAccess)}
                />
            ) : (
                <>
                    <KeyField
                        label="Llave pública (publicAccess)"
                        value={keys.publicAccess}
                        onChange={v => onChange({ ...keys, publicAccess: v })}
                        onCopy={() => navigator.clipboard?.writeText(keys.publicAccess)}
                    />
                    <KeyField
                        label="Llave privada (privateAccess)"
                        value={keys.privateAccess}
                        onChange={v => onChange({ ...keys, privateAccess: v })}
                        onCopy={() => navigator.clipboard?.writeText(keys.privateAccess)}
                    />
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
                        <FieldLabel>URL base</FieldLabel>
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
                            placeholder='{"x-platform": "Microtermix_POS"}' />

                        <FieldLabel>Path llave pública en respuesta</FieldLabel>
                        <input className={inputCls} value={cfg.publicKeyPath}
                            onChange={e => patch({ publicKeyPath: e.target.value })}
                            placeholder="publicKey" />

                        <FieldLabel>Path llave privada en respuesta</FieldLabel>
                        <input className={inputCls} value={cfg.privateKeyPath}
                            onChange={e => patch({ privateKeyPath: e.target.value })}
                            placeholder="privateKey" />

                        <FieldLabel>Path del x-access-id en respuesta</FieldLabel>
                        <input className={inputCls} value={cfg.accessIdPath}
                            onChange={e => patch({ accessIdPath: e.target.value })}
                            placeholder="accessId" />

                        {/* ── x-access-id for decrypt ── */}
                        <div className="border-t border-slate-800 pt-2 mt-1 flex flex-col gap-2">
                            <FieldLabel>
                                x-access-id para descifrar{' '}
                                <span className="text-slate-600">(opcional)</span>
                            </FieldLabel>
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                                Si cifras con la public key, para descifrar necesitas la private key de ese par específico. Pega aquí el x-access-id que vino con las llaves de cifrado.
                            </p>
                            <input
                                className={inputCls}
                                value={cfg.accessId}
                                onChange={e => patch({ accessId: e.target.value })}
                                placeholder="abc-123-xyz"
                            />
                            {cfg.url && cfg.accessId && (
                                <p className="text-[10px] text-violet-400 break-all leading-relaxed font-mono">
                                    → {cfg.url.replace(/\/$/, '')}/{cfg.accessId.trim()}
                                </p>
                            )}
                        </div>

                        <FieldLabel>Token</FieldLabel>
                        <textarea
                            className={`${inputCls} h-16 resize-none`}
                            value={token}
                            onChange={e => {
                                setToken(e.target.value);
                                localStorage.setItem(`lc-token-${algorithm}`, e.target.value);
                            }}
                            placeholder="Pega tu JWT u otro token aquí..."
                        />

                        {serviceError && (
                            <p className="text-[10px] text-red-400 break-all leading-relaxed">{serviceError}</p>
                        )}

                        {serviceSuccess && (
                            <p className="text-[10px] text-emerald-400 font-bold">✓ Llaves obtenidas</p>
                        )}

                        {lastFetchedAccessId && (
                            <div className="bg-slate-800 rounded p-2 flex flex-col gap-1 border border-violet-700/40">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">x-access-id</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                navigator.clipboard?.writeText(lastFetchedAccessId);
                                                patch({ accessId: lastFetchedAccessId });
                                            }}
                                            className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                                            title="Copiar y usar para descifrar"
                                        >
                                            <Copy size={9} /> Copiar y usar
                                        </button>
                                        <button
                                            onClick={() => setLastFetchedAccessId('')}
                                            className="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
                                            title="Cerrar"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] font-mono text-slate-300 break-all">{lastFetchedAccessId}</p>
                                <p className="text-[10px] text-slate-600 leading-relaxed">
                                    Guárdalo. Si cifras con estas llaves, necesitarás este ID para obtener la private key y descifrar.
                                </p>
                            </div>
                        )}

                        <button
                            onClick={handleFetchKeys}
                            disabled={fetching || !cfg.url}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-xs text-white font-bold transition-colors"
                        >
                            {fetching && <span className="animate-spin inline-block">↻</span>}
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
            placeholder="Pega una llave..."
        />
    </div>
);
