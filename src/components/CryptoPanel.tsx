import React, { useState } from 'react';
import { ShieldCheck, FileJson } from 'lucide-react';
import { CipherTab } from './crypto/CipherTab';
import { JsonProcessorTab } from './crypto/JsonProcessorTab';
import { Scheme, KeyPair } from './crypto/KeysPanel';

type MainTab = 'cipher' | 'json';

const EMPTY: KeyPair = { public_key: '', private_key: '' };

function loadPref<T>(key: string, fallback: T): T {
    try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
}

export const CryptoPanel: React.FC = () => {
    const [mainTab, setMainTab] = useState<MainTab>(() =>
        loadPref<MainTab>('crypto-active-tab', 'cipher')
    );
    const [scheme, setScheme] = useState<Scheme>(() =>
        loadPref<Scheme>('crypto-active-scheme', 'aes')
    );
    const [keysByScheme, setKeysByScheme] = useState<Record<Scheme, KeyPair>>(() =>
        loadPref<Record<Scheme, KeyPair>>('crypto-keys-by-scheme', { aes: EMPTY, rsa: EMPTY, ecies: EMPTY })
    );

    const switchTab = (tab: MainTab) => {
        setMainTab(tab);
        localStorage.setItem('crypto-active-tab', JSON.stringify(tab));
    };

    const switchScheme = (s: Scheme) => {
        setScheme(s);
        localStorage.setItem('crypto-active-scheme', JSON.stringify(s));
    };

    const updateKeys = (s: Scheme, keys: KeyPair) =>
        setKeysByScheme(prev => {
            const next = { ...prev, [s]: keys };
            localStorage.setItem('crypto-keys-by-scheme', JSON.stringify(next));
            return next;
        });

    const tabBtn = (id: MainTab, label: string, Icon: React.FC<{ size?: number }>) => (
        <button
            onClick={() => switchTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
                mainTab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
        >
            <Icon size={14} /> {label}
        </button>
    );

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header bar */}
            <div className="shrink-0 flex items-center bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2 px-5 py-3 border-r border-slate-800 shrink-0">
                    <ShieldCheck size={15} className="text-blue-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cifrado</span>
                </div>
                {tabBtn('cipher', 'Cifrador', ({ size }) => <ShieldCheck size={size} />)}
                {tabBtn('json', 'JSON Processor', ({ size }) => <FileJson size={size} />)}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {mainTab === 'cipher' ? (
                    <CipherTab
                        activeScheme={scheme}
                        onSchemeChange={switchScheme}
                        keysByScheme={keysByScheme}
                        onKeysChange={updateKeys}
                    />
                ) : (
                    <JsonProcessorTab
                        activeScheme={scheme}
                        onSchemeChange={switchScheme}
                        keysByScheme={keysByScheme}
                        onKeysChange={updateKeys}
                    />
                )}
            </div>
        </div>
    );
};
