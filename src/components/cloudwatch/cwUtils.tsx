import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { CwCredentials } from '../../services/cloudwatchApi';

export function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            if (saved !== null) return JSON.parse(saved);
        } catch { }
        return initialValue;
    });

    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(state));
    }, [key, state]);

    return [state, setState];
}

export const LogMessage = React.memo(({ message }: { message: string }) => {
    try {
        const parsed = JSON.parse(message);
        return (
            <pre className="text-[10px] text-slate-300 bg-slate-900/50 p-2 rounded-md border border-slate-800/50 whitespace-pre-wrap break-words">
                {JSON.stringify(parsed, null, 2)}
            </pre>
        );
    } catch {
        return <span className="break-all">{message}</span>;
    }
});

export function NeedConfig({ onGo }: { onGo: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 p-12">
            <AlertCircle size={36} />
            <p className="text-sm text-center">Primero configura tus credenciales AWS.</p>
            <button onClick={onGo} className="text-xs text-nexus-accent hover:underline">Ir a Configuración →</button>
        </div>
    );
}

export function parseAwsCredentialBlock(text: string): Partial<CwCredentials> {
    const result: Partial<CwCredentials> = {};
    for (const raw of text.split('\n')) {
        const line = raw.replace(/^\s*export\s+/i, '').trim();
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim().toLowerCase();
        const value = line.slice(eq + 1).trim();
        if (!value) continue;
        if (key === 'aws_access_key_id') result.accessKeyId = value;
        if (key === 'aws_secret_access_key') result.secretAccessKey = value;
        if (key === 'aws_session_token') result.sessionToken = value;
        if (key === 'region' || key === 'aws_default_region') result.region = value;
    }
    return result;
}

export type OsTab = 'windows' | 'linux' | 'macos';

export function detectOs(): OsTab {
    const p = navigator.platform ?? '';
    if (p.startsWith('Win')) return 'windows';
    if (p.includes('Mac')) return 'macos';
    return 'linux';
}
