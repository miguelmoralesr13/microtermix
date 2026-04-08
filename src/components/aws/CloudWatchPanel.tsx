import React, { useState } from 'react';
import {
    Cloud, CheckCircle, X
} from 'lucide-react';
import { Ec2Tab } from './Ec2Tab';
import { SettingsTab } from './SettingsTab';
import { LogsTab } from './LogsTab';
import { MetricsTab } from './MetricsTab';
import { NeedConfig } from './cwUtils';
import { ApiGatewayPanel } from './ApiGatewayPanel';
import { StepFunctionsTab } from './StepFunctionsTab';
import { EcsTab } from './EcsTab';
import { LambdaTab } from './LambdaTab';
import { S3Tab } from './S3Tab';
import { EnvVarsTab } from './EnvVarsTab';
import { InvokeTesterTab } from './InvokeTesterTab';
import { useCwStore, CwTab } from '../../stores/cwStore';
import { useAwsStore } from '../../stores/awsStore';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '../ui/select';



// ── Main panel ────────────────────────────────────────────────────────────────

export const CloudWatchPanel: React.FC = () => {
    const { activeTab: tab, setActiveTab: setTab } = useCwStore();
    const [savedMsg, setSavedMsg] = useState(false);
    const { activeAccountId, accounts, setActiveAccount } = useAwsStore();
    const credentials = useAwsStore(s => s.credentials);
    const isConfigured = !!(credentials?.accessKeyId && credentials?.secretAccessKey && credentials?.region);

    const handleSaved = () => {
        setSavedMsg(true);
        if (useAwsStore.getState().credentials?.accessKeyId) setTab('logs');
    };

    const tabs: { id: CwTab; label: string }[] = [
        { id: 'settings', label: 'Configuración' },
        { id: 'invoke-tester', label: '⚡ Invoke Tester' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Métricas' },
        { id: 'env-vars', label: 'Envs (SSM/Secrets)' },
        { id: 's3', label: 'S3 Explorer' },
        { id: 'ec2', label: 'EC2' },
        { id: 'api-gateway', label: 'API Gateway' },
        { id: 'step-functions', label: 'Step Functions' },
        { id: 'ecs', label: 'ECS / Fargate' },
        { id: 'lambda', label: 'Lambda' },
    ];

    const currentAccount = accounts.find(a => a.id === activeAccountId);

    return (
        <div className="flex-1 flex flex-col h-full w-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <Cloud size={15} className="text-microtermix-neon mr-2 shrink-0" />
                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar no-scrollbar-x pb-0">
                    {tabs.map(t => (
                        <button 
                            key={t.id} 
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${tab === t.id
                                ? 'border-microtermix-neon text-white'
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                                }`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-4 pl-4 border-l border-white/5 pb-1">
                    {accounts.length > 0 && (
                        <Select 
                            value={activeAccountId || ""} 
                            onValueChange={(val) => setActiveAccount(val)}
                        >
                            <SelectTrigger size="sm" className="bg-microtermix-neon/5 border-microtermix-neon/20 hover:bg-microtermix-neon/10 transition-all text-microtermix-neon font-bold h-7 min-w-[120px]">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-microtermix-neon animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{currentAccount?.name || "Seleccionar Cuenta"}</span>
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id} className="text-xs focus:bg-microtermix-neon/20 focus:text-white">
                                        <div className="flex flex-col py-0.5">
                                            <span className="font-bold">{acc.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono opacity-70">{acc.region}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    
                    {savedMsg && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle size={12} /> Guardado
                            <button onClick={() => setSavedMsg(false)} className="ml-1 text-slate-600 hover:text-slate-400"><X size={10} /></button>
                        </span>
                    )}
                </div>
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
                {tab === 'env-vars' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'env-vars' && isConfigured && <EnvVarsTab />}
                {tab === 's3' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 's3' && isConfigured && <S3Tab />}
                {tab === 'invoke-tester' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'invoke-tester' && isConfigured && <InvokeTesterTab />}
            </div>
        </div>
    );
};
