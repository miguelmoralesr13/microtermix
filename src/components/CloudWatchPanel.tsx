import React, { useState } from 'react';
import {
    Cloud, CheckCircle, X
} from 'lucide-react';
import { Ec2Tab } from './cloudwatch/Ec2Tab';
import { SettingsTab } from './cloudwatch/SettingsTab';
import { LogsTab } from './cloudwatch/LogsTab';
import { MetricsTab } from './cloudwatch/MetricsTab';
import { NeedConfig } from './cloudwatch/cwUtils';
import { ApiGatewayPanel } from './ApiGatewayPanel';
import { StepFunctionsTab } from './cloudwatch/StepFunctionsTab';
import { EcsTab } from './cloudwatch/EcsTab';
import { LambdaTab } from './cloudwatch/LambdaTab';
import { S3Tab } from './cloudwatch/S3Tab';
import { useCwStore } from '../stores/cwStore';
import { useAwsStore } from '../stores/awsStore';

type CwTab = 'settings' | 'logs' | 'metrics' | 'ec2' | 'api-gateway' | 'step-functions' | 'ecs' | 'lambda' | 's3';

// ── Main panel ────────────────────────────────────────────────────────────────

export const CloudWatchPanel: React.FC = () => {
    const { activeTab: tab, setActiveTab: setTab } = useCwStore();
    const [savedMsg, setSavedMsg] = useState(false);
    const credentials = useAwsStore(s => s.credentials);
    const isConfigured = !!(credentials?.accessKeyId && credentials?.secretAccessKey && credentials?.region);

    const handleSaved = () => {
        setSavedMsg(true);
        if (useAwsStore.getState().credentials?.accessKeyId) setTab('logs');
    };

    const tabs: { id: CwTab; label: string }[] = [
        { id: 'settings', label: 'Configuración' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Métricas' },
        { id: 's3', label: 'S3 Explorer' },
        { id: 'ec2', label: 'EC2' },
        { id: 'api-gateway', label: 'API Gateway' },
        { id: 'step-functions', label: 'Step Functions' },
        { id: 'ecs', label: 'ECS / Fargate' },
        { id: 'lambda', label: 'Lambda' },
    ];

    return (
        <div className="flex-1 flex flex-col h-full w-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <Cloud size={15} className="text-microtermix-neon mr-2 shrink-0" />
                {tabs.map(t => (
                    <button 
                        key={t.id} 
                        // @ts-ignore
                        onClick={() => setTab(t.id as any)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === (t.id as string)
                            ? 'border-microtermix-neon text-white'
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
                {tab === 'logs' && isConfigured && <LogsTab />}
                {tab === 'metrics' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'metrics' && isConfigured && <MetricsTab />}
                {tab === 'ec2' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'ec2' && isConfigured && <Ec2Tab />}
                {tab === 'api-gateway' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'api-gateway' && isConfigured && <ApiGatewayPanel />}
                {tab === 'step-functions' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'step-functions' && isConfigured && <StepFunctionsTab />}
                {tab === 'ecs' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'ecs' && isConfigured && <EcsTab />}
                {tab === 'lambda' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'lambda' && isConfigured && <LambdaTab />}
                {(tab as string) === 's3' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {(tab as string) === 's3' && isConfigured && <S3Tab />}
            </div>
        </div>
    );
};
