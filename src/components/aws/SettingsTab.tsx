import { Settings, ShieldCheck } from 'lucide-react';
import { useAwsStore } from '../../stores/awsStore';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

// Sub-components
import { AccountSidebar } from './AccountSidebar';
import { AccountDetailView } from './AccountDetailView';
import { PlatformSetupGuide } from './PlatformSetupGuide';

interface SettingsTabProps {
    onSaved: () => void;
}

export function SettingsTab({ onSaved }: SettingsTabProps) {
    const { accounts, activeAccountId } = useAwsStore();
    const activeAccount = accounts.find(a => a.id === activeAccountId);
    
    const isConfigured = !!(activeAccount?.accessKeyId && activeAccount?.secretAccessKey);

    return (
        <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header section (Orchestrator Responsibility: Shared Context) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-microtermix-neon/10 rounded-xl">
                            <Settings className="w-8 h-8 text-microtermix-neon" />
                        </div>
                        AWS Multi-Auth Hub
                    </h1>
                    <p className="text-slate-400 mt-2">Gestiona múltiples cuentas de AWS y conmuta entre ellas al instante.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Badge variant={isConfigured ? "outline" : "secondary"} className={cn(
                        "px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-500",
                        activeAccount?.status === 'expired' ? "border-red-500 text-red-500 bg-red-500/10 shadow-[0_0_15px_-5px_rgba(239,68,68,0.5)]" : 
                        (isConfigured ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/5" : "bg-slate-800 text-slate-400")
                    )}>
                        {activeAccount?.status === 'expired' ? 'Sesión Expirada' : (isConfigured ? 'Status: Configurado' : 'Status: Sin configurar')}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Sidebar: Accounts & Global Settings */}
                <AccountSidebar />

                {/* Main Stage: Detail View & Guides */}
                <div className="lg:col-span-8 space-y-8 h-full">
                    {!activeAccount ? (
                        <div className="h-[600px] flex flex-col items-center justify-center p-12 bg-slate-900/10 rounded-[2rem] border border-dashed border-white/5 animate-in fade-in zoom-in-95 duration-500">
                            <div className="p-6 bg-slate-900/50 rounded-3xl mb-6 shadow-xl text-slate-700">
                                <ShieldCheck className="w-12 h-12" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-300 tracking-tight">Centro de Control AWS</h3>
                            <p className="text-slate-500 text-sm mt-3 text-center max-w-xs leading-relaxed">
                                Selecciona un perfil de la barra lateral para gestionar sus credenciales y herramientas de sistema.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
                            {/* Detail / Edit View (Col span 3) */}
                            <AccountDetailView 
                                account={activeAccount} 
                                onSaved={onSaved}
                            />

                            {/* Setup Guide (Col span 2) */}
                            <div className="xl:col-span-2 space-y-6">
                                <PlatformSetupGuide />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
