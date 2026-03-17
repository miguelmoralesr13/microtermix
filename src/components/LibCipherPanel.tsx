import React, { useState } from 'react';
import { Package, ShieldCheck, FileJson } from 'lucide-react';
import { LibCipherCipherTab } from './lib-cipher/LibCipherCipherTab';
import { LibCipherJsonTab } from './lib-cipher/LibCipherJsonTab';
import { LCAlgorithm, LCKeyPair } from './lib-cipher/LibCipherKeysPanel';

type MainTab = 'cipher' | 'json';

const EMPTY: LCKeyPair = { publicAccess: '', privateAccess: '' };

const DEFAULT_KEYS: Record<LCAlgorithm, LCKeyPair> = {
    ECIES: EMPTY,
    AES: EMPTY,
    'AES-LEGACY': EMPTY,
    RSA: EMPTY,
    'RSA-LEGACY': EMPTY,
};

function loadPref<T>(key: string, fallback: T): T {
    try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
}

export const LibCipherPanel: React.FC = () => {
    const [mainTab, setMainTab] = useState<MainTab>(() =>
        loadPref<MainTab>('lc-active-tab', 'cipher')
    );
    const [algorithm, setAlgorithm] = useState<LCAlgorithm>(() =>
        loadPref<LCAlgorithm>('lc-active-algorithm', 'ECIES')
    );
    const [keysByAlgorithm, setKeysByAlgorithm] = useState<Record<LCAlgorithm, LCKeyPair>>(() =>
        loadPref<Record<LCAlgorithm, LCKeyPair>>('lc-keys-by-algorithm', DEFAULT_KEYS)
    );

    const switchTab = (tab: MainTab) => {
        setMainTab(tab);
        localStorage.setItem('lc-active-tab', JSON.stringify(tab));
    };

    const switchAlgorithm = (a: LCAlgorithm) => {
        setAlgorithm(a);
        localStorage.setItem('lc-active-algorithm', JSON.stringify(a));
    };

    const updateKeys = (algo: LCAlgorithm, keys: LCKeyPair) =>
        setKeysByAlgorithm(prev => {
            const next = { ...prev, [algo]: keys };
            localStorage.setItem('lc-keys-by-algorithm', JSON.stringify(next));
            return next;
        });

    const tabBtn = (id: MainTab, label: string, Icon: React.FC<{ size?: number }>) => (
        <button
            onClick={() => switchTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
                mainTab === id
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
        >
            <Icon size={14} /> {label}
        </button>
    );

    return (
        <div className="flex-1 flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2 px-5 py-3 border-r border-slate-800 shrink-0">
                    <Package size={15} className="text-violet-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">lib-cipher</span>
                </div>
                {tabBtn('cipher', 'Cifrador', ({ size }) => <ShieldCheck size={size} />)}
                {tabBtn('json', 'JSON Processor', ({ size }) => <FileJson size={size} />)}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {mainTab === 'cipher' ? (
                    <LibCipherCipherTab
                        activeAlgorithm={algorithm}
                        onAlgorithmChange={switchAlgorithm}
                        keysByAlgorithm={keysByAlgorithm}
                        onKeysChange={updateKeys}
                    />
                ) : (
                    <LibCipherJsonTab
                        activeAlgorithm={algorithm}
                        onAlgorithmChange={switchAlgorithm}
                        keysByAlgorithm={keysByAlgorithm}
                        onKeysChange={updateKeys}
                    />
                )}
            </div>
        </div>
    );
};
