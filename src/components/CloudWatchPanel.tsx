import React, { useState } from 'react';
import {
    Cloud, CheckCircle, X
} from 'lucide-react';
import { Ec2Tab } from './cloudwatch/Ec2Tab';
import { SettingsTab } from './cloudwatch/SettingsTab';
import { LogsTab } from './cloudwatch/LogsTab';
import { MetricsTab } from './cloudwatch/MetricsTab';
import { usePersistedState, NeedConfig } from './cloudwatch/cwUtils';
import {
    CwCredentials,
    loadCwConfig,
} from '../services/cloudwatchApi';
import { ApiGatewayPanel } from './ApiGatewayPanel';

type CwTab = 'settings' | 'logs' | 'metrics' | 'ec2' | 'api-gateway';







// ── Main panel ────────────────────────────────────────────────────────────────

export const CloudWatchPanel: React.FC = () => {
    const [tab, setTab] = usePersistedState<CwTab>('nexus-cw-active-tab', 'settings');
    const [savedMsg, setSavedMsg] = useState(false);
    const [cfg, setCfg] = useState<CwCredentials>(() => loadCwConfig());
    const isConfigured = !!(cfg.accessKeyId && cfg.secretAccessKey && cfg.region);

    const handleSaved = () => {
        const updated = loadCwConfig();
        setCfg(updated);
        setSavedMsg(true);
        if (updated.accessKeyId && updated.secretAccessKey) setTab('logs');
    };

    const tabs: { id: CwTab; label: string }[] = [
        { id: 'settings', label: 'Configuración' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Métricas' },
        { id: 'ec2', label: 'EC2' },
        { id: 'api-gateway', label: 'API Gateway' },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <Cloud size={15} className="text-nexus-neon mr-2 shrink-0" />
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-nexus-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.label}
                    </button>
                ))}
                {savedMsg && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle size={12} /> Guardado
                        <button onClick={() => setSavedMsg(false)} className="ml-1 text-slate-600 hover:text-slate-400"><X size={10} /></button>
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto">
                {tab === 'settings' && <SettingsTab onSaved={handleSaved} />}
                {tab === 'logs' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'logs' && isConfigured && <LogsTab cfg={cfg} />}
                {tab === 'metrics' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'metrics' && isConfigured && <MetricsTab cfg={cfg} />}
                {tab === 'ec2' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'ec2' && isConfigured && <Ec2Tab cfg={cfg} />}
                {tab === 'api-gateway' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'api-gateway' && isConfigured && <ApiGatewayPanel credentials={cfg} />}
            </div>
        </div>
    );
};
